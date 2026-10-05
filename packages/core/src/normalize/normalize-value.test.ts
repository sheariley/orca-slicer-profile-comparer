import { describe, expect, it } from 'vitest';
import { normalizeValue, valuesEqual } from './normalize-value.ts';

describe('normalizeValue', () => {
  it('wraps a scalar string', () => {
    expect(normalizeValue('0.4')).toEqual(['0.4']);
  });

  it('keeps string arrays', () => {
    expect(normalizeValue(['100', '105'])).toEqual(['100', '105']);
  });

  it('stringifies numbers and booleans defensively', () => {
    expect(normalizeValue(16)).toEqual(['16']);
    expect(normalizeValue([true, 2])).toEqual(['true', '2']);
  });
});

describe('valuesEqual', () => {
  it('treats a scalar and a one-element array as equal', () => {
    expect(valuesEqual(normalizeValue('16'), normalizeValue(['16']))).toBe(true);
  });

  it('distinguishes different lengths', () => {
    expect(valuesEqual(normalizeValue('16'), normalizeValue(['16', '16']))).toBe(false);
  });
});
