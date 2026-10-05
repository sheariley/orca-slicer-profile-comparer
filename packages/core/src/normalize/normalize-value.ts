/** A setting value in comparable form: always an array of strings. */
export type NormalizedValue = readonly string[];

/**
 * Converts a raw profile value to its comparable form, so `"16"` and `["16"]` compare equal.
 * Profiles store everything as strings; numbers and booleans are accepted defensively.
 */
export function normalizeValue(raw: unknown): NormalizedValue {
  if (Array.isArray(raw)) return raw.map(scalarToString);
  return [scalarToString(raw)];
}

function scalarToString(value: unknown): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return JSON.stringify(value) ?? '';
}

export function valuesEqual(a: NormalizedValue, b: NormalizedValue): boolean {
  return a.length === b.length && a.every((item, index) => item === b[index]);
}
