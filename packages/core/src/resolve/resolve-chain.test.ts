import { describe, expect, it } from 'vitest';
import { chainFor, loadFixtureDocuments } from '../../test/load-fixtures.ts';
import { ComparerError } from '../errors/errors.ts';
import type { ProfileDocument } from '../model/profile.ts';
import { resolveChain } from './resolve-chain.ts';

const documents = loadFixtureDocuments();

describe('resolveChain', () => {
  it('resolves a real four-level filament chain, leaf first', () => {
    const resolved = resolveChain(chainFor(documents, 'Bambu ABS @BBL A1'));

    expect(resolved.chain.map((ref) => ref.name)).toEqual([
      'Bambu ABS @BBL A1',
      'Bambu ABS @base',
      'fdm_filament_abs',
      'fdm_filament_common',
    ]);
    // Overridden in the leaf.
    expect(resolved.settings.get('filament_max_volumetric_speed')?.value).toEqual(['16']);
    expect(resolved.settings.get('filament_max_volumetric_speed')?.definedBy).toMatchObject({
      name: 'Bambu ABS @BBL A1',
    });
    // Inherited from further up.
    expect(resolved.settings.get('filament_flow_ratio')?.definedBy).toMatchObject({
      name: 'Bambu ABS @base',
    });
  });

  it('lets a user preset override its system parent', () => {
    const resolved = resolveChain(chainFor(documents, 'My ABS'));

    expect(resolved.settings.get('nozzle_temperature')?.value).toEqual(['260']);
    expect(resolved.settings.get('filament_max_volumetric_speed')?.value).toEqual(['16']);
  });

  it('skips metadata keys', () => {
    const resolved = resolveChain(chainFor(documents, 'Bambu ABS @BBL A1'));

    for (const key of ['name', 'inherits', 'from', 'setting_id', 'instantiation', 'type']) {
      expect(resolved.settings.has(key)).toBe(false);
    }
  });

  it('starts the root from built-in defaults, which any preset in the chain overrides', () => {
    const defaults = new Map<string, string | string[]>([
      ['nozzle_temperature', ['200']],
      ['activate_air_filtration', ['0']],
      ['name', 'never inherited'],
    ]);
    const resolved = resolveChain(chainFor(documents, 'My ABS'), { defaults });

    expect(resolved.settings.get('nozzle_temperature')).toMatchObject({ value: ['260'] });
    expect(resolved.settings.get('activate_air_filtration')?.definedBy).not.toBe('default');
    expect(
      resolveChain(chainFor(documents, 'My ABS'), {
        defaults: new Map([['made_up_key', '7']]),
      }).settings.get('made_up_key'),
    ).toEqual({ value: ['7'], definedBy: 'default' });
    expect(resolved.settings.has('name')).toBe(false);
  });

  it('drops obsolete keys and renames old keys, like OrcaSlicer does on load', () => {
    const document: ProfileDocument = {
      ref: { id: 'old', name: 'Old', type: 'process', origin: 'user' },
      content: {
        name: 'Old',
        enable_wipe_tower: '1',
        wipe_tower_width: '60',
        prime_tower_width: '35',
        adaptive_layer_height: '1',
      },
    };
    const resolved = resolveChain([document], {
      legacyKeys: {
        obsolete: new Set(['adaptive_layer_height']),
        renamed: new Map([
          ['enable_wipe_tower', 'enable_prime_tower'],
          ['wipe_tower_width', 'prime_tower_width'],
        ]),
      },
    });

    expect([...resolved.settings.keys()].sort()).toEqual([
      'enable_prime_tower',
      'prime_tower_width',
    ]);
    expect(resolved.settings.get('enable_prime_tower')?.value).toEqual(['1']);
    // The current key wins over the old one it replaces.
    expect(resolved.settings.get('prime_tower_width')?.value).toEqual(['35']);
  });

  it('rejects a chain that repeats a preset', () => {
    const document: ProfileDocument = {
      ref: { id: 'a', name: 'A', type: 'filament', origin: 'user' },
      content: { name: 'A', inherits: 'A' },
    };

    expect(() => resolveChain([document, document])).toThrow(ComparerError);
  });
});
