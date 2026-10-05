import { configDir, join, sep } from '@tauri-apps/api/path';
import { exists, readDir, readTextFile } from '@tauri-apps/plugin-fs';
import type { HostFileSystem } from './file-system.ts';

/** HostFileSystem over Tauri's fs plugin. Paths must be inside the scopes in capabilities/. */
export function tauriFileSystem(): HostFileSystem {
  return {
    separator: sep(),
    async list(path) {
      if (!(await exists(path))) return [];
      const entries = await readDir(path);
      return entries.map((entry) => ({ name: entry.name, isDirectory: entry.isDirectory }));
    },
    readText: (path) => readTextFile(path),
  };
}

/**
 * OrcaSlicer's default data folder: %APPDATA%\OrcaSlicer on Windows,
 * ~/Library/Application Support/OrcaSlicer on macOS, $XDG_CONFIG_HOME/OrcaSlicer on Linux.
 */
export function defaultOrcaDataDir(): Promise<string> {
  return configDir().then((dir) => join(dir, 'OrcaSlicer'));
}
