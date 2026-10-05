import type { ProfileDocument, ProfileType, RawValue } from '@comparer/core';
import { createMemoryHost } from '@comparer/host-memory';
import { describe, expect, it } from 'vitest';
import { createComparerApp } from './comparer-app.ts';

function doc(
  name: string,
  type: ProfileType,
  content: Record<string, unknown>,
  vendor = 'Acme',
): ProfileDocument {
  return {
    ref: { id: `${vendor}/${name}`, name, type, origin: 'system', vendor },
    content: { name, ...content },
  };
}

const documents = [
  doc('base', 'filament', { nozzle_temperature: ['200'], fan_max_speed: ['100'] }),
  doc('PLA', 'filament', { inherits: 'base', nozzle_temperature: ['210'] }),
  doc('PETG', 'filament', { inherits: 'base', nozzle_temperature: ['240'] }),
  doc('0.20mm', 'process', { layer_height: '0.2' }),
];

const noLegacy = { obsolete: new Set<string>(), renamed: new Map<string, string>() };
const noCatalog = {
  describe: () => undefined,
  defaultsFor: () => new Map(),
  legacyKeys: () => noLegacy,
};

const app = createComparerApp({ repository: createMemoryHost({ documents }), catalog: noCatalog });

describe('ComparerApp', () => {
  it('lists presets filtered by type', async () => {
    const presets = await app.listPresets({ type: 'filament' });
    expect(presets.map((preset) => preset.name)).toEqual(['base', 'PETG', 'PLA']);
  });

  it('compares two presets through their inheritance chains', async () => {
    const presets = await app.listPresets();
    const byName = (name: string) => presets.find((preset) => preset.name === name)!;

    const comparison = await app.compare(byName('PLA'), byName('PETG'));
    const byKey = new Map(comparison.rows.map((row) => [row.key, row]));

    expect(byKey.get('nozzle_temperature')).toMatchObject({
      status: 'changed',
      left: ['210'],
      right: ['240'],
    });
    expect(byKey.get('fan_max_speed')?.status).toBe('same');
  });

  it("fills settings a chain doesn't set with the built-in defaults for its type", async () => {
    const defaultsApp = createComparerApp({
      repository: createMemoryHost({ documents }),
      catalog: {
        describe: () => undefined,
        defaultsFor: (type) =>
          new Map<string, RawValue>(
            type === 'filament' ? [['filament_density', ['1.24']]] : [['wall_loops', '2']],
          ),
        legacyKeys: () => noLegacy,
      },
    });
    const presets = await defaultsApp.listPresets();
    const pla = await defaultsApp.loadResolved(presets.find((preset) => preset.name === 'PLA')!);
    const process = await defaultsApp.loadResolved(presets.find((p) => p.name === '0.20mm')!);

    expect(pla.settings.get('filament_density')).toEqual({ value: ['1.24'], definedBy: 'default' });
    expect(pla.settings.has('wall_loops')).toBe(false);
    expect(process.settings.get('wall_loops')?.definedBy).toBe('default');
  });

  it('reports a missing parent as not-found', async () => {
    const orphanApp = createComparerApp({
      repository: createMemoryHost({
        documents: [doc('orphan', 'filament', { inherits: 'gone' })],
      }),
      catalog: noCatalog,
    });
    const [orphan] = await orphanApp.listPresets();

    await expect(orphanApp.loadResolved(orphan!)).rejects.toMatchObject({ kind: 'not-found' });
  });
});
