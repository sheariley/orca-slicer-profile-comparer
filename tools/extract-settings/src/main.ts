// Generates packages/setting-catalog/data/settings.json from a local OrcaSlicer clone.
//
// Usage: pnpm extract-settings [--orca <path to OrcaSlicer clone>]
// The clone defaults to ../OrcaSlicer next to this repo, or the ORCASLICER_DIR env variable.
import { execFileSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { parsePrintConfig } from './parse-print-config.ts';

const repoRoot = path.resolve(import.meta.dirname, '../../..');
const { values } = parseArgs({ options: { orca: { type: 'string' } } });
const orcaDir = path.resolve(
  values.orca ?? process.env['ORCASLICER_DIR'] ?? path.join(repoRoot, '..', 'OrcaSlicer'),
);

const source = await readFile(path.join(orcaDir, 'src', 'libslic3r', 'PrintConfig.cpp'), 'utf8');
const settings = parsePrintConfig(source);

const output = {
  source: { repository: 'OrcaSlicer/OrcaSlicer', commit: gitCommit(orcaDir) },
  settings: Object.fromEntries([...settings].sort(([a], [b]) => a.localeCompare(b))),
};

const target = path.join(repoRoot, 'packages', 'setting-catalog', 'data', 'settings.json');
await mkdir(path.dirname(target), { recursive: true });
await writeFile(target, `${JSON.stringify(output, null, 2)}\n`);
console.log(`Wrote ${settings.size} settings to ${path.relative(repoRoot, target)}`);

function gitCommit(dir: string): string | null {
  try {
    return execFileSync('git', ['-C', dir, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  } catch {
    return null;
  }
}
