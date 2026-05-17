import { describe, expect, test } from 'bun:test';
import { buildCoverageReport } from '../../src/coverage/report';
import { DEFAULT_COVERAGE_CONFIG } from '../../src/coverage/types';
import { renderHtml } from '../../src/graph/render';
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
    areas: { checkout: { id: 'checkout' } },
    edges: [],
    latest_failures: {},
    acNodes: {},
    classifications: [],
  };
}

describe('renderHtml — coverage map (Phase 27)', () => {
  test('includes coverage-map-canvas div and renderCoverageMap function', () => {
    const snap = emptySnap();
    const report = buildCoverageReport(
      snap,
      DEFAULT_COVERAGE_CONFIG,
      new Date('2026-05-17T10:00:00.000Z'),
    );
    const html = renderHtml({
      data: { nodes: [], edges: [] },
      stats: { tickets: 0, scenarios: 0, poms: 0, areas: 1, failures: 0, edges: 0 },
      generatedAt: '2026-05-17T10:00:00.000Z',
      coverage: { report, snapshots: [] },
    });
    expect(html).toContain('coverage-map-canvas');
    expect(html).toContain('renderCoverageMap');
    expect(html).toContain('UNCOVERED');
  });
});

describe('renderHtml — coverage list (Phase 28)', () => {
  test('includes table headers + table bodies for coverage list', () => {
    const snap = emptySnap();
    snap.tickets['PROJ-1'] = {
      id: 'PROJ-1',
      summary: 'x',
      ac: ['AC 0'],
      storyHash: 'h',
      modifiesAreas: ['checkout'],
      fetchedAt: '2026-05-15T10:00:00.000Z',
    };
    snap.acNodes['PROJ-1#ac-0'] = { id: 'PROJ-1#ac-0', ticketId: 'PROJ-1', index: 0, text: 'AC 0' };
    snap.edges.push({
      kind: 'modifies',
      from: 'PROJ-1',
      to: 'checkout',
      source: 'xera-fetch',
      discoveredAt: '2026-05-15T10:00:00.000Z',
    });
    const report = buildCoverageReport(
      snap,
      DEFAULT_COVERAGE_CONFIG,
      new Date('2026-05-17T10:00:00.000Z'),
    );
    const html = renderHtml({
      data: { nodes: [], edges: [] },
      stats: { tickets: 1, scenarios: 0, poms: 0, areas: 1, failures: 0, edges: 1 },
      generatedAt: '2026-05-17T10:00:00.000Z',
      coverage: { report, snapshots: [] },
    });
    expect(html).toContain('coverage-list-table');
    expect(html).toContain('coverage-ac-table');
    expect(html).toContain('AC Gaps');
  });
});

describe('renderHtml — coverage trend (Phase 29)', () => {
  test('includes SVG container and renderCoverageTrend function', () => {
    const snap = emptySnap();
    const report = buildCoverageReport(
      snap,
      DEFAULT_COVERAGE_CONFIG,
      new Date('2026-05-17T10:00:00.000Z'),
    );
    const html = renderHtml({
      data: { nodes: [], edges: [] },
      stats: { tickets: 0, scenarios: 0, poms: 0, areas: 1, failures: 0, edges: 0 },
      generatedAt: '2026-05-17T10:00:00.000Z',
      coverage: {
        report,
        snapshots: [
          {
            ts: '2026-05-15T10:00:00.000Z',
            windowDays: 30,
            areas: [
              {
                id: 'checkout',
                status: 'UNCOVERED',
                risk: 1,
                breakdown: { recentTickets: 1, recentBugs: 0, criticalBoost: 1 },
              },
            ],
            tickets: [],
          },
          {
            ts: '2026-05-17T10:00:00.000Z',
            windowDays: 30,
            areas: [],
            tickets: [],
          },
        ],
      },
    });
    expect(html).toContain('coverage-trend-svg');
    expect(html).toContain('renderCoverageTrend');
  });
});
