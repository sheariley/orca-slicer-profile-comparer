import { ComparerError } from '../errors/errors.ts';
import type { RawValue } from '../model/profile.ts';

/**
 * How a profile file is laid out. OrcaSlicer writes user presets as canonical sorted-key JSON
 * (nlohmann's sorted map) with a final newline, indented with a tab (current versions) or 4
 * spaces (older ones). Line endings follow the platform that saved the file: OrcaSlicer writes
 * "\n" in text mode, which becomes "\r\n" on Windows only.
 */
export interface TextFormat {
  /** One level of indentation: "\t" or a run of spaces. */
  readonly indent: string;
  readonly newline: '\n' | '\r\n';
  readonly finalNewline: boolean;
  /** Keys in byte order, as OrcaSlicer writes them. Otherwise the file's own order is kept. */
  readonly sortedKeys: boolean;
}

/** What a save changes: keys to set (added or replaced) and keys to remove. */
export interface ProfileEdits {
  readonly set?: Readonly<Record<string, RawValue>>;
  readonly remove?: readonly string[];
}

export interface EditResult {
  readonly text: string;
  /**
   * True when the original text wasn't in canonical form (e.g. edited by hand), so the result
   * reformats the whole file rather than only the changed keys. The UI must warn before saving.
   */
  readonly reformatted: boolean;
}

/**
 * The format current OrcaSlicer versions give a new file. The newline is the caller's: core is
 * platform-free, so the host passes "\r\n" on Windows and "\n" on macOS and Linux.
 */
export function orcaSlicerFormat(newline: TextFormat['newline']): TextFormat {
  return { indent: '\t', newline, finalNewline: true, sortedKeys: true };
}

/**
 * Detects a profile file's layout. `fallback` fills in what the text can't tell (e.g. the
 * line endings of a one-line `{}`).
 */
export function detectFormat(text: string, fallback: TextFormat): TextFormat {
  const content = parseProfileObject(text);
  const firstMember = /^\{\r?\n([ \t]+)"/.exec(text);
  return {
    indent: firstMember?.[1] ?? fallback.indent,
    newline: text.includes('\r\n') ? '\r\n' : text.includes('\n') ? '\n' : fallback.newline,
    finalNewline: /\n$/.test(text),
    sortedKeys: isSorted(Object.keys(content)),
  };
}

/**
 * Writes a profile in the given format. With OrcaSlicer's canonical layout this matches its
 * own writer byte for byte: `JSON.stringify` and nlohmann's `dump()` agree on spacing, escapes
 * (`\n`, lowercase `\u001f`), and leave non-ASCII text unescaped.
 */
export function serializeProfile(
  content: Readonly<Record<string, unknown>>,
  format: TextFormat,
): string {
  const ordered = format.sortedKeys ? sortKeys(content) : content;
  const text = JSON.stringify(ordered, null, format.indent);
  const withNewlines = format.newline === '\n' ? text : text.replace(/\n/g, format.newline);
  return format.finalNewline ? withNewlines + format.newline : withNewlines;
}

/**
 * Applies edits to a profile file's text, keeping its format so the result differs from the
 * original only in the edited keys. New keys go where OrcaSlicer would put them: in sorted
 * position for sorted files, at the end otherwise. `fallback` is used only for what the text
 * can't tell (see detectFormat); pass orcaSlicerFormat() with the platform's newline.
 */
export function applyEdits(text: string, edits: ProfileEdits, fallback: TextFormat): EditResult {
  const format = detectFormat(text, fallback);
  const content: Record<string, unknown> = { ...parseProfileObject(text) };
  const reformatted = serializeProfile(content, format) !== text;

  for (const key of edits.remove ?? []) delete content[key];
  for (const [key, value] of Object.entries(edits.set ?? {})) content[key] = value;

  return { text: serializeProfile(content, format), reformatted };
}

function parseProfileObject(text: string): Readonly<Record<string, unknown>> {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch (error) {
    throw new ComparerError('invalid-profile', `Not valid JSON: ${(error as Error).message}`);
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new ComparerError('invalid-profile', 'A profile must be a JSON object.');
  }
  return value as Record<string, unknown>;
}

/** Byte order, like std::map<std::string>. (Profile keys are ASCII, where UTF-16 agrees.) */
const byteOrder = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

function isSorted(keys: readonly string[]): boolean {
  return keys.every((key, index) => index === 0 || byteOrder(keys[index - 1]!, key) <= 0);
}

function sortKeys(content: Readonly<Record<string, unknown>>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(content).sort(([a], [b]) => byteOrder(a, b)));
}
