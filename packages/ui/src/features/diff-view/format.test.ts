import { describe, expect, it } from 'vitest';
import { unitFor } from './format.ts';

describe('unitFor', () => {
  it('shows the unit after plain numbers', () => {
    expect(unitFor(['0.2'], 'mm')).toBe('mm');
  });

  it('drops the unit when the value is already a percentage', () => {
    expect(unitFor(['50%'], '%')).toBeUndefined();
    expect(unitFor(['50%'], 'mm/s² or %')).toBeUndefined();
  });

  it('keeps only the first unit of an "or %" unit for plain numbers', () => {
    expect(unitFor(['500'], 'mm/s² or %')).toBe('mm/s²');
  });

  it('shows nothing without a unit', () => {
    expect(unitFor(['1'], undefined)).toBeUndefined();
  });
});
