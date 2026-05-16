import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { graphQueryCmd } from '../../src/bin-internal/graph-query';
import { appendEvents } from '../../src/graph/store';
import { ulid } from '../../src/graph/ulid';

let root: string; let prevCwd: string;
beforeEach(() => { prevCwd = process.cwd(); root = mkdtempSync(join(tmpdir(), 'xera-q-')); process.chdir(root); });
afterEach(() => { process.chdir(prevCwd); rmSync(root, { recursive: true, force: true }); });

function captureStdout(fn: () => Promise<number>): Promise<{ exit: number; out: string }> {
  return new Promise((resolve) => {
    let out = '';
    const orig = process.stdout.write.bind(process.stdout);
    (process.stdout as any).write = (chunk: any) => { out += chunk.toString(); return true; };
    fn().then((exit) => {
      (process.stdout as any).write = orig;
      resolve({ exit, out });
    });
  });
}

describe('graph-query', () => {
  test('--format json dumps snapshot JSON', async () => {
    appendEvents(root, [{
      event_id: ulid(), schema_version: 1, ts: '2026-05-16T00:00:00Z', actor: 'test',
      type: 'ticket.fetched',
      payload: { ticketId: 'ABC-1', summary: 's', ac: [], jiraLinks: [], storyHash: 'h', modifiesAreas: [] },
    } as any], { skill: 'test', ticketId: 'ABC-1' });
    const { exit, out } = await captureStdout(() => graphQueryCmd(['--format', 'json']));
    expect(exit).toBe(0);
    const parsed = JSON.parse(out);
    expect(parsed.tickets['ABC-1']).toBeDefined();
  });

  test('--ticket filter narrows to one ticket', async () => {
    appendEvents(root, [
      { event_id: ulid(), schema_version: 1, ts: '2026-05-16T00:00:00Z', actor: 't', type: 'ticket.fetched',
        payload: { ticketId: 'ABC-1', summary: 'A', ac: [], jiraLinks: [], storyHash: 'h', modifiesAreas: [] } },
      { event_id: ulid(), schema_version: 1, ts: '2026-05-16T00:00:00Z', actor: 't', type: 'ticket.fetched',
        payload: { ticketId: 'ABC-2', summary: 'B', ac: [], jiraLinks: [], storyHash: 'h', modifiesAreas: [] } },
    ] as any, { skill: 't', ticketId: 'ABC-1' });
    const { out } = await captureStdout(() => graphQueryCmd(['--ticket', 'ABC-1', '--format', 'json']));
    const parsed = JSON.parse(out);
    expect(parsed.tickets['ABC-1']).toBeDefined();
    expect(parsed.tickets['ABC-2']).toBeUndefined();
  });
});
