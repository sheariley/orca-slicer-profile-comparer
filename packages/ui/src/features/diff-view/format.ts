import type { NormalizedValue } from '@comparer/core';

/**
 * The unit to show after a value. Percentages carry their own unit, and OrcaSlicer's
 * "mm/s² or %" style units only need the first part for a plain number.
 */
export function unitFor(value: NormalizedValue, unit: string | undefined): string | undefined {
  if (!unit || value.some((item) => item.endsWith('%'))) return undefined;
  return unit.replace(/\s+or\s+%$/, '');
}
