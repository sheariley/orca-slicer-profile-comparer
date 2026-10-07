import {
  ComparerError,
  applyEdits,
  diffProfiles,
  isComparerError,
  orcaSlicerFormat,
  planTransfer,
  serializeProfile,
  type DiffRow,
  type HostCapabilities,
  type PresetQuery,
  type PresetRef,
  type ProfileRepository,
  type ProfileType,
  type ResolvedProfile,
  type ResolveOptions,
  type SaveResult,
  type SettingCatalog,
  type SettingInfo,
  type PinOverrides,
  type TransferPlan,
} from '@comparer/core';
import {
  createSession,
  editedDocument,
  inheritedEdited,
  markSaved,
  pending,
  presetIn,
  recordBatch,
  resolveEdited,
  type EditSession,
} from './session/session.ts';
import { loadChain, loadResolved } from './use-cases/load-resolved.ts';

export interface ComparerDependencies {
  readonly repository: ProfileRepository;
  readonly catalog: SettingCatalog;
}

export interface Comparison {
  readonly left: ResolvedProfile;
  readonly right: ResolvedProfile;
  readonly rows: readonly DiffRow[];
}

/** Copy `keys` from one open preset to one or more others (all ids of presets in the session). */
export interface CopyRequest {
  readonly source: string;
  readonly targets: readonly string[];
  readonly keys: readonly string[];
  /** The user's "Pin override" choices (see core's RedundantOverride). */
  readonly pinOverrides?: PinOverrides;
}

/** What happened to one target when saving. */
export type TargetSaveResult =
  | {
      readonly status: 'saved';
      readonly target: PresetRef;
      readonly reloadRequired: SaveResult['reloadRequired'];
      /** The file wasn't in canonical form, so saving reformatted all of it. */
      readonly reformatted: boolean;
    }
  /** System presets are never written; the change needs a new user preset (not built yet). */
  | { readonly status: 'needs-user-preset'; readonly target: PresetRef }
  /** Nothing was written; the target's edits stay pending so the user can retry. */
  | { readonly status: 'failed'; readonly target: PresetRef; readonly error: ComparerError };

/** The use cases the UI calls. The UI never talks to a host directly. */
export interface ComparerApp {
  readonly capabilities: HostCapabilities;
  listPresets(query?: PresetQuery): Promise<readonly PresetRef[]>;
  loadResolved(ref: PresetRef): Promise<ResolvedProfile>;
  compare(left: PresetRef, right: PresetRef): Promise<Comparison>;
  describeSetting(key: string): SettingInfo | undefined;

  /** Loads presets (and their parent chains) for editing. */
  openSession(refs: readonly PresetRef[]): Promise<EditSession>;
  /** Compares two open presets as they currently stand, pending edits included. */
  compareEdited(session: EditSession, left: string, right: string): Comparison;
  /** What a copy would do, without recording it (for previews and "Pin override" choices). */
  previewCopy(session: EditSession, request: CopyRequest): TransferPlan;
  /** Plans a copy and records it as one undoable step. */
  copy(
    session: EditSession,
    request: CopyRequest,
    label?: string,
  ): { session: EditSession; plan: TransferPlan };
  /**
   * Saves every preset with pending edits, one file at a time. One failure doesn't stop the
   * others; failed targets keep their pending edits.
   */
  saveChanges(session: EditSession): Promise<{ session: EditSession; results: TargetSaveResult[] }>;
}

export function createComparerApp({ repository, catalog }: ComparerDependencies): ComparerApp {
  const resolveOptions = (type: ProfileType): ResolveOptions => ({
    defaults: catalog.defaultsFor(type),
    legacyKeys: catalog.legacyKeys(),
  });
  const resolve = (ref: PresetRef) => loadResolved(repository, ref, resolveOptions(ref.type));

  const plan = (session: EditSession, request: CopyRequest): TransferPlan => {
    const source = presetIn(session, request.source).ref;
    const targets = request.targets.map((id) => {
      const { ref } = presetIn(session, id);
      const options = resolveOptions(ref.type);
      return {
        // Planned against the edited state, so a copy builds on earlier, unsaved ones.
        document: editedDocument(session, id),
        resolved: resolveEdited(session, id, options),
        inherited: inheritedEdited(session, id, options),
        rules: catalog.keyRules(ref.type),
      };
    });
    return planTransfer(
      resolveEdited(session, request.source, resolveOptions(source.type)),
      request.keys,
      targets,
      {
        legacyKeys: catalog.legacyKeys(),
        ...(request.pinOverrides ? { pinOverrides: request.pinOverrides } : {}),
      },
    );
  };

  return {
    capabilities: repository.capabilities,
    listPresets: (query) => repository.listPresets(query),
    loadResolved: resolve,
    async compare(leftRef, rightRef) {
      const [left, right] = await Promise.all([resolve(leftRef), resolve(rightRef)]);
      return { left, right, rows: diffProfiles(left, right) };
    },
    describeSetting: (key) => catalog.describe(key),

    async openSession(refs) {
      const chains = await Promise.all(refs.map((ref) => loadChain(repository, ref)));
      return createSession(chains.map((chain, index) => ({ ref: refs[index]!, chain })));
    },

    compareEdited(session, leftId, rightId) {
      const left = resolveEdited(
        session,
        leftId,
        resolveOptions(presetIn(session, leftId).ref.type),
      );
      const right = resolveEdited(
        session,
        rightId,
        resolveOptions(presetIn(session, rightId).ref.type),
      );
      return { left, right, rows: diffProfiles(left, right) };
    },

    previewCopy: plan,

    copy(session, request, label) {
      const transfer = plan(session, request);
      const names = request.targets.map((id) => presetIn(session, id).ref.name).join(', ');
      const count = request.keys.length;
      const batchLabel = label ?? `Copy ${count} setting${count === 1 ? '' : 's'} to ${names}`;
      return {
        session: recordBatch(session, { label: batchLabel, plan: transfer }),
        plan: transfer,
      };
    },

    async saveChanges(session) {
      let current = session;
      const results: TargetSaveResult[] = [];
      for (const { target, edits } of pending(session)) {
        if (target.origin === 'system') {
          results.push({ status: 'needs-user-preset', target });
          continue;
        }
        const original = presetIn(current, target.id).chain[0]!;
        const fallback = orcaSlicerFormat(repository.newline);
        // Hosts always provide the text; documents built in memory may not.
        const originalText = original.text ?? serializeProfile(original.content, fallback);
        try {
          const { text, reformatted } = applyEdits(originalText, edits, fallback);
          const saved = await repository.saveDocument({
            ref: target,
            text,
            previousText: original.text,
          });
          current = markSaved(current, {
            ref: target,
            content: JSON.parse(text) as Record<string, unknown>,
            text,
          });
          results.push({
            status: 'saved',
            target,
            reloadRequired: saved.reloadRequired,
            reformatted,
          });
        } catch (error) {
          results.push({ status: 'failed', target, error: asComparerError(error, target) });
        }
      }
      return { session: current, results };
    },
  };
}

function asComparerError(error: unknown, target: PresetRef): ComparerError {
  if (isComparerError(error)) return error;
  return new ComparerError(
    'host-error',
    error instanceof Error ? error.message : String(error),
    target.id,
  );
}
