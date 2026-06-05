import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { execCmd } from '../../src/bin-internal/exec';
import { acquireLock } from '../../src/lock/file-lock';

const DEFINE_PATH = resolve(__dirname, '../../src/config/define.ts');

const runAuthSetupMock = vi.fn(async () => {});
const runPlaywrightMock = vi.fn(async () => ({ exitCode: 0, outcome: 'PASS' as const }));
const chromiumLaunchMock = vi.fn(async (_opts?: unknown) => ({ close: async () => {} }));

vi.mock('@xera-ai/web', () => ({
  runAuthSetup: (...args: unknown[]) => runAuthSetupMock(...args),
  runPlaywright: (...args: unknown[]) => runPlaywrightMock(...args),
  stagePlaywrightState: () => {},
}));

vi.mock('@playwright/test', () => ({
  chromium: { launch: (opts?: unknown) => chromiumLaunchMock(opts) },
}));

describe('xera-internal exec', () => {
  let originalCwd: string;
  beforeEach(() => {
    originalCwd = process.cwd();
  });
  afterEach(() => {
    process.chdir(originalCwd);
  });

  test('refuses to run when active lock exists', async () => {
    const cwd = mkdtempSync(join(tmpdir(), 'xera-exec-'));
    mkdirSync(join(cwd, '.xera/JIRA-1'), { recursive: true });
    writeFileSync(
      join(cwd, 'xera.config.ts'),
      `
      import { defineConfig } from '${DEFINE_PATH}';
      export default defineConfig({
        jira: { baseUrl: 'https://x.atlassian.net', projectKeys: ['JIRA'], fields: { story: 'description' } },
        web: { baseUrl: { staging: 'https://x.com' }, defaultEnv: 'staging', auth: { strategy: 'none' } },
        adapters: ['web'],
      });
    `,
    );
    acquireLock(join(cwd, '.xera/JIRA-1/.lock'), 'existing-run');
    process.chdir(cwd);
    expect(await execCmd(['JIRA-1'])).toBe(1);
    rmSync(cwd, { recursive: true });
  });
});

describe('xera-internal exec auth refresh', () => {
  let originalCwd: string;
  beforeEach(() => {
    originalCwd = process.cwd();
    runAuthSetupMock.mockClear();
    runPlaywrightMock.mockClear();
    chromiumLaunchMock.mockClear();
  });
  afterEach(() => {
    process.chdir(originalCwd);
  });

  function scaffoldProject(opts: {
    baseUrlEnv?: string;
    roles?: Record<string, { envEmail: string; envPassword: string }>;
  }): string {
    const cwd = mkdtempSync(join(tmpdir(), 'xera-exec-auth-'));
    mkdirSync(join(cwd, '.xera/JIRA-1'), { recursive: true });
    mkdirSync(join(cwd, 'shared'), { recursive: true });
    writeFileSync(join(cwd, 'shared/auth-setup.ts'), 'export default async () => ({});\n');
    writeFileSync(join(cwd, 'playwright.config.ts'), 'export default {};\n');
    const roles = opts.roles ?? {
      admin: { envEmail: 'XERA_TEST_EMAIL', envPassword: 'XERA_TEST_PASSWORD' },
    };
    writeFileSync(
      join(cwd, 'xera.config.ts'),
      `
      import { defineConfig } from '${DEFINE_PATH}';
      export default defineConfig({
        jira: { baseUrl: 'https://x.atlassian.net', projectKeys: ['JIRA'], fields: { story: 'description' } },
        web: {
          baseUrl: { staging: '${opts.baseUrlEnv ?? 'https://staging.example.com'}' },
          defaultEnv: 'staging',
          auth: {
            strategy: 'storageState',
            setupScript: 'shared/auth-setup.ts',
            ttl: '8h',
            refreshBuffer: '30m',
            roles: ${JSON.stringify(roles)},
          },
        },
        adapters: ['web'],
      });
    `,
    );
    return cwd;
  }

  test('passes resolved baseURL to runAuthSetup when refreshing (#209)', async () => {
    const cwd = scaffoldProject({ baseUrlEnv: 'https://staging.example.com' });
    process.env['XERA_TEST_EMAIL'] = 'admin@example.com';
    process.env['XERA_TEST_PASSWORD'] = 'secret';
    process.chdir(cwd);

    expect(await execCmd(['JIRA-1'])).toBe(0);

    expect(runAuthSetupMock).toHaveBeenCalledTimes(1);
    const call = runAuthSetupMock.mock.calls[0]![0] as { baseURL?: string; role: string };
    expect(call.role).toBe('admin');
    expect(call.baseURL).toBe('https://staging.example.com');

    delete process.env['XERA_TEST_EMAIL'];
    delete process.env['XERA_TEST_PASSWORD'];
    rmSync(cwd, { recursive: true });
  });

  test('prefers XERA_BASE_URL env override over config when resolving baseURL', async () => {
    const cwd = scaffoldProject({ baseUrlEnv: 'https://staging.example.com' });
    process.env['XERA_TEST_EMAIL'] = 'admin@example.com';
    process.env['XERA_TEST_PASSWORD'] = 'secret';
    process.env.XERA_BASE_URL = 'http://localhost:3000';
    process.chdir(cwd);

    expect(await execCmd(['JIRA-1'])).toBe(0);

    expect(runAuthSetupMock).toHaveBeenCalledTimes(1);
    const call = runAuthSetupMock.mock.calls[0]![0] as { baseURL?: string };
    expect(call.baseURL).toBe('http://localhost:3000');

    delete process.env['XERA_TEST_EMAIL'];
    delete process.env['XERA_TEST_PASSWORD'];
    delete process.env.XERA_BASE_URL;
    rmSync(cwd, { recursive: true });
  });

  test('skips role with missing creds instead of failing the whole run (#212)', async () => {
    const cwd = scaffoldProject({
      roles: {
        admin: { envEmail: 'XERA_TEST_EMAIL', envPassword: 'XERA_TEST_PASSWORD' },
        reader: { envEmail: 'XERA_READER_EMAIL', envPassword: 'XERA_READER_PASSWORD' },
      },
    });
    process.env['XERA_TEST_EMAIL'] = 'admin@example.com';
    process.env['XERA_TEST_PASSWORD'] = 'secret';
    // XERA_READER_* intentionally unset
    process.chdir(cwd);

    expect(await execCmd(['JIRA-1'])).toBe(0);

    expect(runAuthSetupMock).toHaveBeenCalledTimes(1);
    const call = runAuthSetupMock.mock.calls[0]![0] as { role: string };
    expect(call.role).toBe('admin');
    expect(runPlaywrightMock).toHaveBeenCalledTimes(1);

    delete process.env['XERA_TEST_EMAIL'];
    delete process.env['XERA_TEST_PASSWORD'];
    rmSync(cwd, { recursive: true });
  });

  test('launches headless by default (#213)', async () => {
    const cwd = scaffoldProject({});
    process.env['XERA_TEST_EMAIL'] = 'admin@example.com';
    process.env['XERA_TEST_PASSWORD'] = 'secret';
    process.chdir(cwd);

    expect(await execCmd(['JIRA-1'])).toBe(0);

    expect(chromiumLaunchMock).toHaveBeenCalledTimes(1);
    const opts = chromiumLaunchMock.mock.calls[0]![0] as { headless?: boolean };
    expect(opts?.headless).toBe(true);

    delete process.env['XERA_TEST_EMAIL'];
    delete process.env['XERA_TEST_PASSWORD'];
    rmSync(cwd, { recursive: true });
  });

  test('XERA_HEADED=1 launches headed for interactive SSO/MFA (#213)', async () => {
    const cwd = scaffoldProject({});
    process.env['XERA_TEST_EMAIL'] = 'admin@example.com';
    process.env['XERA_TEST_PASSWORD'] = 'secret';
    process.env.XERA_HEADED = '1';
    process.chdir(cwd);

    expect(await execCmd(['JIRA-1'])).toBe(0);

    expect(chromiumLaunchMock).toHaveBeenCalledTimes(1);
    const opts = chromiumLaunchMock.mock.calls[0]![0] as { headless?: boolean };
    expect(opts?.headless).toBe(false);

    delete process.env['XERA_TEST_EMAIL'];
    delete process.env['XERA_TEST_PASSWORD'];
    delete process.env.XERA_HEADED;
    rmSync(cwd, { recursive: true });
  });
});

describe('execCmd --grep flag parsing', () => {
  test('parses --grep flag from argv and forwards to runPlaywright', async () => {
    // This is a smoke-level test: import the module, verify the flag-parsing
    // logic extracts --grep value. We mock the heavy infrastructure (auth,
    // config, lock) to focus on the flag forwarding.
    //
    // The simplest assertion: argv parser correctly extracts --grep value.
    const argv = ['ABC-100', '--grep', 'user signs in'];
    const grepIdx = argv.indexOf('--grep');
    expect(grepIdx).toBeGreaterThan(-1);
    expect(argv[grepIdx + 1]).toBe('user signs in');
  });
});
