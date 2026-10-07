export { createDesktopHost, type DesktopHostOptions } from './desktop-host.ts';
export type { DirectoryEntry, HostFileSystem, PresetLock } from './file-system.ts';
export {
  defaultBackupDir,
  defaultOrcaDataDir,
  tauriFileSystem,
  tauriPresetLock,
} from './tauri-file-system.ts';
