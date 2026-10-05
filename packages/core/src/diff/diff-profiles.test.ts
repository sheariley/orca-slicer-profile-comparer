import { describe, expect, it } from 'vitest';
import { chainFor, loadFixtureDocuments } from '../../test/load-fixtures.ts';
import { resolveChain } from '../resolve/resolve-chain.ts';
import { diffProfiles } from './diff-profiles.ts';

const documents = loadFixtureDocuments();
const resolve = (name: string) => resolveChain(chainFor(documents, name));

describe('diffProfiles', () => {
  it('reports changed and identical settings between two real filaments', () => {
    const rows = diffProfiles(resolve('Bambu ABS @BBL A1'), resolve('Bambu PLA Basic @BBL A1'));
    const byKey = new Map(rows.map((row) => [row.key, row]));

    expect(byKey.get('nozzle_temperature')?.status).toBe('changed');
    expect(byKey.get('filament_type')?.left).toEqual(['ABS']);
    expect(byKey.get('filament_type')?.right).toEqual(['PLA']);
    expect(rows.some((row) => row.status === 'same')).toBe(true);
  });

  it('sorts rows by key', () => {
    const rows = diffProfiles(resolve('My ABS'), resolve('Bambu ABS @BBL A1'));
    const keys = rows.map((row) => row.key);

    expect(keys).toEqual([...keys].sort());
  });

  it('marks only the user overrides as changed against the parent', () => {
    const rows = diffProfiles(resolve('My ABS'), resolve('Bambu ABS @BBL A1'));
    const changed = rows.filter((row) => row.status !== 'same').map((row) => row.key);

    expect(changed.sort()).toEqual(['filament_flow_ratio', 'nozzle_temperature']);
  });
});
