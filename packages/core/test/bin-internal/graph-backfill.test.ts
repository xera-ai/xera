import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { graphBackfillCmd } from '../../src/bin-internal/graph-backfill';
import { loadAllEvents } from '../../src/graph/store';

let root: string;
let prevCwd: string;
beforeEach(() => {
  prevCwd = process.cwd();
  root = mkdtempSync(join(tmpdir(), 'xera-bf-'));
  process.chdir(root);
});
afterEach(() => {
  process.chdir(prevCwd);
  rmSync(root, { recursive: true, force: true });
});

function seedExistingTicket(ticket: string) {
  const dir = join(root, '.xera', ticket);
  mkdirSync(join(dir, 'feature'), { recursive: true });
  mkdirSync(join(dir, 'poms'), { recursive: true });
  writeFileSync(
    join(dir, 'story.md'),
    `---
ticketId: ${ticket}
summary: "Login"
storyHash: h1
---
body
`,
  );
  writeFileSync(
    join(dir, 'feature', `${ticket}.feature`),
    `Feature: x
@p0
Scenario: user signs in
  Given a user
  When they sign in
`,
  );
  writeFileSync(
    join(dir, 'poms', 'LoginPage.ts'),
    `export class LoginPage {
  async goto() { await this.page.goto('/login'); }
}`,
  );
}

describe('graph-backfill', () => {
  test('dry-run does not write events', async () => {
    seedExistingTicket('ABC-1');
    const exit = await graphBackfillCmd(['--dry-run']);
    expect(exit).toBe(0);
    expect(loadAllEvents(root)).toHaveLength(0);
  });

  test('real run writes events from existing artifacts', async () => {
    seedExistingTicket('ABC-1');
    const exit = await graphBackfillCmd([]);
    expect(exit).toBe(0);
    const events = loadAllEvents(root);
    const types = events.map((e) => e.type);
    expect(types).toContain('ticket.fetched');
    expect(types).toContain('scenario.generated');
    expect(types).toContain('pom.generated');
  });
});
