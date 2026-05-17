import { describe, expect, test } from 'bun:test';
import { safeParseEvent } from '../../src/graph/schema';

describe('safeParseEvent', () => {
  test('accepts valid ticket.fetched event', () => {
    const result = safeParseEvent({
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
        storyHash: 'abc123',
        modifiesAreas: ['login'],
      },
    });
    expect(result.success).toBe(true);
  });

  test('rejects unknown event type', () => {
    const result = safeParseEvent({
      event_id: '01H7BX2NXY3R8YQR6F9TKEFOO1',
      schema_version: 1,
      ts: '2026-05-16T08:23:14Z',
      actor: 'xera-fetch',
      type: 'unknown.thing',
      payload: {},
    });
    expect(result.success).toBe(false);
  });

  test('rejects schema_version != 1', () => {
    const result = safeParseEvent({
      event_id: '01H7BX2NXY3R8YQR6F9TKEFOO2',
      schema_version: 2,
      ts: '2026-05-16T08:23:14Z',
      actor: 'xera-fetch',
      type: 'ticket.fetched',
      payload: {
        ticketId: 'ABC-100',
        summary: 'x',
        ac: [],
        jiraLinks: [],
        storyHash: 'h',
        modifiesAreas: [],
      },
    });
    expect(result.success).toBe(false);
  });

  test('accepts edge.discovered with confidence', () => {
    const result = safeParseEvent({
      event_id: '01H7BX2NXY3R8YQR6F9TKEFOO3',
      schema_version: 1,
      ts: '2026-05-16T08:23:14Z',
      actor: 'xera-fetch',
      type: 'edge.discovered',
      payload: {
        kind: 'similar',
        from: 'ABC-100',
        to: 'ABC-101',
        confidence: 0.82,
        source: 'claude',
      },
    });
    expect(result.success).toBe(true);
  });

  test('rejects confidence > 1', () => {
    const result = safeParseEvent({
      event_id: '01H7BX2NXY3R8YQR6F9TKEFOO4',
      schema_version: 1,
      ts: '2026-05-16T08:23:14Z',
      actor: 'xera-fetch',
      type: 'edge.discovered',
      payload: {
        kind: 'similar',
        from: 'ABC-100',
        to: 'ABC-101',
        confidence: 1.5,
        source: 'claude',
      },
    });
    expect(result.success).toBe(false);
  });
});

const base = {
  event_id: `01HXYZ${'0'.repeat(20)}`,
  schema_version: 1,
  ts: '2026-05-17T10:00:00.000Z',
  actor: 'xera-test',
};

describe('edgeDiscovered schema with satisfies kind', () => {
  test('accepts kind=satisfies', () => {
    const r = safeParseEvent({
      ...base,
      type: 'edge.discovered',
      payload: {
        kind: 'satisfies',
        from: 'PROJ-1#scenario-0',
        to: 'PROJ-1#ac-0',
        source: 'xera-script',
      },
    });
    expect(r.success).toBe(true);
  });
});

describe('scenarioGenerated schema with satisfiesAcs', () => {
  test('accepts optional satisfiesAcs', () => {
    const r = safeParseEvent({
      ...base,
      type: 'scenario.generated',
      payload: {
        scenarioId: 'PROJ-1#scenario-0',
        ticketId: 'PROJ-1',
        name: 'x',
        gherkin: '...',
        priority: 'p1',
        featureHash: 'h',
        generatedAt: '2026-05-17T10:00:00.000Z',
        satisfiesAcs: [0, 2],
      },
    });
    expect(r.success).toBe(true);
  });

  test('accepts payload without satisfiesAcs (legacy)', () => {
    const r = safeParseEvent({
      ...base,
      type: 'scenario.generated',
      payload: {
        scenarioId: 'PROJ-1#scenario-0',
        ticketId: 'PROJ-1',
        name: 'x',
        gherkin: '...',
        priority: 'p1',
        featureHash: 'h',
        generatedAt: '2026-05-17T10:00:00.000Z',
      },
    });
    expect(r.success).toBe(true);
  });

  test('rejects non-integer satisfiesAcs', () => {
    const r = safeParseEvent({
      ...base,
      type: 'scenario.generated',
      payload: {
        scenarioId: 'PROJ-1#scenario-0',
        ticketId: 'PROJ-1',
        name: 'x',
        gherkin: '...',
        priority: 'p1',
        featureHash: 'h',
        generatedAt: '2026-05-17T10:00:00.000Z',
        satisfiesAcs: [1.5],
      },
    });
    expect(r.success).toBe(false);
  });
});

describe('coverage.snapshot event schema', () => {
  test('accepts valid event', () => {
    const r = safeParseEvent({
      ...base,
      type: 'coverage.snapshot',
      payload: {
        ts: '2026-05-17T10:00:00.000Z',
        windowDays: 30,
        areas: [
          {
            id: 'checkout',
            status: 'UNCOVERED',
            risk: 8,
            breakdown: { recentTickets: 3, recentBugs: 2, criticalBoost: 2 },
          },
        ],
        tickets: [{ id: 'PROJ-105', acCount: 5, satisfiedCount: 3, gapScore: 4 }],
      },
    });
    expect(r.success).toBe(true);
  });

  test('rejects criticalBoost = 3', () => {
    const r = safeParseEvent({
      ...base,
      type: 'coverage.snapshot',
      payload: {
        ts: '2026-05-17T10:00:00.000Z',
        windowDays: 30,
        areas: [
          {
            id: 'x',
            status: 'UNCOVERED',
            risk: 0,
            breakdown: { recentTickets: 0, recentBugs: 0, criticalBoost: 3 },
          },
        ],
        tickets: [],
      },
    });
    expect(r.success).toBe(false);
  });

  test('rejects unknown status', () => {
    const r = safeParseEvent({
      ...base,
      type: 'coverage.snapshot',
      payload: {
        ts: '2026-05-17T10:00:00.000Z',
        windowDays: 30,
        areas: [
          {
            id: 'x',
            status: 'WEIRD',
            risk: 0,
            breakdown: { recentTickets: 0, recentBugs: 0, criticalBoost: 1 },
          },
        ],
        tickets: [],
      },
    });
    expect(r.success).toBe(false);
  });
});

describe('ac-coverage.backfilled event schema', () => {
  test('accepts valid event', () => {
    const r = safeParseEvent({
      ...base,
      type: 'ac-coverage.backfilled',
      payload: {
        ts: '2026-05-17T10:00:00.000Z',
        ticketId: 'PROJ-105',
        mappings: [{ scenarioId: 'PROJ-105#scenario-0', satisfiesAcs: [0, 1], confidence: 0.85 }],
      },
    });
    expect(r.success).toBe(true);
  });
});
