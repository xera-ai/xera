import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

export function loadSnap(name: string): unknown {
  return JSON.parse(readFileSync(join(here, `${name}.json`), 'utf8'));
}
export function loadExpected(name: string): unknown {
  return JSON.parse(readFileSync(join(here, `${name}.expected.json`), 'utf8'));
}
