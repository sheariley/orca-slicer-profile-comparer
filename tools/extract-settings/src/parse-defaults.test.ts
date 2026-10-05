import { describe, expect, it } from 'vitest';
import { formatNumber, parseDefault, UnsupportedDefault } from './parse-defaults.ts';

const context = {
  enumKeys: new Map([
    ['ipCrossHatch', 'crosshatch'],
    ['ZHopType::zhtSlope', 'Slope Lift'],
    ['zhtSlope', 'Slope Lift'],
    ['WallSequence::InnerOuter', 'inner wall/outer wall'],
  ]),
  constants: new Map([
    ['INITIAL_LAYER_HEIGHT', '0.2'],
    ['INITIAL_REDUCE_CROSSING_WALL', 'false'],
  ]),
};
const parse = (expression: string) => parseDefault(expression, context);

describe('formatNumber', () => {
  it.each([
    [0, '0'],
    [2, '2'],
    [0.4, '0.4'],
    [0.02, '0.02'],
    [100, '100'],
    [-99999, '-99999'],
    [1 / 3, '0.333333'],
    [1e-5, '1e-05'],
    [1234567, '1.23457e+06'],
  ])('formats %d like a C++ ostream', (value, expected) => {
    expect(formatNumber(value)).toBe(expected);
  });
});

describe('parseDefault', () => {
  it('serializes scalars', () => {
    expect(parse('new ConfigOptionFloat(0.)')).toBe('0');
    expect(parse('new ConfigOptionFloat(INITIAL_LAYER_HEIGHT)')).toBe('0.2');
    expect(parse('new ConfigOptionInt{1}')).toBe('1');
    expect(parse('new ConfigOptionBool(false)')).toBe('0');
    expect(parse('new ConfigOptionBool(1)')).toBe('1');
    expect(parse('new ConfigOptionBool(INITIAL_REDUCE_CROSSING_WALL)')).toBe('0');
    expect(parse('new ConfigOptionPercent(100)')).toBe('100%');
    expect(parse('new ConfigOptionFloatOrPercent(50, true)')).toBe('50%');
    expect(parse('new ConfigOptionFloatOrPercent(0., false)')).toBe('0');
    expect(parse('new ConfigOptionPoint(Vec2d(-99999, -99999))')).toBe('-99999,-99999');
  });

  it('serializes strings, joining literals and decoding escapes', () => {
    expect(parse('new ConfigOptionString()')).toBe('');
    expect(parse('new ConfigOptionString("G28\\n" "M104")')).toBe('G28\nM104');
    expect(parse('new ConfigOptionStrings{ L("(Undefined)") }')).toEqual(['(Undefined)']);
  });

  it('serializes vectors as arrays of strings', () => {
    expect(parse('new ConfigOptionFloats { 60.0f }')).toEqual(['60']);
    expect(parse('new ConfigOptionFloats({0})')).toEqual(['0']);
    expect(parse('new ConfigOptionInts{ 35, 40 }')).toEqual(['35', '40']);
    expect(parse('new ConfigOptionBools { true }')).toEqual(['1']);
    expect(parse('new ConfigOptionPercents { 100 }')).toEqual(['100%']);
    expect(parse('new ConfigOptionStrings()')).toEqual([]);
    expect(parse('new ConfigOptionPoints{ Vec2d(0, 0), Vec2d(200, 0) }')).toEqual(['0x0', '200x0']);
  });

  it('serializes nil entries of nullable vectors', () => {
    expect(
      parse('new ConfigOptionPercentsNullable{ ConfigOptionPercentsNullable::nil_value() }'),
    ).toEqual(['nil']);
    expect(parse('new ConfigOptionFloatsOrPercentsNullable{FloatOrPercent(0, false)}')).toEqual([
      '0',
    ]);
  });

  it('maps enum constants to their keys', () => {
    expect(parse('new ConfigOptionEnum<InfillPattern>(ipCrossHatch)')).toBe('crosshatch');
    expect(parse('new ConfigOptionEnum<WallSequence>(WallSequence::InnerOuter)')).toBe(
      'inner wall/outer wall',
    );
    expect(parse('new ConfigOptionEnumsGeneric{ ZHopType::zhtSlope }')).toEqual(['Slope Lift']);
  });

  it('rejects what it does not understand', () => {
    expect(() => parse('new ConfigOptionFloat(compute())')).toThrow(UnsupportedDefault);
    expect(() => parse('new ConfigOptionEnum<Foo>(fooUnknown)')).toThrow(UnsupportedDefault);
    expect(() => parse('new ConfigOptionPointsGroups{}')).toThrow(UnsupportedDefault);
  });
});
