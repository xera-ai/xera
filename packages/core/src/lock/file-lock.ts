import { existsSync, readFileSync, writeFileSync, unlinkSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { hostname } from 'node:os';

export interface LockData {
  pid: number;
  hostname: string;
  started_at: string;
  run_id: string;
}

export function acquireLock(path: string, runId: string): boolean {
  if (existsSync(path)) return false;
  mkdirSync(dirname(path), { recursive: true });
  const data: LockData = {
    pid: process.pid,
    hostname: hostname(),
    started_at: new Date().toISOString(),
    run_id: runId,
  };
  // Use 'wx' flag for atomic-ish create-only.
  try {
    writeFileSync(path, JSON.stringify(data), { flag: 'wx' });
    return true;
  } catch {
    return false;
  }
}

export function releaseLock(path: string): void {
  if (existsSync(path)) unlinkSync(path);
}

export function readLock(path: string): LockData | null {
  if (!existsSync(path)) return null;
  return JSON.parse(readFileSync(path, 'utf8')) as LockData;
}

export function isLockStale(path: string): boolean {
  const lock = readLock(path);
  if (!lock) return true;
  if (lock.hostname !== hostname()) {
    // Cannot verify a remote PID; treat as not stale.
    return false;
  }
  try {
    // Signal 0 = "check if process exists". Throws if not.
    process.kill(lock.pid, 0);
    return false;
  } catch {
    return true;
  }
}

export function forceUnlock(path: string): void {
  releaseLock(path);
}
