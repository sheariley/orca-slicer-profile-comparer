import {
  applyContentEdits,
  canRedo,
  canUndo,
  editsBetween,
  emptyHistory,
  hasEdits,
  pendingEdits,
  record,
  redo,
  resolveChain,
  undo,
  type EditBatch,
  type EditHistory,
  type PendingEdits,
  type PresetRef,
  type ProfileDocument,
  type ResolvedProfile,
  type ResolveOptions,
} from '@comparer/core';

/** A preset opened for editing, with the raw documents of its inheritance chain. */
export interface LoadedPreset {
  readonly ref: PresetRef;
  /** The preset's own file as it was when the session opened it. The history applies to this. */
  readonly opened: ProfileDocument;
  /** Leaf first. The leaf is the preset's own file as it is now (after any saves). */
  readonly chain: readonly ProfileDocument[];
}

/**
 * The state of an editing session: the presets opened for editing and the edit history.
 * Immutable; every operation returns a new session. Edits stay pending until saved.
 */
export interface EditSession {
  readonly presets: ReadonlyMap<string, LoadedPreset>;
  readonly history: EditHistory;
}

export function createSession(
  presets: readonly { ref: PresetRef; chain: readonly ProfileDocument[] }[],
): EditSession {
  return {
    presets: new Map(
      presets.map((preset) => [preset.ref.id, { ...preset, opened: preset.chain[0]! }]),
    ),
    history: emptyHistory,
  };
}

export function presetIn(session: EditSession, id: string): LoadedPreset {
  const preset = session.presets.get(id);
  if (!preset) throw new Error(`Preset ${id} isn't open in this session.`);
  return preset;
}

/**
 * A preset's own content as the edit history wants it: the file as opened, with every applied
 * batch on top. Saving and undoing don't change this; they change what the file holds.
 */
function desiredContent(session: EditSession, id: string): Record<string, unknown> {
  const { opened } = presetIn(session, id);
  const edits = pendingEdits(session.history, new Map([[id, opened]])).find(
    (entry) => entry.target.id === id,
  )?.edits;
  return edits ? applyContentEdits(opened.content, edits) : { ...opened.content };
}

/**
 * The net edits each preset's file needs to match what the history wants: what saving would
 * write. Measured against the file as it is now, so saved changes drop out, and undoing a saved
 * change makes reverting it pending (like undo after save in a text editor).
 */
export function pending(session: EditSession): PendingEdits[] {
  return [...session.presets.values()].flatMap(({ ref, chain }) => {
    const edits = editsBetween(chain[0]!.content, desiredContent(session, ref.id));
    return hasEdits(edits) ? [{ target: ref, edits }] : [];
  });
}

export const hasPendingEdits = (session: EditSession) => pending(session).length > 0;

/** A preset's own document with its pending edits applied. Has no `text` until it's saved. */
export function editedDocument(session: EditSession, id: string): ProfileDocument {
  return { ref: presetIn(session, id).ref, content: desiredContent(session, id) };
}

/**
 * A preset's chain as it currently stands: any document that belongs to a preset open in the
 * session (the preset itself, or a parent that's also open) carries its pending edits.
 */
export function editedChain(session: EditSession, id: string): ProfileDocument[] {
  return presetIn(session, id).chain.map((document) =>
    session.presets.has(document.ref.id) ? editedDocument(session, document.ref.id) : document,
  );
}

/** Resolves a preset in its current, edited state. */
export function resolveEdited(
  session: EditSession,
  id: string,
  options: ResolveOptions,
): ResolvedProfile {
  return resolveChain(editedChain(session, id), options);
}

/**
 * What a preset would have without its own overrides, in its current, edited state: its parent's
 * resolved settings, or just the built-in defaults for a root preset.
 */
export function inheritedEdited(
  session: EditSession,
  id: string,
  options: ResolveOptions,
): ResolvedProfile['settings'] {
  const [leaf, ...parents] = editedChain(session, id);
  // A root inherits only the defaults: resolve an empty stand-in for its own file.
  const chain = parents.length > 0 ? parents : [{ ref: leaf!.ref, content: {} }];
  return resolveChain(chain, options).settings;
}

export function recordBatch(session: EditSession, batch: EditBatch): EditSession {
  return { ...session, history: record(session.history, batch) };
}

export const undoSession = (session: EditSession): EditSession => ({
  ...session,
  history: undo(session.history),
});

export const redoSession = (session: EditSession): EditSession => ({
  ...session,
  history: redo(session.history),
});

export const canUndoSession = (session: EditSession) => canUndo(session.history);
export const canRedoSession = (session: EditSession) => canRedo(session.history);

/** The label of the step undo would reverse (e.g. "Copy 2 settings to PETG"), if any. */
export const undoLabel = (session: EditSession) => session.history.done.at(-1)?.label;
/** The label of the step redo would reapply, if any. */
export const redoLabel = (session: EditSession) => session.history.undone[0]?.label;

/**
 * Records that a preset's file now holds `saved`. Pending edits are measured against it, so the
 * saved ones drop out. The history and the opened file are kept, so undo can still reverse a
 * saved change (which makes reverting it pending).
 */
export function markSaved(session: EditSession, saved: ProfileDocument): EditSession {
  const presets = new Map(
    [...session.presets].map(([id, preset]) => [
      id,
      {
        ...preset,
        chain: preset.chain.map((document) =>
          document.ref.id === saved.ref.id ? saved : document,
        ),
      },
    ]),
  );
  return { ...session, presets };
}
