import { describe, expect, test } from 'bun:test';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { hostname, tmpdir } from 'node:os';
import { join } from 'node:path';
import { acquireLock, isLockStale, readLock, releaseLock } from '../../src/lock/file-lock';

describe('file-lock', () => {
  test('acquireLock creates file with PID/host/run-id; second acquire fails', () => {
    const dir = mkdtempSync(join(tmpdir(), 'xera-lock-'));
    const lockPath = join(dir, '.lock');
    const ok = acquireLock(lockPath, 'run-1');
    expect(ok).toBe(true);
    expect(existsSync(lockPath)).toBe(true);
    const lockData = readLock(lockPath)!;
    expect(lockData.pid).toBe(process.pid);
    expect(lockData.run_id).toBe('run-1');
    const ok2 = acquireLock(lockPath, 'run-2');
    expect(ok2).toBe(false);
    rmSync(dir, { recursive: true });
  });

  test('releaseLock removes file', () => {
    const dir = mkdtempSync(join(tmpdir(), 'xera-lock-'));
    const lockPath = join(dir, '.lock');
    acquireLock(lockPath, 'r1');
    releaseLock(lockPath);
    expect(existsSync(lockPath)).toBe(false);
    rmSync(dir, { recursive: true });
  });

  test('isLockStale returns true when PID does not exist on same host', () => {
    const dir = mkdtempSync(join(tmpdir(), 'xera-lock-'));
    const lockPath = join(dir, '.lock');
    // Manually write a lock with an impossible PID
    const fakeLock = {
      pid: 9999999,
      hostname: hostname(),
      started_at: new Date().toISOString(),
      run_id: 'r1',
    };
    writeFileSync(lockPath, JSON.stringify(fakeLock));
    expect(isLockStale(lockPath)).toBe(true);
    rmSync(dir, { recursive: true });
  });
});
