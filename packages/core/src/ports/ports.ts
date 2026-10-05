import type { PresetRef, ProfileDocument, ProfileType, RawValue } from '../model/profile.ts';
import type { LegacyKeys } from '../resolve/resolve-chain.ts';

/**
 * What a host can do. The app and UI adapt to these flags instead of checking which host
 * they're running in.
 */
export interface HostCapabilities {
  readonly canSave: boolean;
  readonly canBrowseFiles: boolean;
  readonly canWatchForChanges: boolean;
}

export interface PresetQuery {
  readonly type?: ProfileType;
}

/** The result of saving one document. Hosts report what the user must do next. */
export interface SaveResult {
  readonly ref: PresetRef;
  /** What the user must do before OrcaSlicer sees the change. */
  readonly reloadRequired: 'none' | 'reselect-preset' | 'restart';
}

/** Access to profile documents. Every host implements this. */
export interface ProfileRepository {
  readonly capabilities: HostCapabilities;
  listPresets(query?: PresetQuery): Promise<readonly PresetRef[]>;
  readDocument(ref: PresetRef): Promise<ProfileDocument>;
  /**
   * Finds the preset that `child` inherits from by name. The host decides the lookup scope
   * (same vendor folder, shared libraries, ...). Resolves to undefined when there's no match.
   */
  resolveParent(child: PresetRef, parentName: string): Promise<PresetRef | undefined>;
  saveDocument(document: ProfileDocument): Promise<SaveResult>;
}

/** Human-readable metadata for one setting key. */
export interface SettingInfo {
  readonly key: string;
  readonly label: string;
  /** Group used to organize the diff view (OrcaSlicer's category). */
  readonly group?: string;
  readonly tooltip?: string;
  /** Unit text shown after the value (e.g. "mm³/s"). */
  readonly unit?: string;
}

export interface SettingCatalog {
  describe(key: string): SettingInfo | undefined;
  /**
   * OrcaSlicer's built-in default for every setting a preset of this type owns. Root presets
   * (no `inherits`) start from these. Empty for types the catalog doesn't cover.
   */
  defaultsFor(type: ProfileType): ReadonlyMap<string, RawValue>;
  /** The obsolete and renamed keys OrcaSlicer migrates when it loads a profile. */
  legacyKeys(): LegacyKeys;
}

/** Persistent user preferences (default filters, recent comparisons, ...). */
export interface SettingsStore {
  load(): Promise<Readonly<Record<string, unknown>>>;
  save(settings: Readonly<Record<string, unknown>>): Promise<void>;
}
