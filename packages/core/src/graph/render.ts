import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { CoverageReport } from '../coverage/report';
import type { CoverageSnapshotPayload, EdgeRecord, Snapshot } from './types';

export interface VisNode {
  id: string;
  label: string;
  group: 'Ticket' | 'Scenario' | 'POM' | 'SUTArea' | 'Failure';
  color?: string;
  shape?: string;
  size?: number;
  title?: string;
  borderWidth?: number;
}

export interface VisEdge {
  id?: string;
  from: string;
  to: string;
  label?: string;
  color?: string;
  dashes?: boolean;
  width?: number;
  arrows?: string;
}

export interface GraphStats {
  tickets: number;
  scenarios: number;
  poms: number;
  areas: number;
  failures: number;
  edges: number;
}

export interface RenderOpts {
  since?: string; // ISO8601 cutoff
  ticketId?: string; // ego-graph centered on this ticket
  depth?: 1 | 2 | 3; // traversal depth for ego-graph
  performanceMode?: 'full' | 'ticket-only' | 'text-fallback';
}

const COLORS = {
  ticket: '#3B82F6',
  scenarioPass: '#10B981',
  scenarioFail: '#EF4444',
  pom: '#F59E0B',
  area: '#6B7280',
  failure: '#EF4444',
  edgeModifies: '#EF4444',
  edgeDefault: '#9CA3AF',
  edgeJira: '#3B82F6',
  edgeSimilar: '#A855F7',
} as const;

function ticketsAfter(since: string | undefined, fetchedAt: string): boolean {
  if (!since) return true;
  return Date.parse(fetchedAt) >= Date.parse(since);
}

function scenariosAfter(since: string | undefined, generatedAt: string): boolean {
  if (!since) return true;
  return Date.parse(generatedAt) >= Date.parse(since);
}

function buildTicketNode(snap: Snapshot, ticketId: string): VisNode {
  const t = snap.tickets[ticketId]!;
  const usageCount = snap.edges.filter((e) => e.kind === 'tests' && e.from === ticketId).length;
  const node: VisNode = {
    id: t.id,
    label: t.id,
    group: 'Ticket',
    color: COLORS.ticket,
    shape: 'dot',
    size: 10 + Math.min(usageCount * 2, 20),
    title: `${t.id} — ${t.summary}`,
  };
  return node;
}

function buildScenarioNode(snap: Snapshot, scenarioId: string): VisNode {
  const s = snap.scenarios[scenarioId]!;
  const failed = snap.latest_failures[scenarioId];
  const sizeBase = s.priority === 'p0' ? 14 : s.priority === 'p1' ? 11 : 9;
  const node: VisNode = {
    id: s.id,
    label: s.name,
    group: 'Scenario',
    color: failed ? COLORS.scenarioFail : COLORS.scenarioPass,
    shape: 'square',
    size: sizeBase,
    title: `${s.ticketId} / ${s.name} [${s.priority.toUpperCase()}]`,
  };
  return node;
}

function buildPomNode(snap: Snapshot, pomId: string): VisNode {
  const p = snap.poms[pomId]!;
  const usageCount = snap.edges.filter((e) => e.kind === 'uses' && e.to === pomId).length;
  const node: VisNode = {
    id: p.id,
    label: p.filePath.split('/').pop() ?? p.id,
    group: 'POM',
    color: COLORS.pom,
    shape: 'diamond',
    size: 8 + Math.min(usageCount * 2, 16),
    title: `${p.filePath} (${p.route || 'no route'})`,
  };
  return node;
}

function buildAreaNode(snap: Snapshot, areaId: string): VisNode {
  const a = snap.areas[areaId]!;
  const node: VisNode = {
    id: a.id,
    label: a.id,
    group: 'SUTArea',
    color: COLORS.area,
    shape: 'hexagon',
    size: 12,
    title: `area: ${a.id}`,
  };
  return node;
}

function buildFailureNode(
  _snap: Snapshot,
  failure: { id: string; scenarioId: string; runId: string; ts: string },
): VisNode {
  const node: VisNode = {
    id: failure.id,
    label: 'fail',
    group: 'Failure',
    color: COLORS.failure,
    shape: 'triangle',
    size: 10,
    title: `failure on ${failure.scenarioId} @ ${failure.ts}`,
  };
  return node;
}

function buildEdge(edge: EdgeRecord, idx: number): VisEdge {
  const v: VisEdge = {
    id: `e-${idx}`,
    from: edge.from,
    to: edge.to,
    label: edge.kind,
    arrows: 'to',
    width: 1,
  };
  switch (edge.kind) {
    case 'modifies':
      v.color = COLORS.edgeModifies;
      v.dashes = true;
      v.width = 2;
      break;
    case 'jira-linked':
      v.color = COLORS.edgeJira;
      v.dashes = true;
      break;
    case 'similar':
      v.color = COLORS.edgeSimilar;
      v.dashes = false;
      v.width = 1 + Math.round((edge.confidence ?? 0) * 3);
      break;
    default:
      v.color = COLORS.edgeDefault;
      break;
  }
  return v;
}

function bfsFromTicket(
  snap: Snapshot,
  ticketId: string,
  depth: number,
): { nodeIds: Set<string>; edgeIdxs: Set<number> } {
  const nodeIds = new Set<string>([ticketId]);
  const edgeIdxs = new Set<number>();
  let frontier = new Set<string>([ticketId]);
  for (let d = 0; d < depth; d++) {
    const next = new Set<string>();
    snap.edges.forEach((e, i) => {
      if (frontier.has(e.from) && !nodeIds.has(e.to)) {
        nodeIds.add(e.to);
        next.add(e.to);
        edgeIdxs.add(i);
      } else if (frontier.has(e.to) && !nodeIds.has(e.from)) {
        nodeIds.add(e.from);
        next.add(e.from);
        edgeIdxs.add(i);
      } else if (frontier.has(e.from) && nodeIds.has(e.to)) {
        edgeIdxs.add(i);
      } else if (frontier.has(e.to) && nodeIds.has(e.from)) {
        edgeIdxs.add(i);
      }
    });
    frontier = next;
    if (frontier.size === 0) break;
  }
  return { nodeIds, edgeIdxs };
}

export function transformForVisNetwork(
  snap: Snapshot,
  opts: RenderOpts,
): {
  nodes: VisNode[];
  edges: VisEdge[];
  stats: GraphStats;
} {
  const mode = opts.performanceMode ?? 'full';

  const nodes: VisNode[] = [];
  const edges: VisEdge[] = [];

  // Determine the universe of node IDs to include
  let includeTickets = new Set<string>();
  let includeScenarios = new Set<string>();
  let includePoms = new Set<string>();
  let includeAreas = new Set<string>();
  let includeEdgeIdxs = new Set<number>();

  if (opts.ticketId) {
    const result = bfsFromTicket(snap, opts.ticketId, opts.depth ?? 2);
    for (const id of result.nodeIds) {
      if (snap.tickets[id]) includeTickets.add(id);
      else if (snap.scenarios[id]) includeScenarios.add(id);
      else if (snap.poms[id]) includePoms.add(id);
      else if (snap.areas[id]) includeAreas.add(id);
    }
    includeEdgeIdxs = result.edgeIdxs;
  } else {
    includeTickets = new Set(
      Object.keys(snap.tickets).filter((id) =>
        ticketsAfter(opts.since, snap.tickets[id]!.fetchedAt),
      ),
    );
    includeScenarios = new Set(
      Object.keys(snap.scenarios).filter((id) =>
        scenariosAfter(opts.since, snap.scenarios[id]!.generatedAt),
      ),
    );
    includePoms = new Set(Object.keys(snap.poms));
    includeAreas = new Set(Object.keys(snap.areas));
    snap.edges.forEach((_, i) => {
      includeEdgeIdxs.add(i);
    });
  }

  // Apply performance mode
  if (mode === 'ticket-only') {
    includeScenarios.clear();
    includePoms.clear();
    includeAreas.clear();
  }

  for (const id of includeTickets) nodes.push(buildTicketNode(snap, id));
  for (const id of includeScenarios) nodes.push(buildScenarioNode(snap, id));
  for (const id of includePoms) nodes.push(buildPomNode(snap, id));
  for (const id of includeAreas) nodes.push(buildAreaNode(snap, id));

  for (const failure of Object.values(snap.latest_failures)) {
    if (includeScenarios.has(failure.scenarioId)) {
      nodes.push(buildFailureNode(snap, failure));
    }
  }

  const visibleNodeIds = new Set(nodes.map((n) => n.id));
  for (const i of includeEdgeIdxs) {
    const e = snap.edges[i];
    if (!e) continue;
    if (!visibleNodeIds.has(e.from) || !visibleNodeIds.has(e.to)) continue;
    edges.push(buildEdge(e, i));
  }

  const stats: GraphStats = {
    tickets: includeTickets.size,
    scenarios: includeScenarios.size,
    poms: includePoms.size,
    areas: includeAreas.size,
    failures: nodes.filter((n) => n.group === 'Failure').length,
    edges: edges.length,
  };

  return { nodes, edges, stats };
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const TEMPLATES_DIR = join(__dirname, 'templates');

function loadTemplate(name: string): string {
  return readFileSync(join(TEMPLATES_DIR, name), 'utf8');
}

function statsToHuman(s: GraphStats): string {
  return `${s.tickets} tickets · ${s.scenarios} scenarios · ${s.poms} POMs · ${s.edges} edges`;
}

export interface CoverageInput {
  report: CoverageReport;
  snapshots: CoverageSnapshotPayload[]; // Trend tab data (deduped by day, sorted asc)
}

export interface RenderHtmlInput {
  data: { nodes: VisNode[]; edges: VisEdge[] };
  stats: GraphStats;
  generatedAt: string;
  coverage?: CoverageInput; // NEW v0.8.1
}

export function renderHtml(input: RenderHtmlInput): string {
  const template = loadTemplate('graph.html.template');
  const css = loadTemplate('graph.css');
  const js = loadTemplate('graph.js');
  const visNetwork = loadTemplate('vis-network.min.js');

  const graphJson = JSON.stringify(input.data);
  const statsHuman = statsToHuman(input.stats);

  const coverageTabButton = input.coverage ? '<button data-tab="coverage">Coverage</button>' : '';
  const coverageTabPanel = input.coverage ? loadTemplate('coverage-panel.html.fragment') : '';
  const coverageJson = input.coverage ? JSON.stringify(input.coverage) : 'null';

  return template
    .replace('{{CSS}}', () => css)
    .replace('{{STATS}}', () => statsHuman)
    .replace(/\{\{GENERATED_AT\}\}/g, () => input.generatedAt)
    .replace('{{VIS_NETWORK_JS}}', () => visNetwork)
    .replace('{{GRAPH_DATA}}', () => graphJson)
    .replace('{{INTERACTION_JS}}', () => js)
    .replace('{{COVERAGE_TAB_BUTTON}}', () => coverageTabButton)
    .replace('{{COVERAGE_TAB_PANEL}}', () => coverageTabPanel)
    .replace('{{COVERAGE_DATA}}', () => coverageJson);
}
