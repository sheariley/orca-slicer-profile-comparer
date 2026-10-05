// Converts the C++ in `def->set_default_value(new ConfigOption...(...))` into the value
// OrcaSlicer writes to a profile file: a string for scalar options, an array of strings for
// vector options. Mirrors ConfigOption*::serialize()/vserialize() in OrcaSlicer's Config.hpp.

export type DefaultValue = string | string[];

export interface DefaultsContext {
  /** Enum constant (e.g. "ipCrossHatch") → serialized key (e.g. "crosshatch"). */
  readonly enumKeys: ReadonlyMap<string, string>;
  /** #define constants with a number or boolean value (e.g. INITIAL_LAYER_HEIGHT → "0.2"). */
  readonly constants: ReadonlyMap<string, string>;
}

/** Thrown for C++ the parser doesn't understand; the caller skips that option. */
export class UnsupportedDefault extends Error {}

const NIL = 'nil';

/** Parses `new ConfigOptionX(...)` / `new ConfigOptionX{...}` / `new ConfigOptionEnum<T>(...)`. */
export function parseDefault(expression: string, context: DefaultsContext): DefaultValue {
  const match = /^new\s+ConfigOption(\w+)(?:<\s*\w+\s*>)?\s*([({])/.exec(expression.trim());
  if (!match) throw new UnsupportedDefault(`not a ConfigOption constructor: ${expression}`);
  const [whole, type] = match as unknown as [string, string];
  const args = splitTopLevel(unwrapBraces(innerOf(expression.trim(), whole.length - 1)));
  const scalar = (fn: (arg: string) => string) => {
    if (args.length > 1) throw new UnsupportedDefault(`expected one argument: ${expression}`);
    return fn(args[0] ?? '');
  };
  const number = (arg: string) => formatNumber(evaluateNumber(arg, context));
  const nullable = (fn: (arg: string) => string) => (arg: string) =>
    /nil_value\(\)/.test(arg) ? NIL : fn(arg);

  switch (type) {
    case 'Float':
      return scalar(number);
    case 'Int':
      return scalar((arg) => String(Math.trunc(evaluateNumber(arg, context))));
    case 'Bool':
      return scalar((arg) => boolean(arg, context));
    case 'String':
      return scalar((arg) => (arg === '' ? '' : stringLiteral(arg)));
    case 'Percent':
      return scalar((arg) => `${number(arg)}%`);
    case 'FloatOrPercent':
      return floatOrPercent(args, context);
    case 'Enum':
      return scalar((arg) => enumKey(arg, context));
    case 'Point':
      return scalar((arg) => point(arg, context).join(','));
    case 'Floats':
    case 'FloatsNullable':
      return args.map(nullable(number));
    case 'Ints':
    case 'IntsNullable':
      return args.map(nullable((arg) => String(Math.trunc(evaluateNumber(arg, context)))));
    case 'Bools':
    case 'BoolsNullable':
      return args.map(nullable((arg) => boolean(arg, context)));
    case 'Percents':
    case 'PercentsNullable':
      return args.map(nullable((arg) => `${number(arg)}%`));
    case 'Strings':
      return args.map(stringLiteral);
    case 'FloatsOrPercents':
    case 'FloatsOrPercentsNullable':
      return args.map(
        nullable((arg) => {
          const inner = /^FloatOrPercent\s*[({]/.test(arg) ? arg.slice(arg.search(/[({]/)) : arg;
          return floatOrPercent(splitTopLevel(innerOf(inner, 0)), context);
        }),
      );
    case 'EnumsGeneric':
    case 'EnumsGenericNullable':
      return args.map((arg) => enumKey(arg, context));
    case 'Points':
      return args.map((arg) => point(arg, context).join('x'));
    default:
      throw new UnsupportedDefault(`unsupported option type ConfigOption${type}`);
  }
}

/** Formats a double the way a default C++ ostream does (`%g`, 6 significant digits). */
export function formatNumber(value: number): string {
  if (!Number.isFinite(value)) throw new UnsupportedDefault(`not a finite number: ${value}`);
  if (value === 0) return '0';
  const [mantissa, exponentText] = value.toExponential(5).split('e') as [string, string];
  const exponent = Number(exponentText);
  const trim = (text: string) => (text.includes('.') ? text.replace(/\.?0+$/, '') : text);
  if (exponent < -4 || exponent >= 6) {
    const sign = exponent < 0 ? '-' : '+';
    return `${trim(mantissa)}e${sign}${String(Math.abs(exponent)).padStart(2, '0')}`;
  }
  return trim(value.toFixed(Math.max(0, 5 - exponent)));
}

function floatOrPercent(args: string[], context: DefaultsContext): string {
  const [value, percent] = args;
  if (value === undefined || percent === undefined) {
    throw new UnsupportedDefault(`FloatOrPercent needs two arguments: ${args.join(', ')}`);
  }
  const suffix = boolean(percent, context) === '1' ? '%' : '';
  return `${formatNumber(evaluateNumber(value, context))}${suffix}`;
}

/** `true`/`false`, a boolean #define, or a number (non-zero is true), serialized as "1"/"0". */
function boolean(arg: string, context: DefaultsContext): string {
  const value = context.constants.get(arg) ?? arg;
  if (value === 'true') return '1';
  if (value === 'false') return '0';
  if (/^-?\d+$/.test(value)) return Number(value) === 0 ? '0' : '1';
  throw new UnsupportedDefault(`not a boolean: ${arg}`);
}

function point(arg: string, context: DefaultsContext): [string, string] {
  const match = /^Vec2d\s*\((.*)\)$/s.exec(arg);
  const parts = match ? splitTopLevel(match[1]!) : [];
  if (parts.length !== 2) throw new UnsupportedDefault(`not a Vec2d: ${arg}`);
  return [
    formatNumber(evaluateNumber(parts[0]!, context)),
    formatNumber(evaluateNumber(parts[1]!, context)),
  ];
}

function enumKey(arg: string, context: DefaultsContext): string {
  // Accept `ipCrossHatch`, `ZHopType::zhtSlope`, `RetractLiftEnforceType ::rletAllSurfaces`,
  // and `(int)Overhang_threshold_bridge`.
  const constant = arg
    .replace(/^\(\s*int\s*\)/, '')
    .replace(/\s*::\s*/g, '::')
    .trim();
  const key =
    context.enumKeys.get(constant) ?? context.enumKeys.get(constant.replace(/^\w+::/, ''));
  if (key === undefined) throw new UnsupportedDefault(`unknown enum constant: ${arg}`);
  return key;
}

/** Evaluates a numeric literal or simple arithmetic over literals and #define constants. */
function evaluateNumber(arg: string, context: DefaultsContext): number {
  const expression = arg
    .replace(/\b([A-Z_][A-Z0-9_]*)\b/g, (name: string) => {
      const value = context.constants.get(name);
      if (value === undefined || !/^-?[\d.]/.test(value)) {
        throw new UnsupportedDefault(`unknown numeric constant: ${name}`);
      }
      return value;
    })
    .replace(/(\d)\.?[fF]\b/g, '$1')
    .replace(/(\d)\.(?!\d)/g, '$1.0');
  if (!/^[\d\s.+\-*/()eE]+$/.test(expression)) {
    throw new UnsupportedDefault(`not a numeric expression: ${arg}`);
  }
  const value = Function(`"use strict"; return (${expression});`)() as unknown;
  if (typeof value !== 'number') throw new UnsupportedDefault(`not a number: ${arg}`);
  return value;
}

/** Joins adjacent C++ string literals ("a" "b") and decodes their escapes. */
function stringLiteral(text: string): string {
  // Translation wrappers (L("..."), _L("...")) don't change the serialized default.
  const arg = text.replace(/^_?L\s*\(([\s\S]*)\)$/, '$1').trim();
  const literals = [...arg.matchAll(/(?:u8|L)?"((?:[^"\\]|\\.)*)"/g)];
  const rest = arg.replace(/(?:u8|L)?"(?:[^"\\]|\\.)*"/g, '').trim();
  if (literals.length === 0 || rest !== '')
    throw new UnsupportedDefault(`not a string literal: ${arg}`);
  return literals.map((match) => unescapeC(match[1]!)).join('');
}

export function unescapeC(value: string): string {
  return value.replace(/\\(u[0-9a-fA-F]{4}|.)/g, (_, escape: string) => {
    if (escape.startsWith('u') && escape.length === 5) {
      return String.fromCharCode(parseInt(escape.slice(1), 16));
    }
    const simple: Record<string, string> = {
      n: '\n',
      t: '\t',
      r: '\r',
      '"': '"',
      "'": "'",
      '\\': '\\',
    };
    return simple[escape] ?? escape;
  });
}

/** Index of the bracket that closes the one at `open`, skipping string literals. */
function closingIndex(text: string, open: number): number {
  if (!'({'.includes(text[open] ?? ''))
    throw new UnsupportedDefault(`expected a bracket in: ${text}`);
  let depth = 0;
  let inString = false;
  for (let i = open; i < text.length; i++) {
    const char = text[i];
    if (inString) {
      if (char === '\\') i++;
      else if (char === '"') inString = false;
    } else if (char === '"') inString = true;
    else if (char === '(' || char === '{') depth++;
    else if (char === ')' || char === '}') {
      depth--;
      if (depth === 0) return i;
    }
  }
  throw new UnsupportedDefault(`unbalanced brackets in: ${text}`);
}

/** The trimmed text between the bracket at `open` and its matching close. */
function innerOf(text: string, open: number): string {
  return text.slice(open + 1, closingIndex(text, open)).trim();
}

/** `{ a, b }` → `a, b` when the braces wrap the whole text; anything else is unchanged. */
function unwrapBraces(text: string): string {
  return text.startsWith('{') && closingIndex(text, 0) === text.length - 1
    ? innerOf(text, 0)
    : text;
}

/** Splits on commas that aren't inside brackets or string literals. */
function splitTopLevel(text: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let inString = false;
  let start = 0;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (inString) {
      if (char === '\\') i++;
      else if (char === '"') inString = false;
    } else if (char === '"') inString = true;
    else if (char === '(' || char === '{') depth++;
    else if (char === ')' || char === '}') depth--;
    else if (char === ',' && depth === 0) {
      parts.push(text.slice(start, i).trim());
      start = i + 1;
    }
  }
  const last = text.slice(start).trim();
  if (last !== '') parts.push(last);
  return parts;
}
