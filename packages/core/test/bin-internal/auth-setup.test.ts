/**
 * Tests for `xera:auth-setup` shape-vs-export mismatch detection (issue #93).
 *
 * The bug: when `--shape http` (or `--shape all`) was run against a project
 * whose shared/auth-setup.ts only exported `web`, auth-setup silently exited
 * 0 with no output. `xera doctor` kept reporting the http auth file missing
 * on every run — an infinite loop with no actionable error.
 *
 * The fix surfaces a clear error pointing the user at the missing export.
 */

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { authSetupCmd } from '../../src/bin-internal/auth-setup';

const chromiumLaunchMock = vi.fn(async (_opts?: unknown) => ({ close: async () => {} }));

vi.mock('@playwright/test', () => ({
  chromium: { launch: (opts?: unknown) => chromiumLaunchMock(opts) },
}));

vi.mock('@xera-ai/web', () => ({
  runAuthSetup: async () => {},
}));

// test file is packages/core/test/bin-internal/, repo root is 3 levels up.
const REPO_ROOT = resolve(import.meta.dirname, '../../../..');

let root: string;
let prevCwd: string;

beforeEach(() => {
  prevCwd = process.cwd();
  root = mkdtempSync(join(tmpdir(), 'xera-auth-setup-'));
  process.chdir(root);
});

afterEach(() => {
  process.chdir(prevCwd);
  rmSync(root, { recursive: true, force: true });
});

function writeConfig(content: string): void {
  writeFileSync(join(root, 'xera.config.ts'), content);
}

function writeAuthSetup(content: string): void {
  mkdirSync(join(root, 'shared'), { recursive: true });
  writeFileSync(join(root, 'shared/auth-setup.ts'), content);
}

// xera.config.ts must `import { defineConfig } from '@xera-ai/core'`. The test
// project is a fresh tmpdir with no node_modules, so we point the import at
// the source path of this repo to keep the test hermetic.
function mixedConfig(repoRoot: string): string {
  return `
import { defineConfig } from '${join(repoRoot, 'packages/core/src/index.ts')}';
export default defineConfig({
  jira: { baseUrl: 'https://x.atlassian.net', projectKeys: ['X'], fields: { story: 'description' } },
  web: { baseUrl: { dev: 'https://app.x.com' }, defaultEnv: 'dev',
    auth: { strategy: 'storageState', setupScript: './shared/auth-setup.ts',
      roles: { admin: { envEmail: 'A_E', envPassword: 'A_P' } } } },
  http: { baseUrl: { dev: 'https://api.x.com' }, defaultEnv: 'dev',
    auth: { strategy: 'bearer', roles: { admin: { tokenEnv: 'A_T' } } } },
  adapters: ['web', 'http'],
});
`;
}

function webOnlyConfig(repoRoot: string): string {
  return `
import { defineConfig } from '${join(repoRoot, 'packages/core/src/index.ts')}';
export default defineConfig({
  jira: { baseUrl: 'https://x.atlassian.net', projectKeys: ['X'], fields: { story: 'description' } },
  web: { baseUrl: { dev: 'https://app.x.com' }, defaultEnv: 'dev',
    auth: { strategy: 'storageState', setupScript: './shared/auth-setup.ts',
      roles: { admin: { envEmail: 'A_E', envPassword: 'A_P' } } } },
  adapters: ['web'],
});
`;
}

const WEB_ONLY_SETUP = `
export const web = async () => ({ expiresAt: Date.now() + 3_600_000 });
`;

function captureStderr(): { restore: () => string } {
  const original = console.error;
  const chunks: string[] = [];
  console.error = (...args: unknown[]) => {
    chunks.push(args.map((a) => String(a)).join(' '));
  };
  return {
    restore: () => {
      console.error = original;
      return chunks.join('\n');
    },
  };
}

describe('authSetupCmd shape mismatch detection (#93)', () => {
  const repoRoot = REPO_ROOT;

  test('--shape http with no http export → exit 1 with actionable error', async () => {
    writeConfig(mixedConfig(repoRoot));
    writeAuthSetup(WEB_ONLY_SETUP);

    const cap = captureStderr();
    const exit = await authSetupCmd(['--shape', 'http']);
    const stderr = cap.restore();

    expect(exit).toBe(1);
    expect(stderr).toContain('http adapter is configured');
    expect(stderr).toContain('missing the `http` export');
    expect(stderr).toContain('defineHttpAuthSetup');
  });

  test('--shape http with no http config block → exit 1 with clear error', async () => {
    writeConfig(webOnlyConfig(repoRoot));
    writeAuthSetup(WEB_ONLY_SETUP);

    const cap = captureStderr();
    const exit = await authSetupCmd(['--shape', 'http']);
    const stderr = cap.restore();

    expect(exit).toBe(1);
    expect(stderr).toContain('--shape http requested');
    expect(stderr).toContain('no `http` block');
  });

  test('--shape all (default) on mixed config with no exports → exit 1 with both warnings', async () => {
    // This is the infinite-loop case from the issue: doctor says "run auth-setup",
    // user runs `npx xera-internal auth-setup` (no --shape flag, defaults to `all`),
    // it used to silently no-op. Now both warnings fire from the pre-flight.
    // Using a no-export auth-setup.ts keeps the test hermetic — the web branch
    // would otherwise try to launch chromium which isn't installed in CI.
    writeConfig(mixedConfig(repoRoot));
    writeAuthSetup('// no exports');

    const cap = captureStderr();
    const exit = await authSetupCmd(['--shape', 'all']);
    const stderr = cap.restore();

    expect(exit).toBe(1);
    expect(stderr).toContain('http adapter is configured');
    expect(stderr).toContain('missing the `http` export');
    expect(stderr).toContain('web adapter is configured');
    expect(stderr).toContain('missing the `web` export');
  });
});

describe('authSetupCmd unknown role detection (#98)', () => {
  const repoRoot = REPO_ROOT;

  test('typoed --role on mixed config → exit 1 listing configured roles', async () => {
    writeConfig(mixedConfig(repoRoot));
    writeAuthSetup('// no exports'); // hermetic — pre-flight returns before web/http branches

    const cap = captureStderr();
    const exit = await authSetupCmd(['--role', 'amdin']); // typo of 'admin'
    const stderr = cap.restore();

    expect(exit).toBe(1);
    expect(stderr).toContain("unknown role 'amdin'");
    expect(stderr).toContain('configured roles: admin');
    expect(stderr).toContain('web roles: admin');
    expect(stderr).toContain('http roles: admin');
  });

  test('typoed --role with --shape http only lists http roles', async () => {
    writeConfig(mixedConfig(repoRoot));
    writeAuthSetup('// no exports');

    const cap = captureStderr();
    const exit = await authSetupCmd(['--shape', 'http', '--role', 'nope']);
    const stderr = cap.restore();

    expect(exit).toBe(1);
    expect(stderr).toContain("unknown role 'nope'");
    expect(stderr).toContain('http roles: admin');
    // web roles not surfaced when --shape http excludes that adapter
    expect(stderr).not.toContain('web roles:');
  });

  test('correct --role passes through unknown-role check', async () => {
    writeConfig(mixedConfig(repoRoot));
    writeAuthSetup('// no exports');

    const cap = captureStderr();
    const exit = await authSetupCmd(['--role', 'admin']);
    const stderr = cap.restore();

    // Still exits 1 because of missing exports (#93 pre-flight), but the
    // unknown-role error must NOT be emitted for a valid role.
    expect(exit).toBe(1);
    expect(stderr).not.toContain('unknown role');
  });
});

describe('authSetupCmd headed opt-in (#213)', () => {
  const repoRoot = REPO_ROOT;

  beforeEach(() => {
    chromiumLaunchMock.mockClear();
    process.env.A_E = 'admin@example.com';
    process.env.A_P = 'secret';
  });

  afterEach(() => {
    delete process.env.A_E;
    delete process.env.A_P;
    delete process.env.XERA_HEADED;
  });

  test('launches headless by default', async () => {
    writeConfig(webOnlyConfig(repoRoot));
    writeAuthSetup(WEB_ONLY_SETUP);

    await authSetupCmd(['--shape', 'web']);

    expect(chromiumLaunchMock).toHaveBeenCalledTimes(1);
    const opts = chromiumLaunchMock.mock.calls[0]![0] as { headless?: boolean };
    expect(opts?.headless).toBe(true);
  });

  test('XERA_HEADED=1 launches headed for SSO/MFA flows', async () => {
    writeConfig(webOnlyConfig(repoRoot));
    writeAuthSetup(WEB_ONLY_SETUP);
    process.env.XERA_HEADED = '1';

    await authSetupCmd(['--shape', 'web']);

    expect(chromiumLaunchMock).toHaveBeenCalledTimes(1);
    const opts = chromiumLaunchMock.mock.calls[0]![0] as { headless?: boolean };
    expect(opts?.headless).toBe(false);
  });
});
