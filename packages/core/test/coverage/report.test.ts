import { describe, expect, test } from 'vitest';
import { buildCoverageReport, renderMarkdown } from '../../src/coverage/report';
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

describe('buildCoverageReport', () => {
  const now = new Date('2026-05-17T10:00:00.000Z');

  test('empty snapshot → empty report with metadata', () => {
    const report = buildCoverageReport(emptySnap(), DEFAULT_COVERAGE_CONFIG, now);
    expect(report.generatedAt).toBe('2026-05-17T10:00:00.000Z');
    expect(report.windowDays).toBe(30);
    expect(report.areas).toEqual([]);
    expect(report.tickets).toEqual([]);
    expect(report.acBackfillNeeded).toBe(false);
  });

  test('sorts UNCOVERED first by risk desc; tie-break alpha; STALE next; COVERED last', () => {
    const snap = emptySnap();
    snap.areas['admin'] = { id: 'admin' };
    snap.areas['profile'] = { id: 'profile' };
    snap.areas['checkout'] = { id: 'checkout' };
    snap.tickets['PROJ-101'] = {
      id: 'PROJ-101',
      summary: 's',
      ac: [],
      storyHash: 'h',
      modifiesAreas: ['checkout'],
      fetchedAt: '2026-05-15T10:00:00.000Z',
    };
    snap.tickets['PROJ-102'] = {
      id: 'PROJ-102',
      summary: 's',
      ac: [],
      storyHash: 'h',
      modifiesAreas: ['profile'],
      fetchedAt: '2026-05-12T10:00:00.000Z',
    };
    snap.edges.push(
      {
        kind: 'modifies',
        from: 'PROJ-101',
        to: 'checkout',
        source: 'xera-fetch',
        discoveredAt: '2026-05-15T10:00:00.000Z',
      },
      {
        kind: 'modifies',
        from: 'PROJ-102',
        to: 'profile',
        source: 'xera-fetch',
        discoveredAt: '2026-05-12T10:00:00.000Z',
      },
    );
    const r = buildCoverageReport(snap, DEFAULT_COVERAGE_CONFIG, now);
    expect(r.areas.map((a) => a.id)).toEqual(['checkout', 'profile', 'admin']);
  });

  test('acBackfillNeeded = true when ticket has ACs + scenarios but no satisfies edges', () => {
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
    snap.scenarios['PROJ-1#scenario-0'] = {
      id: 'PROJ-1#scenario-0',
      ticketId: 'PROJ-1',
      name: 's',
      gherkin: '...',
      priority: 'p1',
      featureHash: 'h',
      generatedAt: '2026-04-01T11:00:00.000Z',
    };
    const r = buildCoverageReport(snap, DEFAULT_COVERAGE_CONFIG, now);
    expect(r.acBackfillNeeded).toBe(true);
  });
});

describe('renderMarkdown', () => {
  test('renders header + window line', () => {
    const md = renderMarkdown({
      generatedAt: '2026-05-17T10:00:00.000Z',
      windowDays: 30,
      areas: [],
      tickets: [],
      acBackfillNeeded: false,
    });
    expect(md).toContain('Coverage report');
    expect(md).toContain('window 30d');
    expect(md).toContain('2026-05-17');
  });

  test('renders UNCOVERED row with risk + breakdown line', () => {
    const md = renderMarkdown({
      generatedAt: '2026-05-17T10:00:00.000Z',
      windowDays: 30,
      areas: [
        {
          id: 'checkout',
          status: 'UNCOVERED',
          risk: 8,
          breakdown: { recentTickets: 3, recentBugs: 2, criticalBoost: 2 },
        },
      ],
      tickets: [],
      acBackfillNeeded: false,
    });
    expect(md).toContain('UNCOVERED');
    expect(md).toContain('checkout');
    expect(md).toContain('risk 8');
    expect(md).toContain('3 tickets');
    expect(md).toContain('2 bugs');
    expect(md).toContain('critical ×2');
  });

  test('renders AC GAPS rows with ✗ markers', () => {
    const md = renderMarkdown({
      generatedAt: '2026-05-17T10:00:00.000Z',
      windowDays: 30,
      areas: [],
      acBackfillNeeded: false,
      tickets: [
        {
          id: 'PROJ-105',
          summary: 'x',
          acCount: 5,
          satisfiedCount: 3,
          gapScore: 4,
          unsatisfiedAcs: [
            { index: 2, text: 'Tax line shows' },
            { index: 4, text: 'Receipt email' },
          ],
        },
      ],
    });
    expect(md).toContain('AC GAPS');
    expect(md).toContain('PROJ-105');
    expect(md).toContain('3/5 ACs covered');
    expect(md).toContain('gap_score 4');
    expect(md).toContain('✗ AC-3  Tax line shows');
    expect(md).toContain('✗ AC-5  Receipt email');
  });

  test('default omits COVERED rows, shows count line with hint', () => {
    const md = renderMarkdown({
      generatedAt: '2026-05-17T10:00:00.000Z',
      windowDays: 30,
      areas: [
        {
          id: 'login',
          status: 'COVERED',
          risk: 0,
          breakdown: { recentTickets: 0, recentBugs: 0, criticalBoost: 1 },
        },
      ],
      tickets: [],
      acBackfillNeeded: false,
    });
    expect(md).toContain('COVERED — 1 area');
    expect(md).toContain('show with --all');
  });

  test('includeCovered: true shows COVERED rows', () => {
    const md = renderMarkdown(
      {
        generatedAt: '2026-05-17T10:00:00.000Z',
        windowDays: 30,
        areas: [
          {
            id: 'login',
            status: 'COVERED',
            risk: 0,
            breakdown: { recentTickets: 0, recentBugs: 0, criticalBoost: 1 },
          },
        ],
        tickets: [],
        acBackfillNeeded: false,
      },
      { includeCovered: true },
    );
    expect(md).toMatch(/#1\s+login/);
  });
});
