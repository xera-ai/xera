import { describe, expect, test } from 'bun:test';
import {
  computeAcStatus,
  computeAreaStatus,
  computeScenarioStatus,
  computeTicketStatus,
} from '../../src/coverage/status';
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

describe('computeScenarioStatus', () => {
  const now = new Date('2026-05-17T10:00:00.000Z');

  test('NOT_PASSING when no classifications', () => {
    expect(computeScenarioStatus('PROJ-1#scenario-0', emptySnap(), 30, now)).toBe('NOT_PASSING');
  });

  test('PASSING when latest classification is PASS within window', () => {
    const snap = emptySnap();
    snap.classifications.push({
      scenarioId: 'PROJ-1#scenario-0',
      classification: 'PASS',
      ts: '2026-05-15T10:00:00.000Z',
    });
    expect(computeScenarioStatus('PROJ-1#scenario-0', snap, 30, now)).toBe('PASSING');
  });

  test('NOT_PASSING when latest PASS is older than windowDays', () => {
    const snap = emptySnap();
    snap.classifications.push({
      scenarioId: 'PROJ-1#scenario-0',
      classification: 'PASS',
      ts: '2026-03-01T10:00:00.000Z',
    });
    expect(computeScenarioStatus('PROJ-1#scenario-0', snap, 30, now)).toBe('NOT_PASSING');
  });

  test('NOT_PASSING when latest classification is REAL_BUG (most recent wins)', () => {
    const snap = emptySnap();
    snap.classifications.push(
      { scenarioId: 'PROJ-1#scenario-0', classification: 'PASS', ts: '2026-05-10T10:00:00.000Z' },
      {
        scenarioId: 'PROJ-1#scenario-0',
        classification: 'REAL_BUG',
        ts: '2026-05-15T10:00:00.000Z',
      },
    );
    expect(computeScenarioStatus('PROJ-1#scenario-0', snap, 30, now)).toBe('NOT_PASSING');
  });

  test('NOT_PASSING when latest classification is SKIPPED (does not verify AC)', () => {
    const snap = emptySnap();
    snap.classifications.push({
      scenarioId: 'PROJ-1#scenario-0',
      classification: 'SKIPPED',
      ts: '2026-05-15T10:00:00.000Z',
    });
    expect(computeScenarioStatus('PROJ-1#scenario-0', snap, 30, now)).toBe('NOT_PASSING');
  });
});

describe('computeAreaStatus', () => {
  const now = new Date('2026-05-17T10:00:00.000Z');

  test('UNCOVERED when no POM covers the area', () => {
    const snap = emptySnap();
    snap.areas['checkout'] = { id: 'checkout' };
    expect(computeAreaStatus('checkout', snap, 30, now)).toBe('UNCOVERED');
  });

  test('STALE when POM exists but no PASSING scenario in window', () => {
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
    expect(computeAreaStatus('checkout', snap, 30, now)).toBe('STALE');
  });

  test('COVERED when ≥1 scenario in area is PASSING', () => {
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
    snap.classifications.push({
      scenarioId: 'PROJ-1#scenario-0',
      classification: 'PASS',
      ts: '2026-05-15T10:00:00.000Z',
    });
    expect(computeAreaStatus('checkout', snap, 30, now)).toBe('COVERED');
  });
});

describe('computeAcStatus', () => {
  const now = new Date('2026-05-17T10:00:00.000Z');

  test('UNSATISFIED when no satisfies edges', () => {
    const snap = emptySnap();
    snap.acNodes['PROJ-1#ac-0'] = { id: 'PROJ-1#ac-0', ticketId: 'PROJ-1', index: 0, text: 'x' };
    expect(computeAcStatus('PROJ-1#ac-0', snap, 30, now)).toBe('UNSATISFIED');
  });

  test('SATISFIED when ≥1 satisfying scenario is PASSING', () => {
    const snap = emptySnap();
    snap.acNodes['PROJ-1#ac-0'] = { id: 'PROJ-1#ac-0', ticketId: 'PROJ-1', index: 0, text: 'x' };
    snap.edges.push({
      kind: 'satisfies',
      from: 'PROJ-1#scenario-0',
      to: 'PROJ-1#ac-0',
      confidence: 1.0,
      source: 'xera-script',
      discoveredAt: '2026-05-01T10:00:00.000Z',
    });
    snap.classifications.push({
      scenarioId: 'PROJ-1#scenario-0',
      classification: 'PASS',
      ts: '2026-05-15T10:00:00.000Z',
    });
    expect(computeAcStatus('PROJ-1#ac-0', snap, 30, now)).toBe('SATISFIED');
  });

  test('UNSATISFIED when satisfying scenario is NOT_PASSING (stale)', () => {
    const snap = emptySnap();
    snap.acNodes['PROJ-1#ac-0'] = { id: 'PROJ-1#ac-0', ticketId: 'PROJ-1', index: 0, text: 'x' };
    snap.edges.push({
      kind: 'satisfies',
      from: 'PROJ-1#scenario-0',
      to: 'PROJ-1#ac-0',
      confidence: 1.0,
      source: 'xera-script',
      discoveredAt: '2026-05-01T10:00:00.000Z',
    });
    snap.classifications.push({
      scenarioId: 'PROJ-1#scenario-0',
      classification: 'PASS',
      ts: '2026-03-01T10:00:00.000Z',
    });
    expect(computeAcStatus('PROJ-1#ac-0', snap, 30, now)).toBe('UNSATISFIED');
  });
});

describe('computeTicketStatus', () => {
  const now = new Date('2026-05-17T10:00:00.000Z');

  test('COMPLETE vacuously when no ACs', () => {
    const snap = emptySnap();
    snap.tickets['PROJ-1'] = {
      id: 'PROJ-1',
      summary: 's',
      ac: [],
      storyHash: 'h',
      modifiesAreas: [],
      fetchedAt: '2026-05-01T10:00:00.000Z',
    };
    expect(computeTicketStatus('PROJ-1', snap, 30, now)).toBe('COMPLETE');
  });

  test('INCOMPLETE when ≥1 AC UNSATISFIED', () => {
    const snap = emptySnap();
    snap.tickets['PROJ-1'] = {
      id: 'PROJ-1',
      summary: 's',
      ac: ['x', 'y'],
      storyHash: 'h',
      modifiesAreas: [],
      fetchedAt: '2026-05-01T10:00:00.000Z',
    };
    snap.acNodes['PROJ-1#ac-0'] = { id: 'PROJ-1#ac-0', ticketId: 'PROJ-1', index: 0, text: 'x' };
    snap.acNodes['PROJ-1#ac-1'] = { id: 'PROJ-1#ac-1', ticketId: 'PROJ-1', index: 1, text: 'y' };
    expect(computeTicketStatus('PROJ-1', snap, 30, now)).toBe('INCOMPLETE');
  });
});
