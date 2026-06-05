import { describe, expect, test } from 'vitest';
import { DEFAULT_COVERAGE_CONFIG } from '../../src/coverage/types';
import { buildWhyArea, buildWhyTicket } from '../../src/coverage/why';
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

describe('buildWhyArea', () => {
  const now = new Date('2026-05-17T10:00:00.000Z');

  test('returns formula expansion + contributing tickets', () => {
    const snap = emptySnap();
    snap.areas['checkout'] = { id: 'checkout' };
    snap.tickets['PROJ-101'] = {
      id: 'PROJ-101',
      summary: 'Add Apple Pay to checkout',
      ac: [],
      storyHash: 'h',
      modifiesAreas: ['checkout'],
      fetchedAt: '2026-05-15T10:00:00.000Z',
    };
    snap.edges.push({
      kind: 'modifies',
      from: 'PROJ-101',
      to: 'checkout',
      source: 'xera-fetch',
      discoveredAt: '2026-05-15T10:00:00.000Z',
    });
    const out = buildWhyArea('checkout', snap, DEFAULT_COVERAGE_CONFIG, now);
    expect(out).toContain('Area: checkout');
    expect(out).toContain('UNCOVERED');
    expect(out).toContain('Risk score: 1');
    expect(out).toContain('1 × 1 + 0');
    expect(out).toContain('PROJ-101');
    expect(out).toContain('Add Apple Pay');
  });

  test('shows "critical" + ×2 when area is critical', () => {
    const snap = emptySnap();
    snap.areas['checkout'] = { id: 'checkout' };
    const out = buildWhyArea(
      'checkout',
      snap,
      { ...DEFAULT_COVERAGE_CONFIG, criticalAreas: ['checkout'] },
      now,
    );
    expect(out).toContain('UNCOVERED, critical');
    expect(out).toContain('× 2');
  });

  test('errors gracefully if area unknown', () => {
    const out = buildWhyArea('missing', emptySnap(), DEFAULT_COVERAGE_CONFIG, now);
    expect(out).toContain('Unknown area');
  });
});

describe('buildWhyTicket', () => {
  const now = new Date('2026-05-17T10:00:00.000Z');

  test('returns AC list with ✓/✗ markers and gap score breakdown', () => {
    const snap = emptySnap();
    snap.tickets['PROJ-105'] = {
      id: 'PROJ-105',
      summary: 'Add tax',
      ac: ['Subtotal', 'Tax', 'Total'],
      storyHash: 'h',
      modifiesAreas: [],
      fetchedAt: '2026-05-08T10:00:00.000Z',
    };
    snap.acNodes['PROJ-105#ac-0'] = {
      id: 'PROJ-105#ac-0',
      ticketId: 'PROJ-105',
      index: 0,
      text: 'Subtotal',
    };
    snap.acNodes['PROJ-105#ac-1'] = {
      id: 'PROJ-105#ac-1',
      ticketId: 'PROJ-105',
      index: 1,
      text: 'Tax',
    };
    snap.acNodes['PROJ-105#ac-2'] = {
      id: 'PROJ-105#ac-2',
      ticketId: 'PROJ-105',
      index: 2,
      text: 'Total',
    };
    snap.edges.push({
      kind: 'satisfies',
      from: 'PROJ-105#scenario-0',
      to: 'PROJ-105#ac-0',
      confidence: 1.0,
      source: 'xera-script',
      discoveredAt: '2026-05-08T11:00:00.000Z',
    });
    snap.classifications.push({
      scenarioId: 'PROJ-105#scenario-0',
      classification: 'PASS',
      ts: '2026-05-15T10:00:00.000Z',
    });
    const out = buildWhyTicket('PROJ-105', snap, DEFAULT_COVERAGE_CONFIG, now);
    expect(out).toContain('Ticket: PROJ-105');
    expect(out).toContain('INCOMPLETE');
    expect(out).toContain('1/3 ACs covered');
    expect(out).toContain('Add tax');
    expect(out).toContain('Fetched: 2026-05-08');
    expect(out).toContain('recency boost ×1.0');
    expect(out).toContain('AC gap score: 2');
    expect(out).toContain('✓ AC-1');
    expect(out).toContain('✗ AC-2');
    expect(out).toContain('✗ AC-3');
    expect(out).toContain('/xera-fill-gap --ticket PROJ-105');
  });

  test('errors gracefully if ticket unknown', () => {
    const out = buildWhyTicket('PROJ-999', emptySnap(), DEFAULT_COVERAGE_CONFIG, now);
    expect(out).toContain('Unknown ticket');
  });
});
