/**
 * The file operations the desktop host needs. The real implementation wraps Tauri's fs
 * plugin; tests use an in-memory one, so the adapter's logic runs without Tauri.
 */
export interface HostFileSystem {
  readonly separator: string;
  /** Lists a directory's entries; resolves to [] when the directory doesn't exist. */
  list(path: string): Promise<readonly DirectoryEntry[]>;
  exists(path: string): Promise<boolean>;
  readText(path: string): Promise<string>;
  /** Creates or replaces a file with exactly this text (UTF-8, no BOM). */
  writeText(path: string, text: string): Promise<void>;
  /** Moves a file, replacing the destination if it exists. */
  rename(from: string, to: string): Promise<void>;
  remove(path: string): Promise<void>;
  /** Creates a directory and any missing parents. */
  makeDirectory(path: string): Promise<void>;
}

export interface DirectoryEntry {
  readonly name: string;
  readonly isDirectory: boolean;
}

/**
 * OrcaSlicer's lock around reading and writing user presets: an OS file lock on
 * `<data folder>/user.lock` (`InstanceLock` in OrcaSlicer, LockFileEx on Windows and flock
 * elsewhere), held only while it reads or writes. Saving takes it too, so the comparer and a
 * running OrcaSlicer never write the same files at once.
 */
export interface PresetLock {
  /** Runs `work` while holding the lock. Rejects, without running it, if the lock stays busy. */
  withLock<T>(work: () => Promise<T>): Promise<T>;
}
