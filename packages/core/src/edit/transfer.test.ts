import { describe, expect, it } from 'vitest';
import type { ProfileDocument, ProfileType } from '../model/profile.ts';
import type { KeyRules } from '../ports/ports.ts';
import { resolveChain, type ResolvedProfile } from '../resolve/resolve-chain.ts';
import { fitToVariants, planTransfer, type TransferTarget } from './transfer.ts';

const doc = (
  name: string,
  content: Record<string, unknown>,
  type: ProfileType = 'filament',
): ProfileDocument => ({
  ref: { id: name, name, type, origin: 'user' },
  content: { name, ...content },
});

const rules: KeyRules = {
  owned: new Set([
    'nozzle_temperature',
    'filament_flow_ratio',
    'filament_start_gcode',
    'fan_max_speed',
    'filament_type',
  ]),
  perVariant: new Set(['filament_flow_ratio', 'filament_extruder_variant']),
};

/** A target from its own document and (optionally) its parent, as the app layer builds it. */
function target(own: ProfileDocument, parent?: ProfileDocument): TransferTarget {
  const chain = parent ? [own, parent] : [own];
  return {
    document: own,
    resolved: resolveChain(chain),
    inherited: parent ? resolveChain([parent]).settings : new Map(),
    rules,
  };
}

const source: ResolvedProfile = resolveChain([
  doc('Source', {
    nozzle_temperature: ['215'],
    filament_flow_ratio: ['0.95'],
    filament_start_gcode: ['M104\nG28'],
    fan_max_speed: ['80'],
    layer_height: '0.2',
  }),
]);

describe('planTransfer', () => {
  it('sets a differing value, keeping the shape the target uses', () => {
    const plan = planTransfer(
      source,
      ['nozzle_temperature'],
      [target(doc('Target', { nozzle_temperature: ['240'] }))],
    );

    expect(plan.targets[0]).toEqual({
      target: expect.objectContaining({ name: 'Target' }),
      changes: [{ key: 'nozzle_temperature', change: { kind: 'set', value: ['215'] } }],
      skipped: [],
    });
  });

  it('skips a value the target already has', () => {
    const plan = planTransfer(
      source,
      ['fan_max_speed'],
      [target(doc('Target', { fan_max_speed: ['80'] }))],
    );

    expect(plan.targets[0]!.skipped).toEqual([{ key: 'fan_max_speed', reason: 'already-equal' }]);
    expect(plan.targets[0]!.changes).toEqual([]);
  });

  it('removes the override when the copied value is what the target would inherit', () => {
    const parent = doc('Parent', { nozzle_temperature: ['215'] });
    const own = doc('Child', { inherits: 'Parent', nozzle_temperature: ['240'] });

    const plan = planTransfer(source, ['nozzle_temperature'], [target(own, parent)]);

    expect(plan.targets[0]!.changes).toEqual([
      { key: 'nozzle_temperature', change: { kind: 'remove' } },
    ]);
  });

  it('sets an inherited key the target has never overridden', () => {
    const parent = doc('Parent', { nozzle_temperature: ['240'] });
    const own = doc('Child', { inherits: 'Parent' });

    const plan = planTransfer(source, ['nozzle_temperature'], [target(own, parent)]);

    expect(plan.targets[0]!.changes).toEqual([
      { key: 'nozzle_temperature', change: { kind: 'set', value: ['215'] } },
    ]);
  });

  it('never copies metadata, the variant list, keys the type does not own, or missing keys', () => {
    const withVariants = resolveChain([
      doc('Dual', { filament_extruder_variant: ['A', 'B'], filament_type: ['PLA'] }),
    ]);

    const plan = planTransfer(
      withVariants,
      ['name', 'filament_extruder_variant', 'layer_height', 'filament_type', 'nozzle_temperature'],
      [target(doc('Target', {}))],
    );

    expect(plan.targets[0]!.skipped).toEqual([
      { key: 'name', reason: 'metadata' },
      { key: 'filament_extruder_variant', reason: 'variant-list' },
      { key: 'layer_height', reason: 'not-owned' },
      { key: 'nozzle_temperature', reason: 'missing-in-source' },
    ]);
    expect(plan.targets[0]!.changes).toEqual([
      { key: 'filament_type', change: { kind: 'set', value: ['PLA'] } },
    ]);
  });

  it('allows any key when the target type has no known ownership list', () => {
    const open: TransferTarget = {
      ...target(doc('Target', {})),
      rules: { owned: new Set(), perVariant: new Set() },
    };

    const plan = planTransfer(source, ['layer_height'], [open]);

    expect(plan.targets[0]!.changes).toEqual([
      { key: 'layer_height', change: { kind: 'set', value: '0.2' } },
    ]);
  });

  it('fits per-variant settings to the target, matching variants by name', () => {
    const dual = resolveChain([
      doc('Dual', {
        filament_extruder_variant: ['Direct Drive Standard', 'Direct Drive High Flow'],
        filament_flow_ratio: ['0.95', '0.98'],
      }),
    ]);
    const highFlowOnly = doc('HF', {
      filament_extruder_variant: ['Direct Drive High Flow'],
      filament_flow_ratio: ['1'],
    });

    const plan = planTransfer(dual, ['filament_flow_ratio'], [target(highFlowOnly)]);

    expect(plan.targets[0]!.changes).toEqual([
      { key: 'filament_flow_ratio', change: { kind: 'set', value: ['0.98'] } },
    ]);
  });

  it('copies other arrays as they are and handles several targets independently', () => {
    const plan = planTransfer(
      source,
      ['filament_start_gcode', 'fan_max_speed'],
      [target(doc('A', { fan_max_speed: ['80'] })), target(doc('B', { fan_max_speed: ['100'] }))],
    );

    expect(plan.targets.map((t) => t.changes.map((c) => c.key))).toEqual([
      ['filament_start_gcode'],
      ['filament_start_gcode', 'fan_max_speed'],
    ]);
    expect(plan.targets[0]!.changes[0]!.change).toEqual({ kind: 'set', value: ['M104\nG28'] });
  });
});

describe('fitToVariants', () => {
  it('matches values by variant name when both presets name their variants', () => {
    expect(fitToVariants(['1', '2', '3'], ['A', 'B', 'C'], ['C', 'A'])).toEqual(['3', '1']);
  });

  it("resizes like OrcaSlicer when names don't match: truncate, or pad with the first value", () => {
    expect(fitToVariants(['1', '2'], ['A', 'B'], ['X'])).toEqual(['1']);
    expect(fitToVariants(['1', '2'], undefined, ['X', 'Y', 'Z'])).toEqual(['1', '2', '1']);
    expect(fitToVariants(['1', '2'], ['A', 'B'], undefined)).toEqual(['1']);
  });

  it('leaves an empty array alone', () => {
    expect(fitToVariants([], undefined, ['X', 'Y'])).toEqual([]);
  });
});
