import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  appendEvents,
  deriveSnapshot,
  isSnapshotStale,
  loadAllEvents,
  writeSnapshot,
} from '../../src/graph/store';
import type { Event } from '../../src/graph/types';

function eid(seed: string): string {
  const digits = seed
    .replace(/[^0-9]/g, '')
    .padEnd(20, '0')
    .slice(0, 20);
  return `01HXYZ${digits}`;
}

function ticketFetchedEvent(ticketId: string, ac: string[], ts: string, storyHash = 'h'): Event {
  return {
    event_id: eid(ts),
    schema_version: 1,
    ts,
    actor: 'xera-fetch',
    type: 'ticket.fetched',
    payload: {
      ticketId,
      summary: 's',
      ac,
      jiraLinks: [],
      storyHash,
      modifiesAreas: [],
    },
  };
}

function scenarioGeneratedEvent(
  ticketId: string,
  scenarioId: string,
  ts: string,
  satisfiesAcs?: number[],
): Event {
  const payload: import('../../src/graph/types').ScenarioGeneratedPayload = {
    scenarioId,
    ticketId,
    name: 'n',
    gherkin: '...',
    priority: 'p1',
    featureHash: 'h',
    generatedAt: ts,
  };
  if (satisfiesAcs) payload.satisfiesAcs = satisfiesAcs;
  return {
    event_id: eid(ts),
    schema_version: 1,
    ts,
    actor: 'xera-script',
    type: 'scenario.generated',
    payload,
  };
}

let root: string;
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'xera-graph-'));
});
afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

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
    appendEvents(root, [mkEvent({ event_id: '01H7BX2NXY3R8YQR6F9TKE0001' })], {
      skill: 'xera-fetch',
      ticketId: 'ABC-100',
    });
    const events = loadAllEvents(root);
    expect(events).toHaveLength(1);
    expect(events[0]!.event_id).toBe('01H7BX2NXY3R8YQR6F9TKE0001');
  });

  test('two appends produce two files (no shared file)', () => {
    appendEvents(root, [mkEvent({ event_id: '01H7BX2NXY3R8YQR6F9TKE0001' })], {
      skill: 'xera-fetch',
      ticketId: 'ABC-100',
    });
    appendEvents(root, [mkEvent({ event_id: '01H7BX2NXY3R8YQR6F9TKE0002' })], {
      skill: 'xera-fetch',
      ticketId: 'ABC-101',
    });
    const events = loadAllEvents(root);
    expect(events).toHaveLength(2);
  });
});

describe('loadAllEvents', () => {
  test('skips corrupt JSONL lines with warning, keeps file', () => {
    const dir = join(root, '.xera/graph/events/2026-05');
    mkdirSync(dir, { recursive: true });
    const good = JSON.stringify(mkEvent({ event_id: '01H7BX2NXY3R8YQR6F9TKE0003' }));
    writeFileSync(
      join(dir, '01H7BX2NXY3R8YQR6F9TKE0003-xera-fetch-ABC-100.jsonl'),
      `${good}\n{not valid json\n`,
    );
    const events = loadAllEvents(root);
    expect(events).toHaveLength(1);
  });

  test('replays events in ULID order across files', () => {
    appendEvents(root, [mkEvent({ event_id: '01H7BX2NXY3R8YQR6F9TKE0002' })], {
      skill: 'xera-fetch',
      ticketId: 'ABC-100',
    });
    appendEvents(root, [mkEvent({ event_id: '01H7BX2NXY3R8YQR6F9TKE0001' })], {
      skill: 'xera-fetch',
      ticketId: 'ABC-101',
    });
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
        ticketId: 'ABC-100',
        summary: 'old summary',
        ac: [],
        jiraLinks: [],
        storyHash: 'h1',
        modifiesAreas: [],
      },
    });
    const e2 = mkEvent({
      event_id: '01H7BX2NXY3R8YQR6F9TKE0002',
      payload: {
        ticketId: 'ABC-100',
        summary: 'new summary',
        ac: [],
        jiraLinks: [],
        storyHash: 'h2',
        modifiesAreas: [],
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

describe('deriveSnapshot dispute aggregation', () => {
  test('marks latest_failures[scenarioId].disputed = true when classification.disputed event present', () => {
    const failEvent: Event = {
      event_id: '01H7BX2NXY3R8YQR6F9TKE0001',
      schema_version: 1,
      ts: '2026-05-16T08:00:00Z',
      actor: 'xera-exec',
      type: 'run.completed',
      payload: {
        scenarioId: 'sc-1',
        ticketId: 'ABC-100',
        runId: 'r1',
        status: 'fail',
        runtime: 1000,
      },
    };
    const disputeEvent: Event = {
      event_id: '01H7BX2NXY3R8YQR6F9TKE0002',
      schema_version: 1,
      ts: '2026-05-16T09:00:00Z',
      actor: 'xera-report',
      type: 'classification.disputed',
      payload: {
        runId: 'r1',
        scenarioId: 'sc-1',
        originalClassification: 'TEST_OUTDATED',
        disputedTo: 'REAL_BUG',
        qaActor: 'qa@example.com',
      },
    };
    const snap = deriveSnapshot([failEvent, disputeEvent]);
    expect(snap.latest_failures['sc-1']).toBeDefined();
    expect(snap.latest_failures['sc-1']!.disputed).toBe(true);
  });

  test('disputed flag stays false when no classification.disputed event for the scenario', () => {
    const failEvent: Event = {
      event_id: '01H7BX2NXY3R8YQR6F9TKE0003',
      schema_version: 1,
      ts: '2026-05-16T08:00:00Z',
      actor: 'xera-exec',
      type: 'run.completed',
      payload: {
        scenarioId: 'sc-2',
        ticketId: 'ABC-100',
        runId: 'r2',
        status: 'fail',
        runtime: 1000,
      },
    };
    const snap = deriveSnapshot([failEvent]);
    expect(snap.latest_failures['sc-2']).toBeDefined();
    expect(snap.latest_failures['sc-2']!.disputed).toBeUndefined();
  });
});

describe('snapshot drift', () => {
  test('isSnapshotStale true when events newer than snapshot', () => {
    appendEvents(root, [mkEvent({ event_id: '01H7BX2NXY3R8YQR6F9TKE0001' })], {
      skill: 'xera-fetch',
      ticketId: 'ABC-100',
    });
    writeSnapshot(root, deriveSnapshot([]));
    expect(isSnapshotStale(root)).toBe(true);
  });

  test('isSnapshotStale false when snapshot matches events', () => {
    appendEvents(root, [mkEvent({ event_id: '01H7BX2NXY3R8YQR6F9TKE0001' })], {
      skill: 'xera-fetch',
      ticketId: 'ABC-100',
    });
    writeSnapshot(root, deriveSnapshot(loadAllEvents(root)));
    expect(isSnapshotStale(root)).toBe(false);
  });
});

describe('deriveSnapshot — ACNode materialization', () => {
  test('materializes one ACNode per AC from ticket.fetched', () => {
    const events: Event[] = [
      ticketFetchedEvent(
        'PROJ-105',
        ['Sees subtotal', 'Sees discount', 'Sees tax line'],
        '2026-05-12T10:00:00.000Z',
      ),
    ];
    const snap = deriveSnapshot(events);
    expect(Object.keys(snap.acNodes).sort()).toEqual([
      'PROJ-105#ac-0',
      'PROJ-105#ac-1',
      'PROJ-105#ac-2',
    ]);
    expect(snap.acNodes['PROJ-105#ac-2']).toEqual({
      id: 'PROJ-105#ac-2',
      ticketId: 'PROJ-105',
      index: 2,
      text: 'Sees tax line',
    });
  });

  test('re-fetch replaces ACNodes for that ticket', () => {
    const events: Event[] = [
      ticketFetchedEvent('PROJ-105', ['Old 0', 'Old 1', 'Old 2'], '2026-05-12T10:00:00.000Z', 'v1'),
      ticketFetchedEvent('PROJ-105', ['New 0', 'New 1'], '2026-05-15T10:00:00.000Z', 'v2'),
    ];
    const snap = deriveSnapshot(events);
    expect(Object.keys(snap.acNodes).sort()).toEqual(['PROJ-105#ac-0', 'PROJ-105#ac-1']);
    expect(snap.acNodes['PROJ-105#ac-0']?.text).toBe('New 0');
  });

  test('re-fetch prunes satisfies edges targeting removed ACs', () => {
    const events: Event[] = [
      ticketFetchedEvent('PROJ-105', ['AC 0', 'AC 1', 'AC 2'], '2026-05-12T10:00:00.000Z', 'v1'),
      {
        event_id: eid('20260513100000'),
        schema_version: 1,
        ts: '2026-05-13T10:00:00.000Z',
        actor: 'xera-script',
        type: 'edge.discovered',
        payload: {
          kind: 'satisfies',
          from: 'PROJ-105#scenario-0',
          to: 'PROJ-105#ac-2',
          source: 'xera-script',
        },
      },
      ticketFetchedEvent('PROJ-105', ['AC 0', 'AC 1'], '2026-05-15T10:00:00.000Z', 'v2'),
    ];
    const snap = deriveSnapshot(events);
    const targets = snap.edges.filter((e) => e.kind === 'satisfies').map((e) => e.to);
    expect(targets).toEqual([]);
  });
});

describe('deriveSnapshot — eager satisfies edges', () => {
  test('emits satisfies edges from scenario.generated.satisfiesAcs', () => {
    const events: Event[] = [
      ticketFetchedEvent('PROJ-105', ['AC 0', 'AC 1', 'AC 2'], '2026-05-12T10:00:00.000Z'),
      scenarioGeneratedEvent('PROJ-105', 'PROJ-105#scenario-0', '2026-05-12T11:00:00.000Z', [0, 2]),
    ];
    const snap = deriveSnapshot(events);
    const sat = snap.edges.filter((e) => e.kind === 'satisfies');
    expect(sat).toHaveLength(2);
    expect(sat.map((e) => e.to).sort()).toEqual(['PROJ-105#ac-0', 'PROJ-105#ac-2']);
    expect(sat[0]?.source).toBe('xera-script');
    expect(sat[0]?.confidence).toBe(1.0);
  });

  test('no satisfies edges when scenario.generated lacks satisfiesAcs (legacy)', () => {
    const events: Event[] = [
      ticketFetchedEvent('PROJ-1', ['AC 0'], '2026-04-01T10:00:00.000Z'),
      scenarioGeneratedEvent('PROJ-1', 'PROJ-1#scenario-0', '2026-04-01T11:00:00.000Z'),
    ];
    const snap = deriveSnapshot(events);
    expect(snap.edges.filter((e) => e.kind === 'satisfies')).toEqual([]);
  });

  test('regenerating a scenario replaces its prior eager satisfies edges', () => {
    const events: Event[] = [
      ticketFetchedEvent('PROJ-1', ['AC 0', 'AC 1', 'AC 2'], '2026-04-01T10:00:00.000Z'),
      scenarioGeneratedEvent('PROJ-1', 'PROJ-1#scenario-0', '2026-04-01T11:00:00.000Z', [0, 1]),
      scenarioGeneratedEvent('PROJ-1', 'PROJ-1#scenario-0', '2026-04-02T11:00:00.000Z', [2]),
    ];
    const snap = deriveSnapshot(events);
    const sat = snap.edges.filter((e) => e.kind === 'satisfies' && e.from === 'PROJ-1#scenario-0');
    expect(sat).toHaveLength(1);
    expect(sat[0]?.to).toBe('PROJ-1#ac-2');
  });
});
