import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { readAuthState, writeAuthState } from '../../src/auth/state';
import { preflightRefreshReuseWebSession } from '../../src/bin-internal/preflight-refresh';
import type { XeraConfig } from '../../src/config/schema';

let dir: string;
const origCwd = process.cwd();
const origKey = process.env.XERA_AUTH_KEY;

function makeConfig(): XeraConfig {
  // Cast through unknown — the test only exercises the http branch and the
  // loader isn't involved (we construct a minimal validated-shape object).
  return {
    github: { repo: 'owner/repo' },
    adapters: ['http'],
    http: {
      baseUrl: { dev: 'http://api.test' },
      defaultEnv: 'dev',
      auth: {
        strategy: 'reuse-web-session',
        ttl: '8h',
        refreshBuffer: '30m',
        roles: {
          admin: {
            reuseWebSession: {
              domainContains: 'test',
              cookies: {
                access: { match: { regex: '_at$' }, driveExpiry: true },
              },
            },
          },
        },
      },
    },
  } as unknown as XeraConfig;
}

function seedFreshWeb(): void {
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
          domain: 'api.test',
          path: '/',
          expires: Math.floor(Date.now() / 1000) + 900,
        },
      ],
      origins: [],
    },
  });
}

function seedExpiredWeb(): void {
  mkdirSync(join(dir, '.xera/.auth'), { recursive: true });
  writeAuthState(join(dir, '.xera/.auth'), {
    role: 'admin',
    strategy: 'storageState',
    created_at: new Date(Date.now() - 2 * 86_400_000).toISOString(),
    expires_at: new Date(Date.now() - 60_000).toISOString(),
    payload: { cookies: [], origins: [] },
  });
}

function seedExpiredHttp(): void {
  mkdirSync(join(dir, '.xera/.auth/http'), { recursive: true });
  writeAuthState(join(dir, '.xera/.auth/http'), {
    role: 'admin',
    strategy: 'apiToken',
    created_at: new Date(Date.now() - 86_400_000).toISOString(),
    expires_at: new Date(Date.now() - 60_000).toISOString(),
    payload: { type: 'cookie', token: '', header: 'Authorization', scheme: '', cookies: [] },
  });
}

function seedFreshHttp(): void {
  mkdirSync(join(dir, '.xera/.auth/http'), { recursive: true });
  writeAuthState(join(dir, '.xera/.auth/http'), {
    role: 'admin',
    strategy: 'apiToken',
    created_at: new Date().toISOString(),
    expires_at: new Date(Date.now() + 86_400_000).toISOString(),
    payload: { type: 'cookie', token: '', header: 'Authorization', scheme: '', cookies: [] },
  });
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'xera-preflight-'));
  process.env.XERA_AUTH_KEY =
    '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
  process.chdir(dir);
});

afterEach(() => {
  process.chdir(origCwd);
  rmSync(dir, { recursive: true, force: true });
  if (origKey === undefined) delete process.env.XERA_AUTH_KEY;
  else process.env.XERA_AUTH_KEY = origKey;
});

describe('preflightRefreshReuseWebSession', () => {
  test('re-derives http file when http expired but web fresh', async () => {
    seedFreshWeb();
    seedExpiredHttp();

    const oldExp = readAuthState(join(dir, '.xera/.auth/http'), 'admin')!.expires_at;
    expect(new Date(oldExp).getTime()).toBeLessThan(Date.now());

    const logger = { log: vi.fn(), warn: vi.fn() };
    await preflightRefreshReuseWebSession(makeConfig(), dir, logger);

    const refreshed = readAuthState(join(dir, '.xera/.auth/http'), 'admin');
    expect(refreshed).not.toBeNull();
    // expires_at must advance past now after re-derivation from a fresh web file.
    expect(new Date(refreshed!.expires_at).getTime()).toBeGreaterThan(Date.now());
    expect(refreshed!.strategy).toBe('apiToken');
    expect(logger.log).toHaveBeenCalled();
    expect(logger.warn).not.toHaveBeenCalled();
  });

  test('falls through silently when both http and web are expired', async () => {
    seedExpiredWeb();
    seedExpiredHttp();

    const before = readAuthState(join(dir, '.xera/.auth/http'), 'admin')!;
    const logger = { log: vi.fn(), warn: vi.fn() };
    // Must not throw — runtime "auth expired" error owns the user-facing message.
    await preflightRefreshReuseWebSession(makeConfig(), dir, logger);

    const after = readAuthState(join(dir, '.xera/.auth/http'), 'admin')!;
    expect(after.expires_at).toBe(before.expires_at);
    expect(logger.log).not.toHaveBeenCalled();
    expect(logger.warn).not.toHaveBeenCalled();
  });

  test('no-op when http file is already fresh', async () => {
    seedFreshWeb();
    seedFreshHttp();

    const before = readAuthState(join(dir, '.xera/.auth/http'), 'admin')!;
    const logger = { log: vi.fn(), warn: vi.fn() };
    await preflightRefreshReuseWebSession(makeConfig(), dir, logger);

    const after = readAuthState(join(dir, '.xera/.auth/http'), 'admin')!;
    expect(after.expires_at).toBe(before.expires_at);
    expect(after.created_at).toBe(before.created_at);
    expect(logger.log).not.toHaveBeenCalled();
    expect(logger.warn).not.toHaveBeenCalled();
  });

  test('no-op when http strategy is not reuse-web-session', async () => {
    seedExpiredHttp();
    const cfg = makeConfig();
    // Mutate to a non-reuse strategy.
    (cfg.http as { auth: { strategy: string } }).auth.strategy = 'apiToken';

    const before = readAuthState(join(dir, '.xera/.auth/http'), 'admin')!;
    const logger = { log: vi.fn(), warn: vi.fn() };
    await preflightRefreshReuseWebSession(cfg, dir, logger);

    const after = readAuthState(join(dir, '.xera/.auth/http'), 'admin')!;
    expect(after.expires_at).toBe(before.expires_at);
    expect(logger.log).not.toHaveBeenCalled();
  });

  test('no-op when config.http is undefined (web-only project)', async () => {
    const cfg: XeraConfig = {
      github: { repo: 'owner/repo' },
      adapters: ['web'],
      web: { baseUrl: { dev: 'http://x' }, defaultEnv: 'dev', auth: { strategy: 'storageState', ttl: '8h', refreshBuffer: '30m', roles: {} } },
    } as unknown as XeraConfig;
    const logger = { log: vi.fn(), warn: vi.fn() };
    await expect(preflightRefreshReuseWebSession(cfg, dir, logger)).resolves.toBeUndefined();
    expect(logger.log).not.toHaveBeenCalled();
    expect(logger.warn).not.toHaveBeenCalled();
  });
});
