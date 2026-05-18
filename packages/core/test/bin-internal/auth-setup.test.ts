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

import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { authSetupCmd } from '../../src/bin-internal/auth-setup';

// test file is packages/core/test/bin-internal/, repo root is 3 levels up.
const REPO_ROOT = resolve(import.meta.dir, '../../../..');

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

  test('--shape all (default) on mixed config with no http export → exit 1', async () => {
    // This is the infinite-loop case from the issue: doctor says "run auth-setup",
    // user runs `bun run xera:auth-setup` (no --shape flag, defaults to `all`),
    // it used to silently no-op on http. Now it surfaces the problem.
    writeConfig(mixedConfig(repoRoot));
    writeAuthSetup(WEB_ONLY_SETUP);

    const cap = captureStderr();
    // Need creds so the web branch doesn't bail first (it will still warn, but
    // that's fine — we want to see the http warning emerge before silent exit).
    process.env.A_E = 'a@b.c';
    process.env.A_P = 'pwd';
    const exit = await authSetupCmd(['--shape', 'all']);
    const stderr = cap.restore();
    delete process.env.A_E;
    delete process.env.A_P;

    expect(exit).toBe(1);
    expect(stderr).toContain('http adapter is configured');
    expect(stderr).toContain('missing the `http` export');
  });
});
