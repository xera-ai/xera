import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { acquireLock } from '../../src/lock/file-lock';
import { execCmd } from '../../src/bin-internal/exec';

const DEFINE_PATH = resolve(__dirname, '../../src/config/define.ts');

describe('xera-internal exec', () => {
  let originalCwd: string;
  beforeEach(() => { originalCwd = process.cwd(); });
  afterEach(() => { process.chdir(originalCwd); });

  test('refuses to run when active lock exists', async () => {
    const cwd = mkdtempSync(join(tmpdir(), 'xera-exec-'));
    mkdirSync(join(cwd, '.xera/JIRA-1'), { recursive: true });
    writeFileSync(join(cwd, 'xera.config.ts'), `
      import { defineConfig } from '${DEFINE_PATH}';
      export default defineConfig({
        jira: { baseUrl: 'https://x.atlassian.net', projectKeys: ['JIRA'], fields: { story: 'description' } },
        web: { baseUrl: { staging: 'https://x.com' }, defaultEnv: 'staging', auth: { strategy: 'none' } },
        adapters: ['web'],
      });
    `);
    acquireLock(join(cwd, '.xera/JIRA-1/.lock'), 'existing-run');
    process.chdir(cwd);
    expect(await execCmd(['JIRA-1'])).toBe(1);
    rmSync(cwd, { recursive: true });
  });
});
