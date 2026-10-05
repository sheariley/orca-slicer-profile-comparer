import {
  diffProfiles,
  type DiffRow,
  type HostCapabilities,
  type PresetQuery,
  type PresetRef,
  type ProfileRepository,
  type ResolvedProfile,
  type SettingCatalog,
  type SettingInfo,
} from '@comparer/core';
import { loadResolved } from './use-cases/load-resolved.ts';

export interface ComparerDependencies {
  readonly repository: ProfileRepository;
  readonly catalog: SettingCatalog;
}

export interface Comparison {
  readonly left: ResolvedProfile;
  readonly right: ResolvedProfile;
  readonly rows: readonly DiffRow[];
}

/** The use cases the UI calls. The UI never talks to a host directly. */
export interface ComparerApp {
  readonly capabilities: HostCapabilities;
  listPresets(query?: PresetQuery): Promise<readonly PresetRef[]>;
  loadResolved(ref: PresetRef): Promise<ResolvedProfile>;
  compare(left: PresetRef, right: PresetRef): Promise<Comparison>;
  describeSetting(key: string): SettingInfo | undefined;
}

export function createComparerApp({ repository, catalog }: ComparerDependencies): ComparerApp {
  return {
    capabilities: repository.capabilities,
    listPresets: (query) => repository.listPresets(query),
    loadResolved: (ref) => loadResolved(repository, ref),
    async compare(leftRef, rightRef) {
      const [left, right] = await Promise.all([
        loadResolved(repository, leftRef),
        loadResolved(repository, rightRef),
      ]);
      return { left, right, rows: diffProfiles(left, right) };
    },
    describeSetting: (key) => catalog.describe(key),
  };
}
