import { describe, expect, it } from 'vitest';
import { createSettingCatalog } from './setting-catalog.ts';

describe('createSettingCatalog', () => {
  it('describes a setting from the generated data', () => {
    const info = createSettingCatalog().describe('layer_height');

    expect(info).toMatchObject({ key: 'layer_height', label: 'Layer height', unit: 'mm' });
  });

  it('prefers the full label over the short tab label', () => {
    const catalog = createSettingCatalog({
      hot_plate_temp: { label: 'Other layers', fullLabel: 'Bed temperature' },
    });

    expect(catalog.describe('hot_plate_temp')?.label).toBe('Bed temperature');
  });

  it('returns undefined for unknown keys', () => {
    expect(createSettingCatalog({}).describe('nope')).toBeUndefined();
  });
});
