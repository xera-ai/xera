import type { AuthStateEntry } from './state';
export type { AuthStateEntry } from './state';

const RE = /^(\d+)([hms])$/;

export function parseDuration(d: string): number {
  const m = RE.exec(d);
  if (!m) throw new Error(`Bad duration "${d}" — expected e.g. "8h", "30m", "45s"`);
  const n = Number(m[1]);
  const unit = m[2]!;
  if (unit === 'h') return n * 3600 * 1000;
  if (unit === 'm') return n * 60 * 1000;
  return n * 1000;
}

export interface RefreshPolicy { ttl: string; refreshBuffer: string; }

export function needsRefresh(
  entry: AuthStateEntry | null,
  policy: RefreshPolicy,
  now: Date = new Date(),
): boolean {
  if (!entry) return true;
  const ttlMs = parseDuration(policy.ttl);
  const bufMs = parseDuration(policy.refreshBuffer);
  const createdAt = new Date(entry.created_at).getTime();
  if (now.getTime() - createdAt > ttlMs) return true;
  const expiresAt = new Date(entry.expires_at).getTime();
  if (expiresAt - now.getTime() < bufMs) return true;
  return false;
}
