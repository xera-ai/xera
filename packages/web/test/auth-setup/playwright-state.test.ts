import { describe, expect, test } from 'bun:test';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { generateKey, AUTH_KEY_ENV, writeAuthState } from '@xera/core';
import { stagePlaywrightState } from '../../src/auth-setup/playwright-state';

describe('stagePlaywrightState', () => {
  test('decrypts auth-state and writes plaintext to .cache/<role>.json', () => {
    const dir = mkdtempSync(join(tmpdir(), 'xera-stage-'));
    const authDir = join(dir, '.auth');
    process.env[AUTH_KEY_ENV] = generateKey();
    writeAuthState(authDir, {
      role: 'admin',
      strategy: 'storageState',
      created_at: '2026-05-14T10:00:00.000Z',
      expires_at: '2026-05-14T18:00:00.000Z',
      payload: { cookies: [], origins: [] },
    });

    const stagedPath = stagePlaywrightState(authDir, 'admin');
    expect(stagedPath).toBe(join(authDir, '.cache', 'admin.json'));
    const txt = readFileSync(stagedPath, 'utf8');
    expect(JSON.parse(txt)).toEqual({ cookies: [], origins: [] });

    delete process.env[AUTH_KEY_ENV];
    rmSync(dir, { recursive: true });
  });
});
