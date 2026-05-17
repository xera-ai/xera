import { describe, expect, test } from 'bun:test';
import { buildCoverageReport } from '../../src/coverage/report';
import { DEFAULT_COVERAGE_CONFIG } from '../../src/coverage/types';
import { renderHtml, transformForVisNetwork } from '../../src/graph/render';
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
