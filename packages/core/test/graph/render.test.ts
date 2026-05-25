import { describe, expect, test } from 'vitest';
import { buildCoverageReport } from '../../src/coverage/report';
import { DEFAULT_COVERAGE_CONFIG } from '../../src/coverage/types';
import { computeTicketMeta, renderHtml, transformForVisNetwork } from '../../src/graph/render';
import type { Snapshot } from '../../src/graph/types';

function mkSnapshot(): Snapshot {
  return {
    schema_version: 1,
    generated_at: '2026-05-16T00:00:00Z',
    event_count: 4,
    events_hash: 'sha256:test',
    tickets: {
      'ABC-100': {
        id: 'ABC-100',
        summary: 'login feature',
        ac: ['AC1'],
        storyHash: 'h1',
        modifiesAreas: ['login'],
        fetchedAt: '2026-05-10T00:00:00Z',
      },
      'ABC-200': {
        id: 'ABC-200',
        summary: 'rename Sign in',
        ac: ['Button = Log in'],
        storyHash: 'h2',
        modifiesAreas: ['login'],
        fetchedAt: '2026-05-15T00:00:00Z',
      },
    },
    scenarios: {
      'sc-100': {
        id: 'sc-100',
        ticketId: 'ABC-100',
        name: 'user signs in',
        gherkin: 'g',
        priority: 'p0',
        featureHash: 'f1',
        generatedAt: '2026-05-10T00:00:00Z',
      },
    },
    poms: {
      'pom-login': {
        id: 'pom-login',
        ticketId: 'ABC-100',
        filePath: 'login.ts',
        route: '/login',
        locators: [],
        scope: 'shared',
      },
    },
    areas: { login: { id: 'login' } },
    edges: [
      {
        kind: 'tests',
        from: 'ABC-100',
        to: 'sc-100',
        source: 'xera-script',
        discoveredAt: '2026-05-10T00:00:00Z',
      },
      {
        kind: 'uses',
        from: 'sc-100',
        to: 'pom-login',
        source: 'xera-script',
        discoveredAt: '2026-05-10T00:00:00Z',
      },
      {
        kind: 'covers',
        from: 'pom-login',
        to: 'login',
        source: 'xera-script',
        discoveredAt: '2026-05-10T00:00:00Z',
      },
      {
        kind: 'modifies',
        from: 'ABC-200',
        to: 'login',
        source: 'extract-areas',
        discoveredAt: '2026-05-15T00:00:00Z',
      },
    ],
    latest_failures: {},
  };
}

describe('transformForVisNetwork', () => {
  test('produces nodes for tickets, scenarios, poms, areas', () => {
    const snap = mkSnapshot();
    const { nodes } = transformForVisNetwork(snap, {});
    const types = nodes.map((n) => n.group).sort();
    expect(types).toContain('Ticket');
    expect(types).toContain('Scenario');
    expect(types).toContain('POM');
    expect(types).toContain('SUTArea');
  });

  test('produces edges for each kind in snapshot.edges', () => {
    const snap = mkSnapshot();
    const { edges } = transformForVisNetwork(snap, {});
    expect(edges).toHaveLength(4);
    const kinds = edges.map((e) => e.label).sort();
    expect(kinds).toEqual(['covers', 'modifies', 'tests', 'uses']);
  });

  test('Ticket nodes are blue dots', () => {
    const snap = mkSnapshot();
    const { nodes } = transformForVisNetwork(snap, {});
    const ticket = nodes.find((n) => n.id === 'ABC-100');
    expect(ticket?.color).toBe('#3B82F6');
    expect(ticket?.shape).toBe('dot');
  });

  test('Scenario node color reflects last run status (no failure → green)', () => {
    const snap = mkSnapshot();
    const { nodes } = transformForVisNetwork(snap, {});
    const scenario = nodes.find((n) => n.id === 'sc-100');
    expect(scenario?.color).toBe('#10B981'); // green
  });

  test('Scenario node turns red when latest_failures contains it', () => {
    const snap = mkSnapshot();
    snap.latest_failures['sc-100'] = {
      id: 'fail-1',
      scenarioId: 'sc-100',
      runId: 'r1',
      ts: '2026-05-15T00:00:00Z',
    };
    const { nodes } = transformForVisNetwork(snap, {});
    const scenario = nodes.find((n) => n.id === 'sc-100');
    expect(scenario?.color).toBe('#EF4444'); // red
  });

  test('Failure node is anchored to its scenario via a synthetic ran edge', () => {
    const snap = mkSnapshot();
    snap.latest_failures['sc-100'] = {
      id: 'fail-1',
      scenarioId: 'sc-100',
      runId: 'r1',
      ts: '2026-05-15T00:00:00Z',
    };
    const { nodes, edges } = transformForVisNetwork(snap, {});
    const failure = nodes.find((n) => n.id === 'fail-1');
    expect(failure?.group).toBe('Failure');
    const ran = edges.find((e) => e.from === 'fail-1' && e.to === 'sc-100');
    expect(ran).toBeDefined();
    expect(ran?.label).toBe('ran');
  });

  test('Failure label uses classification + tooltip carries confidence/runId/disputed', () => {
    const snap = mkSnapshot();
    snap.latest_failures['sc-100'] = {
      id: 'fail-1',
      scenarioId: 'sc-100',
      runId: 'r-abc-123',
      ts: '2026-05-15T00:00:00Z',
      classification: 'REAL_BUG',
      confidence: 'high',
      disputed: true,
      traceId: 'trace-xyz',
    };
    const { nodes } = transformForVisNetwork(snap, {});
    const failure = nodes.find((n) => n.id === 'fail-1');
    expect(failure?.label).toBe('REAL_BUG');
    expect(failure?.title).toContain('classification: REAL_BUG');
    expect(failure?.title).toContain('(high)');
    expect(failure?.title).toContain('r-abc-123');
    expect(failure?.title).toContain('disputed');
    expect(failure?.title).toContain('trace-xyz');
  });

  test('Failure tooltip + meta surface human-readable scenario name, not the hash id', () => {
    const snap = mkSnapshot();
    // sc-100's snapshot name is "user signs in" — that is what QA should see,
    // not the scenarioId (which in real snapshots is a SHA1 content hash).
    snap.latest_failures['sc-100'] = {
      id: 'fail-named',
      scenarioId: 'sc-100',
      runId: 'r1',
      ts: '2026-05-15T00:00:00Z',
      classification: 'SELECTOR_DRIFT',
      confidence: 'medium',
    };
    const { nodes } = transformForVisNetwork(snap, {});
    const failure = nodes.find((n) => n.id === 'fail-named');
    expect(failure?.title).toContain('user signs in');
    expect(failure?.title).not.toContain('sc-100 @');
    expect(failure?.meta?.scenarioName).toBe('user signs in');
    expect(failure?.meta?.classification).toBe('SELECTOR_DRIFT');
    expect(failure?.meta?.confidence).toBe('medium');
    expect(failure?.meta?.runId).toBe('r1');
    expect(failure?.meta?.disputed).toBeUndefined();
  });

  test('Failure label falls back to "fail" when classification missing', () => {
    const snap = mkSnapshot();
    snap.latest_failures['sc-100'] = {
      id: 'fail-2',
      scenarioId: 'sc-100',
      runId: 'r-xyz',
      ts: '2026-05-15T00:00:00Z',
    };
    const { nodes } = transformForVisNetwork(snap, {});
    const failure = nodes.find((n) => n.id === 'fail-2');
    expect(failure?.label).toBe('fail');
    expect(failure?.title).not.toContain('classification:');
    expect(failure?.title).not.toContain('disputed');
    expect(failure?.meta?.classification).toBeUndefined();
  });

  test('Modifies edges are red dashed', () => {
    const snap = mkSnapshot();
    const { edges } = transformForVisNetwork(snap, {});
    const mod = edges.find((e) => e.label === 'modifies');
    expect(mod?.color).toBe('#EF4444');
    expect(mod?.dashes).toBe(true);
  });

  test('--ticket filter narrows to ego-graph of one ticket', () => {
    const snap = mkSnapshot();
    const { nodes, edges } = transformForVisNetwork(snap, { ticketId: 'ABC-200' });
    // ABC-200 + the area it modifies, edges between them
    const nodeIds = nodes.map((n) => n.id).sort();
    expect(nodeIds).toContain('ABC-200');
    expect(nodeIds).toContain('login');
    expect(nodeIds).not.toContain('ABC-100'); // unrelated
    expect(edges.length).toBeGreaterThan(0);
  });

  test('--since filter excludes nodes older than cutoff', () => {
    const snap = mkSnapshot();
    // since 2026-05-12 → ABC-100 (fetched 5-10) excluded; ABC-200 (5-15) kept
    const { nodes } = transformForVisNetwork(snap, { since: '2026-05-12T00:00:00Z' });
    const ids = nodes.map((n) => n.id);
    expect(ids).toContain('ABC-200');
    expect(ids).not.toContain('ABC-100');
  });

  test('stats reports counts', () => {
    const snap = mkSnapshot();
    const { stats } = transformForVisNetwork(snap, {});
    expect(stats.tickets).toBe(2);
    expect(stats.scenarios).toBe(1);
    expect(stats.poms).toBe(1);
    expect(stats.areas).toBe(1);
    expect(stats.edges).toBe(4);
  });

  test('performanceMode "ticket-only" hides scenario + pom + area nodes', () => {
    const snap = mkSnapshot();
    const { nodes } = transformForVisNetwork(snap, { performanceMode: 'ticket-only' });
    const types = new Set(nodes.map((n) => n.group));
    expect(types.has('Ticket')).toBe(true);
    expect(types.has('Scenario')).toBe(false);
    expect(types.has('POM')).toBe(false);
    expect(types.has('SUTArea')).toBe(false);
  });
});

describe('renderHtml', () => {
  test('produces valid HTML with embedded graph data', () => {
    const snap = mkSnapshot();
    const data = transformForVisNetwork(snap, {});
    const html = renderHtml({ data, generatedAt: '2026-05-16T08:00:00Z', stats: data.stats });
    expect(html).toMatch(/^<!DOCTYPE html>/);
    expect(html).toContain('window.__GRAPH__');
    expect(html).toContain('"ABC-100"');
    expect(html).toContain('2026-05-16T08:00:00Z');
    expect(html).toContain('vis-network');
  });

  test('embedded JSON parses correctly', () => {
    const snap = mkSnapshot();
    const data = transformForVisNetwork(snap, {});
    const html = renderHtml({ data, generatedAt: '2026-05-16T08:00:00Z', stats: data.stats });
    const match = html.match(/window\.__GRAPH__\s*=\s*(\{[\s\S]*?\});/);
    expect(match).not.toBeNull();
    const parsed = JSON.parse(match![1]!);
    expect(parsed.nodes).toBeDefined();
    expect(parsed.edges).toBeDefined();
  });

  test('shows stats in topbar', () => {
    const snap = mkSnapshot();
    const data = transformForVisNetwork(snap, {});
    const html = renderHtml({ data, generatedAt: '2026-05-16T08:00:00Z', stats: data.stats });
    expect(html).toMatch(/2 tickets/i);
    expect(html).toMatch(/1 scenario/i);
  });

  test('output size is reasonable (< 1.5 MB)', () => {
    const snap = mkSnapshot();
    const data = transformForVisNetwork(snap, {});
    const html = renderHtml({ data, generatedAt: '2026-05-16T08:00:00Z', stats: data.stats });
    expect(html.length).toBeLessThan(1_500_000);
  });

  test('embeds Legend modal with classifier glossary', () => {
    const snap = mkSnapshot();
    const data = transformForVisNetwork(snap, {});
    const html = renderHtml({ data, generatedAt: '2026-05-16T08:00:00Z', stats: data.stats });
    expect(html).toContain('id="legend-btn"');
    expect(html).toContain('id="legend-modal"');
    expect(html).toContain('REAL_BUG');
    expect(html).toContain('SELECTOR_DRIFT');
    expect(html).toContain('CONTRACT_DRIFT');
    expect(html).toContain('AUTH_EXPIRED');
  });
});

describe('renderHtml with coverage data', () => {
  test('omits Coverage tab markup when coverage is undefined (backwards compat)', () => {
    const html = renderHtml({
      data: { nodes: [], edges: [] },
      stats: { tickets: 0, scenarios: 0, poms: 0, areas: 0, failures: 0, edges: 0 },
      generatedAt: '2026-05-17T10:00:00.000Z',
    });
    expect(html).not.toContain('data-tab="coverage"');
    expect(html).not.toContain('Coverage</button>');
  });

  test('includes Coverage tab markup when coverage data passed', () => {
    const snap = { ...mkSnapshot(), classifications: [], acNodes: {} };
    const report = buildCoverageReport(
      snap,
      DEFAULT_COVERAGE_CONFIG,
      new Date('2026-05-17T10:00:00.000Z'),
    );
    const html = renderHtml({
      data: { nodes: [], edges: [] },
      stats: { tickets: 0, scenarios: 0, poms: 0, areas: 0, failures: 0, edges: 0 },
      generatedAt: '2026-05-17T10:00:00.000Z',
      coverage: {
        report,
        snapshots: [],
      },
    });
    expect(html).toContain('data-tab="coverage"');
    expect(html).toContain('Coverage</button>');
    expect(html).toContain('data-subtab="map"');
    expect(html).toContain('data-subtab="list"');
    expect(html).toContain('data-subtab="trend"');
  });
});

describe('computeTicketMeta', () => {
  function mkRichSnapshot(): Snapshot {
    return {
      schema_version: 1,
      generated_at: '2026-05-20T00:00:00Z',
      event_count: 0,
      events_hash: 'sha256:test',
      tickets: {
        'XFB-7': {
          id: 'XFB-7',
          summary: 'Log in',
          ac: ['form has fields', 'redirect to dashboard', 'rate limit'],
          storyHash: 'h1',
          modifiesAreas: ['login', 'dashboard'],
          fetchedAt: '2026-05-19T14:28:17Z',
        },
        'XFB-8': {
          id: 'XFB-8',
          summary: 'Sign out',
          ac: [],
          storyHash: 'h2',
          modifiesAreas: ['nav'],
          fetchedAt: '2026-05-19T14:28:17Z',
        },
      },
      scenarios: {
        s1: {
          id: 's1',
          ticketId: 'XFB-7',
          name: 'sc1',
          gherkin: '',
          priority: 'p0',
          featureHash: 'f1',
          generatedAt: '2026-05-19T14:33:00Z',
        },
        s2: {
          id: 's2',
          ticketId: 'XFB-7',
          name: 'sc2',
          gherkin: '',
          priority: 'p1',
          featureHash: 'f1',
          generatedAt: '2026-05-19T14:33:01Z',
        },
        s3: {
          id: 's3',
          ticketId: 'XFB-7',
          name: 'sc3',
          gherkin: '',
          priority: 'p2',
          featureHash: 'f1',
          generatedAt: '2026-05-19T14:33:02Z',
        },
        s4: {
          id: 's4',
          ticketId: 'XFB-8',
          name: 'sc4',
          gherkin: '',
          priority: 'p1',
          featureHash: 'f2',
          generatedAt: '2026-05-19T15:00:00Z',
        },
      },
      poms: {
        'pom-login': {
          id: 'pom-login',
          ticketId: 'XFB-7',
          filePath: '.xera/XFB-7/page-objects/LoginPage.ts',
          route: '/login',
          locators: [],
          scope: 'local',
        },
        'pom-dash': {
          id: 'pom-dash',
          ticketId: 'XFB-7',
          filePath: '.xera/XFB-7/page-objects/DashboardPage.ts',
          route: '/',
          locators: [],
          scope: 'local',
        },
      },
      areas: { login: { id: 'login' }, dashboard: { id: 'dashboard' }, nav: { id: 'nav' } },
      edges: [
        {
          kind: 'tests',
          from: 'XFB-7',
          to: 's1',
          source: 'xera-script',
          discoveredAt: '2026-05-19T14:33:00Z',
        },
        {
          kind: 'tests',
          from: 'XFB-7',
          to: 's2',
          source: 'xera-script',
          discoveredAt: '2026-05-19T14:33:01Z',
        },
        {
          kind: 'tests',
          from: 'XFB-7',
          to: 's3',
          source: 'xera-script',
          discoveredAt: '2026-05-19T14:33:02Z',
        },
        {
          kind: 'uses',
          from: 's1',
          to: 'pom-login',
          source: 'xera-script',
          discoveredAt: '2026-05-19T14:33:00Z',
        },
        {
          kind: 'uses',
          from: 's2',
          to: 'pom-dash',
          source: 'xera-script',
          discoveredAt: '2026-05-19T14:33:01Z',
        },
        {
          kind: 'satisfies',
          from: 's1',
          to: 'XFB-7#ac-0',
          source: 'xera-script',
          confidence: 0.95,
          discoveredAt: '2026-05-19T14:33:00Z',
        },
        {
          kind: 'satisfies',
          from: 's2',
          to: 'XFB-7#ac-1',
          source: 'ac-coverage',
          confidence: 0.9,
          discoveredAt: '2026-05-19T14:33:01Z',
        },
        {
          // s3 satisfies AC-2 and is PASS → AC-2 should be VERIFIED
          kind: 'satisfies',
          from: 's3',
          to: 'XFB-7#ac-2',
          source: 'ac-coverage',
          confidence: 0.95,
          discoveredAt: '2026-05-19T14:33:02Z',
        },
        {
          kind: 'jira-linked',
          from: 'XFB-7',
          to: 'XFB-8',
          source: 'jira',
          discoveredAt: '2026-05-19T14:28:17Z',
        },
      ],
      latest_failures: {
        s1: {
          id: 'f-s1',
          scenarioId: 's1',
          runId: 'r1',
          ts: '2026-05-19T14:35:00Z',
          classification: 'REAL_BUG',
          confidence: 'low',
        },
        s2: {
          id: 'f-s2',
          scenarioId: 's2',
          runId: 'r1',
          ts: '2026-05-19T14:35:01Z',
          classification: 'TEST_BUG',
          confidence: 'medium',
        },
      },
      acNodes: {
        'XFB-7#ac-0': { id: 'XFB-7#ac-0', ticketId: 'XFB-7', index: 0, text: 'form has fields' },
        'XFB-7#ac-1': {
          id: 'XFB-7#ac-1',
          ticketId: 'XFB-7',
          index: 1,
          text: 'redirect to dashboard',
        },
        'XFB-7#ac-2': { id: 'XFB-7#ac-2', ticketId: 'XFB-7', index: 2, text: 'rate limit' },
        'XFB-7#ac-3': { id: 'XFB-7#ac-3', ticketId: 'XFB-7', index: 3, text: 'no satisfier' },
      },
      classifications: [
        { scenarioId: 's1', classification: 'REAL_BUG', ts: '2026-05-19T14:35:00Z' },
        { scenarioId: 's2', classification: 'TEST_BUG', ts: '2026-05-19T14:35:01Z' },
        { scenarioId: 's3', classification: 'PASS', ts: '2026-05-19T14:35:02Z' },
      ],
    };
  }

  test('aggregates pass/fail/total from latest_failures + scenarios', () => {
    const m = computeTicketMeta(mkRichSnapshot(), 'XFB-7');
    expect(m.runStats.total).toBe(3);
    expect(m.runStats.fail).toBe(2);
    expect(m.runStats.pass).toBe(1);
    expect(m.runStats.lastRunTs).toBe('2026-05-19T14:35:02Z');
  });

  test('counts failure mix from latest classification per scenario', () => {
    const m = computeTicketMeta(mkRichSnapshot(), 'XFB-7');
    expect(m.failureMix).toEqual({ REAL_BUG: 1, TEST_BUG: 1, PASS: 1 });
  });

  test('picks top classification from most-recent failure', () => {
    const m = computeTicketMeta(mkRichSnapshot(), 'XFB-7');
    expect(m.topClassification).toBe('TEST_BUG');
    expect(m.topConfidence).toBe('medium');
  });

  test('picks highest priority across scenarios', () => {
    const m = computeTicketMeta(mkRichSnapshot(), 'XFB-7');
    expect(m.topPriority).toBe('p0');
  });

  test('3-state AC coverage: verified / broken / gap', () => {
    // Fixture timestamps are 2026-05-19; pin `now` to one day later so the
    // PASS classification stays within the 30-day staleness window regardless
    // of when the test actually runs.
    const m = computeTicketMeta(
      mkRichSnapshot(),
      'XFB-7',
      undefined,
      new Date('2026-05-20T00:00:00Z'),
    );
    expect(m.acTotal).toBe(4);
    expect(m.acStates).toEqual([
      { index: 0, state: 'broken' }, // s1 satisfies but REAL_BUG
      { index: 1, state: 'broken' }, // s2 satisfies but TEST_BUG
      { index: 2, state: 'verified' }, // s3 satisfies and PASS
      { index: 3, state: 'gap' }, // no satisfies edge
    ]);
  });

  test('AC marked broken (not verified) when its only satisfying scenario is failing', () => {
    // Concrete failure mode from xera-sample-app-tests: every AC had a
    // satisfies edge from the ac-coverage backfill, but the satisfying
    // scenarios were SELECTOR_DRIFT failures. Side panel must NOT report
    // those ACs as verified.
    const snap = mkRichSnapshot();
    const m = computeTicketMeta(snap, 'XFB-7', undefined, new Date('2026-05-20T00:00:00Z'));
    const verified = m.acStates.filter((a) => a.state === 'verified').length;
    const broken = m.acStates.filter((a) => a.state === 'broken').length;
    const gap = m.acStates.filter((a) => a.state === 'gap').length;
    expect(verified).toBe(1);
    expect(broken).toBe(2);
    expect(gap).toBe(1);
  });

  test('AC becomes broken when its only PASS classification is older than the staleness window', () => {
    const snap = mkRichSnapshot();
    // Pin `now` to 60 days after the fixture's PASS classification (windowDays=30)
    const m = computeTicketMeta(snap, 'XFB-7', undefined, new Date('2026-07-19T00:00:00Z'));
    const ac2 = m.acStates.find((a) => a.index === 2);
    expect(ac2?.state).toBe('broken');
  });

  test('lists POMs used by ticket scenarios with fileName + route', () => {
    const m = computeTicketMeta(mkRichSnapshot(), 'XFB-7');
    expect(m.poms).toHaveLength(2);
    const names = m.poms.map((p) => p.fileName).sort();
    expect(names).toEqual(['DashboardPage.ts', 'LoginPage.ts']);
  });

  test('lists areas from modifiesAreas; decorates with coverage status when present', () => {
    const snap = mkRichSnapshot();
    const report = buildCoverageReport(
      snap,
      DEFAULT_COVERAGE_CONFIG,
      new Date('2026-05-20T10:00:00Z'),
    );
    const m = computeTicketMeta(snap, 'XFB-7', { report, snapshots: [] });
    expect(m.areas.map((a) => a.id).sort()).toEqual(['dashboard', 'login']);
    // status is present because coverage report was provided
    for (const a of m.areas) expect(a.status).toBeDefined();
  });

  test('areas are bare when coverage is not provided', () => {
    const m = computeTicketMeta(mkRichSnapshot(), 'XFB-7');
    expect(m.areas.find((a) => a.id === 'login')?.status).toBeUndefined();
  });

  test('collects jira-linked tickets from incident edges', () => {
    const m = computeTicketMeta(mkRichSnapshot(), 'XFB-7');
    expect(m.linkedTickets).toHaveLength(1);
    expect(m.linkedTickets[0]?.id).toBe('XFB-8');
  });

  test('records fetchedAt + latestScenarioAt + scenarioCount', () => {
    const m = computeTicketMeta(mkRichSnapshot(), 'XFB-7');
    expect(m.fetchedAt).toBe('2026-05-19T14:28:17Z');
    expect(m.latestScenarioAt).toBe('2026-05-19T14:33:02Z');
    expect(m.scenarioCount).toBe(3);
  });

  test('handles ticket with no scenarios cleanly', () => {
    const snap = mkRichSnapshot();
    // Remove XFB-8's scenario
    delete snap.scenarios.s4;
    const m = computeTicketMeta(snap, 'XFB-8');
    expect(m.runStats.total).toBe(0);
    expect(m.runStats.pass).toBe(0);
    expect(m.runStats.fail).toBe(0);
    expect(m.failureMix).toEqual({});
    expect(m.topPriority).toBeUndefined();
  });

  test('embeds ticket meta into Ticket VisNode', () => {
    const { nodes } = transformForVisNetwork(mkRichSnapshot(), {});
    const ticket = nodes.find((n) => n.id === 'XFB-7');
    expect(ticket?.meta?.ticket).toBeDefined();
    expect(ticket?.meta?.ticket?.runStats.fail).toBe(2);
  });
});
