import { describe, expect, it } from 'vitest';
import { parsePrintConfig } from './parse-print-config.ts';

const SOURCE = `
    def = this->add("filament_max_volumetric_speed", coFloats);
    def->label = L("Max volumetric speed");
    def->tooltip = L("This setting is the volume of filament; it can be melted. "
                     "This value cannot be zero.");
    def->sidetext = L(u8"mm³/s");	// cubic millimeters per second
    def->min = 0;

    def = this->add("hot_plate_temp", coInts);
    def->label = L("Other layers");
    def->sidetext = L(u8"\\u2103" /* °C */);	// degrees Celsius
    def->full_label = L("Bed temperature");
    def->category = L("Temperature");

    def = this->add("machine_load_filament_time", coFloat);
    def->sidetext = L_CONTEXT("s", "second");

    def = this->add(opt_key, coFloat);
    def->label = L("Computed key, skipped");
`;

describe('parsePrintConfig', () => {
  const settings = parsePrintConfig(SOURCE);

  it('reads labels, units, and concatenated tooltips', () => {
    expect(settings.get('filament_max_volumetric_speed')).toEqual({
      label: 'Max volumetric speed',
      tooltip:
        'This setting is the volume of filament; it can be melted. This value cannot be zero.',
      unit: 'mm³/s',
    });
  });

  it('decodes escapes, ignores comments, and reads full labels and categories', () => {
    expect(settings.get('hot_plate_temp')).toEqual({
      label: 'Other layers',
      fullLabel: 'Bed temperature',
      category: 'Temperature',
      unit: '℃',
    });
  });

  it('takes the text, not the context, from L_CONTEXT', () => {
    expect(settings.get('machine_load_filament_time')?.unit).toBe('s');
  });

  it('skips options with computed keys', () => {
    expect([...settings.keys()]).toHaveLength(3);
  });
});
