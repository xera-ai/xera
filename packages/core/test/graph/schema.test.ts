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
  event_id: '01HXYZ' + '0'.repeat(20),
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
