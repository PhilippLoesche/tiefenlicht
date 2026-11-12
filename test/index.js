// Entry point for `node --test test/` (Node 22 resolves a directory argument to
// its index.js). Imports every *.test.js file in this directory so they all run.
import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
for (const f of readdirSync(here).filter((f) => f.endsWith('.test.js')).sort()) {
  await import(join(here, f));
}
