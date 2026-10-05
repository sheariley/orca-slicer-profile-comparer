// Runs Python with the given arguments, trying the interpreter names used on each OS.
import { spawnSync } from 'node:child_process';

const candidates =
  process.platform === 'win32' ? ['py', 'python', 'python3'] : ['python3', 'python'];
const args = process.argv.slice(2);

for (const command of candidates) {
  const result = spawnSync(command, args, { stdio: 'inherit' });
  if (result.error && 'code' in result.error && result.error.code === 'ENOENT') continue;
  process.exit(result.status ?? 1);
}

console.error(`No Python interpreter found (tried: ${candidates.join(', ')}).`);
process.exit(1);
