import { ComparerError } from '../errors/errors.ts';
import {
  METADATA_KEYS,
  type PresetRef,
  type ProfileDocument,
  type RawValue,
} from '../model/profile.ts';
import { normalizeValue, type NormalizedValue } from '../normalize/normalize-value.ts';

/** One resolved setting and where it came from: a preset in the chain, or a built-in default. */
export interface ResolvedSetting {
  readonly value: NormalizedValue;
  readonly definedBy: PresetRef | 'default';
}

/** How OrcaSlicer migrates old keys when it loads a profile (PrintConfigDef::handle_legacy). */
export interface LegacyKeys {
  /** Keys OrcaSlicer discards. */
  readonly obsolete: ReadonlySet<string>;
  /** Old key → current key. */
  readonly renamed: ReadonlyMap<string, string>;
}

export interface ResolveOptions {
  /** Built-in defaults the root starts from (see SettingCatalog.defaultsFor). */
  readonly defaults?: ReadonlyMap<string, RawValue>;
  /** Applied to every document's own keys before they're merged. */
  readonly legacyKeys?: LegacyKeys;
}

/** A profile with its inheritance chain applied. */
export interface ResolvedProfile {
  readonly ref: PresetRef;
  /** The chain the settings came from, leaf first. */
  readonly chain: readonly PresetRef[];
  readonly settings: ReadonlyMap<string, ResolvedSetting>;
}

/**
 * Applies an inheritance chain. `chain` is ordered leaf first, root last; keys in documents
 * nearer the leaf override keys further up. Metadata keys aren't inherited.
 *
 * Like OrcaSlicer, the root starts from `options.defaults` (the built-in default of every
 * setting the preset's type owns), and each document's keys go through `options.legacyKeys`.
 */
export function resolveChain(
  chain: readonly ProfileDocument[],
  { defaults = new Map(), legacyKeys }: ResolveOptions = {},
): ResolvedProfile {
  const leaf = chain[0];
  if (!leaf)
    throw new ComparerError('invalid-profile', 'Cannot resolve an empty inheritance chain.');

  const seen = new Set<string>();
  for (const document of chain) {
    if (seen.has(document.ref.id)) {
      throw new ComparerError(
        'inheritance-cycle',
        `Inheritance cycle at "${document.ref.name}".`,
        document.ref.name,
      );
    }
    seen.add(document.ref.id);
  }

  const settings = new Map<string, ResolvedSetting>();
  for (const [key, raw] of defaults) {
    if (!METADATA_KEYS.has(key))
      settings.set(key, { value: normalizeValue(raw), definedBy: 'default' });
  }
  for (const document of [...chain].reverse()) {
    for (const [key, raw] of migrateKeys(document.content, legacyKeys)) {
      if (METADATA_KEYS.has(key)) continue;
      settings.set(key, { value: normalizeValue(raw), definedBy: document.ref });
    }
  }

  return { ref: leaf.ref, chain: chain.map((document) => document.ref), settings };
}

/**
 * A document's own entries after legacy migration: obsolete keys dropped, old keys renamed.
 * When a document has both an old key and its replacement, the replacement wins.
 */
function migrateKeys(
  content: Readonly<Record<string, unknown>>,
  legacyKeys: LegacyKeys | undefined,
): [string, unknown][] {
  if (!legacyKeys) return Object.entries(content);
  const entries = new Map<string, unknown>();
  for (const [key, raw] of Object.entries(content)) {
    if (legacyKeys.obsolete.has(key)) continue;
    const current = legacyKeys.renamed.get(key);
    if (current === undefined) entries.set(key, raw);
    else if (!(current in content)) entries.set(current, raw);
  }
  return [...entries];
}
