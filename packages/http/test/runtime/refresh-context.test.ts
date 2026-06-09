import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readAuthState } from '@xera-ai/core';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import {
  cookieMatcherFromMatch,
  doRefresh,
  ensureFreshAccess,
  findAccessCookie,
  type RefreshAwarePayload,
  RefreshFailedError,
} from '../../src/runtime/refresh-context';

const ORIG_KEY = process.env.XERA_AUTH_KEY;
let tmpDir: string;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'xera-refresh-'));
  process.env.XERA_AUTH_KEY = 'a'.repeat(64);
});
afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
  if (ORIG_KEY === undefined) delete process.env.XERA_AUTH_KEY;
  else process.env.XERA_AUTH_KEY = ORIG_KEY;
});

function basePayload(): RefreshAwarePayload {
  return {
    type: 'cookie',
    token: '',
    header: 'Authorization',
    scheme: '',
    cookies: [
      {
        name: 'session_at',
        value: 'OLD',
        domain: 'api.x.com',
        path: '/',
        expires: Math.floor(Date.now() / 1000) + 1, // ~1s — well within buffer
      },
    ],
    accessMatch: { regex: '_at$' },
    refresh: { endpoint: 'http://api.x.com/refresh', method: 'POST' },
  };
}

function okResponse(setCookieValues: string[] = []) {
  return {
    status: () => 200,
    statusText: () => 'OK',
    headersArray: () => setCookieValues.map((value) => ({ name: 'set-cookie', value })),
  };
}

describe('RefreshFailedError', () => {
  test('carries role, status, detail and a useful message', () => {
    const err = new RefreshFailedError('admin', 502, 'endpoint /r returned Bad Gateway');
    expect(err.name).toBe('RefreshFailedError');
    expect(err.role).toBe('admin');
    expect(err.status).toBe(502);
    expect(err.detail).toBe('endpoint /r returned Bad Gateway');
    expect(err.message).toContain('admin');
    expect(err.message).toContain('502');
    expect(err.message).toContain('Bad Gateway');
    expect(err).toBeInstanceOf(Error);
  });
});

describe('cookieMatcherFromMatch', () => {
  test('literal exact match', () => {
    const m = cookieMatcherFromMatch({ literal: 'sid' });
    expect(m('sid')).toBe(true);
    expect(m('sid_alt')).toBe(false);
  });
  test('glob with *', () => {
    const m = cookieMatcherFromMatch({ glob: 'session_*' });
    expect(m('session_at')).toBe(true);
    expect(m('session_rt')).toBe(true);
    expect(m('other')).toBe(false);
  });
  test('regex case-insensitive', () => {
    const m = cookieMatcherFromMatch({ regex: '_AT$' });
    expect(m('session_at')).toBe(true);
    expect(m('session_rt')).toBe(false);
  });
});

describe('findAccessCookie', () => {
  test('returns matching cookie', () => {
    const p = basePayload();
    expect(findAccessCookie(p)?.name).toBe('session_at');
  });
  test('returns undefined when no accessMatch', () => {
    const p = basePayload();
    delete p.accessMatch;
    expect(findAccessCookie(p)).toBeUndefined();
  });
});

describe('doRefresh', () => {
  test('POSTs to endpoint, mutates payload cookies, persists encrypted', async () => {
    const newExpires = Math.floor(Date.now() / 1000) + 1000;
    const post = vi.fn(async () =>
      okResponse([`session_at=NEW_VAL; Domain=api.x.com; Path=/; Max-Age=1000; HttpOnly`]),
    );
    const ctx = { post, get: vi.fn() } as unknown as Parameters<typeof doRefresh>[0]['ctx'];
    const payload = basePayload();

    await doRefresh({
      payload,
      ctx,
      authDir: tmpDir,
      role: 'admin',
      refreshBufferMs: 60_000,
      ttlMs: 900_000,
    });

    expect(post).toHaveBeenCalledWith('http://api.x.com/refresh', {
      headers: {},
    });
    const updated = payload.cookies?.find((c) => c.name === 'session_at');
    expect(updated?.value).toBe('NEW_VAL');
    expect(updated?.expires).toBeGreaterThanOrEqual(newExpires - 5);

    // Persisted to disk.
    const entry = readAuthState(tmpDir, 'admin');
    expect(entry).not.toBeNull();
    expect(entry?.role).toBe('admin');
    expect(entry?.strategy).toBe('apiToken');
    const persistedPayload = entry?.payload as unknown as RefreshAwarePayload;
    expect(persistedPayload.cookies?.find((c) => c.name === 'session_at')?.value).toBe('NEW_VAL');
  });

  test('GET method when configured', async () => {
    const get = vi.fn(async () =>
      okResponse([`session_at=NEW; Domain=api.x.com; Path=/; Max-Age=600`]),
    );
    const post = vi.fn();
    const ctx = { post, get } as unknown as Parameters<typeof doRefresh>[0]['ctx'];
    const payload = basePayload();
    payload.refresh = { endpoint: 'http://api.x.com/refresh', method: 'GET' };

    await doRefresh({
      payload,
      ctx,
      authDir: tmpDir,
      role: 'admin',
      refreshBufferMs: 60_000,
      ttlMs: 900_000,
    });

    expect(get).toHaveBeenCalledTimes(1);
    expect(post).not.toHaveBeenCalled();
  });

  test('lifts CSRF header from cookie when csrfHeader configured', async () => {
    const post = vi.fn(async () =>
      okResponse([`session_at=NEW; Domain=api.x.com; Path=/; Max-Age=600`]),
    );
    const ctx = { post, get: vi.fn() } as unknown as Parameters<typeof doRefresh>[0]['ctx'];
    const payload = basePayload();
    payload.csrf = { cookieName: 'csrf_t', header: 'X-CSRF-Token' };
    payload.cookies?.push({
      name: 'csrf_t',
      value: 'TOK',
      domain: 'api.x.com',
      path: '/',
    });
    payload.refresh = {
      endpoint: 'http://api.x.com/refresh',
      method: 'POST',
      csrfHeader: 'X-CSRF-Token',
    };

    await doRefresh({
      payload,
      ctx,
      authDir: tmpDir,
      role: 'admin',
      refreshBufferMs: 60_000,
      ttlMs: 900_000,
    });

    expect(post).toHaveBeenCalledWith('http://api.x.com/refresh', {
      headers: { 'X-CSRF-Token': 'TOK' },
    });
  });

  test('does NOT lift CSRF when refresh.csrfHeader is absent (R2 conditional)', async () => {
    const post = vi.fn(async () =>
      okResponse([`session_at=NEW; Domain=api.x.com; Path=/; Max-Age=600`]),
    );
    const ctx = { post, get: vi.fn() } as unknown as Parameters<typeof doRefresh>[0]['ctx'];
    const payload = basePayload();
    payload.csrf = { cookieName: 'csrf_t', header: 'X-CSRF-Token' };
    payload.cookies?.push({
      name: 'csrf_t',
      value: 'TOK',
      domain: 'api.x.com',
      path: '/',
    });
    // refresh.csrfHeader intentionally not set.

    await doRefresh({
      payload,
      ctx,
      authDir: tmpDir,
      role: 'admin',
      refreshBufferMs: 60_000,
      ttlMs: 900_000,
    });

    expect(post).toHaveBeenCalledWith('http://api.x.com/refresh', { headers: {} });
  });

  test('throws RefreshFailedError on 502', async () => {
    const post = vi.fn(async () => ({
      status: () => 502,
      statusText: () => 'Bad Gateway',
      headersArray: () => [],
    }));
    const ctx = { post, get: vi.fn() } as unknown as Parameters<typeof doRefresh>[0]['ctx'];
    const payload = basePayload();

    await expect(
      doRefresh({
        payload,
        ctx,
        authDir: tmpDir,
        role: 'admin',
        refreshBufferMs: 60_000,
        ttlMs: 900_000,
      }),
    ).rejects.toMatchObject({
      name: 'RefreshFailedError',
      role: 'admin',
      status: 502,
    });
  });

  test('throws RefreshFailedError when no Set-Cookie matches access pattern', async () => {
    const post = vi.fn(async () => okResponse([`unrelated=x; Domain=api.x.com; Path=/`]));
    const ctx = { post, get: vi.fn() } as unknown as Parameters<typeof doRefresh>[0]['ctx'];
    const payload = basePayload();

    await expect(
      doRefresh({
        payload,
        ctx,
        authDir: tmpDir,
        role: 'admin',
        refreshBufferMs: 60_000,
        ttlMs: 900_000,
      }),
    ).rejects.toThrow(/no Set-Cookie matching access pattern.*unrelated/);
  });

  test('throws when payload.refresh is missing', async () => {
    const ctx = { post: vi.fn(), get: vi.fn() } as unknown as Parameters<
      typeof doRefresh
    >[0]['ctx'];
    const payload = basePayload();
    delete payload.refresh;
    await expect(
      doRefresh({
        payload,
        ctx,
        authDir: tmpDir,
        role: 'admin',
        refreshBufferMs: 60_000,
        ttlMs: 900_000,
      }),
    ).rejects.toThrow(RefreshFailedError);
  });
});

describe('ensureFreshAccess', () => {
  test('no-op when payload.refresh is undefined', async () => {
    const post = vi.fn();
    const ctx = { post, get: vi.fn() } as unknown as Parameters<typeof doRefresh>[0]['ctx'];
    const payload = basePayload();
    delete payload.refresh;

    await ensureFreshAccess({
      payload,
      ctx,
      authDir: tmpDir,
      role: 'admin',
      refreshBufferMs: 60_000,
      ttlMs: 900_000,
    });
    expect(post).not.toHaveBeenCalled();
  });

  test('no-op when access cookie has plenty of expiry left', async () => {
    const post = vi.fn();
    const ctx = { post, get: vi.fn() } as unknown as Parameters<typeof doRefresh>[0]['ctx'];
    const payload = basePayload();
    // Set cookie far in the future — well outside refreshBufferMs.
    if (payload.cookies?.[0]) {
      payload.cookies[0].expires = Math.floor(Date.now() / 1000) + 60 * 60; // +1h
    }

    await ensureFreshAccess({
      payload,
      ctx,
      authDir: tmpDir,
      role: 'admin',
      refreshBufferMs: 60_000, // 60s buffer — 1h > 60s, so no refresh
      ttlMs: 900_000,
    });
    expect(post).not.toHaveBeenCalled();
  });

  test('no-op when access cookie cannot be located', async () => {
    const post = vi.fn();
    const ctx = { post, get: vi.fn() } as unknown as Parameters<typeof doRefresh>[0]['ctx'];
    const payload = basePayload();
    payload.accessMatch = { literal: 'nonexistent' };

    await ensureFreshAccess({
      payload,
      ctx,
      authDir: tmpDir,
      role: 'admin',
      refreshBufferMs: 60_000,
      ttlMs: 900_000,
    });
    expect(post).not.toHaveBeenCalled();
  });

  test('triggers refresh when cookie is within buffer', async () => {
    const post = vi.fn(async () =>
      okResponse([`session_at=NEW; Domain=api.x.com; Path=/; Max-Age=3600`]),
    );
    const ctx = { post, get: vi.fn() } as unknown as Parameters<typeof doRefresh>[0]['ctx'];
    const payload = basePayload();
    // Cookie expires in 5s, buffer is 60s → refresh triggers.
    if (payload.cookies?.[0]) {
      payload.cookies[0].expires = Math.floor(Date.now() / 1000) + 5;
    }

    await ensureFreshAccess({
      payload,
      ctx,
      authDir: tmpDir,
      role: 'admin',
      refreshBufferMs: 60_000,
      ttlMs: 900_000,
    });
    expect(post).toHaveBeenCalledTimes(1);
    expect(payload.cookies?.[0]?.value).toBe('NEW');
  });
});
