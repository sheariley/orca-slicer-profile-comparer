import { ComparerError } from '../errors/errors.ts';
import { METADATA_KEYS, type PresetRef, type ProfileDocument } from '../model/profile.ts';
import { normalizeValue, type NormalizedValue } from '../normalize/normalize-value.ts';

/** One resolved setting and the preset that defined it. */
export interface ResolvedSetting {
  readonly value: NormalizedValue;
  readonly definedBy: PresetRef;
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
 */
export function resolveChain(chain: readonly ProfileDocument[]): ResolvedProfile {
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
  for (const document of [...chain].reverse()) {
    for (const [key, raw] of Object.entries(document.content)) {
      if (METADATA_KEYS.has(key)) continue;
      settings.set(key, { value: normalizeValue(raw), definedBy: document.ref });
    }
  }

  return { ref: leaf.ref, chain: chain.map((document) => document.ref), settings };
}
