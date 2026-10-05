import {
  ComparerError,
  type HostCapabilities,
  type ProfileDocument,
  type ProfileRepository,
  type SettingsStore,
} from '@comparer/core';

export interface MemoryHostOptions {
  readonly documents: readonly ProfileDocument[];
  readonly capabilities?: Partial<HostCapabilities>;
}

export type MemoryHost = ProfileRepository & SettingsStore;

/** An in-memory host for tests, the browser playground, and UI previews. */
export function createMemoryHost({ documents, capabilities }: MemoryHostOptions): MemoryHost {
  const byId = new Map(documents.map((document) => [document.ref.id, document]));
  const resolvedCapabilities: HostCapabilities = {
    canSave: true,
    canBrowseFiles: false,
    canWatchForChanges: false,
    ...capabilities,
  };
  let settings: Readonly<Record<string, unknown>> = {};

  return {
    capabilities: resolvedCapabilities,

    async listPresets(query) {
      return [...byId.values()]
        .map((document) => document.ref)
        .filter((ref) => query?.type === undefined || ref.type === query.type)
        .sort((a, b) => a.name.localeCompare(b.name));
    },

    async readDocument(ref) {
      const document = byId.get(ref.id);
      if (!document) throw new ComparerError('not-found', `No preset "${ref.name}".`, ref.id);
      return document;
    },

    async resolveParent(child, parentName) {
      // Same vendor first, then anywhere (user presets inherit across vendors).
      const candidates = [...byId.values()]
        .map((document) => document.ref)
        .filter((ref) => ref.type === child.type && ref.name === parentName);
      return candidates.find((ref) => ref.vendor === child.vendor) ?? candidates[0];
    },

    async saveDocument(document) {
      if (!resolvedCapabilities.canSave) {
        throw new ComparerError('unsupported', 'This host is read-only.');
      }
      if (!byId.has(document.ref.id)) {
        throw new ComparerError('not-found', `No preset "${document.ref.name}".`, document.ref.id);
      }
      byId.set(document.ref.id, document);
      return { ref: document.ref, reloadRequired: 'none' };
    },

    async load() {
      return settings;
    },

    async save(next) {
      settings = { ...next };
    },
  };
}
