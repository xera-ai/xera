import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';
import { generateKey } from '../../src/auth/encrypt';
import { AUTH_KEY_ENV } from '../../src/auth/key';
import { type AuthStateEntry, readAuthState, writeAuthState } from '../../src/auth/state';

describe('auth state IO', () => {
  test('round-trips encrypted', () => {
    const dir = mkdtempSync(join(tmpdir(), 'xera-auth-'));
    const key = generateKey();
    process.env[AUTH_KEY_ENV] = key;
    const entry: AuthStateEntry = {
      role: 'admin',
      strategy: 'storageState',
      created_at: '2026-05-14T10:00:00.000Z',
      expires_at: '2026-05-14T18:00:00.000Z',
      payload: { cookies: [{ name: 's', value: 'secret', domain: 'x' }], origins: [] },
    };
    writeAuthState(dir, entry);
    const onDisk = readFileSync(join(dir, 'admin.json'), 'utf8');
    expect(onDisk).not.toContain('secret'); // confirms encryption
    const decoded = readAuthState(dir, 'admin');
    expect(decoded).toEqual(entry);
    delete process.env[AUTH_KEY_ENV];
    rmSync(dir, { recursive: true });
  });

  test('readAuthState returns null when missing', () => {
    process.env[AUTH_KEY_ENV] = 'a'.repeat(64);
    const dir = mkdtempSync(join(tmpdir(), 'xera-auth-'));
    expect(readAuthState(dir, 'nobody')).toBeNull();
    delete process.env[AUTH_KEY_ENV];
    rmSync(dir, { recursive: true });
  });
});
