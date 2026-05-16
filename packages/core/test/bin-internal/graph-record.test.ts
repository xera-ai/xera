import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { graphRecordCmd } from '../../src/bin-internal/graph-record';
import { loadAllEvents } from '../../src/graph/store';

let root: string;
let prevCwd: string;
beforeEach(() => {
  prevCwd = process.cwd();
  root = mkdtempSync(join(tmpdir(), 'xera-graph-record-'));
  process.chdir(root);
});
afterEach(() => {
  process.chdir(prevCwd);
  rmSync(root, { recursive: true, force: true });
});

function seedFetch(ticket: string) {
  const dir = join(root, '.xera', ticket);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'story.md'), `---
ticketId: ${ticket}
summary: "Login page"
storyHash: abc123
acceptanceCriteria:
  - "User can log in"
linked_issues:
  - { ticketId: "ABC-200", relation: relates }
---

# story body
`);
  writeFileSync(join(dir, 'graph-input.json'), JSON.stringify({
    modifiesAreas: ['login'],
  }));
}

describe('graph-record fetch', () => {
  test('emits ticket.fetched + edge.discovered jira-linked', async () => {
    seedFetch('ABC-100');
    const exit = await graphRecordCmd(['fetch', 'ABC-100']);
    expect(exit).toBe(0);
    const events = loadAllEvents(root);
    const types = events.map((e) => e.type);
    expect(types).toContain('ticket.fetched');
    expect(types).toContain('edge.discovered');
    const fetched = events.find((e) => e.type === 'ticket.fetched');
    expect((fetched!.payload as { modifiesAreas: string[] }).modifiesAreas).toEqual(['login']);
  });

  test('exits 1 when story.md missing', async () => {
    const exit = await graphRecordCmd(['fetch', 'ABC-100']);
    expect(exit).toBe(1);
  });
});

describe('graph-record promote', () => {
  test('emits pom.promoted', async () => {
    const exit = await graphRecordCmd([
      'promote', '--pom-id', 'pom123', '--from', '.xera/ABC-100/poms/Login.ts', '--to', 'shared/poms/Login.ts',
    ]);
    expect(exit).toBe(0);
    const events = loadAllEvents(root);
    expect(events).toHaveLength(1);
    expect(events[0]!.type).toBe('pom.promoted');
  });
});
