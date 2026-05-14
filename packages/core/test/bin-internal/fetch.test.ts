import { describe, expect, test } from 'bun:test';
import { mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fetchCmd } from '../../src/bin-internal/fetch';

const DEFINE_PATH = resolve(__dirname, '../../src/config/define.ts');

describe('xera-internal fetch', () => {
  test('writes story.md and meta.json', async () => {
    const cwd = mkdtempSync(join(tmpdir(), 'xera-fetch-'));
    // Write xera.config.ts
    writeFileSync(join(cwd, 'xera.config.ts'), `
      import { defineConfig } from '${DEFINE_PATH}';
      export default defineConfig({
        jira: { baseUrl: 'https://x.atlassian.net', projectKeys: ['JIRA'], fields: { story: 'description' } },
        web: { baseUrl: { staging: 'https://x.com' }, defaultEnv: 'staging' },
        adapters: ['web'],
      });
    `);
    // Stub the jira client via env-injected factory
    process.env.XERA_TEST_JIRA = JSON.stringify({
      key: 'JIRA-1',
      summary: 'A summary',
      story: 'A user story',
      attachments: [],
      raw: {},
    });

    const exit = await fetchCmd(['JIRA-1'], { cwd });
    expect(exit).toBe(0);
    expect(existsSync(join(cwd, '.xera/JIRA-1/story.md'))).toBe(true);
    const story = readFileSync(join(cwd, '.xera/JIRA-1/story.md'), 'utf8');
    expect(story).toContain('A user story');

    delete process.env.XERA_TEST_JIRA;
    rmSync(cwd, { recursive: true });
  });
});
