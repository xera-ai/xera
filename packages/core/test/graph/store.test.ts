import { describe, expect, test, beforeEach, afterEach } from 'bun:test';
import { mkdirSync, mkdtempSync, rmSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  appendEvents,
  loadAllEvents,
  deriveSnapshot,
  writeSnapshot,
  loadSnapshot,
  isSnapshotStale,
} from '../../src/graph/store';
import type { Event } from '../../src/graph/types';

let root: string;
beforeEach(() => { root = mkdtempSync(join(tmpdir(), 'xera-graph-')); });
afterEach(() => { rmSync(root, { recursive: true, force: true }); });

function mkEvent(overrides: Partial<Event> = {}): Event {
  return {
    event_id: '01H7BX2NXY3R8YQR6F9TKEFOO0',
    schema_version: 1,
    ts: '2026-05-16T08:23:14Z',
    actor: 'xera-fetch',
    type: 'ticket.fetched',
    payload: {
      ticketId: 'ABC-100',
      summary: 'login',
      ac: ['AC1'],
      jiraLinks: [],
      storyHash: 'h1',
      modifiesAreas: ['login'],
    },
    ...overrides,
  } as Event;
}

describe('appendEvents', () => {
  test('writes one file per call atomically', () => {
    appendEvents(root, [mkEvent({ event_id: '01H7BX2NXY3R8YQR6F9TKE0001' })], { skill: 'xera-fetch', ticketId: 'ABC-100' });
    const events = loadAllEvents(root);
    expect(events).toHaveLength(1);
    expect(events[0]!.event_id).toBe('01H7BX2NXY3R8YQR6F9TKE0001');
  });

  test('two appends produce two files (no shared file)', () => {
    appendEvents(root, [mkEvent({ event_id: '01H7BX2NXY3R8YQR6F9TKE0001' })], { skill: 'xera-fetch', ticketId: 'ABC-100' });
    appendEvents(root, [mkEvent({ event_id: '01H7BX2NXY3R8YQR6F9TKE0002' })], { skill: 'xera-fetch', ticketId: 'ABC-101' });
    const events = loadAllEvents(root);
    expect(events).toHaveLength(2);
  });
});

describe('loadAllEvents', () => {
  test('skips corrupt JSONL lines with warning, keeps file', () => {
    const dir = join(root, '.xera/graph/events/2026-05');
    mkdirSync(dir, { recursive: true });
    const good = JSON.stringify(mkEvent({ event_id: '01H7BX2NXY3R8YQR6F9TKE0003' }));
    writeFileSync(join(dir, '01H7BX2NXY3R8YQR6F9TKE0003-xera-fetch-ABC-100.jsonl'), good + '\n{not valid json\n');
    const events = loadAllEvents(root);
    expect(events).toHaveLength(1);
  });

  test('replays events in ULID order across files', () => {
    appendEvents(root, [mkEvent({ event_id: '01H7BX2NXY3R8YQR6F9TKE0002' })], { skill: 'xera-fetch', ticketId: 'ABC-100' });
    appendEvents(root, [mkEvent({ event_id: '01H7BX2NXY3R8YQR6F9TKE0001' })], { skill: 'xera-fetch', ticketId: 'ABC-101' });
    const events = loadAllEvents(root);
    expect(events[0]!.event_id).toBe('01H7BX2NXY3R8YQR6F9TKE0001');
    expect(events[1]!.event_id).toBe('01H7BX2NXY3R8YQR6F9TKE0002');
  });
});

describe('deriveSnapshot', () => {
  test('dedupes ticket.fetched by latest ULID', () => {
    const e1 = mkEvent({
      event_id: '01H7BX2NXY3R8YQR6F9TKE0001',
      payload: {
        ticketId: 'ABC-100', summary: 'old summary', ac: [],
        jiraLinks: [], storyHash: 'h1', modifiesAreas: [],
      },
    });
    const e2 = mkEvent({
      event_id: '01H7BX2NXY3R8YQR6F9TKE0002',
      payload: {
        ticketId: 'ABC-100', summary: 'new summary', ac: [],
        jiraLinks: [], storyHash: 'h2', modifiesAreas: [],
      },
    });
    const snap = deriveSnapshot([e1, e2]);
    expect(snap.tickets['ABC-100']!.summary).toBe('new summary');
  });

  test('builds edges from edge.discovered events', () => {
    const e: Event = {
      event_id: '01H7BX2NXY3R8YQR6F9TKE0003',
      schema_version: 1,
      ts: '2026-05-16T08:23:14Z',
      actor: 'xera-fetch',
      type: 'edge.discovered',
      payload: { kind: 'jira-linked', from: 'ABC-100', to: 'ABC-200', source: 'jira' },
    };
    const snap = deriveSnapshot([e]);
    expect(snap.edges).toHaveLength(1);
    expect(snap.edges[0]!.kind).toBe('jira-linked');
  });

  test('events_hash stable for same events', () => {
    const e = mkEvent({ event_id: '01H7BX2NXY3R8YQR6F9TKE0004' });
    expect(deriveSnapshot([e]).events_hash).toBe(deriveSnapshot([e]).events_hash);
  });
});

describe('snapshot drift', () => {
  test('isSnapshotStale true when events newer than snapshot', () => {
    appendEvents(root, [mkEvent({ event_id: '01H7BX2NXY3R8YQR6F9TKE0001' })], { skill: 'xera-fetch', ticketId: 'ABC-100' });
    writeSnapshot(root, deriveSnapshot([]));
    expect(isSnapshotStale(root)).toBe(true);
  });

  test('isSnapshotStale false when snapshot matches events', () => {
    appendEvents(root, [mkEvent({ event_id: '01H7BX2NXY3R8YQR6F9TKE0001' })], { skill: 'xera-fetch', ticketId: 'ABC-100' });
    writeSnapshot(root, deriveSnapshot(loadAllEvents(root)));
    expect(isSnapshotStale(root)).toBe(false);
  });
});
