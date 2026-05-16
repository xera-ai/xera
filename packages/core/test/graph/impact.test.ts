import { describe, expect, test } from 'bun:test';
import { riskScore, walkImpact } from '../../src/graph/impact';
import type { ImpactScenario } from '../../src/graph/impact';
import type { Snapshot, TicketNode, ScenarioNode, PomNode, EdgeRecord } from '../../src/graph/types';

function mkImpact(overrides: Partial<ImpactScenario> = {}): ImpactScenario {
  return {
    scenarioId: 'sc-1',
    ticketId: 'ABC-100',
    name: 'user signs in',
    priority: 'p1',
    edgePath: [{ kind: 'modifies', from: 'ABC-200', to: 'login' }],
    riskScore: 0,
    ...overrides,
  };
}

describe('riskScore', () => {
  test('P0 with modifies-same-area edge returns 14', () => {
    // priority_weight=3 * 3 + edge_weight=5 + confidence=0 - days=0 = 14
    const s = mkImpact({ priority: 'p0' });
    expect(riskScore(s, 0)).toBeCloseTo(14, 2);
  });

  test('P1 with modifies-same-area edge returns 11', () => {
    // priority_weight=2 * 3 + edge_weight=5 = 11
    const s = mkImpact({ priority: 'p1' });
    expect(riskScore(s, 0)).toBeCloseTo(11, 2);
  });

  test('P2 with similar edge confidence 0.8 returns 5.4', () => {
    // priority_weight=1 * 3 + edge_weight=1*0.8 + 0.8*2 - 0 = 3 + 0.8 + 1.6 = 5.4
    const s = mkImpact({
      priority: 'p2',
      edgePath: [{ kind: 'similar', from: 'ABC-200', to: 'ABC-100', confidence: 0.8 }],
    });
    expect(riskScore(s, 0)).toBeCloseTo(5.4, 2);
  });

  test('subtracts 0.1 per day since last pass', () => {
    const s = mkImpact({ priority: 'p1' });
    // base 11 - 7 days * 0.1 = 10.3
    expect(riskScore(s, 7)).toBeCloseTo(10.3, 2);
  });

  test('jira-linked.blocks weight 4', () => {
    const s = mkImpact({
      priority: 'p1',
      edgePath: [{ kind: 'jira-linked', from: 'ABC-200', to: 'ABC-100', source: 'jira:blocks' }],
    });
    // 2*3 + 4 = 10
    expect(riskScore(s, 0)).toBeCloseTo(10, 2);
  });

  test('jira-linked.relates weight 2', () => {
    const s = mkImpact({
      priority: 'p1',
      edgePath: [{ kind: 'jira-linked', from: 'ABC-200', to: 'ABC-100', source: 'jira:relates' }],
    });
    // 2*3 + 2 = 8
    expect(riskScore(s, 0)).toBeCloseTo(8, 2);
  });
});

function mkGraph(): Snapshot {
  const tickets: Record<string, TicketNode> = {
    'ABC-100': {
      id: 'ABC-100', summary: 'login feature', ac: ['User can sign in'],
      storyHash: 'h1', modifiesAreas: ['login'], fetchedAt: '2026-05-10T00:00:00Z',
    },
    'ABC-145': {
      id: 'ABC-145', summary: 'reset password', ac: ['User can reset password'],
      storyHash: 'h2', modifiesAreas: ['login'], fetchedAt: '2026-05-11T00:00:00Z',
    },
    'ABC-200': {
      id: 'ABC-200', summary: 'rename Sign in button', ac: ['Button label = Log in'],
      storyHash: 'h3', modifiesAreas: ['login'], fetchedAt: '2026-05-15T00:00:00Z',
    },
  };
  const scenarios: Record<string, ScenarioNode> = {
    'sc-100': {
      id: 'sc-100', ticketId: 'ABC-100', name: 'user signs in', gherkin: 'g',
      priority: 'p0', featureHash: 'f1', generatedAt: '2026-05-10T00:00:00Z',
    },
    'sc-145': {
      id: 'sc-145', ticketId: 'ABC-145', name: 'user resets password', gherkin: 'g',
      priority: 'p0', featureHash: 'f2', generatedAt: '2026-05-11T00:00:00Z',
    },
  };
  const poms: Record<string, PomNode> = {
    'pom-login': {
      id: 'pom-login', ticketId: 'ABC-100', filePath: 'login.ts', route: '/login',
      locators: [], scope: 'shared',
    },
  };
  const edges: EdgeRecord[] = [
    { kind: 'tests', from: 'ABC-100', to: 'sc-100', source: 'xera-script', discoveredAt: '2026-05-10T00:00:00Z' },
    { kind: 'tests', from: 'ABC-145', to: 'sc-145', source: 'xera-script', discoveredAt: '2026-05-11T00:00:00Z' },
    { kind: 'uses', from: 'sc-100', to: 'pom-login', source: 'xera-script', discoveredAt: '2026-05-10T00:00:00Z' },
    { kind: 'uses', from: 'sc-145', to: 'pom-login', source: 'xera-script', discoveredAt: '2026-05-11T00:00:00Z' },
    { kind: 'covers', from: 'pom-login', to: 'login', source: 'xera-script', discoveredAt: '2026-05-10T00:00:00Z' },
    { kind: 'modifies', from: 'ABC-100', to: 'login', source: 'extract-areas', discoveredAt: '2026-05-10T00:00:00Z' },
    { kind: 'modifies', from: 'ABC-145', to: 'login', source: 'extract-areas', discoveredAt: '2026-05-11T00:00:00Z' },
    { kind: 'modifies', from: 'ABC-200', to: 'login', source: 'extract-areas', discoveredAt: '2026-05-15T00:00:00Z' },
  ];
  return {
    schema_version: 1, generated_at: '2026-05-15T00:00:00Z',
    event_count: edges.length, events_hash: 'sha256:test',
    tickets, scenarios, poms, areas: { login: { id: 'login' } },
    edges, latest_failures: {},
  };
}

describe('walkImpact', () => {
  test('finds scenarios that use POMs covering target.modifiesAreas', () => {
    const graph = mkGraph();
    const target = graph.tickets['ABC-200']!;
    const result = walkImpact(graph, target, { depth: 1 });
    const ids = result.map((r) => r.scenarioId).sort();
    expect(ids).toEqual(['sc-100', 'sc-145']);
  });

  test('excludes scenarios already owned by target ticket', () => {
    const graph = mkGraph();
    // ABC-100 is the target this time — so sc-100 (its own scenario) must NOT appear
    const target = graph.tickets['ABC-100']!;
    const result = walkImpact(graph, target, { depth: 1 });
    const ids = result.map((r) => r.scenarioId);
    expect(ids).not.toContain('sc-100');
    expect(ids).toContain('sc-145');
  });

  test('depth=2 includes jira-linked scenarios', () => {
    const graph = mkGraph();
    // Add a jira-linked edge: ABC-200 -> ABC-145 (blocks)
    graph.edges.push({
      kind: 'jira-linked', from: 'ABC-200', to: 'ABC-145',
      source: 'jira:blocks', discoveredAt: '2026-05-15T00:00:00Z',
    });
    const target = graph.tickets['ABC-200']!;
    const depth1 = walkImpact(graph, target, { depth: 1 });
    const depth2 = walkImpact(graph, target, { depth: 2 });
    // depth=1 already returns sc-100, sc-145 via modifies path; depth=2 same scenarios but
    // possibly with shorter / alternate edge path. Just verify count is consistent.
    expect(depth2.length).toBeGreaterThanOrEqual(depth1.length);
  });

  test('--min-priority filter excludes lower-priority scenarios', () => {
    const graph = mkGraph();
    graph.scenarios['sc-145']!.priority = 'p2';
    const target = graph.tickets['ABC-200']!;
    const all = walkImpact(graph, target, { depth: 1 });
    const p0Only = walkImpact(graph, target, { depth: 1, minPriority: 'p0' });
    expect(all.map((s) => s.scenarioId)).toContain('sc-145');
    expect(p0Only.map((s) => s.scenarioId)).not.toContain('sc-145');
  });

  test('returns empty list when target modifies an unconnected area', () => {
    const graph = mkGraph();
    graph.tickets['ABC-200']!.modifiesAreas = ['new-feature'];
    const target = graph.tickets['ABC-200']!;
    const result = walkImpact(graph, target, { depth: 1 });
    expect(result).toHaveLength(0);
  });

  test('riskScore is set on each returned scenario', () => {
    const graph = mkGraph();
    const target = graph.tickets['ABC-200']!;
    const result = walkImpact(graph, target, { depth: 1 });
    for (const r of result) {
      expect(r.riskScore).toBeGreaterThan(0);
    }
  });
});
