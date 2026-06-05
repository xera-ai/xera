import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readAuthState, writeAuthState } from '@xera-ai/core';
import { runHttpAuthSetup } from '../../src/auth-setup/runner';
import { presetHttpAuth } from '../../src/auth-setup/preset';

const FIXTURE_DIR = join(__dirname, '..', '..', '..', '..', 'fixtures/reuse-web-session');

let dir: string;
const origKey = process.env.XERA_AUTH_KEY;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'xera-int-reuse-'));
  process.env.XERA_AUTH_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
  if (origKey === undefined) delete process.env.XERA_AUTH_KEY;
  else process.env.XERA_AUTH_KEY = origKey;
});

describe('reuse-web-session integration', () => {
  test('produces persisted payload matching fixture expectations', async () => {
    const nowSec = Math.floor(Date.now() / 1000);
    writeAuthState(dir, {
      role: 'admin',
      strategy: 'storageState',
      created_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + 86400_000).toISOString(),
      payload: {
        cookies: [
          { name: 'session_at', value: 'A', domain: 'api.test.local', path: '/', expires: nowSec + 900 },
          { name: 'session_rt', value: 'R', domain: 'api.test.local', path: '/auth', expires: nowSec + 86400 },
          { name: 'xs_csrf', value: 'C', domain: 'api.test.local', path: '/' },
        ],
        origins: [],
      },
    });
    const { default: cfg } = await import(join(FIXTURE_DIR, 'xera.config.ts'));
    const expected = JSON.parse(readFileSync(join(FIXTURE_DIR, 'expected-payload.json'), 'utf8'));
    await runHttpAuthSetup({
      authDir: dir,
      role: 'admin',
      config: cfg.http,
      setupFn: async (request, role) =>
        presetHttpAuth({ request, role, config: cfg.http, webAuthDir: dir }),
      creds: { email: '', password: '' },
    });
    const entry = readAuthState(join(dir, 'http'), 'admin');
    expect(entry).not.toBeNull();
    const payload = entry!.payload as Record<string, unknown>;
    expect(payload.type).toBe(expected.type);
    expect(payload.header).toBe(expected.header);
    expect(payload.scheme).toBe(expected.scheme);
    expect(payload.csrf).toEqual(expected.csrf);
    expect(payload.refreshable).toEqual(expected.refreshable);
    expect(payload.accessMatch).toEqual(expected.accessMatch);
    expect((payload.cookies as Array<{ name: string }>).map((c) => c.name).sort()).toEqual(
      [...expected.cookieNames].sort(),
    );
  });
});
