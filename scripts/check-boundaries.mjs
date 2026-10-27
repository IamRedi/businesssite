import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../packages/website-engine/', import.meta.url));
// 'automotive' is no longer forbidden: the owner-mandated canonical business
// category registry (BSRC-DESIGN-P4-001) uses it as a neutral industry
// family key inside the engine. The source-product terms below stay guarded.
const forbidden = [/from\s+["']next/, /from\s+["']@supabase/, /stripe/i, /pitlane/i, /businesssite/i];
async function files(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  return (await Promise.all(entries.map((entry) => entry.isDirectory() ? files(join(dir, entry.name)) : [join(dir, entry.name)]))).flat();
}
const invalid = [];
for (const file of await files(root)) {
  if (!file.endsWith('.ts')) continue;
  const content = await readFile(file, 'utf8');
  if (forbidden.some((pattern) => pattern.test(content))) invalid.push(file);
}
if (invalid.length) throw new Error(`Forbidden website-engine dependency or terminology: ${invalid.join(', ')}`);
console.log('Boundary check passed.');
