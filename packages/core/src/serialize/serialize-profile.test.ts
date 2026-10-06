import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { fixturesDir } from '../../test/load-fixtures.ts';
import { ComparerError } from '../errors/errors.ts';
import {
  applyEdits,
  detectFormat,
  orcaSlicerFormat,
  serializeProfile,
} from './serialize-profile.ts';

const fixture = (name: string) =>
  readFileSync(path.join(fixturesDir, 'user', 'default', 'filament', name), 'utf8');

/** Tab-indented, as current OrcaSlicer versions save user presets. */
const tabbed = fixture('My ABS.json');
/** 4-space-indented, as older versions saved them; has G-code, ℃, and an empty array. */
const spaced = fixture('My Old PLA.json');

/** The lines that differ between two texts, as [before, after] pairs. */
function changedLines(before: string, after: string): string[][] {
  const a = before.split('\r\n');
  const b = after.split('\r\n');
  const changes: string[][] = [];
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    if (a[i] !== b[i]) changes.push([a[i] ?? '', b[i] ?? '']);
  }
  return changes;
}

/** The fallback a Windows host passes. Every test file here has line endings to detect. */
const windows = orcaSlicerFormat('\r\n');
const posix = orcaSlicerFormat('\n');

describe('detectFormat', () => {
  it("detects OrcaSlicer's current user-preset format", () => {
    expect(detectFormat(tabbed, posix)).toEqual({
      indent: '\t',
      newline: '\r\n',
      finalNewline: true,
      sortedKeys: true,
    });
  });

  it("detects older versions' 4-space indentation", () => {
    expect(detectFormat(spaced, posix).indent).toBe('    ');
  });

  it('detects LF, a missing final newline, and unsorted keys', () => {
    expect(detectFormat('{\n  "b": "1",\n  "a": "2"\n}', windows)).toEqual({
      indent: '  ',
      newline: '\n',
      finalNewline: false,
      sortedKeys: false,
    });
  });

  it("uses the caller's fallback for what the text can't tell", () => {
    expect(detectFormat('{}', windows)).toMatchObject({ indent: '\t', newline: '\r\n' });
    expect(detectFormat('{}', posix)).toMatchObject({ indent: '\t', newline: '\n' });
  });

  it("keeps a file's own line endings whatever the fallback says", () => {
    expect(detectFormat(tabbed, posix).newline).toBe('\r\n');
    expect(detectFormat('{\n\t"a": "1"\n}\n', windows).newline).toBe('\n');
  });
});

describe('serializeProfile', () => {
  it("writes a new file in current OrcaSlicer's format, with the platform's line endings", () => {
    const content = { name: 'x', from: 'User', list: ['1'] };

    expect(serializeProfile(content, windows)).toBe(
      '{\r\n\t"from": "User",\r\n\t"list": [\r\n\t\t"1"\r\n\t],\r\n\t"name": "x"\r\n}\r\n',
    );
    expect(serializeProfile(content, posix)).toBe(
      '{\n\t"from": "User",\n\t"list": [\n\t\t"1"\n\t],\n\t"name": "x"\n}\n',
    );
  });
});

describe('applyEdits', () => {
  it.each([
    ['tab-indented', tabbed],
    ['4-space-indented', spaced],
  ])('leaves an unedited %s preset byte for byte unchanged', (_, text) => {
    expect(applyEdits(text, {}, windows)).toEqual({ text, reformatted: false });
  });

  it('keeps LF line endings in a preset saved on macOS or Linux, even on a Windows host', () => {
    const macPreset = tabbed.replace(/\r\n/g, '\n');
    const { text, reformatted } = applyEdits(
      macPreset,
      { set: { nozzle_temperature: ['255'] } },
      windows,
    );

    expect(reformatted).toBe(false);
    expect(text).not.toContain('\r');
    expect(text).toBe(macPreset.replace('"260"', '"255"'));
  });

  it('changes only the lines of a replaced value', () => {
    const { text } = applyEdits(tabbed, { set: { nozzle_temperature: ['255'] } }, windows);

    expect(changedLines(tabbed, text)).toEqual([['\t\t"260"', '\t\t"255"']]);
  });

  it("inserts a new key in sorted position, in the file's own indentation and line endings", () => {
    const { text } = applyEdits(spaced, { set: { hot_plate_temp: ['60'] } }, windows);

    expect(text).toContain(
      '"from": "User",\r\n    "hot_plate_temp": [\r\n        "60"\r\n    ],\r\n    "inherits"',
    );
    expect(text.endsWith('}\r\n')).toBe(true);
  });

  it('removes keys', () => {
    const { text } = applyEdits(tabbed, { remove: ['filament_flow_ratio'] }, windows);

    expect(text).toBe(tabbed.replace('\t"filament_flow_ratio": [\r\n\t\t"0.93"\r\n\t],\r\n', ''));
  });

  it('keeps multi-line G-code and non-ASCII text exactly as OrcaSlicer writes them', () => {
    const { text } = applyEdits(spaced, { set: { nozzle_temperature: ['220'] } }, windows);

    expect(text).toContain(
      '"; filament start gcode\\n; Bed must reach 60℃ first\\nM109 S{nozzle_temperature[0]}"',
    );
    expect(text).toContain('"compatible_printers": [],');
  });

  it("keeps an unsorted file's key order and appends new keys at the end", () => {
    const original = '{\n  "b": "1",\n  "a": "2"\n}\n';
    const { text, reformatted } = applyEdits(original, { set: { a: '3', c: '4' } }, windows);

    expect(text).toBe('{\n  "b": "1",\n  "a": "3",\n  "c": "4"\n}\n');
    expect(reformatted).toBe(false);
  });

  it("reports when a file isn't canonical and saving would reformat it", () => {
    const handEdited = '{\r\n\t"name": "x", "list": ["1"]\r\n}\r\n';

    expect(applyEdits(handEdited, {}, windows).reformatted).toBe(true);
  });

  it('rejects text that is not a JSON object', () => {
    expect(() => applyEdits('{ nope', {}, windows)).toThrow(ComparerError);
    expect(() => applyEdits('["a"]', {}, windows)).toThrow(/JSON object/);
  });
});
