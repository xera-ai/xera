import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { writeAuthState } from '@xera-ai/core';
import { newAuthedContext } from '../../src/runtime';

let dir: string;
const origKey = process.env.XERA_AUTH_KEY;
const origAuthDir = process.env.XERA_AUTH_DIR;
const origBaseUrl = process.env.XERA_BASE_URL;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'xera-csrf-'));
  process.env.XERA_AUTH_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
  process.env.XERA_AUTH_DIR = dir;
  process.env.XERA_BASE_URL = 'http://api.example.test';
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
  if (origKey === undefined) delete process.env.XERA_AUTH_KEY; else process.env.XERA_AUTH_KEY = origKey;
  if (origAuthDir === undefined) delete process.env.XERA_AUTH_DIR; else process.env.XERA_AUTH_DIR = origAuthDir;
  if (origBaseUrl === undefined) delete process.env.XERA_BASE_URL; else process.env.XERA_BASE_URL = origBaseUrl;
});

function seed(payload: Record<string, unknown>) {
  writeAuthState(join(dir, 'http'), {
    role: 'admin', strategy: 'apiToken',
    created_at: new Date().toISOString(),
    expires_at: new Date(Date.now() + 900_000).toISOString(),
    payload,
  });
}

function fakePlaywright() {
  const captured: any[] = [];
  return {
    captured,
    playwright: {
      request: {
        newContext: vi.fn(async (opts: any) => {
          captured.push(opts);
          return { dispose: vi.fn() } as any;
        }),
      },
    } as any,
  };
}

describe('newAuthedContext CSRF lift', () => {
  test('lifts CSRF cookie value into extraHTTPHeaders[header]', async () => {
    seed({
      type: 'cookie', token: '', header: 'Authorization', scheme: '',
      cookies: [
        { name: 'session_at', value: 'A', domain: 'api.example.test', path: '/' },
        { name: 'xs_csrf',    value: 'CCC', domain: 'api.example.test', path: '/' },
      ],
      csrf: { cookieName: 'xs_csrf', header: 'X-CSRF-Token' },
    });
    const { captured, playwright } = fakePlaywright();
    await newAuthedContext(playwright as any, 'admin');
    expect(captured[0].extraHTTPHeaders['X-CSRF-Token']).toBe('CCC');
  });

  test('warns and does NOT throw when csrf cookieName missing from cookies', async () => {
    seed({
      type: 'cookie', token: '', header: 'Authorization', scheme: '',
      cookies: [{ name: 'session_at', value: 'A', domain: 'api.example.test', path: '/' }],
      csrf: { cookieName: 'xs_csrf', header: 'X-CSRF-Token' },
    });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { playwright } = fakePlaywright();
    await expect(newAuthedContext(playwright as any, 'admin')).resolves.toBeDefined();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("csrf cookie 'xs_csrf' not present"));
    warn.mockRestore();
  });

  test('no csrf field → no header set, no warning', async () => {
    seed({
      type: 'cookie', token: '', header: 'Authorization', scheme: '',
      cookies: [{ name: 'session_at', value: 'A', domain: 'api.example.test', path: '/' }],
    });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { captured, playwright } = fakePlaywright();
    await newAuthedContext(playwright as any, 'admin');
    expect(captured[0].extraHTTPHeaders['X-CSRF-Token']).toBeUndefined();
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });
});
