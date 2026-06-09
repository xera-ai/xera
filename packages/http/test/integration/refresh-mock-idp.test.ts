import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { request } from '@playwright/test';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { startMockIdp } from '../../../../fixtures/auth-refresh/mock-idp';
import type { AuthFilePayload } from '../../src/runtime';
import { attachRefreshProxy } from '../../src/runtime/refresh-context';

let dir: string;
const origKey = process.env.XERA_AUTH_KEY;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'xera-refresh-idp-'));
  process.env.XERA_AUTH_KEY =
    '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
  if (origKey === undefined) delete process.env.XERA_AUTH_KEY;
  else process.env.XERA_AUTH_KEY = origKey;
});

describe('refresh against mock IDP', () => {
  test('expired cookie triggers refresh; GET /me returns 200 with new counter', async () => {
    const idp = await startMockIdp();
    try {
      const ctx = await request.newContext({ baseURL: idp.url });
      try {
        const nowSec = Math.floor(Date.now() / 1000);
        const payload: AuthFilePayload = {
          type: 'cookie',
          token: '',
          header: 'Authorization',
          scheme: '',
          cookies: [
            {
              name: 'session_at',
              value: 'INITIAL',
              domain: '127.0.0.1',
              path: '/',
              expires: nowSec - 10,
            },
            { name: 'xs_csrf', value: 'INITIAL_CSRF', domain: '127.0.0.1', path: '/' },
          ],
          csrf: { cookieName: 'xs_csrf', header: 'X-CSRF-Token' },
          accessMatch: { regex: '_at$' },
          refresh: {
            endpoint: `${idp.url}/auth/refresh`,
            method: 'POST',
            csrfHeader: 'X-CSRF-Token',
          },
        };
        const wrapped = attachRefreshProxy(ctx, {
          payload,
          authDir: dir,
          role: 'admin',
          refreshBufferMs: 60_000,
          ttlMs: 900_000,
        });

        const res = await wrapped.get('/me');
        expect(res.status()).toBe(200);
        const body = (await res.json()) as { counter: number };
        expect(body.counter).toBe(1);
        expect(idp.refreshCount()).toBe(1);
        expect(payload.cookies?.find((c) => c.name === 'session_at')?.value).toBe('NEW_AT_1');
        expect(payload.cookies?.find((c) => c.name === 'xs_csrf')?.value).toBe('NEW_CSRF_1');
      } finally {
        await ctx.dispose();
      }
    } finally {
      await idp.close();
    }
  });

  test('valid cookie does NOT trigger refresh', async () => {
    const idp = await startMockIdp();
    try {
      // Bootstrap the IDP's internal counter so its "latest" matches the
      // cookie value we seed below; without this the mock would 401.
      const bootstrap = await request.newContext({ baseURL: idp.url });
      await bootstrap.post(`${idp.url}/auth/refresh`);
      await bootstrap.dispose();

      const nowSec = Math.floor(Date.now() / 1000);
      // Seed the Playwright context with the matching cookie so /me sees it.
      // The runtime's `attachRefreshProxy` reads expiry off `payload.cookies`,
      // but the actual cookie that flies on the wire comes from the
      // Playwright storageState — both must agree.
      const ctx = await request.newContext({
        baseURL: idp.url,
        storageState: {
          cookies: [
            {
              name: 'session_at',
              value: 'NEW_AT_1',
              domain: '127.0.0.1',
              path: '/',
              expires: nowSec + 600,
              httpOnly: false,
              secure: false,
              sameSite: 'Lax',
            },
          ],
          origins: [],
        },
      });
      try {
        const payload: AuthFilePayload = {
          type: 'cookie',
          token: '',
          header: 'Authorization',
          scheme: '',
          cookies: [
            {
              name: 'session_at',
              value: 'NEW_AT_1',
              domain: '127.0.0.1',
              path: '/',
              expires: nowSec + 600,
            },
          ],
          accessMatch: { regex: '_at$' },
          refresh: { endpoint: `${idp.url}/auth/refresh`, method: 'POST' },
        };
        const before = idp.refreshCount();
        const wrapped = attachRefreshProxy(ctx, {
          payload,
          authDir: dir,
          role: 'admin',
          refreshBufferMs: 60_000,
          ttlMs: 900_000,
        });
        const res = await wrapped.get('/me');
        expect(idp.refreshCount()).toBe(before);
        expect(res.status()).toBe(200);
      } finally {
        await ctx.dispose();
      }
    } finally {
      await idp.close();
    }
  });
});
