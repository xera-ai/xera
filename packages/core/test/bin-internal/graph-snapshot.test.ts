import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { graphSnapshotCmd } from '../../src/bin-internal/graph-snapshot';
import { appendEvents, loadSnapshot } from '../../src/graph/store';
import { ulid } from '../../src/graph/ulid';

let root: string;
let prevCwd: string;
beforeEach(() => {
  prevCwd = process.cwd();
  root = mkdtempSync(join(tmpdir(), 'xera-snap-'));
  process.chdir(root);
});
afterEach(() => {
  process.chdir(prevCwd);
  rmSync(root, { recursive: true, force: true });
});

describe('graph-snapshot', () => {
  test('rebuild writes snapshot to disk', async () => {
    appendEvents(
      root,
      [
        {
          event_id: ulid(),
          schema_version: 1,
          ts: '2026-05-16T00:00:00Z',
          actor: 'test',
          type: 'ticket.fetched',
          payload: {
            ticketId: 'ABC-1',
            summary: 's',
            ac: [],
            jiraLinks: [],
            storyHash: 'h',
            modifiesAreas: [],
          },
        } as any,
      ],
      { skill: 'test', ticketId: 'ABC-1' },
    );

    const exit = await graphSnapshotCmd([]);
    expect(exit).toBe(0);
    const snap = loadSnapshot(root);
    expect(snap).not.toBeNull();
    expect(snap!.tickets['ABC-1']).toBeDefined();
  });

  test('--check exits 1 when stale, 0 when fresh', async () => {
    appendEvents(
      root,
      [
        {
          event_id: ulid(),
          schema_version: 1,
          ts: '2026-05-16T00:00:00Z',
          actor: 'test',
          type: 'ticket.fetched',
          payload: {
            ticketId: 'ABC-1',
            summary: 's',
            ac: [],
            jiraLinks: [],
            storyHash: 'h',
            modifiesAreas: [],
          },
        } as any,
      ],
      { skill: 'test', ticketId: 'ABC-1' },
    );
    expect(await graphSnapshotCmd(['--check', '--no-rebuild'])).toBe(1);
    await graphSnapshotCmd([]); // rebuild
    expect(await graphSnapshotCmd(['--check', '--no-rebuild'])).toBe(0);
  });
});
