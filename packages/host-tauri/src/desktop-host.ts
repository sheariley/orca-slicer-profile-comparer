import {
  ComparerError,
  type HostCapabilities,
  type PresetRef,
  type ProfileRepository,
  type ProfileType,
} from '@comparer/core';
import type { HostFileSystem } from './file-system.ts';

export interface DesktopHostOptions {
  readonly fs: HostFileSystem;
  /** OrcaSlicer's data folder (holds system/ and user/). */
  readonly dataDir: string;
}

const EDITABLE_TYPES: readonly ProfileType[] = ['filament', 'process'];

const CAPABILITIES: HostCapabilities = {
  // Saving needs format-preserving serialization in core first.
  canSave: false,
  canBrowseFiles: false,
  canWatchForChanges: false,
};

/**
 * Reads presets from OrcaSlicer's data folder:
 *   system/<Vendor>/<type>/<name>.json        copies of the installed vendor profiles
 *   user/<user_id>/<type>/<name>.json         user presets (each with a sibling .info file)
 *   user/<user_id>/<type>/base/<name>.json    user root presets (inherits ""), parents of others
 * <user_id> is "default" when signed out, or the account id when signed in.
 * Preset ids are absolute file paths. Names come from file names, which OrcaSlicer keeps
 * equal to the preset name.
 */
export function createDesktopHost({ fs, dataDir }: DesktopHostOptions): ProfileRepository {
  const join = (...parts: string[]) => parts.join(fs.separator);
  const userRoot = join(dataDir, 'user');

  async function presetsIn(
    folder: string,
    type: ProfileType,
    origin: 'system' | 'user',
    vendor?: string,
  ): Promise<PresetRef[]> {
    const refs: PresetRef[] = [];
    for (const entry of await fs.list(folder)) {
      if (entry.isDirectory || !entry.name.endsWith('.json')) continue;
      refs.push({
        id: join(folder, entry.name),
        name: entry.name.slice(0, -'.json'.length),
        type,
        origin,
        ...(vendor ? { vendor } : {}),
      });
    }
    return refs;
  }

  async function scan(): Promise<PresetRef[]> {
    const refs: PresetRef[] = [];
    for (const vendor of await fs.list(join(dataDir, 'system'))) {
      if (!vendor.isDirectory) continue;
      for (const type of EDITABLE_TYPES) {
        refs.push(
          ...(await presetsIn(
            join(dataDir, 'system', vendor.name, type),
            type,
            'system',
            vendor.name,
          )),
        );
      }
    }
    for (const user of await fs.list(userRoot)) {
      if (!user.isDirectory) continue;
      for (const type of EDITABLE_TYPES) {
        const folder = join(userRoot, user.name, type);
        refs.push(...(await presetsIn(folder, type, 'user')));
        refs.push(...(await presetsIn(join(folder, 'base'), type, 'user')));
      }
    }
    return refs.sort((a, b) => a.name.localeCompare(b.name));
  }

  /** The user folder (user/<user_id>/) a user preset's file lives in. */
  const userFolderOf = (ref: PresetRef) =>
    ref.origin === 'user'
      ? ref.id.slice(0, ref.id.indexOf(fs.separator, userRoot.length + 1) + 1)
      : undefined;

  return {
    capabilities: CAPABILITIES,
    // OrcaSlicer writes CRLF on Windows (text-mode files), LF elsewhere.
    newline: fs.separator === '\\' ? '\r\n' : '\n',

    async listPresets(query) {
      const refs = await scan();
      return query?.type === undefined ? refs : refs.filter((ref) => ref.type === query.type);
    },

    async readDocument(ref) {
      let text: string;
      try {
        text = await fs.readText(ref.id);
      } catch (error) {
        throw toComparerError(error, ref.id);
      }
      try {
        return { ref, content: JSON.parse(text) as Record<string, unknown>, text };
      } catch {
        throw new ComparerError('invalid-profile', `"${ref.name}" isn't valid JSON.`, ref.id);
      }
    },

    async resolveParent(child, parentName) {
      const candidates = (await scan()).filter(
        (ref) => ref.type === child.type && ref.name === parentName,
      );
      const childFolder = userFolderOf(child);
      // The child's own user folder first, then the same vendor, then any system preset.
      return (
        candidates.find((ref) => childFolder && ref.id.startsWith(childFolder)) ??
        candidates.find((ref) => ref.origin === 'system' && ref.vendor === child.vendor) ??
        candidates.find((ref) => ref.origin === 'system')
      );
    },

    async saveDocument() {
      throw new ComparerError('unsupported', "Saving isn't supported in the desktop app yet.");
    },
  };
}

/** Maps file system failures to typed errors. Tauri reports them as plain strings. */
function toComparerError(error: unknown, path: string): ComparerError {
  const text = String(error);
  if (/not allowed|forbidden|denied|permission/i.test(text)) {
    return new ComparerError('access-denied', `Access to ${path} was denied.`, path);
  }
  if (/not found|no such file|cannot find|os error 2\b/i.test(text)) {
    return new ComparerError('not-found', `${path} doesn't exist.`, path);
  }
  return new ComparerError('host-error', text, path);
}
