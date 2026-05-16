import type { EdgeKind, Priority } from './types';

export interface ImpactEdge {
  kind: EdgeKind;
  from: string;
  to: string;
  confidence?: number;
  source?: string;
}

export interface ImpactScenario {
  scenarioId: string;
  ticketId: string;        // owner of the scenario (NOT the impact target)
  name: string;
  priority: Priority;
  edgePath: ImpactEdge[];
  riskScore: number;
  lastPassedAt?: string;
}

export interface ImpactOpts {
  depth: 1 | 2 | 3;
  minPriority?: Priority;
}

export interface ImpactReport {
  targetTicket: string;
  modifiedAreas: string[];
  scenarios: ImpactScenario[];
  generatedAt: string;
}

const PRIORITY_WEIGHT: Record<Priority, number> = { p0: 3, p1: 2, p2: 1 };

const EDGE_WEIGHT_FIXED: Partial<Record<EdgeKind, number>> = {
  modifies: 5,           // direct collision via SUT area
  uses: 4,               // shared POM
  covers: 4,             // shared POM (alt path)
  // 'jira-linked' weight is dynamic — see jiraRelationWeight
};

function jiraRelationWeight(source?: string): number {
  if (!source) return 0;
  if (source.endsWith('blocks')) return 4;
  if (source.endsWith('duplicates')) return 3;
  if (source.endsWith('relates')) return 2;
  if (source.endsWith('supersedes')) return 3;
  return 1;
}

function edgeWeight(edge: ImpactEdge): number {
  if (edge.kind === 'modifies') return EDGE_WEIGHT_FIXED.modifies ?? 0;
  if (edge.kind === 'uses' || edge.kind === 'covers') return EDGE_WEIGHT_FIXED.uses ?? 0;
  if (edge.kind === 'jira-linked') return jiraRelationWeight(edge.source);
  if (edge.kind === 'similar') return 1 * (edge.confidence ?? 0);
  return 0;
}

export function riskScore(scenario: ImpactScenario, daysSinceLastPass: number): number {
  const pri = PRIORITY_WEIGHT[scenario.priority] * 3;
  const firstEdge = scenario.edgePath[0];
  const edgeW = firstEdge ? edgeWeight(firstEdge) : 0;
  const confW = firstEdge?.confidence !== undefined ? firstEdge.confidence * 2 : 0;
  const decay = daysSinceLastPass * 0.1;
  return pri + edgeW + confW - decay;
}
