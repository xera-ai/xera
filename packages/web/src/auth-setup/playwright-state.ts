import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { readAuthState } from '@xera/core';

export function stagePlaywrightState(authDir: string, role: string): string {
  const entry = readAuthState(authDir, role);
  if (!entry) throw new Error(`No auth state for role "${role}" in ${authDir}`);
  const cacheDir = join(authDir, '.cache');
  mkdirSync(cacheDir, { recursive: true });
  const stagedPath = join(cacheDir, `${role}.json`);
  writeFileSync(stagedPath, JSON.stringify(entry.payload));
  return stagedPath;
}
