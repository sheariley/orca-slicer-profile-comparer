import type { ProfileDocument, ProfileType } from '@comparer/core';
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

const app = createComparerApp({
  repository: createMemoryHost({ documents }),
  catalog: { describe: () => undefined },
});

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

  it('reports a missing parent as not-found', async () => {
    const orphanApp = createComparerApp({
      repository: createMemoryHost({
        documents: [doc('orphan', 'filament', { inherits: 'gone' })],
      }),
      catalog: { describe: () => undefined },
    });
    const [orphan] = await orphanApp.listPresets();

    await expect(orphanApp.loadResolved(orphan!)).rejects.toMatchObject({ kind: 'not-found' });
  });
});
