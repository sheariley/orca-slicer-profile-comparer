/**
 * The file operations the desktop host needs. The real implementation wraps Tauri's fs
 * plugin; tests use an in-memory one, so the adapter's logic runs without Tauri.
 */
export interface HostFileSystem {
  readonly separator: string;
  /** Lists a directory's entries; resolves to [] when the directory doesn't exist. */
  list(path: string): Promise<readonly DirectoryEntry[]>;
  readText(path: string): Promise<string>;
}

export interface DirectoryEntry {
  readonly name: string;
  readonly isDirectory: boolean;
}
