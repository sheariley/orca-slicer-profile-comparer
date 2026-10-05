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
    expect(resolved.settings.get('filament_max_volumetric_speed')?.definedBy.name).toBe(
      'Bambu ABS @BBL A1',
    );
    // Inherited from further up.
    expect(resolved.settings.get('filament_flow_ratio')?.definedBy.name).toBe('Bambu ABS @base');
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

  it('rejects a chain that repeats a preset', () => {
    const document: ProfileDocument = {
      ref: { id: 'a', name: 'A', type: 'filament', origin: 'user' },
      content: { name: 'A', inherits: 'A' },
    };

    expect(() => resolveChain([document, document])).toThrow(ComparerError);
  });
});
