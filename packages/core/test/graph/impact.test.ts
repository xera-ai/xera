import { describe, expect, test } from 'bun:test';
import { riskScore } from '../../src/graph/impact';
import type { ImpactScenario } from '../../src/graph/impact';

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
