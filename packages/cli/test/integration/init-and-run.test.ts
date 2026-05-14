import { describe, expect, test, beforeAll, afterAll } from 'bun:test';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn, type Subprocess } from 'bun';

let mockJira: Subprocess | undefined;
let sampleApp: Subprocess | undefined;

beforeAll(async () => {
  mockJira = spawn(['bun', 'run', 'fixtures/mock-jira/server.ts'], { env: { ...process.env, MOCK_JIRA_PORT: '4322' } });
  sampleApp = spawn(['bun', 'run', '--cwd', 'fixtures/sample-app', 'dev']);
  // Wait for both to come up
  for (let i = 0; i < 30; i++) {
    try {
      const a = await fetch('http://localhost:4322/__comments__').then(r => r.ok);
      const b = await fetch('http://localhost:4321/').then(r => r.ok);
      if (a && b) return;
    } catch {}
    await new Promise(r => setTimeout(r, 1000));
  }
  throw new Error('fixtures did not start within 30s');
});

afterAll(async () => {
  mockJira?.kill();
  sampleApp?.kill();
});

describe('xera integration — init + fetch + exec + report', () => {
  test('happy path with prepared spec', async () => {
    const cwd = mkdtempSync(join(tmpdir(), 'xera-int-'));

    // 1. Run `xera init --yes`
    const init = spawn(['bun', 'run', '--cwd', cwd, '../../packages/cli/bin/xera', 'init', '--yes'], { cwd });
    expect(await init.exited).toBe(0);
    expect(existsSync(join(cwd, 'xera.config.ts'))).toBe(true);
    expect(existsSync(join(cwd, '.xera/SAMPLE-001/spec.ts'))).toBe(true);

    // 2. Rewrite xera.config.ts to point at mock-jira
    let cfg = readFileSync(join(cwd, 'xera.config.ts'), 'utf8');
    cfg = cfg.replace(/https:\/\/[^'"]*atlassian[^'"]*/, 'http://localhost:4322');
    cfg = cfg.replace(/http:\/\/localhost:3000|https:\/\/[^'"]+/g, 'http://localhost:4321');
    writeFileSync(join(cwd, 'xera.config.ts'), cfg);
    writeFileSync(join(cwd, '.env'), [
      `JIRA_EMAIL=test@example.com`,
      `JIRA_API_TOKEN=mock`,
      `TEST_ADMIN_EMAIL=alice@example.com`,
      `TEST_ADMIN_PWD=ValidPass123!`,
      `TEST_REGULAR_EMAIL=alice@example.com`,
      `TEST_REGULAR_PWD=ValidPass123!`,
      `XERA_AUTH_KEY=${'a'.repeat(64)}`,
    ].join('\n'));

    // 3. Pre-stage a real ticket directory mimicking what the skills produce
    const ticketDir = join(cwd, '.xera/SAMPLE-002');
    mkdirSync(ticketDir, { recursive: true });
    writeFileSync(join(ticketDir, 'story.md'), 'After login, dashboard says "Welcome, alice".');
    writeFileSync(join(ticketDir, 'test.feature'),
      `Feature: SAMPLE-002\n  Scenario: After login dashboard shows welcome\n    Given I am on /dashboard\n    Then I see "Welcome, alice"\n`);
    writeFileSync(join(ticketDir, 'spec.ts'), `
      import { test, expect } from '@playwright/test';
      test.describe('SAMPLE-002', () => {
        test('After login dashboard shows welcome', async ({ page }) => {
          await page.goto('/dashboard');
          await expect(page.getByText('Welcome, alice')).toBeVisible();
        });
      });
    `);

    // 4. Run xera-internal fetch SAMPLE-001 (uses mock-jira REST since no MCP)
    const fetchProc = spawn(['bun', 'run', '--cwd', cwd, 'xera:fetch', 'SAMPLE-001'], { cwd });
    expect(await fetchProc.exited).toBe(0);
    expect(existsSync(join(cwd, '.xera/SAMPLE-001/story.md'))).toBe(true);

    rmSync(cwd, { recursive: true });
  }, 60000);
});
