import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readAuthState } from '@xera-ai/core';
import { runHttpAuthSetup } from '../../src/auth-setup/runner';

const ORIG = { XERA_AUTH_KEY: process.env.XERA_AUTH_KEY };

let tmpDir: string;
beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'xera-auth-'));
  process.env.XERA_AUTH_KEY = 'a'.repeat(64);
});
afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
  if (ORIG.XERA_AUTH_KEY === undefined) delete process.env.XERA_AUTH_KEY;
  else process.env.XERA_AUTH_KEY = ORIG.XERA_AUTH_KEY;
});

const httpConfig = {
  baseUrl: { dev: 'http://localhost:0' },
  defaultEnv: 'dev',
  auth: {
    strategy: 'bearer' as const,
    ttl: '8h',
    refreshBuffer: '30m',
    roles: { user: { tokenEnv: 'PRESET_TOKEN' } },
  },
};

describe('runHttpAuthSetup', () => {
  test('writes encrypted http auth file for role at <authDir>/http/<role>.json', async () => {
    await runHttpAuthSetup({
      authDir: tmpDir,
      role: 'user',
      config: httpConfig,
      setupFn: async (_request, _role, _creds) => ({
        type: 'bearer',
        token: 'tok-123',
        expiresAt: Date.now() + 60_000,
      }),
      creds: { email: '', password: '' },
    });
    const entry = readAuthState(join(tmpDir, 'http'), 'user');
    expect(entry).not.toBeNull();
    expect(entry?.strategy).toBe('apiToken');
    expect((entry?.payload as { token: string }).token).toBe('tok-123');
    expect((entry?.payload as { type: string }).type).toBe('bearer');
    expect((entry?.payload as { header: string }).header).toBe('Authorization');
    expect((entry?.payload as { scheme: string }).scheme).toBe('Bearer');
  });

  test('uses provided header/scheme when type is apiKey', async () => {
    await runHttpAuthSetup({
      authDir: tmpDir,
      role: 'user',
      config: httpConfig,
      setupFn: async () => ({ type: 'apiKey', token: 'k', header: 'X-Custom-Key' }),
      creds: { email: '', password: '' },
    });
    const entry = readAuthState(join(tmpDir, 'http'), 'user');
    expect((entry?.payload as { header: string }).header).toBe('X-Custom-Key');
  });

  test('includes cookies in payload when provided', async () => {
    await runHttpAuthSetup({
      authDir: tmpDir,
      role: 'user',
      config: httpConfig,
      setupFn: async () => ({
        type: 'bearer',
        token: 't',
        cookies: [{ name: 'session', value: 'abc', domain: 'localhost', path: '/' }],
      }),
      creds: { email: '', password: '' },
    });
    const entry = readAuthState(join(tmpDir, 'http'), 'user');
    const payload = entry?.payload as { cookies?: Array<{ name: string }> };
    expect(payload.cookies?.[0]?.name).toBe('session');
  });
});
