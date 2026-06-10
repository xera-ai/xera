import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { refreshHttpFromWeb } from '../../src/auth/refresh';
import { readAuthState, writeAuthState } from '../../src/auth/state';

let dir: string;
const origKey = process.env.XERA_AUTH_KEY;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'xera-rhfw-'));
  process.env.XERA_AUTH_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
  if (origKey === undefined) delete process.env.XERA_AUTH_KEY;
  else process.env.XERA_AUTH_KEY = origKey;
});

describe('refreshHttpFromWeb', () => {
  test('re-derives http file from web file via preset', async () => {
    mkdirSync(join(dir, '.xera/.auth'), { recursive: true });
    writeAuthState(join(dir, '.xera/.auth'), {
      role: 'admin',
      strategy: 'storageState',
      created_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + 86_400_000).toISOString(),
      payload: {
        cookies: [
          {
            name: 'session_at',
            value: 'A',
            domain: 'api.x.com',
            path: '/',
            expires: Math.floor(Date.now() / 1000) + 900,
          },
        ],
        origins: [],
      },
    });

    const httpConfig = {
      baseUrl: { dev: 'http://api.x.com' },
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
              },
            },
          },
        },
      },
    };

    await refreshHttpFromWeb(dir, 'admin', httpConfig as never);

    const httpEntry = readAuthState(join(dir, '.xera/.auth/http'), 'admin');
    expect(httpEntry).not.toBeNull();
    expect(httpEntry!.strategy).toBe('apiToken');
    expect((httpEntry!.payload as { type: string }).type).toBe('cookie');
  });
});
