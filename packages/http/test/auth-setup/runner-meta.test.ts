import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readAuthState } from '@xera-ai/core';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { runHttpAuthSetup } from '../../src/auth-setup';

let dir: string;
const origKey = process.env.XERA_AUTH_KEY;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'xera-runner-meta-'));
  process.env.XERA_AUTH_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
  if (origKey === undefined) delete process.env.XERA_AUTH_KEY;
  else process.env.XERA_AUTH_KEY = origKey;
});

describe('runHttpAuthSetup meta persistence', () => {
  test('writes meta fields into payload', async () => {
    await runHttpAuthSetup({
      authDir: dir,
      role: 'admin',
      config: {
        baseUrl: { dev: 'http://example.test' },
        defaultEnv: 'dev',
        auth: { strategy: 'reuse-web-session', ttl: '8h', refreshBuffer: '30m', roles: {} },
      } as any,
      setupFn: async () => ({
        type: 'cookie' as const,
        token: '',
        cookies: [{ name: 'session_at', value: 'A', domain: 'x.com', path: '/' }],
        expiresAt: Date.now() + 900_000,
        meta: {
          accessMatch: { regex: '_at$' },
          csrf: { cookieName: 'xs_csrf', header: 'X-CSRF-Token' },
        },
      }),
      creds: { email: '', password: '' },
    });
    const entry = readAuthState(join(dir, 'http'), 'admin');
    expect(entry).not.toBeNull();
    expect((entry!.payload as any).csrf).toEqual({ cookieName: 'xs_csrf', header: 'X-CSRF-Token' });
    expect((entry!.payload as any).accessMatch).toEqual({ regex: '_at$' });
  });

  test('does not break existing bearer flow with no meta', async () => {
    await runHttpAuthSetup({
      authDir: dir,
      role: 'admin',
      config: {
        baseUrl: { dev: 'http://example.test' },
        defaultEnv: 'dev',
        auth: { strategy: 'bearer', ttl: '8h', refreshBuffer: '30m', roles: {} },
      } as any,
      setupFn: async () => ({ type: 'bearer', token: 'tok' }),
      creds: { email: '', password: '' },
    });
    const entry = readAuthState(join(dir, 'http'), 'admin');
    expect(entry).not.toBeNull();
    const p = entry!.payload as any;
    expect(p.token).toBe('tok');
    expect(p.csrf).toBeUndefined();
    expect(p.accessMatch).toBeUndefined();
  });
});
