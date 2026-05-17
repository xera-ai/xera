import { describe, expect, test } from 'bun:test';
import { computeAcGapScore, computeAreaRisk, RISK_WEIGHTS } from '../../src/coverage/risk';
import { DEFAULT_COVERAGE_CONFIG } from '../../src/coverage/types';
import type { Snapshot } from '../../src/graph/types';

function emptySnap(): Snapshot {
  return {
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
}

const cfg = (overrides?: Partial<typeof DEFAULT_COVERAGE_CONFIG>) => ({
  ...DEFAULT_COVERAGE_CONFIG,
  ...overrides,
});

describe('computeAreaRisk', () => {
  const now = new Date('2026-05-17T10:00:00.000Z');

  test('zero when no tickets, no bugs', () => {
    const snap = emptySnap();
    snap.areas['x'] = { id: 'x' };
    expect(computeAreaRisk('x', snap, cfg(), now)).toBe(0);
  });

  test('counts recent_tickets within windowDays', () => {
    const snap = emptySnap();
    snap.areas['checkout'] = { id: 'checkout' };
    snap.tickets['PROJ-1'] = {
      id: 'PROJ-1',
      summary: 's',
      ac: [],
      storyHash: 'h',
      modifiesAreas: ['checkout'],
      fetchedAt: '2026-05-15T10:00:00.000Z',
    };
    snap.tickets['PROJ-2'] = {
      id: 'PROJ-2',
      summary: 's',
      ac: [],
      storyHash: 'h',
      modifiesAreas: ['checkout'],
      fetchedAt: '2026-03-01T10:00:00.000Z',
    };
    snap.edges.push(
      {
        kind: 'modifies',
        from: 'PROJ-1',
        to: 'checkout',
        source: 'xera-fetch',
        discoveredAt: '2026-05-15T10:00:00.000Z',
      },
      {
        kind: 'modifies',
        from: 'PROJ-2',
        to: 'checkout',
        source: 'xera-fetch',
        discoveredAt: '2026-03-01T10:00:00.000Z',
      },
    );
    expect(computeAreaRisk('checkout', snap, cfg(), now)).toBe(1);
  });

  test('critical boost ×2 on recent_tickets', () => {
    const snap = emptySnap();
    snap.areas['checkout'] = { id: 'checkout' };
    snap.tickets['PROJ-1'] = {
      id: 'PROJ-1',
      summary: 's',
      ac: [],
      storyHash: 'h',
      modifiesAreas: ['checkout'],
      fetchedAt: '2026-05-15T10:00:00.000Z',
    };
    snap.edges.push({
      kind: 'modifies',
      from: 'PROJ-1',
      to: 'checkout',
      source: 'xera-fetch',
      discoveredAt: '2026-05-15T10:00:00.000Z',
    });
    expect(computeAreaRisk('checkout', snap, cfg({ criticalAreas: ['checkout'] }), now)).toBe(2);
  });

  test('adds recent_bugs (REAL_BUG + TEST_OUTDATED only, in window)', () => {
    const snap = emptySnap();
    snap.areas['checkout'] = { id: 'checkout' };
    snap.poms['CheckoutPage'] = {
      id: 'CheckoutPage',
      ticketId: 'PROJ-1',
      filePath: 'p.ts',
      route: '/checkout',
      locators: [],
      scope: 'local',
    };
    snap.edges.push(
      {
        kind: 'covers',
        from: 'CheckoutPage',
        to: 'checkout',
        source: 'xera-script',
        discoveredAt: '2026-05-01T10:00:00.000Z',
      },
      {
        kind: 'uses',
        from: 'PROJ-1#scenario-0',
        to: 'CheckoutPage',
        source: 'xera-script',
        discoveredAt: '2026-05-01T10:00:00.000Z',
      },
    );
    snap.scenarios['PROJ-1#scenario-0'] = {
      id: 'PROJ-1#scenario-0',
      ticketId: 'PROJ-1',
      name: 's',
      gherkin: '...',
      priority: 'p1',
      featureHash: 'h',
      generatedAt: '2026-05-01T10:00:00.000Z',
    };
    snap.classifications.push(
      {
        scenarioId: 'PROJ-1#scenario-0',
        classification: 'REAL_BUG',
        ts: '2026-05-15T10:00:00.000Z',
      },
      {
        scenarioId: 'PROJ-1#scenario-0',
        classification: 'TEST_OUTDATED',
        ts: '2026-05-10T10:00:00.000Z',
      },
      {
        scenarioId: 'PROJ-1#scenario-0',
        classification: 'SELECTOR_DRIFT',
        ts: '2026-05-12T10:00:00.000Z',
      },
      {
        scenarioId: 'PROJ-1#scenario-0',
        classification: 'REAL_BUG',
        ts: '2026-03-01T10:00:00.000Z',
      },
    );
    expect(computeAreaRisk('checkout', snap, cfg(), now)).toBe(2);
  });

  test('RISK_WEIGHTS exports stable constants', () => {
    expect(RISK_WEIGHTS.criticalBoost).toBe(2);
    expect(RISK_WEIGHTS.bugClassifications.has('REAL_BUG')).toBe(true);
    expect(RISK_WEIGHTS.bugClassifications.has('TEST_OUTDATED')).toBe(true);
    expect(RISK_WEIGHTS.bugClassifications.has('SELECTOR_DRIFT')).toBe(false);
  });
});

describe('computeAcGapScore', () => {
  const now = new Date('2026-05-17T10:00:00.000Z');

  test('zero when ticket has no unsatisfied ACs', () => {
    const snap = emptySnap();
    snap.tickets['PROJ-1'] = {
      id: 'PROJ-1',
      summary: 's',
      ac: [],
      storyHash: 'h',
      modifiesAreas: [],
      fetchedAt: '2026-05-15T10:00:00.000Z',
    };
    expect(computeAcGapScore('PROJ-1', snap, cfg(), now)).toBe(0);
  });

  test('×2.0 boost when fetched ≤ 7d ago', () => {
    const snap = emptySnap();
    snap.tickets['PROJ-1'] = {
      id: 'PROJ-1',
      summary: 's',
      ac: ['a', 'b'],
      storyHash: 'h',
      modifiesAreas: [],
      fetchedAt: '2026-05-15T10:00:00.000Z',
    };
    snap.acNodes['PROJ-1#ac-0'] = { id: 'PROJ-1#ac-0', ticketId: 'PROJ-1', index: 0, text: 'a' };
    snap.acNodes['PROJ-1#ac-1'] = { id: 'PROJ-1#ac-1', ticketId: 'PROJ-1', index: 1, text: 'b' };
    expect(computeAcGapScore('PROJ-1', snap, cfg(), now)).toBe(4);
  });

  test('×1.0 boost when fetched 8-30d ago', () => {
    const snap = emptySnap();
    snap.tickets['PROJ-1'] = {
      id: 'PROJ-1',
      summary: 's',
      ac: ['a'],
      storyHash: 'h',
      modifiesAreas: [],
      fetchedAt: '2026-05-01T10:00:00.000Z',
    };
    snap.acNodes['PROJ-1#ac-0'] = { id: 'PROJ-1#ac-0', ticketId: 'PROJ-1', index: 0, text: 'a' };
    expect(computeAcGapScore('PROJ-1', snap, cfg(), now)).toBe(1);
  });

  test('×0.5 boost when fetched > 30d ago', () => {
    const snap = emptySnap();
    snap.tickets['PROJ-1'] = {
      id: 'PROJ-1',
      summary: 's',
      ac: ['a', 'b'],
      storyHash: 'h',
      modifiesAreas: [],
      fetchedAt: '2026-02-01T10:00:00.000Z',
    };
    snap.acNodes['PROJ-1#ac-0'] = { id: 'PROJ-1#ac-0', ticketId: 'PROJ-1', index: 0, text: 'a' };
    snap.acNodes['PROJ-1#ac-1'] = { id: 'PROJ-1#ac-1', ticketId: 'PROJ-1', index: 1, text: 'b' };
    expect(computeAcGapScore('PROJ-1', snap, cfg(), now)).toBe(1);
  });
});
