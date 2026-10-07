import type { ProfileDocument } from '@comparer/core';
import { describeProfileRepositoryContract } from '@comparer/host-contract-tests';
import { describe, expect, it } from 'vitest';
import { createDesktopHost, type DesktopHostOptions } from './desktop-host.ts';
import type { HostFileSystem, PresetLock } from './file-system.ts';

const DATA_DIR = '/home/user/.config/OrcaSlicer';
const BACKUP_DIR = '/home/user/.local/share/comparer/backups';

interface MemoryFileSystem extends HostFileSystem {
  readonly files: Map<string, string>;
  /** How many more renames fail, as Windows refuses them while a file is held open. */
  failRenames: number;
}

/** An in-memory HostFileSystem over a map of absolute paths to file contents. */
function memoryFileSystem(initial: ReadonlyMap<string, string>): MemoryFileSystem {
  const files = new Map(initial);
  const fs: MemoryFileSystem = {
    files,
    failRenames: 0,
    separator: '/',
    async list(path) {
      const prefix = `${path}/`;
      const children = new Map<string, boolean>();
      for (const file of files.keys()) {
        if (!file.startsWith(prefix)) continue;
        const [name, ...rest] = file.slice(prefix.length).split('/');
        children.set(name!, rest.length > 0);
      }
      return [...children].map(([name, isDirectory]) => ({ name, isDirectory }));
    },
    async exists(path) {
      return files.has(path);
    },
    async readText(path) {
      const text = files.get(path);
      if (text === undefined) throw new Error(`No such file or directory (os error 2): ${path}`);
      return text;
    },
    async writeText(path, text) {
      files.set(path, text);
    },
    async rename(from, to) {
      if (fs.failRenames > 0) {
        fs.failRenames--;
        throw new Error('The process cannot access the file (os error 32)');
      }
      files.set(to, files.get(from)!);
      files.delete(from);
    },
    async remove(path) {
      files.delete(path);
    },
    async makeDirectory() {},
  };
  return fs;
}

/** A lock that records how it was used. */
function recordingLock(): PresetLock & { held: boolean; uses: number } {
  const lock = {
    held: false,
    uses: 0,
    async withLock<T>(work: () => Promise<T>): Promise<T> {
      lock.uses++;
      lock.held = true;
      try {
        return await work();
      } finally {
        lock.held = false;
      }
    },
  };
  return lock;
}

const desktopHost = (fs: HostFileSystem, options: Partial<DesktopHostOptions> = {}) =>
  createDesktopHost({
    fs,
    dataDir: DATA_DIR,
    lock: recordingLock(),
    backupDir: BACKUP_DIR,
    retryDelaysMs: [0, 0],
    ...options,
  });

/** Lays documents out the way OrcaSlicer's data folder does. */
function layOut(documents: readonly ProfileDocument[]): Map<string, string> {
  return new Map(
    documents.map(({ ref, content }) => {
      const owner = ref.origin === 'system' ? `system/${ref.vendor}` : 'user/default';
      return [`${DATA_DIR}/${owner}/${ref.type}/${ref.name}.json`, JSON.stringify(content)];
    }),
  );
}

describeProfileRepositoryContract('host-tauri (desktop host)', (documents) =>
  desktopHost(memoryFileSystem(layOut(documents))),
);

describe('createDesktopHost', () => {
  it('ignores .info files and folders it does not edit', async () => {
    const files = new Map([
      [`${DATA_DIR}/user/default/filament/My PLA.json`, '{"name":"My PLA"}'],
      [`${DATA_DIR}/user/default/filament/My PLA.info`, 'sync_info = '],
      [`${DATA_DIR}/system/BBL/machine/Bambu Lab A1.json`, '{"name":"Bambu Lab A1"}'],
    ]);
    const host = desktopHost(memoryFileSystem(files));

    expect((await host.listPresets()).map((ref) => ref.name)).toEqual(['My PLA']);
  });

  it("lists user root presets from base/ and resolves parents in the child's user folder", async () => {
    const files = new Map([
      [`${DATA_DIR}/user/default/filament/base/My Base.json`, '{"name":"My Base","inherits":""}'],
      [`${DATA_DIR}/user/default/filament/My PETG.json`, '{"name":"My PETG","inherits":"My Base"}'],
      [`${DATA_DIR}/user/1234/filament/base/My Base.json`, '{"name":"My Base","inherits":""}'],
    ]);
    const host = desktopHost(memoryFileSystem(files));
    const petg = (await host.listPresets()).find((ref) => ref.name === 'My PETG')!;

    expect((await host.listPresets()).map((ref) => ref.name)).toEqual([
      'My Base',
      'My Base',
      'My PETG',
    ]);
    expect((await host.resolveParent(petg, 'My Base'))?.id).toBe(
      `${DATA_DIR}/user/default/filament/base/My Base.json`,
    );
  });

  it('reports malformed JSON as invalid-profile', async () => {
    const files = new Map([[`${DATA_DIR}/user/default/filament/Broken.json`, '{ nope']]);
    const host = desktopHost(memoryFileSystem(files));
    const [broken] = await host.listPresets();

    await expect(host.readDocument(broken!)).rejects.toMatchObject({ kind: 'invalid-profile' });
  });
});

describe('saving', () => {
  const PRESET = `${DATA_DIR}/user/default/filament/My PLA.json`;
  const INFO = `${DATA_DIR}/user/default/filament/My PLA.info`;
  const ORIGINAL =
    '{\r\n\t"name": "My PLA",\r\n\t"nozzle_temperature": [\r\n\t\t"210"\r\n\t]\r\n}\r\n';
  const EDITED = ORIGINAL.replace('"210"', '"215"');
  const INFO_TEXT =
    'sync_info = \r\nuser_id = \r\nsetting_id = abc\r\nbase_id = GFSA04\r\nupdated_time = 1736655895\r\n';

  async function setup(options: Partial<DesktopHostOptions> = {}) {
    const fs = memoryFileSystem(
      new Map([
        [PRESET, ORIGINAL],
        [INFO, INFO_TEXT],
      ]),
    );
    const repository = desktopHost(fs, options);
    const [ref] = await repository.listPresets();
    return { fs, repository, ref: ref! };
  }

  it('writes the exact text, marks the .info for cloud sync, and asks for a restart', async () => {
    const { fs, repository, ref } = await setup();

    const result = await repository.saveDocument({ ref, text: EDITED, previousText: ORIGINAL });

    expect(result).toEqual({ ref, reloadRequired: 'restart' });
    expect(fs.files.get(PRESET)).toBe(EDITED);
    expect(fs.files.get(INFO)).toBe(
      INFO_TEXT.replace('sync_info = \r\n', 'sync_info = update\r\n'),
    );
    expect([...fs.files.keys()].filter((path) => path.endsWith('.tmp'))).toEqual([]);
  });

  it('backs up the file and its .info to the app folder, grouped by batch', async () => {
    const { fs, repository, ref } = await setup();

    await repository.saveDocument({
      ref,
      text: EDITED,
      previousText: ORIGINAL,
      batch: '2026-10-07T12:30:05.123Z',
    });

    const folder = `${BACKUP_DIR}/2026-10-07T12-30-05-123Z/user/default/filament`;
    expect(fs.files.get(`${folder}/My PLA.json`)).toBe(ORIGINAL);
    expect(fs.files.get(`${folder}/My PLA.info`)).toBe(INFO_TEXT);
  });

  it("does all of it under OrcaSlicer's lock", async () => {
    const lock = recordingLock();
    let heldWhileWriting = false;
    const fs = memoryFileSystem(new Map([[PRESET, ORIGINAL]]));
    const writeText = fs.writeText.bind(fs);
    fs.writeText = async (path, text) => {
      heldWhileWriting = lock.held;
      await writeText(path, text);
    };
    const repository = desktopHost(fs, { lock });
    const [ref] = await repository.listPresets();

    await repository.saveDocument({ ref: ref!, text: EDITED, previousText: ORIGINAL });

    expect(lock.uses).toBe(1);
    expect(heldWhileWriting).toBe(true);
  });

  it('refuses with conflict, writing nothing, when the file changed since it was read', async () => {
    const { fs, repository, ref } = await setup();
    fs.files.set(PRESET, ORIGINAL.replace('"210"', '"220"'));

    await expect(
      repository.saveDocument({ ref, text: EDITED, previousText: ORIGINAL }),
    ).rejects.toMatchObject({ kind: 'conflict' });
    expect(fs.files.get(INFO)).toBe(INFO_TEXT);
    expect([...fs.files.keys()].some((path) => path.startsWith(BACKUP_DIR))).toBe(false);
  });

  it('retries a rename Windows refuses, then succeeds', async () => {
    const { fs, repository, ref } = await setup();
    fs.failRenames = 2;

    await repository.saveDocument({ ref, text: EDITED, previousText: ORIGINAL });

    expect(fs.files.get(PRESET)).toBe(EDITED);
    expect([...fs.files.keys()].filter((path) => path.endsWith('.tmp'))).toEqual([]);
  });

  it('writes in place when the rename keeps failing, like OrcaSlicer, after the backup', async () => {
    const { fs, repository, ref } = await setup();
    fs.failRenames = 10;

    await repository.saveDocument({ ref, text: EDITED, previousText: ORIGINAL, batch: 'b' });

    expect(fs.files.get(PRESET)).toBe(EDITED);
    expect(fs.files.get(`${BACKUP_DIR}/b/user/default/filament/My PLA.json`)).toBe(ORIGINAL);
    expect([...fs.files.keys()].filter((path) => path.endsWith('.tmp'))).toEqual([]);
  });

  it('saves a preset without an .info, and never creates one', async () => {
    const fs = memoryFileSystem(new Map([[PRESET, ORIGINAL]]));
    const repository = desktopHost(fs);
    const [ref] = await repository.listPresets();

    await repository.saveDocument({ ref: ref!, text: EDITED, previousText: ORIGINAL });

    expect(fs.files.get(PRESET)).toBe(EDITED);
    expect(fs.files.has(INFO)).toBe(false);
  });

  it('never writes system presets', async () => {
    const system = `${DATA_DIR}/system/BBL/filament/Bambu PLA.json`;
    const fs = memoryFileSystem(new Map([[system, '{"name":"Bambu PLA"}']]));
    const repository = desktopHost(fs);
    const [ref] = await repository.listPresets();

    await expect(
      repository.saveDocument({ ref: ref!, text: '{}', previousText: '{"name":"Bambu PLA"}' }),
    ).rejects.toMatchObject({ kind: 'unsupported' });
    expect(fs.files.get(system)).toBe('{"name":"Bambu PLA"}');
  });

  it('reports CRLF line endings for new files on Windows, LF elsewhere', () => {
    expect(desktopHost(memoryFileSystem(new Map())).newline).toBe('\n');
    expect(desktopHost({ ...memoryFileSystem(new Map()), separator: '\\' }).newline).toBe('\r\n');
  });
});
