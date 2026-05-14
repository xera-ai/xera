import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const CLASS_RE = /export\s+class\s+([A-Z][A-Za-z0-9_]*)/g;

export interface SharedPom {
  className: string;
  absolutePath: string;
}

export function scanSharedPoms(repoRoot: string): SharedPom[] {
  const dir = join(repoRoot, 'shared', 'page-objects');
  if (!existsSync(dir)) return [];
  const found: SharedPom[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith('.ts')) continue;
    const path = join(dir, entry.name);
    const src = readFileSync(path, 'utf8');
    for (const m of src.matchAll(CLASS_RE)) {
      found.push({ className: m[1]!, absolutePath: path });
    }
  }
  return found;
}
