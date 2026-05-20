import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { CoverageReport } from '../coverage/report';
import type { CoverageSnapshotPayload, EdgeRecord, FailureNode, Snapshot } from './types';

export interface TicketMeta {
  // Test health (from latest_failures + classifications)
  runStats: {
    total: number;
    pass: number;
    fail: number;
    lastRunTs?: string;
  };
  failureMix: Record<string, number>; // classification → count, latest per scenario
  topClassification?: string;
  topConfidence?: string;
  // Priority — max of incident scenarios (p0 > p1 > p2)
  topPriority?: 'p0' | 'p1' | 'p2';
  // AC coverage (from acNodes + satisfies edges)
  acTotal: number;
  acCoveredIdx: number[];
  acUncoveredIdx: number[];
  // Linked entities (from adjacency)
  poms: Array<{ id: string; fileName: string; route: string }>;
  areas: Array<{ id: string; status?: 'COVERED' | 'UNCOVERED' | 'STALE'; risk?: number }>;
  linkedTickets: Array<{ id: string; source: string }>;
  // Freshness
  fetchedAt: string;
  latestScenarioAt?: string;
  scenarioCount: number;
}

export interface VisNode {
  id: string;
  label: string;
  group: 'Ticket' | 'Scenario' | 'POM' | 'SUTArea' | 'Failure';
  color?: string;
  shape?: string;
  size?: number;
  title?: string;
  borderWidth?: number;
  // Structured data for the click-panel — `failure` populated on Failure nodes,
  // `ticket` populated on Ticket nodes. vis-network ignores unknown fields, so
  // this travels through to the client alongside the rendered visual props.
  meta?: {
    // Failure node fields
    scenarioName?: string;
    classification?: string;
    confidence?: string;
    runId?: string;
    disputed?: boolean;
    traceId?: string;
    ts?: string;
    // Ticket node fields
    ticket?: TicketMeta;
  };
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

function buildTicketNode(snap: Snapshot, ticketId: string, coverage?: CoverageInput): VisNode {
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
    meta: { ticket: computeTicketMeta(snap, ticketId, coverage) },
  };
  return node;
}

const PRIORITY_RANK: Record<string, number> = { p0: 3, p1: 2, p2: 1 };

/**
 * Compute per-ticket derived data (test health, AC coverage, linked entities,
 * freshness) from a snapshot. Embedded into the Ticket VisNode's `meta` so the
 * client renders the rich side-panel without re-walking events.
 */
export function computeTicketMeta(
  snap: Snapshot,
  ticketId: string,
  coverage?: CoverageInput,
): TicketMeta {
  const t = snap.tickets[ticketId]!;

  // Scenarios for this ticket
  const ticketScenarios = Object.values(snap.scenarios).filter((s) => s.ticketId === ticketId);
  const scenarioIds = new Set(ticketScenarios.map((s) => s.id));

  // Test health — latest classification per scenario, then aggregate.
  // Defensive: treat missing `classifications`/`acNodes` (older fixtures or
  // partial test snapshots) as empty rather than throwing.
  const classifications = snap.classifications ?? [];
  const acNodesAll = snap.acNodes ?? {};
  // Walk classifications once, keep most-recent per scenarioId
  const latestByScenario = new Map<string, { classification: string; ts: string }>();
  for (const c of classifications) {
    if (!scenarioIds.has(c.scenarioId)) continue;
    const prev = latestByScenario.get(c.scenarioId);
    if (!prev || Date.parse(c.ts) > Date.parse(prev.ts)) {
      latestByScenario.set(c.scenarioId, { classification: c.classification, ts: c.ts });
    }
  }
  const failureMix: Record<string, number> = {};
  for (const v of latestByScenario.values()) {
    failureMix[v.classification] = (failureMix[v.classification] ?? 0) + 1;
  }

  // Pass/fail counts derived from latest_failures (authoritative for fail) and
  // classifications (authoritative for pass). Scenarios not in either bucket
  // are counted as "not classified" — surfaced in failureMix only if present.
  const failScenarios = new Set(
    Object.values(snap.latest_failures)
      .filter((f) => scenarioIds.has(f.scenarioId))
      .map((f) => f.scenarioId),
  );
  let lastRunTs: string | undefined;
  for (const f of Object.values(snap.latest_failures)) {
    if (!scenarioIds.has(f.scenarioId)) continue;
    if (!lastRunTs || Date.parse(f.ts) > Date.parse(lastRunTs)) lastRunTs = f.ts;
  }
  for (const v of latestByScenario.values()) {
    if (!lastRunTs || Date.parse(v.ts) > Date.parse(lastRunTs)) lastRunTs = v.ts;
  }
  const fail = failScenarios.size;
  const pass = Math.max(0, ticketScenarios.length - fail);

  // Top classification (most-recent failure's class wins for the chip)
  let topClassification: string | undefined;
  let topConfidence: string | undefined;
  let topTs = 0;
  for (const f of Object.values(snap.latest_failures)) {
    if (!scenarioIds.has(f.scenarioId)) continue;
    const t2 = Date.parse(f.ts);
    if (t2 > topTs && f.classification) {
      topTs = t2;
      topClassification = f.classification;
      topConfidence = f.confidence;
    }
  }

  // Priority — max over scenarios
  let topPriority: 'p0' | 'p1' | 'p2' | undefined;
  let topRank = 0;
  for (const s of ticketScenarios) {
    const r = PRIORITY_RANK[s.priority] ?? 0;
    if (r > topRank) {
      topRank = r;
      topPriority = s.priority;
    }
  }

  // AC coverage
  const acsForTicket = Object.values(acNodesAll)
    .filter((a) => a.ticketId === ticketId)
    .sort((a, b) => a.index - b.index);
  const satisfiedByAcId = new Set(
    snap.edges.filter((e) => e.kind === 'satisfies' && scenarioIds.has(e.from)).map((e) => e.to),
  );
  const acCoveredIdx: number[] = [];
  const acUncoveredIdx: number[] = [];
  for (const a of acsForTicket) {
    if (satisfiedByAcId.has(a.id)) acCoveredIdx.push(a.index);
    else acUncoveredIdx.push(a.index);
  }

  // Linked entities — POMs used by this ticket's scenarios
  const pomIds = new Set<string>();
  for (const e of snap.edges) {
    if (e.kind === 'uses' && scenarioIds.has(e.from) && snap.poms[e.to]) {
      pomIds.add(e.to);
    }
  }
  const poms = Array.from(pomIds).map((id) => {
    const p = snap.poms[id]!;
    return { id, fileName: p.filePath.split('/').pop() ?? id, route: p.route };
  });

  // Areas — from ticket.modifiesAreas, decorated with coverage status if available
  const areaCovById = new Map<
    string,
    { status: 'COVERED' | 'UNCOVERED' | 'STALE'; risk: number }
  >();
  if (coverage?.report?.areas) {
    for (const a of coverage.report.areas) {
      areaCovById.set(a.id, { status: a.status, risk: a.risk });
    }
  }
  const areas = t.modifiesAreas.map((id) => {
    const c = areaCovById.get(id);
    return c ? { id, status: c.status, risk: c.risk } : { id };
  });

  // Linked tickets — jira-linked edges incident to this ticket
  const linkedTickets: Array<{ id: string; source: string }> = [];
  for (const e of snap.edges) {
    if (e.kind !== 'jira-linked') continue;
    if (e.from === ticketId && snap.tickets[e.to]) {
      linkedTickets.push({ id: e.to, source: e.source });
    } else if (e.to === ticketId && snap.tickets[e.from]) {
      linkedTickets.push({ id: e.from, source: e.source });
    }
  }

  // Freshness
  const latestScenarioAt = ticketScenarios
    .map((s) => s.generatedAt)
    .sort()
    .pop();

  const meta: TicketMeta = {
    runStats: { total: ticketScenarios.length, pass, fail },
    failureMix,
    acTotal: acsForTicket.length,
    acCoveredIdx,
    acUncoveredIdx,
    poms,
    areas,
    linkedTickets,
    fetchedAt: t.fetchedAt,
    scenarioCount: ticketScenarios.length,
  };
  if (lastRunTs) meta.runStats.lastRunTs = lastRunTs;
  if (topClassification) meta.topClassification = topClassification;
  if (topConfidence) meta.topConfidence = topConfidence;
  if (topPriority) meta.topPriority = topPriority;
  if (latestScenarioAt) meta.latestScenarioAt = latestScenarioAt;
  return meta;
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

function buildFailureNode(snap: Snapshot, failure: FailureNode): VisNode {
  // scenarioId is a content hash; surface the human-readable scenario name
  // instead so QA sees "Successful login redirects to dashboard" rather than
  // "bd911645a4a5d5…" in the tooltip + click panel.
  const scenarioName = snap.scenarios[failure.scenarioId]?.name ?? failure.scenarioId;

  const titleParts: string[] = [`failure on "${scenarioName}" @ ${failure.ts}`];
  if (failure.classification) {
    const conf = failure.confidence ? ` (${failure.confidence})` : '';
    titleParts.push(`classification: ${failure.classification}${conf}`);
  }
  titleParts.push(`runId: ${failure.runId}`);
  if (failure.disputed) titleParts.push('disputed by QA');
  if (failure.traceId) titleParts.push(`trace: ${failure.traceId}`);

  const meta: NonNullable<VisNode['meta']> = {
    scenarioName,
    runId: failure.runId,
    ts: failure.ts,
  };
  if (failure.classification) meta.classification = failure.classification;
  if (failure.confidence) meta.confidence = failure.confidence;
  if (failure.disputed) meta.disputed = true;
  if (failure.traceId) meta.traceId = failure.traceId;

  const node: VisNode = {
    id: failure.id,
    label: failure.classification ?? 'fail',
    group: 'Failure',
    color: COLORS.failure,
    shape: 'triangle',
    size: 10,
    title: titleParts.join(' · '),
    meta,
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
  coverage?: CoverageInput,
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

  for (const id of includeTickets) nodes.push(buildTicketNode(snap, id, coverage));
  for (const id of includeScenarios) nodes.push(buildScenarioNode(snap, id));
  for (const id of includePoms) nodes.push(buildPomNode(snap, id));
  for (const id of includeAreas) nodes.push(buildAreaNode(snap, id));

  // Failure → Scenario edges are not persisted in snap.edges (store only emits
  // tests/uses/covers/modifies/jira-linked/similar/satisfies); synthesize them
  // here so vis-network has an anchor and triangles don't drift off-canvas.
  // Spec §2 (data model) defines `ran: Failure → Scenario` for exactly this.
  let syntheticEdgeIdx = snap.edges.length;
  for (const failure of Object.values(snap.latest_failures)) {
    if (includeScenarios.has(failure.scenarioId)) {
      nodes.push(buildFailureNode(snap, failure));
      edges.push(
        buildEdge(
          {
            kind: 'ran',
            from: failure.id,
            to: failure.scenarioId,
            source: 'synthetic',
            discoveredAt: failure.ts,
          },
          syntheticEdgeIdx++,
        ),
      );
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
