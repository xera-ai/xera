import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';

export function hashString(s: string): string {
  return `sha256:${createHash('sha256').update(s).digest('hex')}`;
}

export function hashFile(path: string): string {
  return hashString(readFileSync(path, 'utf8'));
}

export function hashFileIfExists(path: string): string | null {
  if (!existsSync(path)) return null;
  return hashFile(path);
}
