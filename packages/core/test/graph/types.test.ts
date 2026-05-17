import { describe, expect, test } from 'bun:test';
import type {
  ACNode,
  AcCoverageBackfilledPayload,
  CoverageSnapshotPayload,
  EdgeKind,
  Event,
  ScenarioGeneratedPayload,
  Snapshot,
} from '../../src/graph/types';

describe('EdgeKind union', () => {
  test('includes "satisfies"', () => {
    const kinds: EdgeKind[] = [
      'tests',
      'uses',
      'covers',
      'modifies',
      'jira-linked',
      'similar',
      'ran',
      'satisfies',
    ];
    expect(kinds).toContain('satisfies');
  });
});

describe('ACNode', () => {
  test('shape: id = `${ticketId}#ac-${index}`, includes text + index', () => {
    const node: ACNode = {
      id: 'PROJ-105#ac-2',
      ticketId: 'PROJ-105',
      index: 2,
      text: 'Tax line item shows in cart preview',
    };
    expect(node.id).toBe(`${node.ticketId}#ac-${node.index}`);
    expect(node.index).toBe(2);
  });
});

describe('ScenarioGeneratedPayload', () => {
  test('accepts optional satisfiesAcs: number[]', () => {
    const withMapping: ScenarioGeneratedPayload = {
      scenarioId: 'PROJ-105#scenario-0',
      ticketId: 'PROJ-105',
      name: 'Checkout shows tax',
      gherkin: 'Given ...',
      priority: 'p1',
      featureHash: 'abc',
      generatedAt: '2026-05-17T10:00:00.000Z',
      satisfiesAcs: [0, 3],
    };
    expect(withMapping.satisfiesAcs).toEqual([0, 3]);

    const withoutMapping: ScenarioGeneratedPayload = {
      scenarioId: 'PROJ-101#scenario-0',
      ticketId: 'PROJ-101',
      name: 'Legacy scenario',
      gherkin: '...',
      priority: 'p2',
      featureHash: 'xyz',
      generatedAt: '2026-05-17T10:00:00.000Z',
    };
    expect(withoutMapping.satisfiesAcs).toBeUndefined();
  });
});

describe('CoverageSnapshotPayload', () => {
  test('shape: ts, windowDays, areas[], tickets[]', () => {
    const payload: CoverageSnapshotPayload = {
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
    };
    expect(payload.windowDays).toBe(30);
    expect(payload.areas[0]?.status).toBe('UNCOVERED');
  });
});

describe('AcCoverageBackfilledPayload', () => {
  test('shape: ts, ticketId, mappings[]', () => {
    const payload: AcCoverageBackfilledPayload = {
      ts: '2026-05-17T10:00:00.000Z',
      ticketId: 'PROJ-105',
      mappings: [{ scenarioId: 'PROJ-105#scenario-0', satisfiesAcs: [0, 1, 3], confidence: 0.85 }],
    };
    expect(payload.ticketId).toBe('PROJ-105');
    expect(payload.mappings[0]?.satisfiesAcs).toEqual([0, 1, 3]);
  });
});

describe('Event union extended', () => {
  test('Event type discriminates coverage.snapshot', () => {
    const e: Event = {
      event_id: `01HXYZ${'0'.repeat(20)}`,
      schema_version: 1,
      ts: '2026-05-17T10:00:00.000Z',
      actor: 'xera-coverage',
      type: 'coverage.snapshot',
      payload: {
        ts: '2026-05-17T10:00:00.000Z',
        windowDays: 30,
        areas: [],
        tickets: [],
      },
    };
    expect(e.type).toBe('coverage.snapshot');
  });

  test('Event type discriminates ac-coverage.backfilled', () => {
    const e: Event = {
      event_id: `01HXYZ${'0'.repeat(20)}`,
      schema_version: 1,
      ts: '2026-05-17T10:00:00.000Z',
      actor: 'xera-coverage',
      type: 'ac-coverage.backfilled',
      payload: {
        ts: '2026-05-17T10:00:00.000Z',
        ticketId: 'PROJ-105',
        mappings: [],
      },
    };
    expect(e.type).toBe('ac-coverage.backfilled');
  });
});

describe('Snapshot with v0.8 projections', () => {
  test('has acNodes: Record<string, ACNode> and classifications: array', () => {
    const snap: Snapshot = {
      schema_version: 1,
      generated_at: '2026-05-17T10:00:00.000Z',
      event_count: 0,
      events_hash: 'sha256:',
      tickets: {},
      scenarios: {},
      poms: {},
      areas: {},
      edges: [],
      latest_failures: {},
      acNodes: {},
      classifications: [],
    };
    expect(snap.acNodes).toEqual({});
    expect(snap.classifications).toEqual([]);
  });
});
