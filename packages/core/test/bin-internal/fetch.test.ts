import { describe, expect, test } from 'bun:test';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fetchCmd } from '../../src/bin-internal/fetch';

const DEFINE_PATH = resolve(__dirname, '../../src/config/define.ts');

function writeConfig(cwd: string, withAcField = false): void {
  const fields = withAcField
    ? `{ story: 'description', acceptanceCriteria: 'customfield_10100' }`
    : `{ story: 'description' }`;
  writeFileSync(
    join(cwd, 'xera.config.ts'),
    `
      import { defineConfig } from '${DEFINE_PATH}';
      export default defineConfig({
        jira: { baseUrl: 'https://x.atlassian.net', projectKeys: ['JIRA'], fields: ${fields} },
        web: { baseUrl: { staging: 'https://x.com' }, defaultEnv: 'staging' },
        adapters: ['web'],
      });
    `,
  );
}

describe('xera-internal fetch', () => {
  test('writes story.md and meta.json', async () => {
    const cwd = mkdtempSync(join(tmpdir(), 'xera-fetch-'));
    writeConfig(cwd);
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
    // Frontmatter required by graph-record fetch
    expect(story).toMatch(/^---\n/);
    expect(story).toContain('ticketId: JIRA-1');
    expect(story).toContain('summary: "A summary"');
    expect(story).toContain('storyHash:');

    delete process.env.XERA_TEST_JIRA;
    rmSync(cwd, { recursive: true });
  });

  test('writes acceptanceCriteriaSource: none when Jira returns no AC', async () => {
    const cwd = mkdtempSync(join(tmpdir(), 'xera-fetch-'));
    writeConfig(cwd, true);
    process.env.XERA_TEST_JIRA = JSON.stringify({
      key: 'JIRA-2',
      summary: 'No AC',
      story: 'Body only, AC nowhere',
      attachments: [],
      raw: {},
    });
    try {
      const exit = await fetchCmd(['JIRA-2'], { cwd });
      expect(exit).toBe(0);
      const story = readFileSync(join(cwd, '.xera/JIRA-2/story.md'), 'utf8');
      expect(story).toContain('acceptanceCriteriaSource: none');
      expect(story).not.toContain('acceptanceCriteria:');
    } finally {
      delete process.env.XERA_TEST_JIRA;
      rmSync(cwd, { recursive: true });
    }
  });

  test('writes acceptanceCriteriaSource: jira-field when Jira returned AC', async () => {
    const cwd = mkdtempSync(join(tmpdir(), 'xera-fetch-'));
    writeConfig(cwd, true);
    process.env.XERA_TEST_JIRA = JSON.stringify({
      key: 'JIRA-3',
      summary: 'Has AC',
      story: 'Body',
      acceptanceCriteria: '- AC1\n- AC2',
      attachments: [],
      raw: {},
    });
    try {
      const exit = await fetchCmd(['JIRA-3'], { cwd });
      expect(exit).toBe(0);
      const story = readFileSync(join(cwd, '.xera/JIRA-3/story.md'), 'utf8');
      expect(story).toContain('acceptanceCriteriaSource: jira-field');
      expect(story).toContain('acceptanceCriteria:');
      expect(story).toContain('"AC1"');
      expect(story).toContain('"AC2"');
    } finally {
      delete process.env.XERA_TEST_JIRA;
      rmSync(cwd, { recursive: true });
    }
  });

  test('writes story.md for a GitHub ticket via XERA_TEST_ISSUE injection', async () => {
    const cwd = mkdtempSync(join(tmpdir(), 'xera-fetch-gh-'));
    writeFileSync(
      join(cwd, 'xera.config.ts'),
      `
        import { defineConfig } from '${DEFINE_PATH}';
        export default defineConfig({
          github: { repo: 'octocat/hello-world' },
          web: { baseUrl: { staging: 'https://x.com' }, defaultEnv: 'staging' },
          adapters: ['web'],
        });
      `,
    );
    process.env.XERA_TEST_ISSUE = JSON.stringify({
      key: 'GH-7',
      summary: 'Login button mis-aligned on Safari',
      story: 'Steps: 1. Open Safari\\n2. Try login',
      attachments: [],
    });
    try {
      const exit = await fetchCmd(['GH-7'], { cwd });
      expect(exit).toBe(0);
      const story = readFileSync(join(cwd, '.xera/GH-7/story.md'), 'utf8');
      expect(story).toContain('ticketId: GH-7');
      expect(story).toContain('Login button mis-aligned on Safari');
      // GitHub tickets never have a separate AC field, so this is always none
      // here — the skill's body-extraction step is what populates AC later.
      expect(story).toContain('acceptanceCriteriaSource: none');
    } finally {
      delete process.env.XERA_TEST_ISSUE;
      rmSync(cwd, { recursive: true });
    }
  });
});
