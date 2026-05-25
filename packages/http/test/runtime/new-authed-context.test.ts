import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { request as pwRequest } from '@playwright/test';
import { writeAuthState } from '@xera-ai/core';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { newAuthedContext } from '../../src/runtime';

const ORIG_KEY = process.env.XERA_AUTH_KEY;
const ORIG_DIR = process.env.XERA_AUTH_DIR;
const ORIG_BASE = process.env.XERA_BASE_URL;

let tmpDir: string;
beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'xera-rt-'));
  process.env.XERA_AUTH_KEY = 'a'.repeat(64);
  process.env.XERA_AUTH_DIR = tmpDir;
  process.env.XERA_BASE_URL = 'http://localhost:0';
});
afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
  if (ORIG_KEY === undefined) delete process.env.XERA_AUTH_KEY;
  else process.env.XERA_AUTH_KEY = ORIG_KEY;
  if (ORIG_DIR === undefined) delete process.env.XERA_AUTH_DIR;
  else process.env.XERA_AUTH_DIR = ORIG_DIR;
  if (ORIG_BASE === undefined) delete process.env.XERA_BASE_URL;
  else process.env.XERA_BASE_URL = ORIG_BASE;
});

const fakePlaywright = { request: pwRequest } as unknown as Parameters<typeof newAuthedContext>[0];

describe('newAuthedContext', () => {
  test('throws helpful error when auth file missing', async () => {
    expect(newAuthedContext(fakePlaywright, 'user')).rejects.toThrow(
      /xera-internal auth-setup --role user/,
    );
  });

  test('throws expired error when auth file past expiry', async () => {
    writeAuthState(join(tmpDir, 'http'), {
      role: 'user',
      strategy: 'apiToken',
      created_at: new Date(Date.now() - 1e7).toISOString(),
      expires_at: new Date(Date.now() - 1e6).toISOString(),
      payload: { token: 'x', type: 'bearer', header: 'Authorization', scheme: 'Bearer' },
    });
    expect(newAuthedContext(fakePlaywright, 'user')).rejects.toThrow(/expired/);
  });

  test('throws when XERA_BASE_URL unset', async () => {
    delete process.env.XERA_BASE_URL;
    writeAuthState(join(tmpDir, 'http'), {
      role: 'user',
      strategy: 'apiToken',
      created_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + 1e6).toISOString(),
      payload: { token: 'x', type: 'bearer', header: 'Authorization', scheme: 'Bearer' },
    });
    expect(newAuthedContext(fakePlaywright, 'user')).rejects.toThrow(/XERA_BASE_URL/);
  });
});
