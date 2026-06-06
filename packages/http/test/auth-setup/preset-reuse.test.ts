import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { writeAuthState } from '@xera-ai/core';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { presetHttpAuth } from '../../src/auth-setup/preset';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const fakeRequest = {} as any;
const baseConfig = {
  baseUrl: { dev: 'http://example.test' },
  defaultEnv: 'dev',
  auth: {
    strategy: 'reuse-web-session' as const,
    ttl: '8h',
    refreshBuffer: '30m',
    roles: {
      admin: {
        reuseWebSession: {
          domainContains: 'x.com',
          cookies: {
            access: { match: { regex: '_at$' }, driveExpiry: true },
            refresh: { match: { regex: '_rt$' }, path: '/auth' },
            csrf: { match: { literal: 'xs_csrf' }, header: 'X-CSRF-Token' },
          },
        },
      },
    },
  },
};

let dir: string;
const origKey = process.env.XERA_AUTH_KEY;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'xera-reuse-'));
  process.env.XERA_AUTH_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
  if (origKey === undefined) delete process.env.XERA_AUTH_KEY;
  else process.env.XERA_AUTH_KEY = origKey;
});

function seedWebState(
  cookies: Array<{ name: string; value: string; domain: string; path: string; expires?: number }>,
) {
  writeAuthState(dir, {
    role: 'admin',
    strategy: 'storageState',
    created_at: new Date().toISOString(),
    expires_at: new Date(Date.now() + 8 * 3600 * 1000).toISOString(),
    payload: { cookies, origins: [] },
  });
}

describe('presetHttpAuth reuse-web-session', () => {
  test('picks access/refresh/csrf and emits expiresAt from access cookie', async () => {
    const now = Math.floor(Date.now() / 1000);
    seedWebState([
      { name: 'session_at', value: 'A', domain: 'api.x.com', path: '/', expires: now + 900 },
      { name: 'session_rt', value: 'R', domain: 'api.x.com', path: '/auth', expires: now + 86400 },
      { name: 'xs_csrf', value: 'C', domain: 'api.x.com', path: '/' },
      { name: '_ga', value: 'G', domain: '.other.test', path: '/' },
    ]);
    const res = await presetHttpAuth({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      request: fakeRequest,
      role: 'admin',
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      config: baseConfig as any,
      webAuthDir: dir,
    });
    expect(res.type).toBe('cookie');
    expect(res.cookies?.map((c) => c.name).sort()).toEqual(['session_at', 'session_rt', 'xs_csrf']);
    expect(res.expiresAt).toBe((now + 900) * 1000);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((res as any).meta?.csrf).toEqual({ cookieName: 'xs_csrf', header: 'X-CSRF-Token' });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((res as any).meta?.refreshable?.path).toBe('/auth');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((res as any).meta?.accessMatch).toEqual({ regex: '_at$' });
  });

  test('throws when web auth file missing', async () => {
    await expect(
      presetHttpAuth({
        request: fakeRequest,
        role: 'admin',
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        config: baseConfig as any,
        webAuthDir: dir,
      }),
    ).rejects.toThrow(/Run.*auth-setup.*--shape web/);
  });

  test('throws when no cookies match domainContains', async () => {
    seedWebState([{ name: 'session_at', value: 'A', domain: '.other.test', path: '/' }]);
    await expect(
      presetHttpAuth({
        request: fakeRequest,
        role: 'admin',
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        config: baseConfig as any,
        webAuthDir: dir,
      }),
    ).rejects.toThrow(/domainContains='x.com'/);
  });

  test('throws when access match has no candidate', async () => {
    seedWebState([{ name: 'session_xx', value: 'X', domain: 'api.x.com', path: '/' }]);
    await expect(
      presetHttpAuth({
        request: fakeRequest,
        role: 'admin',
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        config: baseConfig as any,
        webAuthDir: dir,
      }),
    ).rejects.toThrow(/access\.match/);
  });

  test('throws when access and refresh resolve to the same cookie', async () => {
    const cfg = JSON.parse(JSON.stringify(baseConfig));
    cfg.auth.roles.admin.reuseWebSession.cookies.refresh.match = { regex: '_at$' };
    seedWebState([{ name: 'session_at', value: 'A', domain: 'api.x.com', path: '/' }]);
    await expect(
      presetHttpAuth({ request: fakeRequest, role: 'admin', config: cfg, webAuthDir: dir }),
    ).rejects.toThrow(/access.*refresh.*same cookie/);
  });

  test('throws when access.match resolves to multiple cookies (e.g. loose regex /_at/)', async () => {
    const cfg = JSON.parse(JSON.stringify(baseConfig));
    cfg.auth.roles.admin.reuseWebSession.cookies.access.match = { regex: '_at' };
    delete cfg.auth.roles.admin.reuseWebSession.cookies.refresh;
    delete cfg.auth.roles.admin.reuseWebSession.cookies.csrf;
    seedWebState([
      { name: 'session_at', value: 'A', domain: 'api.x.com', path: '/' },
      { name: '_atomic_event', value: 'B', domain: 'api.x.com', path: '/' },
    ]);
    await expect(
      presetHttpAuth({ request: fakeRequest, role: 'admin', config: cfg, webAuthDir: dir }),
    ).rejects.toThrow(/access\.match matched multiple.*Tighten/);
  });

  test('falls back to auth.ttl when driveExpiry=false', async () => {
    const cfg = JSON.parse(JSON.stringify(baseConfig));
    cfg.auth.roles.admin.reuseWebSession.cookies.access.driveExpiry = false;
    seedWebState([
      {
        name: 'session_at',
        value: 'A',
        domain: 'api.x.com',
        path: '/',
        expires: Math.floor(Date.now() / 1000) + 30,
      },
    ]);
    const before = Date.now();
    const res = await presetHttpAuth({
      request: fakeRequest,
      role: 'admin',
      config: cfg,
      webAuthDir: dir,
    });
    expect(res.expiresAt!).toBeGreaterThan(before + 7 * 3600 * 1000);
  });
});
