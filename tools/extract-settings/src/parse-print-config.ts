// Extracts setting metadata from OrcaSlicer's src/libslic3r/PrintConfig.cpp.
//
// Each option is defined as:
//   def = this->add("key", coType);
//   def->label = L("Label");
//   def->tooltip = L("Line one "
//                    "line two");
//   def->sidetext = L(u8"mm³/s");
// Only literal keys are extracted; options added in loops with computed keys are skipped.

export interface ExtractedSetting {
  label?: string;
  fullLabel?: string;
  category?: string;
  tooltip?: string;
  unit?: string;
}

const ADD_PATTERN = /this->add(?:_nullable)?\(\s*"([A-Za-z0-9_]+)"\s*,\s*co[A-Za-z]+\s*\)/g;
const FIELD_PATTERN = /def->(label|full_label|category|tooltip|sidetext)\s*=/g;

const FIELD_NAMES: Record<string, keyof ExtractedSetting> = {
  label: 'label',
  full_label: 'fullLabel',
  category: 'category',
  tooltip: 'tooltip',
  sidetext: 'unit',
};

export function parsePrintConfig(source: string): Map<string, ExtractedSetting> {
  const settings = new Map<string, ExtractedSetting>();
  const adds = [...source.matchAll(ADD_PATTERN)];

  adds.forEach((match, index) => {
    const key = match[1]!;
    const start = match.index + match[0].length;
    const end = adds[index + 1]?.index ?? source.length;
    const block = source.slice(start, end);
    const setting: ExtractedSetting = {};

    for (const field of block.matchAll(FIELD_PATTERN)) {
      const statement = readStatement(block, field.index + field[0].length);
      const value = firstStringArgument(statement);
      if (value !== undefined && value.length > 0) setting[FIELD_NAMES[field[1]!]!] = value;
    }

    // A key can be added more than once (e.g. per printer technology); keep the first.
    if (!settings.has(key)) settings.set(key, setting);
  });

  return settings;
}

/** Reads from `from` to the statement's terminating semicolon, skipping string literals. */
function readStatement(text: string, from: number): string {
  let inString = false;
  for (let i = from; i < text.length; i++) {
    const char = text[i];
    if (inString) {
      if (char === '\\') i++;
      else if (char === '"') inString = false;
    } else if (char === '"') {
      inString = true;
    } else if (char === ';') {
      return text.slice(from, i);
    }
  }
  return text.slice(from);
}

/**
 * Returns the first string argument, joining adjacent literals ("a" "b") the way C++ does.
 * For L_CONTEXT("s", "second") that's "s"; comments between literals are ignored.
 */
function firstStringArgument(statement: string): string | undefined {
  const withoutComments = statement.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
  const run = /(?:(?:u8)?"(?:[^"\\]|\\.)*"\s*)+/.exec(withoutComments);
  if (!run) return undefined;
  return [...run[0].matchAll(/"((?:[^"\\]|\\.)*)"/g)].map((match) => unescapeC(match[1]!)).join('');
}

function unescapeC(value: string): string {
  return value.replace(/\\(u[0-9a-fA-F]{4}|.)/g, (_, escape: string) => {
    if (escape.startsWith('u') && escape.length === 5) {
      return String.fromCharCode(parseInt(escape.slice(1), 16));
    }
    const simple: Record<string, string> = { n: '\n', t: '\t', '"': '"', "'": "'", '\\': '\\' };
    return simple[escape] ?? escape;
  });
}
