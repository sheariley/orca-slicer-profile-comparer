import type { ProfileDocument } from '@comparer/core';
import { describeProfileRepositoryContract } from '@comparer/host-contract-tests';
import { describe, expect, it } from 'vitest';
import { createDesktopHost } from './desktop-host.ts';
import type { HostFileSystem } from './file-system.ts';

const DATA_DIR = '/home/user/.config/OrcaSlicer';

/** An in-memory HostFileSystem over a map of absolute paths to file contents. */
function memoryFileSystem(files: ReadonlyMap<string, string>): HostFileSystem {
  return {
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
    async readText(path) {
      const text = files.get(path);
      if (text === undefined) throw new Error(`No such file or directory (os error 2): ${path}`);
      return text;
    },
  };
}

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
  createDesktopHost({ fs: memoryFileSystem(layOut(documents)), dataDir: DATA_DIR }),
);

describe('createDesktopHost', () => {
  it('ignores .info files and folders it does not edit', async () => {
    const files = new Map([
      [`${DATA_DIR}/user/default/filament/My PLA.json`, '{"name":"My PLA"}'],
      [`${DATA_DIR}/user/default/filament/My PLA.info`, 'sync_info = '],
      [`${DATA_DIR}/system/BBL/machine/Bambu Lab A1.json`, '{"name":"Bambu Lab A1"}'],
    ]);
    const host = createDesktopHost({ fs: memoryFileSystem(files), dataDir: DATA_DIR });

    expect((await host.listPresets()).map((ref) => ref.name)).toEqual(['My PLA']);
  });

  it("lists user root presets from base/ and resolves parents in the child's user folder", async () => {
    const files = new Map([
      [`${DATA_DIR}/user/default/filament/base/My Base.json`, '{"name":"My Base","inherits":""}'],
      [`${DATA_DIR}/user/default/filament/My PETG.json`, '{"name":"My PETG","inherits":"My Base"}'],
      [`${DATA_DIR}/user/1234/filament/base/My Base.json`, '{"name":"My Base","inherits":""}'],
    ]);
    const host = createDesktopHost({ fs: memoryFileSystem(files), dataDir: DATA_DIR });
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
    const host = createDesktopHost({ fs: memoryFileSystem(files), dataDir: DATA_DIR });
    const [broken] = await host.listPresets();

    await expect(host.readDocument(broken!)).rejects.toMatchObject({ kind: 'invalid-profile' });
  });
});
