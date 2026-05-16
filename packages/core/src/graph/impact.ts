import type { EdgeKind, Priority, Snapshot, TicketNode } from './types';

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

const PRIORITY_RANK: Record<Priority, number> = { p0: 3, p1: 2, p2: 1 };

function daysSince(ts: string | undefined): number {
  if (!ts) return 0;
  const ms = Date.now() - Date.parse(ts);
  return ms < 0 ? 0 : ms / (86400 * 1000);
}

export function walkImpact(graph: Snapshot, target: TicketNode, opts: ImpactOpts): ImpactScenario[] {
  const result: ImpactScenario[] = [];
  const seen = new Set<string>();

  // Areas the target modifies
  const targetAreas = new Set(target.modifiesAreas);

  // POMs covering any of those areas
  const pomIds = graph.edges
    .filter((e) => e.kind === 'covers' && targetAreas.has(e.to))
    .map((e) => e.from);

  // Scenarios using any of those POMs (depth 1 — direct collision)
  const directScenarios = graph.edges
    .filter((e) => e.kind === 'uses' && pomIds.includes(e.to))
    .map((e) => e.from);

  for (const scenarioId of directScenarios) {
    if (seen.has(scenarioId)) continue;
    const scenario = graph.scenarios[scenarioId];
    if (!scenario) continue;
    if (scenario.ticketId === target.id) continue; // exclude own scenarios

    const usingPom = graph.edges.find((e) => e.kind === 'uses' && e.from === scenarioId);
    const modifyEdge = graph.edges.find((e) => e.kind === 'modifies' && e.from === target.id && targetAreas.has(e.to));
    const edgePath: ImpactEdge[] = [];
    if (modifyEdge) edgePath.push({ kind: 'modifies', from: modifyEdge.from, to: modifyEdge.to });
    if (usingPom) edgePath.push({ kind: 'uses', from: usingPom.from, to: usingPom.to });

    seen.add(scenarioId);
    const impact: ImpactScenario = {
      scenarioId, ticketId: scenario.ticketId, name: scenario.name,
      priority: scenario.priority, edgePath, riskScore: 0,
    };
    impact.riskScore = riskScore(impact, daysSince(graph.latest_failures[scenarioId]?.ts));
    result.push(impact);
  }

  // Depth >= 2: jira-linked tickets contribute their scenarios
  if (opts.depth >= 2) {
    const linked = graph.edges
      .filter((e) => e.kind === 'jira-linked' && e.from === target.id)
      .map((e) => ({ to: e.to, source: e.source }));
    for (const link of linked) {
      const sceneIds = graph.edges
        .filter((e) => e.kind === 'tests' && e.from === link.to)
        .map((e) => e.to);
      for (const scenarioId of sceneIds) {
        if (seen.has(scenarioId)) continue;
        const scenario = graph.scenarios[scenarioId];
        if (!scenario || scenario.ticketId === target.id) continue;
        seen.add(scenarioId);
        const edge: ImpactEdge = { kind: 'jira-linked', from: target.id, to: link.to };
        if (link.source !== undefined) edge.source = link.source;
        const impact: ImpactScenario = {
          scenarioId, ticketId: scenario.ticketId, name: scenario.name,
          priority: scenario.priority, edgePath: [edge], riskScore: 0,
        };
        impact.riskScore = riskScore(impact, daysSince(graph.latest_failures[scenarioId]?.ts));
        result.push(impact);
      }
    }
  }

  // Depth >= 3: similar tickets contribute their scenarios
  if (opts.depth >= 3) {
    const similar = graph.edges
      .filter((e) => e.kind === 'similar' && e.from === target.id)
      .map((e) => ({ to: e.to, confidence: e.confidence }));
    for (const link of similar) {
      const sceneIds = graph.edges
        .filter((e) => e.kind === 'tests' && e.from === link.to)
        .map((e) => e.to);
      for (const scenarioId of sceneIds) {
        if (seen.has(scenarioId)) continue;
        const scenario = graph.scenarios[scenarioId];
        if (!scenario || scenario.ticketId === target.id) continue;
        seen.add(scenarioId);
        const edge: ImpactEdge = { kind: 'similar', from: target.id, to: link.to };
        if (link.confidence !== undefined) edge.confidence = link.confidence;
        const impact: ImpactScenario = {
          scenarioId, ticketId: scenario.ticketId, name: scenario.name,
          priority: scenario.priority, edgePath: [edge], riskScore: 0,
        };
        impact.riskScore = riskScore(impact, daysSince(graph.latest_failures[scenarioId]?.ts));
        result.push(impact);
      }
    }
  }

  // Filter by min-priority
  let filtered = result;
  if (opts.minPriority) {
    const min = PRIORITY_RANK[opts.minPriority];
    filtered = filtered.filter((s) => PRIORITY_RANK[s.priority] >= min);
  }

  // Sort by riskScore descending
  filtered.sort((a, b) => b.riskScore - a.riskScore);
  return filtered;
}

const HIGH_THRESHOLD = 7.0;
const MEDIUM_THRESHOLD = 4.0;

function bucket(score: number): 'high' | 'medium' | 'low' {
  if (score >= HIGH_THRESHOLD) return 'high';
  if (score >= MEDIUM_THRESHOLD) return 'medium';
  return 'low';
}

function fmtEdgePath(path: ImpactEdge[]): string {
  return path.map((e) => `${e.from} →[${e.kind}]→ ${e.to}`).join(' · ');
}

export function renderImpactMarkdown(report: ImpactReport): string {
  const lines: string[] = [];
  lines.push(`# Impact Analysis — ${report.targetTicket}`);
  lines.push('');
  lines.push(`**Modified areas:** ${report.modifiedAreas.join(', ') || '(none)'}`);
  lines.push(`**Generated:** ${report.generatedAt}`);
  lines.push('');

  if (report.scenarios.length === 0) {
    lines.push('No prior scenarios in the modified areas. This may be a new feature area.');
    lines.push('');
    return lines.join('\n');
  }

  const bySeverity = { high: [] as ImpactScenario[], medium: [] as ImpactScenario[], low: [] as ImpactScenario[] };
  for (const s of report.scenarios) bySeverity[bucket(s.riskScore)].push(s);

  lines.push(`**Total impacted:** ${report.scenarios.length} scenarios (${bySeverity.high.length} high · ${bySeverity.medium.length} medium · ${bySeverity.low.length} low)`);
  lines.push('');

  for (const [name, scenarios] of [
    ['High-risk', bySeverity.high],
    ['Medium-risk', bySeverity.medium],
    ['Low-risk', bySeverity.low],
  ] as const) {
    if (scenarios.length === 0) continue;
    lines.push(`## ${name}`);
    lines.push('');
    for (const s of scenarios) {
      lines.push(`### ${s.ticketId} / "${s.name}" [${s.priority.toUpperCase()}]   score ${s.riskScore.toFixed(1)}`);
      lines.push(`- Edge: ${fmtEdgePath(s.edgePath)}`);
      if (s.lastPassedAt) lines.push(`- Last passed: ${s.lastPassedAt}`);
      lines.push('');
    }
  }

  lines.push('## Re-run commands');
  lines.push('- All:        `bun run xera:exec --from-impact ' + report.targetTicket + '`');
  lines.push('- P0 only:    `bun run xera:exec --from-impact ' + report.targetTicket + ' --min-priority p0`');
  lines.push('- Select:     `bun run xera:exec --from-impact ' + report.targetTicket + ' --select`');
  lines.push('');

  return lines.join('\n');
}
