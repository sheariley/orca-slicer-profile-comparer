// Copies the profiles listed in fixtures.json from a local OrcaSlicer clone into core's test
// fixtures, byte for byte.
//
// Usage: pnpm sync-fixtures [--orca <path to OrcaSlicer clone>]
// The clone defaults to ../OrcaSlicer next to this repo, or the ORCASLICER_DIR env variable.
import { copyFile, mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { parseArgs } from 'node:util';

const repoRoot = path.resolve(import.meta.dirname, '../../..');
const { values } = parseArgs({ options: { orca: { type: 'string' } } });
const orcaDir = path.resolve(
  values.orca ?? process.env['ORCASLICER_DIR'] ?? path.join(repoRoot, '..', 'OrcaSlicer'),
);

const manifestPath = path.join(import.meta.dirname, '..', 'fixtures.json');
const manifest = JSON.parse(await readFile(manifestPath, 'utf8')) as { profiles: string[] };

const sourceRoot = path.join(orcaDir, 'resources', 'profiles');
const targetRoot = path.join(repoRoot, 'packages', 'core', 'test', 'fixtures', 'system');

for (const relative of manifest.profiles) {
  const target = path.join(targetRoot, ...relative.split('/'));
  await mkdir(path.dirname(target), { recursive: true });
  await copyFile(path.join(sourceRoot, ...relative.split('/')), target);
}

console.log(`Copied ${manifest.profiles.length} profiles from ${sourceRoot}`);
