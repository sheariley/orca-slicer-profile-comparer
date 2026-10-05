import {
  ComparerError,
  inheritsFrom,
  resolveChain,
  type PresetRef,
  type ProfileDocument,
  type ProfileRepository,
  type ResolvedProfile,
} from '@comparer/core';

/** Deeper than any real OrcaSlicer chain; guards against runaway lookups. */
const MAX_CHAIN_DEPTH = 32;

/** Reads a preset and its ancestors through the repository, then resolves them in core. */
export async function loadResolved(
  repository: ProfileRepository,
  ref: PresetRef,
): Promise<ResolvedProfile> {
  const chain: ProfileDocument[] = [];
  const visited = new Set<string>();
  let current: PresetRef | undefined = ref;

  while (current) {
    if (visited.has(current.id)) {
      throw new ComparerError(
        'inheritance-cycle',
        `Inheritance cycle at "${current.name}".`,
        current.name,
      );
    }
    if (chain.length >= MAX_CHAIN_DEPTH) {
      throw new ComparerError('invalid-profile', `Inheritance chain of "${ref.name}" is too deep.`);
    }
    visited.add(current.id);

    const document = await repository.readDocument(current);
    chain.push(document);

    const parentName = inheritsFrom(document);
    if (parentName === undefined) break;
    current = await repository.resolveParent(current, parentName);
    if (!current) {
      throw new ComparerError(
        'not-found',
        `"${document.ref.name}" inherits from "${parentName}", which wasn't found.`,
        parentName,
      );
    }
  }

  return resolveChain(chain);
}
