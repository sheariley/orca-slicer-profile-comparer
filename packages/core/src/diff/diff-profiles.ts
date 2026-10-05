import { valuesEqual, type NormalizedValue } from '../normalize/normalize-value.ts';
import type { ResolvedProfile } from '../resolve/resolve-chain.ts';

export type DiffStatus = 'same' | 'changed' | 'left-only' | 'right-only';

export interface DiffRow {
  readonly key: string;
  readonly status: DiffStatus;
  readonly left: NormalizedValue | undefined;
  readonly right: NormalizedValue | undefined;
}

/** Compares two resolved profiles key by key. Rows are sorted by key. */
export function diffProfiles(left: ResolvedProfile, right: ResolvedProfile): DiffRow[] {
  const keys = new Set([...left.settings.keys(), ...right.settings.keys()]);
  return [...keys].sort().map((key) => {
    const leftValue = left.settings.get(key)?.value;
    const rightValue = right.settings.get(key)?.value;
    return { key, status: statusOf(leftValue, rightValue), left: leftValue, right: rightValue };
  });
}

function statusOf(
  left: NormalizedValue | undefined,
  right: NormalizedValue | undefined,
): DiffStatus {
  if (left === undefined) return 'right-only';
  if (right === undefined) return 'left-only';
  return valuesEqual(left, right) ? 'same' : 'changed';
}
