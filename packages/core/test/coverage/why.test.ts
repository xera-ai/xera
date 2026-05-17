import { describe, expect, test } from 'bun:test';
import { DEFAULT_COVERAGE_CONFIG } from '../../src/coverage/types';
import { buildWhyArea } from '../../src/coverage/why';
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
