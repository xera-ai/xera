import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { AUTH_KEY_ENV, generateKey, writeAuthState } from '@xera-ai/core';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { stageAuthCmd } from '../../src/bin-internal/stage-auth';

const DEFINE_PATH = resolve(__dirname, '../../src/config/define.ts');

const runAuthSetupMock = vi.fn(async () => {});
const chromiumLaunchMock = vi.fn(async (_opts?: unknown) => ({ close: async () => {} }));

vi.mock('@xera-ai/web', async () => {
  // Keep the real stagePlaywrightState so file-on-disk assertions are honest.
  const actual = await vi.importActual<typeof import('@xera-ai/web')>('@xera-ai/web');
  return {
    ...actual,
    runAuthSetup: (...args: unknown[]) => runAuthSetupMock(...args),
  };
});

vi.mock('@playwright/test', () => ({
  chromium: { launch: (opts?: unknown) => chromiumLaunchMock(opts) },
}));

describe('stageAuthCmd (#225)', () => {
  let originalCwd: string;
  let cwd: string;
  beforeEach(() => {
    originalCwd = process.cwd();
    process.env[AUTH_KEY_ENV] = generateKey();
    runAuthSetupMock.mockClear();
    chromiumLaunchMock.mockClear();

    cwd = mkdtempSync(join(tmpdir(), 'xera-stage-auth-'));
    mkdirSync(join(cwd, 'shared'), { recursive: true });
    writeFileSync(join(cwd, 'shared/auth-setup.ts'), 'export default async () => ({});\n');
    writeFileSync(
      join(cwd, 'xera.config.ts'),
      `
      import { defineConfig } from '${DEFINE_PATH}';
      export default defineConfig({
        jira: { baseUrl: 'https://x.atlassian.net', projectKeys: ['JIRA'], fields: { story: 'description' } },
        web: {
          baseUrl: { staging: 'https://staging.example.com' },
          defaultEnv: 'staging',
          auth: {
            strategy: 'storageState',
            setupScript: 'shared/auth-setup.ts',
            ttl: '8h',
            refreshBuffer: '30m',
            roles: { admin: { envEmail: 'A_E', envPassword: 'A_P' } },
          },
        },
        adapters: ['web'],
      });
    `,
    );
    process.chdir(cwd);
  });
  afterEach(() => {
    process.chdir(originalCwd);
    delete process.env[AUTH_KEY_ENV];
    delete process.env.A_E;
    delete process.env.A_P;
    rmSync(cwd, { recursive: true, force: true });
  });

  function seedExistingAuth(role: string): void {
    const authDir = join(cwd, '.xera', '.auth');
    mkdirSync(authDir, { recursive: true });
    writeAuthState(authDir, {
      role,
      strategy: 'storageState',
      created_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + 8 * 3600 * 1000).toISOString(),
      payload: { cookies: [{ name: 's', value: 'token' }] } as unknown as Record<string, unknown>,
    });
  }

  test('decrypts existing auth state into .cache/<role>.json (no refresh needed)', async () => {
    seedExistingAuth('admin');

    const exit = await stageAuthCmd([]);

    expect(exit).toBe(0);
    const staged = join(cwd, '.xera', '.auth', '.cache', 'admin.json');
    expect(existsSync(staged)).toBe(true);
    // Plaintext, not the v1:... ciphertext envelope.
    const raw = readFileSync(staged, 'utf8');
    expect(raw.startsWith('v1:')).toBe(false);
    expect(raw).toContain('token');
    // No refresh call when entry is fresh.
    expect(runAuthSetupMock).not.toHaveBeenCalled();
    expect(chromiumLaunchMock).not.toHaveBeenCalled();
  });

  test('refreshes expired role when creds present, then stages', async () => {
    // Plant an expired entry.
    const authDir = join(cwd, '.xera', '.auth');
    mkdirSync(authDir, { recursive: true });
    writeAuthState(authDir, {
      role: 'admin',
      strategy: 'storageState',
      created_at: new Date(Date.now() - 10 * 3600 * 1000).toISOString(),
      expires_at: new Date(Date.now() - 1000).toISOString(),
      payload: { cookies: [{ name: 's', value: 'old' }] } as unknown as Record<string, unknown>,
    });
    process.env.A_E = 'admin@example.com';
    process.env.A_P = 'secret';
    // Have runAuthSetup write a new fresh entry so subsequent stage works.
    runAuthSetupMock.mockImplementation(async () => {
      writeAuthState(authDir, {
        role: 'admin',
        strategy: 'storageState',
        created_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + 8 * 3600 * 1000).toISOString(),
        payload: { cookies: [{ name: 's', value: 'refreshed' }] } as unknown as Record<
          string,
          unknown
        >,
      });
    });

    const exit = await stageAuthCmd([]);

    expect(exit).toBe(0);
    expect(runAuthSetupMock).toHaveBeenCalledTimes(1);
    const staged = join(cwd, '.xera', '.auth', '.cache', 'admin.json');
    expect(readFileSync(staged, 'utf8')).toContain('refreshed');
  });

  test('returns 1 with actionable message when role missing entirely and creds unset', async () => {
    // No seeded auth file, no creds env.
    const exit = await stageAuthCmd([]);
    // Even though no entry, the loop tries to refresh; with creds unset it
    // warns + skips, then the stage loop reports "no auth state". Exit 1.
    expect(exit).toBe(1);
  });

  test('--role limits scope', async () => {
    // Add a second role to the config and seed only one.
    writeFileSync(
      join(cwd, 'xera.config.ts'),
      `
      import { defineConfig } from '${DEFINE_PATH}';
      export default defineConfig({
        jira: { baseUrl: 'https://x.atlassian.net', projectKeys: ['JIRA'], fields: { story: 'description' } },
        web: {
          baseUrl: { staging: 'https://staging.example.com' },
          defaultEnv: 'staging',
          auth: {
            strategy: 'storageState',
            setupScript: 'shared/auth-setup.ts',
            roles: {
              admin: { envEmail: 'A_E', envPassword: 'A_P' },
              reader: { envEmail: 'R_E', envPassword: 'R_P' },
            },
          },
        },
        adapters: ['web'],
      });
    `,
    );
    seedExistingAuth('admin');

    const exit = await stageAuthCmd(['--role', 'admin']);

    expect(exit).toBe(0);
    expect(existsSync(join(cwd, '.xera', '.auth', '.cache', 'admin.json'))).toBe(true);
    expect(existsSync(join(cwd, '.xera', '.auth', '.cache', 'reader.json'))).toBe(false);
  });
});
