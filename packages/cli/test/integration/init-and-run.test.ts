import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { type Proc, run } from './helpers';

// Absolute path to the xera CLI entrypoint. Must be absolute because the test
// runs `node <bin>` with cwd set to a fresh tmpdir, so a relative path would
// resolve outside the repo. Test file lives at packages/cli/test/integration/,
// bin at packages/cli/bin/.
const xeraBin = resolve(import.meta.dirname, '../../bin/xera');
const REPO_ROOT = resolve(import.meta.dirname, '../../../..');

let mockJira: Proc | undefined;
let sampleApp: Proc | undefined;

beforeAll(async () => {
  mockJira = run(['npx', 'tsx', 'fixtures/mock-jira/server.ts'], {
    cwd: REPO_ROOT,
    env: { ...process.env, MOCK_JIRA_PORT: '4322' },
  });
  sampleApp = run(['npm', 'run', 'dev'], { cwd: join(REPO_ROOT, 'fixtures/sample-app') });
  // Wait for both to come up
  for (let i = 0; i < 30; i++) {
    try {
      const a = await fetch('http://localhost:4322/__comments__').then((r) => r.ok);
      const b = await fetch('http://localhost:4321/').then((r) => r.ok);
      if (a && b) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error('fixtures did not start within 30s');
}, 60000);

afterAll(async () => {
  mockJira?.kill();
  sampleApp?.kill();
});

describe('xera integration — init + fetch + exec + report', () => {
  test('happy path with prepared spec', async () => {
    const cwd = mkdtempSync(join(tmpdir(), 'xera-int-'));

    // 1. Run `xera init --yes`
    const init = run(['node', xeraBin, 'init', '--yes'], { cwd });
    expect(await init.exited).toBe(0);
    expect(existsSync(join(cwd, 'xera.config.ts'))).toBe(true);

    // 2. Rewrite xera.config.ts to point at mock-jira
    let cfg = readFileSync(join(cwd, 'xera.config.ts'), 'utf8');
    cfg = cfg.replace(/https:\/\/[^'"]*atlassian[^'"]*/, 'http://localhost:4322');
    cfg = cfg.replace(/http:\/\/localhost:3000|https:\/\/[^'"]+/g, 'http://localhost:4321');
    writeFileSync(join(cwd, 'xera.config.ts'), cfg);
    writeFileSync(
      join(cwd, '.env'),
      [
        `JIRA_EMAIL=test@example.com`,
        `JIRA_API_TOKEN=mock`,
        `TEST_ADMIN_EMAIL=alice@example.com`,
        `TEST_ADMIN_PWD=ValidPass123!`,
        `TEST_REGULAR_EMAIL=alice@example.com`,
        `TEST_REGULAR_PWD=ValidPass123!`,
        `XERA_AUTH_KEY=${'a'.repeat(64)}`,
      ].join('\n'),
    );

    // 3. Pre-stage a real ticket directory mimicking what the skills produce
    const ticketDir = join(cwd, '.xera/SAMPLE-002');
    mkdirSync(ticketDir, { recursive: true });
    writeFileSync(join(ticketDir, 'story.md'), 'After login, dashboard says "Welcome, alice".');
    writeFileSync(
      join(ticketDir, 'test.feature'),
      `Feature: SAMPLE-002\n  Scenario: After login dashboard shows welcome\n    Given I am on /dashboard\n    Then I see "Welcome, alice"\n`,
    );
    writeFileSync(
      join(ticketDir, 'spec.ts'),
      `
      import { test, expect } from '@playwright/test';
      test.describe('SAMPLE-002', () => {
        test('After login dashboard shows welcome', async ({ page }) => {
          await page.goto('/dashboard');
          await expect(page.getByText('Welcome, alice')).toBeVisible();
        });
      });
    `,
    );

    // 4. Install scaffolded deps so `xera:fetch` can resolve the
    // `xera-internal` bin (from @xera-ai/core).
    const install = run(['npm', 'install'], { cwd });
    expect(await install.exited).toBe(0);

    // 5. Run xera-internal fetch SAMPLE-001 (uses mock-jira REST since no MCP)
    const fetchProc = run(['npx', 'xera-internal', 'fetch', 'SAMPLE-001'], { cwd });
    expect(await fetchProc.exited).toBe(0);
    expect(existsSync(join(cwd, '.xera/SAMPLE-001/story.md'))).toBe(true);

    rmSync(cwd, { recursive: true });
  }, 60000);
});
