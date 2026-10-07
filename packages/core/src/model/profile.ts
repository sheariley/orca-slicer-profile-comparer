/** The preset types OrcaSlicer stores as profile files. The comparer edits filament and process. */
export type ProfileType = 'filament' | 'process' | 'machine';

/** Where a preset comes from. Only user presets are safe to save over. */
export type PresetOrigin = 'system' | 'user' | 'file';

/**
 * A host-neutral reference to one preset. `id` is opaque: each adapter decides what it
 * contains (a file path, a preset name, ...) and only that adapter interprets it.
 */
export interface PresetRef {
  readonly id: string;
  readonly name: string;
  readonly type: ProfileType;
  readonly origin: PresetOrigin;
  /** Vendor folder for system presets (e.g. "BBL"), when the host knows it. */
  readonly vendor?: string;
}

/** A raw setting value as stored in a profile file: a string or an array of strings. */
export type RawValue = string | readonly string[];

/** A profile file's own content, before inheritance is applied. */
export interface ProfileDocument {
  readonly ref: PresetRef;
  /** The parsed JSON object, metadata keys included. */
  readonly content: Readonly<Record<string, unknown>>;
  /**
   * The file's text exactly as read. Hosts always set it; saving applies edits to it so the file
   * keeps its format (see core/serialize). Documents built in memory (tests) may omit it.
   */
  readonly text?: string;
}

/**
 * Keys that describe a profile rather than configure printing: the BBL_JSON_KEY_* and
 * ORCA_JSON_KEY_* constants in OrcaSlicer's Preset.hpp, plus the *_settings_id options. They're
 * never inherited, compared as settings, or copied between profiles.
 */
export const METADATA_KEYS: ReadonlySet<string> = new Set([
  'type',
  'name',
  'inherits',
  'include',
  'from',
  'setting_id',
  'base_id',
  'user_id',
  'filament_id',
  'instantiation',
  'version',
  'is_custom_defined',
  'description',
  'renamed_from',
  'created_time',
  'updated_time',
  // Config options that only record the preset's own name (PrintConfig.cpp, no label).
  'filament_settings_id',
  'print_settings_id',
  'printer_settings_id',
]);

/** The parent preset name a document inherits from, if any. */
export function inheritsFrom(document: ProfileDocument): string | undefined {
  const parent = document.content['inherits'];
  return typeof parent === 'string' && parent.length > 0 ? parent : undefined;
}
