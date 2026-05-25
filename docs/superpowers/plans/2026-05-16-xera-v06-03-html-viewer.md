# xera v0.6.3 — HTML Viewer + CI Artifact — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the manager-facing artefact of the xera v0.6 graph initiative — a single self-contained HTML file (`.xera/graph.html`) that visualizes the project knowledge graph as a force-directed network. CI publishes it as a per-PR artifact + sticky comment so managers and reviewers can click a link in the PR thread without needing to clone the repo.

**Architecture:** New module `packages/core/src/graph/render.ts` transforms a `Snapshot` into a `vis-network`–compatible node/edge dataset, then injects it into a templated HTML shell with vendored `vis-network.min.js` (Apache-2.0, ~200 KB) inlined. New `bin-internal/graph-render.ts` subcommand wraps the module: reads snapshot, applies optional filters (`--since`, `--ticket`, `--depth`), writes `.xera/graph.html` (atomic). Vanilla JS interaction handlers (click → ego-graph highlight, right-click → context menu, filter pane) live in a separate template file inlined at render time. A new GitHub Actions step in `.github/workflows/ci.yml` runs the render, uploads `.xera/graph.html` as an artifact, and posts a sticky PR comment with the artifact link. A scaffold template `packages/cli/templates/xera-graph.yml.template` ships the same workflow snippet to consumer projects via `xera init`.

**Tech Stack:** Node runtime, TypeScript strict, `vitest`, vanilla DOM JS (no framework), vendored `vis-network@9.x` (Apache-2.0), GitHub Actions (`actions/upload-artifact@v4`, `actions/github-script@v7`).

**Spec:** `docs/superpowers/specs/2026-05-16-xera-v06-project-knowledge-graph-design.md` §7 (HTML viewer), §11.5 (CI artifact), §11.6 (disputed runs visual marker)

**Builds on:** v0.6.0 + v0.6.1 + v0.6.2 (all merged) — graph foundation, TEST_OUTDATED + dispute events, impact analysis. v0.6.3 closes the v0.6 release train.

**Scope decisions:**
- The `--since` and `--ticket` filters are implemented via post-snapshot filtering in `render.ts` (not by re-deriving the snapshot). This keeps `bin-internal/graph-render.ts` simple.
- Performance modes (>500 nodes / >2000 nodes) are decided by `render.ts` and shape the inline JS payload; the HTML viewer auto-switches modes client-side based on the embedded data.
- Disputed runs (events of type `classification.disputed` from v0.6.1) are surfaced as a red dashed outline on the affected `Failure` nodes; out-of-scope for this release: dispute history sidebar.

---

## File Structure

### New files

**`packages/core/src/graph/`** — extending the v0.6 module
- `render.ts` — `transformForVisNetwork(snapshot, opts)` → `{ nodes: VisNode[], edges: VisEdge[], stats: GraphStats }`; `renderHtml({ data, generatedAt })` → string (templated HTML); `RenderOpts` type with `since`, `ticketId`, `depth`, `performanceMode` fields.
- `templates/graph.html.template` — HTML shell with `{{CSS}}`, `{{STATS}}`, `{{GENERATED_AT}}`, `{{VIS_NETWORK_JS}}`, `{{GRAPH_DATA}}`, `{{INTERACTION_JS}}` placeholders.
- `templates/graph.css` — Inlined styles: top-bar, canvas, side-panel, filter chips.
- `templates/graph.js` — Interaction handlers (click, right-click, hover, filter, ego-graph highlight).
- `templates/vis-network.min.js` — Vendored `vis-network@9.1.x` UMD build (Apache-2.0). ~200 KB minified.
- `templates/LICENSE-vis-network.txt` — Apache-2.0 license text from upstream `vis-network` repo.

**`packages/core/src/bin-internal/`** — new subcommand
- `graph-render.ts` — `xera-internal graph-render [--since <duration>] [--ticket <id>] [--depth N] [--out <path>]`. Loads snapshot, calls render module, writes `.xera/graph.html` (or `--out` path) atomically.

**`packages/core/test/graph/`** — new tests
- `render.test.ts` — Unit tests for `transformForVisNetwork` (node/edge mapping, styling rules, depth filter, performance modes); `renderHtml` (template substitution, valid HTML structure, embedded `window.__GRAPH__` JSON parses correctly).

**`packages/core/test/bin-internal/`** — new tests
- `graph-render.test.ts` — Subcommand writes `.xera/graph.html`, `--out` flag, `--ticket` flag, exit codes.

**`packages/cli/templates/`** — new scaffold template
- `xera-graph.yml.template` — GitHub Actions workflow snippet. Consumer projects get this in `.github/workflows/xera-graph.yml` after `xera init`.

**`fixtures/golden-graph/`** — extending v0.6.0 golden fixtures
- `viewer-empty/` — Tiny graph (1 ticket, 0 scenarios) → `renderHtml` produces empty-state HTML.
- `viewer-with-disputes/` — Graph with at least 1 `classification.disputed` event → `renderHtml` adds red-outline marker on the failure node.

### Modified files

- `packages/core/src/graph/index.ts` — Export `transformForVisNetwork`, `renderHtml`, `RenderOpts`, `VisNode`, `VisEdge`, `GraphStats`.
- `packages/core/src/bin-internal/index.ts` — Register `graph-render` in `COMMANDS`.
- `.github/workflows/ci.yml` — Add `graph-viewer` job that builds + uploads + comments.
- `packages/cli/src/commands/init.ts` — Copy `xera-graph.yml.template` into consumer's `.github/workflows/xera-graph.yml`.
- `packages/cli/src/commands/init-update.ts` — Same.
- `packages/cli/templates/.gitignore.template` (or equivalent in `init.ts` gitignore array) — Ensure `.xera/graph.html` is gitignored (already done in v0.6.0 via `init.ts:96`).
- `packages/core/package.json` — Bump 0.4.2 → 0.4.3.
- `packages/skills/version.json` — Bump skills 0.4.2 → 0.4.3 (CHANGELOG-only bump per spec; no skill text changes).
- `packages/skills/package.json` — Bump version.
- `packages/cli/package.json` — Patch bump + caret bumps to ^0.4.3.
- `packages/cli/src/commands/init.ts` — Bump `@xera-ai/core` caret to `^0.4.3`.
- `packages/cli/src/commands/init-update.ts` — Same.
- `docs/CONFIGURATION.md` — Append "HTML viewer" section explaining `npx xera-internal graph-render` flags.
- `docs/TROUBLESHOOTING.md` — Append "Viewer too slow / blank" entry.
- `README.md` — Update v0.6 roadmap: mark v0.6.3 as shipped (the project knowledge graph rollout completes).

---

## Task 1: Vendor `vis-network.min.js` + Apache-2.0 license

**Files:**
- Create: `packages/core/src/graph/templates/vis-network.min.js`
- Create: `packages/core/src/graph/templates/LICENSE-vis-network.txt`

- [ ] **Step 1: Create templates directory**

```bash
mkdir -p /home/user/xera/packages/core/src/graph/templates
```

- [ ] **Step 2: Download `vis-network@9.1.10` UMD bundle**

Use `npm install` to fetch the package locally then copy the dist file (we don't make `vis-network` a runtime dep — we vendor a snapshot):

```bash
cd /tmp && rm -rf vis-fetch && mkdir vis-fetch && cd vis-fetch
npm install vis-network@9.1.10
cp node_modules/vis-network/standalone/umd/vis-network.min.js \
   /home/user/xera/packages/core/src/graph/templates/vis-network.min.js
```

If npm fetch is unavailable in this environment, fall back to the GitHub release tarball:

```bash
curl -L -o /tmp/vis-network.tgz \
  https://registry.npmjs.org/vis-network/-/vis-network-9.1.10.tgz
tar -xzf /tmp/vis-network.tgz -C /tmp
cp /tmp/package/standalone/umd/vis-network.min.js \
   /home/user/xera/packages/core/src/graph/templates/vis-network.min.js
```

Verify the file exists and is roughly the right size:

```bash
ls -la /home/user/xera/packages/core/src/graph/templates/vis-network.min.js
# Expected: ~600-800 KB (the full vis-network bundle includes more than the network module)
```

If the file is much smaller (<100 KB) or much larger (>2 MB), abort — wrong file.

- [ ] **Step 3: Save Apache-2.0 license text**

```bash
curl -L -o /home/user/xera/packages/core/src/graph/templates/LICENSE-vis-network.txt \
  https://raw.githubusercontent.com/visjs/vis-network/master/LICENSE-APACHE-2.0
```

Verify it contains "Apache License" and "Version 2.0":

```bash
grep -c "Apache License\|Version 2.0" /home/user/xera/packages/core/src/graph/templates/LICENSE-vis-network.txt
```

Expected: ≥ 2.

- [ ] **Step 4: Commit**

```bash
git add packages/core/src/graph/templates/vis-network.min.js \
        packages/core/src/graph/templates/LICENSE-vis-network.txt
git commit -m "core: vendor vis-network@9.1.10 UMD bundle + Apache-2.0 license (v0.6.3)"
```

---

## Task 2: `render.ts` core — `transformForVisNetwork` — TDD

**Files:**
- Create: `packages/core/src/graph/render.ts`
- Create: `packages/core/test/graph/render.test.ts`

- [ ] **Step 1: Write failing test**

Create `packages/core/test/graph/render.test.ts`:

```typescript
import { describe, expect, test } from 'vitest';
import { transformForVisNetwork } from '../../src/graph/render';
import type { Snapshot } from '../../src/graph/types';

function mkSnapshot(): Snapshot {
  return {
    schema_version: 1, generated_at: '2026-05-16T00:00:00Z',
    event_count: 4, events_hash: 'sha256:test',
    tickets: {
      'ABC-100': { id: 'ABC-100', summary: 'login feature', ac: ['AC1'], storyHash: 'h1', modifiesAreas: ['login'], fetchedAt: '2026-05-10T00:00:00Z' },
      'ABC-200': { id: 'ABC-200', summary: 'rename Sign in', ac: ['Button = Log in'], storyHash: 'h2', modifiesAreas: ['login'], fetchedAt: '2026-05-15T00:00:00Z' },
    },
    scenarios: {
      'sc-100': { id: 'sc-100', ticketId: 'ABC-100', name: 'user signs in', gherkin: 'g', priority: 'p0', featureHash: 'f1', generatedAt: '2026-05-10T00:00:00Z' },
    },
    poms: {
      'pom-login': { id: 'pom-login', ticketId: 'ABC-100', filePath: 'login.ts', route: '/login', locators: [], scope: 'shared' },
    },
    areas: { login: { id: 'login' } },
    edges: [
      { kind: 'tests', from: 'ABC-100', to: 'sc-100', source: 'xera-script', discoveredAt: '2026-05-10T00:00:00Z' },
      { kind: 'uses', from: 'sc-100', to: 'pom-login', source: 'xera-script', discoveredAt: '2026-05-10T00:00:00Z' },
      { kind: 'covers', from: 'pom-login', to: 'login', source: 'xera-script', discoveredAt: '2026-05-10T00:00:00Z' },
      { kind: 'modifies', from: 'ABC-200', to: 'login', source: 'extract-areas', discoveredAt: '2026-05-15T00:00:00Z' },
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
      id: 'fail-1', scenarioId: 'sc-100', runId: 'r1', ts: '2026-05-15T00:00:00Z',
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
```

- [ ] **Step 2: Run to fail**

Run: `cd /home/user/xera/packages/core && npx vitest run test/graph/render.test.ts`
Expected: FAIL — cannot import.

- [ ] **Step 3: Implement `render.ts`**

Create `packages/core/src/graph/render.ts`:

```typescript
import type { Snapshot, EdgeRecord } from './types';

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
  since?: string;        // ISO8601 cutoff
  ticketId?: string;     // ego-graph centered on this ticket
  depth?: 1 | 2 | 3;     // traversal depth for ego-graph
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
  return {
    id: t.id,
    label: t.id,
    group: 'Ticket',
    color: COLORS.ticket,
    shape: 'dot',
    size: 10 + Math.min(usageCount * 2, 20),
    title: `${t.id} — ${t.summary}`,
  };
}

function buildScenarioNode(snap: Snapshot, scenarioId: string): VisNode {
  const s = snap.scenarios[scenarioId]!;
  const failed = snap.latest_failures[scenarioId];
  const sizeBase = s.priority === 'p0' ? 14 : s.priority === 'p1' ? 11 : 9;
  return {
    id: s.id,
    label: s.name,
    group: 'Scenario',
    color: failed ? COLORS.scenarioFail : COLORS.scenarioPass,
    shape: 'square',
    size: sizeBase,
    title: `${s.ticketId} / ${s.name} [${s.priority.toUpperCase()}]`,
  };
}

function buildPomNode(snap: Snapshot, pomId: string): VisNode {
  const p = snap.poms[pomId]!;
  const usageCount = snap.edges.filter((e) => e.kind === 'uses' && e.to === pomId).length;
  return {
    id: p.id,
    label: p.filePath.split('/').pop() ?? p.id,
    group: 'POM',
    color: COLORS.pom,
    shape: 'diamond',
    size: 8 + Math.min(usageCount * 2, 16),
    title: `${p.filePath} (${p.route || 'no route'})`,
  };
}

function buildAreaNode(snap: Snapshot, areaId: string): VisNode {
  const a = snap.areas[areaId]!;
  return {
    id: a.id,
    label: a.id,
    group: 'SUTArea',
    color: COLORS.area,
    shape: 'hexagon',
    size: 12,
    title: `area: ${a.id}`,
  };
}

function buildFailureNode(_snap: Snapshot, failure: { id: string; scenarioId: string; runId: string; ts: string }): VisNode {
  return {
    id: failure.id,
    label: 'fail',
    group: 'Failure',
    color: COLORS.failure,
    shape: 'triangle',
    size: 10,
    title: `failure on ${failure.scenarioId} @ ${failure.ts}`,
  };
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
    case 'tests':
    case 'uses':
    case 'covers':
    case 'ran':
    default:
      v.color = COLORS.edgeDefault;
      break;
  }
  return v;
}

function bfsFromTicket(snap: Snapshot, ticketId: string, depth: number): { nodeIds: Set<string>; edgeIdxs: Set<number> } {
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

export function transformForVisNetwork(snap: Snapshot, opts: RenderOpts): {
  nodes: VisNode[]; edges: VisEdge[]; stats: GraphStats;
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
    includeTickets = new Set(Object.keys(snap.tickets).filter((id) => ticketsAfter(opts.since, snap.tickets[id]!.fetchedAt)));
    includeScenarios = new Set(Object.keys(snap.scenarios).filter((id) => scenariosAfter(opts.since, snap.scenarios[id]!.generatedAt)));
    includePoms = new Set(Object.keys(snap.poms));
    includeAreas = new Set(Object.keys(snap.areas));
    snap.edges.forEach((_, i) => includeEdgeIdxs.add(i));
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
```

- [ ] **Step 4: Run tests, verify pass**

Run: `cd /home/user/xera/packages/core && npx vitest run test/graph/render.test.ts && npm run typecheck`
Expected: 10 tests pass; typecheck clean.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/graph/render.ts \
        packages/core/test/graph/render.test.ts
git commit -m "core: add transformForVisNetwork (snapshot → vis-network format) (v0.6.3)"
```

---

## Task 3: HTML template + CSS + JS

**Files:**
- Create: `packages/core/src/graph/templates/graph.html.template`
- Create: `packages/core/src/graph/templates/graph.css`
- Create: `packages/core/src/graph/templates/graph.js`

- [ ] **Step 1: Create `graph.html.template`**

Create `packages/core/src/graph/templates/graph.html.template`:

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>xera graph — {{GENERATED_AT}}</title>
  <style>{{CSS}}</style>
</head>
<body>
  <header id="topbar">
    <div class="title">xera graph</div>
    <div class="stats">{{STATS}}</div>
    <div class="filters">
      <input type="text" id="search" placeholder="search…" />
      <label><input type="checkbox" id="filter-pass" checked> pass</label>
      <label><input type="checkbox" id="filter-fail" checked> fail</label>
      <label><input type="checkbox" id="filter-p0" checked> P0</label>
      <button id="reset">reset</button>
    </div>
  </header>
  <main id="canvas"></main>
  <aside id="sidepanel" class="hidden">
    <h3 id="sp-title"></h3>
    <p id="sp-desc"></p>
    <div id="sp-actions"></div>
  </aside>
  <footer id="footer">generated {{GENERATED_AT}} · double-click a node to open · right-click for options</footer>
  <script>{{VIS_NETWORK_JS}}</script>
  <script>window.__GRAPH__ = {{GRAPH_DATA}};</script>
  <script>{{INTERACTION_JS}}</script>
</body>
</html>
```

- [ ] **Step 2: Create `graph.css`**

Create `packages/core/src/graph/templates/graph.css`:

```css
* { box-sizing: border-box; }
body { margin: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; height: 100vh; display: grid; grid-template-rows: 56px 1fr 32px; grid-template-columns: 1fr 320px; }
#topbar { grid-column: 1 / -1; display: flex; align-items: center; gap: 16px; padding: 0 16px; background: #1F2937; color: #F9FAFB; border-bottom: 1px solid #374151; }
#topbar .title { font-weight: 600; font-size: 16px; }
#topbar .stats { color: #9CA3AF; font-size: 13px; flex: 1; }
#topbar .filters { display: flex; gap: 8px; align-items: center; font-size: 13px; }
#topbar input[type=text] { background: #111827; color: #F9FAFB; border: 1px solid #374151; border-radius: 4px; padding: 4px 8px; width: 160px; }
#topbar button { background: #374151; color: #F9FAFB; border: none; border-radius: 4px; padding: 4px 12px; cursor: pointer; }
#topbar button:hover { background: #4B5563; }
#canvas { background: #FAFBFC; position: relative; }
#sidepanel { background: #FFFFFF; border-left: 1px solid #E5E7EB; padding: 16px; overflow-y: auto; }
#sidepanel.hidden { display: none; }
#sidepanel h3 { margin: 0 0 8px; font-size: 14px; }
#sidepanel p { margin: 0 0 12px; font-size: 13px; color: #4B5563; }
#footer { grid-column: 1 / -1; background: #F3F4F6; padding: 6px 16px; font-size: 11px; color: #6B7280; border-top: 1px solid #E5E7EB; }
.disputed-outline { border: 2px dashed #EF4444 !important; }
```

- [ ] **Step 3: Create `graph.js`**

Create `packages/core/src/graph/templates/graph.js`:

```javascript
(function () {
  var data = window.__GRAPH__ || { nodes: [], edges: [] };
  var container = document.getElementById('canvas');
  if (!container || typeof vis === 'undefined') {
    document.body.innerHTML = '<p style="padding:20px;color:#6B7280">Failed to load vis-network. Check console.</p>';
    return;
  }

  var nodes = new vis.DataSet(data.nodes);
  var edges = new vis.DataSet(data.edges);
  var network = new vis.Network(container, { nodes: nodes, edges: edges }, {
    physics: { stabilization: { iterations: 200 } },
    interaction: { hover: true, navigationButtons: true, keyboard: true },
    edges: { smooth: { type: 'continuous', forceDirection: 'none', roundness: 0.4 }, font: { size: 9, color: '#6B7280' } },
    nodes: { font: { size: 11, color: '#1F2937' } },
  });

  var sidepanel = document.getElementById('sidepanel');
  var spTitle = document.getElementById('sp-title');
  var spDesc = document.getElementById('sp-desc');
  var spActions = document.getElementById('sp-actions');

  network.on('click', function (params) {
    if (params.nodes.length === 0) {
      sidepanel.classList.add('hidden');
      return;
    }
    var nodeId = params.nodes[0];
    var node = nodes.get(nodeId);
    spTitle.textContent = node.label;
    spDesc.textContent = node.title || '';
    spActions.innerHTML = '';
    if (node.group === 'Ticket') {
      var btn = document.createElement('button');
      btn.textContent = 'Copy /xera-impact command';
      btn.onclick = function () {
        navigator.clipboard && navigator.clipboard.writeText('/xera-impact ' + nodeId);
      };
      spActions.appendChild(btn);
    }
    sidepanel.classList.remove('hidden');

    // Highlight ego-graph (depth 2)
    var connected = network.getConnectedNodes(nodeId);
    var connected2 = [];
    connected.forEach(function (id) {
      Array.prototype.push.apply(connected2, network.getConnectedNodes(id));
    });
    var keep = new Set([nodeId].concat(connected).concat(connected2));
    nodes.forEach(function (n) {
      var update = { id: n.id, opacity: keep.has(n.id) ? 1 : 0.2 };
      nodes.update(update);
    });
  });

  document.getElementById('reset').onclick = function () {
    nodes.forEach(function (n) {
      nodes.update({ id: n.id, opacity: 1 });
    });
    sidepanel.classList.add('hidden');
    network.fit();
  };

  document.getElementById('search').oninput = function (e) {
    var q = e.target.value.toLowerCase();
    if (!q) {
      nodes.forEach(function (n) {
        nodes.update({ id: n.id, opacity: 1 });
      });
      return;
    }
    nodes.forEach(function (n) {
      var matches = (n.label || '').toLowerCase().includes(q) || (n.id || '').toLowerCase().includes(q);
      nodes.update({ id: n.id, opacity: matches ? 1 : 0.2 });
    });
  };

  ['filter-pass', 'filter-fail', 'filter-p0'].forEach(function (id) {
    document.getElementById(id).onchange = function () {
      var pass = document.getElementById('filter-pass').checked;
      var fail = document.getElementById('filter-fail').checked;
      var p0Only = !document.getElementById('filter-p0').checked ? false : false; // toggle: when checked = show all priorities, when unchecked = P0 only
      nodes.forEach(function (n) {
        if (n.group !== 'Scenario') return;
        var visible = true;
        if (n.color === '#10B981' && !pass) visible = false;
        if (n.color === '#EF4444' && !fail) visible = false;
        nodes.update({ id: n.id, hidden: !visible });
      });
    };
  });
})();
```

- [ ] **Step 4: Verify files exist**

```bash
ls /home/user/xera/packages/core/src/graph/templates/
```

Expected output: `LICENSE-vis-network.txt  graph.css  graph.html.template  graph.js  vis-network.min.js`.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/graph/templates/graph.html.template \
        packages/core/src/graph/templates/graph.css \
        packages/core/src/graph/templates/graph.js
git commit -m "core: add graph viewer templates (HTML + CSS + JS) (v0.6.3)"
```

---

## Task 4: `renderHtml` template substitution + barrel export — TDD

**Files:**
- Modify: `packages/core/src/graph/render.ts` — add `renderHtml()` function
- Modify: `packages/core/src/graph/index.ts` — export render APIs
- Modify: `packages/core/test/graph/render.test.ts` — add `renderHtml` tests

- [ ] **Step 1: Add failing tests for `renderHtml`**

Append to `packages/core/test/graph/render.test.ts`:

```typescript
import { renderHtml } from '../../src/graph/render';

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
```

- [ ] **Step 2: Run to fail**

Run: `cd /home/user/xera/packages/core && npx vitest run test/graph/render.test.ts -t renderHtml`
Expected: FAIL.

- [ ] **Step 3: Implement `renderHtml`**

Append to `packages/core/src/graph/render.ts`:

```typescript
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const TEMPLATES_DIR = join(__dirname, 'templates');

function loadTemplate(name: string): string {
  return readFileSync(join(TEMPLATES_DIR, name), 'utf8');
}

function statsToHuman(s: GraphStats): string {
  return `${s.tickets} tickets · ${s.scenarios} scenarios · ${s.poms} POMs · ${s.edges} edges`;
}

export interface RenderHtmlInput {
  data: { nodes: VisNode[]; edges: VisEdge[] };
  stats: GraphStats;
  generatedAt: string;
}

export function renderHtml(input: RenderHtmlInput): string {
  const template = loadTemplate('graph.html.template');
  const css = loadTemplate('graph.css');
  const js = loadTemplate('graph.js');
  const visNetwork = loadTemplate('vis-network.min.js');

  const graphJson = JSON.stringify(input.data);
  const statsHuman = statsToHuman(input.stats);

  return template
    .replace('{{CSS}}', css)
    .replace('{{STATS}}', statsHuman)
    .replace('{{GENERATED_AT}}', input.generatedAt)
    .replace('{{VIS_NETWORK_JS}}', visNetwork)
    .replace('{{GRAPH_DATA}}', graphJson)
    .replace('{{INTERACTION_JS}}', js);
}
```

- [ ] **Step 4: Add render exports to barrel**

Edit `packages/core/src/graph/index.ts`. Append:

```typescript
export {
  transformForVisNetwork,
  renderHtml,
} from './render';
export type {
  GraphStats,
  RenderHtmlInput,
  RenderOpts,
  VisEdge,
  VisNode,
} from './render';
```

- [ ] **Step 5: Run tests, verify pass**

Run: `cd /home/user/xera/packages/core && npx vitest run test/graph/render.test.ts && npm run typecheck`
Expected: 14 tests pass (10 transform + 4 renderHtml); typecheck clean.

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/graph/render.ts \
        packages/core/src/graph/index.ts \
        packages/core/test/graph/render.test.ts
git commit -m "core: add renderHtml template substitution + barrel exports (v0.6.3)"
```

---

## Task 5: `graph-render` bin-internal subcommand — TDD

**Files:**
- Create: `packages/core/src/bin-internal/graph-render.ts`
- Create: `packages/core/test/bin-internal/graph-render.test.ts`
- Modify: `packages/core/src/bin-internal/index.ts` — register

- [ ] **Step 1: Write failing test**

Create `packages/core/test/bin-internal/graph-render.test.ts`:

```typescript
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { graphRenderCmd } from '../../src/bin-internal/graph-render';
import { appendEvents } from '../../src/graph/store';
import { ulid } from '../../src/graph/ulid';
import type { Event } from '../../src/graph/types';

let root: string; let prevCwd: string;

beforeEach(() => {
  prevCwd = process.cwd();
  root = mkdtempSync(join(tmpdir(), 'xera-render-'));
  process.chdir(root);
});
afterEach(() => {
  process.chdir(prevCwd);
  rmSync(root, { recursive: true, force: true });
});

function seedSmallGraph() {
  appendEvents(root, [{
    event_id: ulid(), schema_version: 1, ts: '2026-05-16T00:00:00Z', actor: 'test',
    type: 'ticket.fetched',
    payload: { ticketId: 'ABC-1', summary: 'login', ac: [], jiraLinks: [], storyHash: 'h', modifiesAreas: ['login'] },
  } as any], { skill: 'test', ticketId: 'ABC-1' });
}

describe('graph-render', () => {
  test('writes .xera/graph.html with embedded graph data', async () => {
    seedSmallGraph();
    const exit = await graphRenderCmd([]);
    expect(exit).toBe(0);
    const htmlPath = join(root, '.xera/graph.html');
    expect(existsSync(htmlPath)).toBe(true);
    const html = readFileSync(htmlPath, 'utf8');
    expect(html).toMatch(/^<!DOCTYPE html>/);
    expect(html).toContain('ABC-1');
  });

  test('--out flag writes to custom path', async () => {
    seedSmallGraph();
    const customOut = join(root, 'custom.html');
    const exit = await graphRenderCmd(['--out', customOut]);
    expect(exit).toBe(0);
    expect(existsSync(customOut)).toBe(true);
  });

  test('--ticket filter narrows to one ticket', async () => {
    appendEvents(root, [
      { event_id: ulid(), schema_version: 1, ts: '2026-05-16T00:00:00Z', actor: 't', type: 'ticket.fetched',
        payload: { ticketId: 'ABC-1', summary: 'A', ac: [], jiraLinks: [], storyHash: 'h', modifiesAreas: [] } },
      { event_id: ulid(), schema_version: 1, ts: '2026-05-16T00:00:00Z', actor: 't', type: 'ticket.fetched',
        payload: { ticketId: 'ABC-2', summary: 'B', ac: [], jiraLinks: [], storyHash: 'h', modifiesAreas: [] } },
    ] as any, { skill: 't', ticketId: 'ABC-1' });
    const exit = await graphRenderCmd(['--ticket', 'ABC-1']);
    expect(exit).toBe(0);
    const html = readFileSync(join(root, '.xera/graph.html'), 'utf8');
    // Only ABC-1 should be in the embedded graph data; ABC-2 excluded
    const match = html.match(/window\.__GRAPH__\s*=\s*(\{[\s\S]*?\});/);
    expect(match).not.toBeNull();
    expect(match![1]!).toContain('ABC-1');
    expect(match![1]!).not.toContain('ABC-2');
  });

  test('exits 0 when graph empty (no events)', async () => {
    const exit = await graphRenderCmd([]);
    expect(exit).toBe(0);
    expect(existsSync(join(root, '.xera/graph.html'))).toBe(true);
  });
});
```

- [ ] **Step 2: Run to fail**

Run: `cd /home/user/xera/packages/core && npx vitest run test/bin-internal/graph-render.test.ts`
Expected: FAIL — cannot import.

- [ ] **Step 3: Implement `graph-render.ts`**

Create `packages/core/src/bin-internal/graph-render.ts`:

```typescript
import { mkdirSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { renderHtml, transformForVisNetwork } from '../graph/render';
import { deriveSnapshot, loadAllEvents } from '../graph/store';
import type { RenderOpts } from '../graph/render';

function parseDepth(s: string | undefined): 1 | 2 | 3 {
  const n = s ? Number.parseInt(s, 10) : 2;
  if (n === 1 || n === 3) return n;
  return 2;
}

function decidePerformanceMode(nodeCount: number): 'full' | 'ticket-only' | 'text-fallback' {
  if (nodeCount > 2000) return 'text-fallback';
  if (nodeCount > 500) return 'ticket-only';
  return 'full';
}

export async function graphRenderCmd(argv: string[]): Promise<number> {
  let outPath: string | undefined;
  let ticketId: string | undefined;
  let since: string | undefined;
  let depth: 1 | 2 | 3 = 2;

  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--out') outPath = argv[++i];
    else if (argv[i] === '--ticket') ticketId = argv[++i];
    else if (argv[i] === '--since') since = argv[++i];
    else if (argv[i] === '--depth') depth = parseDepth(argv[++i]);
  }

  const repoRoot = process.cwd();
  const finalPath = outPath ?? join(repoRoot, '.xera/graph.html');

  const snap = deriveSnapshot(loadAllEvents(repoRoot));
  const totalNodeCount = Object.keys(snap.tickets).length + Object.keys(snap.scenarios).length + Object.keys(snap.poms).length + Object.keys(snap.areas).length;
  const performanceMode = decidePerformanceMode(totalNodeCount);

  if (performanceMode === 'text-fallback') {
    const txtPath = finalPath.replace(/\.html$/, '.txt');
    mkdirSync(dirname(txtPath), { recursive: true });
    writeFileSync(txtPath, `Graph too large for HTML viewer (${totalNodeCount} nodes). Use 'xera:graph-query --format text' instead.\n`);
    console.log(`[graph-render] graph too large (${totalNodeCount} nodes); wrote ${txtPath}`);
    return 0;
  }

  const opts: RenderOpts = { depth, performanceMode };
  if (ticketId) opts.ticketId = ticketId;
  if (since) opts.since = since;

  const data = transformForVisNetwork(snap, opts);
  const html = renderHtml({ data, stats: data.stats, generatedAt: new Date().toISOString() });

  mkdirSync(dirname(finalPath), { recursive: true });
  const tmpPath = finalPath + '.tmp';
  writeFileSync(tmpPath, html);
  renameSync(tmpPath, finalPath);

  console.log(`[graph-render] wrote ${finalPath} (${data.stats.tickets} tickets · ${data.stats.scenarios} scenarios · ${html.length} bytes)`);
  return 0;
}
```

- [ ] **Step 4: Register in `index.ts`**

Edit `packages/core/src/bin-internal/index.ts`. Add import + dispatch entry:

```typescript
import { graphRenderCmd } from './graph-render';
// ...
'graph-render': graphRenderCmd,
```

- [ ] **Step 5: Run tests, verify pass**

Run: `cd /home/user/xera/packages/core && npx vitest run test/bin-internal/graph-render.test.ts && npm run typecheck`
Expected: 4 tests pass.

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/bin-internal/graph-render.ts \
        packages/core/src/bin-internal/index.ts \
        packages/core/test/bin-internal/graph-render.test.ts
git commit -m "core: add graph-render bin-internal (v0.6.3)"
```

---

## Task 6: CI workflow — publish viewer artifact

**Files:**
- Modify: `.github/workflows/ci.yml`

- [ ] **Step 1: Read existing CI workflow**

Run: `cat /home/user/xera/.github/workflows/ci.yml`

- [ ] **Step 2: Add `graph-viewer` job**

Append a new job to `.github/workflows/ci.yml` (preserve existing `test` job):

```yaml
  graph-viewer:
    needs: test
    if: github.event_name == 'pull_request'
    runs-on: ubuntu-latest
    permissions:
      contents: read
      pull-requests: write
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22 }
      - run: npm ci
      - name: Build graph snapshot
        run: npm run --cwd packages/core xera-internal graph-snapshot
        continue-on-error: true
      - name: Render graph viewer
        run: npm run --cwd packages/core xera-internal graph-render --out ${{ github.workspace }}/graph.html
        continue-on-error: true
      - name: Upload viewer
        uses: actions/upload-artifact@v4
        if: hashFiles('graph.html') != ''
        with:
          name: xera-graph
          path: graph.html
          retention-days: 14
      - name: Sticky PR comment
        if: hashFiles('graph.html') != ''
        uses: actions/github-script@v7
        with:
          script: |
            const prNum = context.issue.number;
            const runUrl = `${context.serverUrl}/${context.repo.owner}/${context.repo.repo}/actions/runs/${context.runId}`;
            const body = `**xera graph viewer** is ready for this PR.\n\n[Download viewer artifact](${runUrl}#artifacts) → open \`graph.html\` in any browser.\n\n_Auto-generated by xera v0.6.3._`;
            const marker = '<!-- xera-graph-comment -->';
            const { data: comments } = await github.rest.issues.listComments({ ...context.repo, issue_number: prNum });
            const existing = comments.find(c => c.body.includes(marker));
            if (existing) {
              await github.rest.issues.updateComment({ ...context.repo, comment_id: existing.id, body: marker + '\n' + body });
            } else {
              await github.rest.issues.createComment({ ...context.repo, issue_number: prNum, body: marker + '\n' + body });
            }
```

- [ ] **Step 3: Validate YAML**

```bash
cd /home/user/xera && npx yaml-lint .github/workflows/ci.yml 2>&1 || \
  python3 -c "import yaml; yaml.safe_load(open('.github/workflows/ci.yml'))"
```

Expected: no syntax errors.

- [ ] **Step 4: Commit**

```bash
git add .github/workflows/ci.yml
git commit -m "ci: publish xera graph viewer as PR artifact + sticky comment (v0.6.3)"
```

---

## Task 7: CLI scaffold — `xera-graph.yml.template`

**Files:**
- Create: `packages/cli/templates/xera-graph.yml.template`
- Modify: `packages/cli/src/commands/init.ts` — copy template into consumer's `.github/workflows/`
- Modify: `packages/cli/src/commands/init-update.ts` — same

- [ ] **Step 1: Create scaffold template**

Create `packages/cli/templates/xera-graph.yml.template`:

```yaml
# Auto-publish xera graph viewer on every PR.
# Generated by `xera init` (v0.6.3+).
name: xera graph viewer
on:
  pull_request:
    branches: [main]
jobs:
  viewer:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      pull-requests: write
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22 }
      - run: npm ci
      - name: Build graph snapshot
        run: npx xera-internal graph-snapshot
        continue-on-error: true
      - name: Render viewer
        run: npx xera-internal graph-render --out graph.html
        continue-on-error: true
      - name: Upload artifact
        uses: actions/upload-artifact@v4
        if: hashFiles('graph.html') != ''
        with:
          name: xera-graph
          path: graph.html
          retention-days: 14
      - name: Sticky PR comment
        if: hashFiles('graph.html') != ''
        uses: actions/github-script@v7
        with:
          script: |
            const runUrl = `${context.serverUrl}/${context.repo.owner}/${context.repo.repo}/actions/runs/${context.runId}`;
            const body = `**xera graph viewer** is ready.\n\n[Download artifact](${runUrl}#artifacts) → open \`graph.html\` in a browser.`;
            const marker = '<!-- xera-graph-comment -->';
            const { data: comments } = await github.rest.issues.listComments({ ...context.repo, issue_number: context.issue.number });
            const existing = comments.find(c => c.body.includes(marker));
            if (existing) {
              await github.rest.issues.updateComment({ ...context.repo, comment_id: existing.id, body: marker + '\n' + body });
            } else {
              await github.rest.issues.createComment({ ...context.repo, issue_number: context.issue.number, body: marker + '\n' + body });
            }
```

- [ ] **Step 2: Update `init.ts` to scaffold the workflow file**

Edit `packages/cli/src/commands/init.ts`. Find the section that scaffolds template files (look for existing `scaffoldFile(join(cwd, 'xera.config.ts'), ...)` call). Add after that section, BEFORE the gitignore additions:

```typescript
  // Scaffold GitHub Actions viewer workflow (v0.6.3+)
  scaffoldFile(join(cwd, '.github/workflows/xera-graph.yml'), 'xera-graph.yml.template', vars);
```

Also bump `pkg.scripts['xera:graph-snapshot']` and `pkg.scripts['xera:graph-render']` entries in the same file (find the existing `pkg.scripts['xera:fetch'] = 'xera-internal fetch';` block and append):

```typescript
  pkg.scripts['xera:graph-snapshot'] = 'xera-internal graph-snapshot';
  pkg.scripts['xera:graph-render'] = 'xera-internal graph-render';
```

- [ ] **Step 3: Same updates in `init-update.ts`**

Edit `packages/cli/src/commands/init-update.ts`. The existing file refreshes deps + skills. Add the same `scaffoldFile` call (use `copyFileSync` directly if scaffold helper isn't imported there) and the same `pkg.scripts` additions.

If `init-update.ts` doesn't have access to `scaffoldFile` or `pkg`, just add the workflow file via `copyFileSync` from the templates dir:

```typescript
import { copyFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
// ...
const wfDir = join(cwd, '.github/workflows');
mkdirSync(wfDir, { recursive: true });
const tplPath = join(skillsSrc.replace('@xera-ai/skills', '@xera-ai/cli'), 'templates/xera-graph.yml.template');
copyFileSync(tplPath, join(wfDir, 'xera-graph.yml'));
```

(Adapt the path resolution to whatever pattern `init-update.ts` already uses to find package files.)

- [ ] **Step 4: Verify scaffold template is in cli's `files` array**

Edit `packages/cli/package.json` — confirm `"templates"` is in the `files` array (it should already be from earlier versions).

- [ ] **Step 5: Commit**

```bash
git add packages/cli/templates/xera-graph.yml.template \
        packages/cli/src/commands/init.ts \
        packages/cli/src/commands/init-update.ts
git commit -m "cli: scaffold xera-graph.yml workflow + xera:graph-* npm scripts (v0.6.3)"
```

---

## Task 8: Version bumps + docs

**Files:**
- Modify: `packages/core/package.json`
- Modify: `packages/skills/version.json`
- Modify: `packages/skills/package.json`
- Modify: `packages/cli/package.json`
- Modify: `packages/cli/src/commands/init.ts` (caret bump)
- Modify: `packages/cli/src/commands/init-update.ts` (caret bump)
- Modify: `docs/CONFIGURATION.md`
- Modify: `docs/TROUBLESHOOTING.md`
- Modify: `README.md`

- [ ] **Step 1: Bump versions**

Edit `packages/core/package.json` — bump `"version": "0.4.2"` → `"0.4.3"`.

Edit `packages/skills/version.json` — bump skills `"0.4.2"` → `"0.4.3"`.

Edit `packages/skills/package.json` — bump `"0.4.2"` → `"0.4.3"`.

Edit `packages/cli/package.json` — bump version (e.g. `0.2.3` → `0.2.4`); bump caret deps `@xera-ai/core` `^0.4.2` → `^0.4.3` and `@xera-ai/skills` `^0.4.2` → `^0.4.3`.

Edit `packages/cli/src/commands/init.ts` — bump `pkg.dependencies['@xera-ai/core']` to `^0.4.3`.

Edit `packages/cli/src/commands/init-update.ts` — same.

- [ ] **Step 2: CONFIGURATION.md — viewer section**

Append to `docs/CONFIGURATION.md`:

```markdown
### HTML viewer (v0.6.3+)

Generate a single self-contained HTML file visualizing the project knowledge graph:

```bash
npx xera-internal graph-render                            # full snapshot
npx xera-internal graph-render --since 90d                # filter to recent activity
npx xera-internal graph-render --ticket ABC-200 --depth 2 # ego-graph centered on one ticket
npx xera-internal graph-render --out custom-path.html     # custom output location
```

The viewer is a single self-contained HTML file (~700 KB total — vendored vis-network is the bulk). Open it in any browser; works offline. The file is automatically gitignored.

**Performance modes** (auto-selected based on graph size):
- `< 500 nodes`: full mode — all node types visible
- `500–2000 nodes`: ticket-only — scenarios, POMs, and areas hidden
- `> 2000 nodes`: text-fallback — writes a placeholder text file

**CI publishing:** `xera init` scaffolds `.github/workflows/xera-graph.yml` which renders the viewer on every PR, uploads it as an artifact, and posts a sticky comment with the artifact link. Reviewers click → open in browser, no clone required.
```

- [ ] **Step 3: TROUBLESHOOTING.md — viewer entries**

Append to `docs/TROUBLESHOOTING.md`:

```markdown
### Viewer too slow / blank

If `.xera/graph.html` opens but renders slowly or appears blank:

1. Check graph size: `npx xera-internal graph-query --format text | head` — if you have > 500 nodes, the renderer auto-switches to ticket-only mode.
2. Filter the view: `npx xera-internal graph-render --since 30d` or `--ticket <SOME_ID>` to narrow the rendered subset.
3. Check browser console for errors (vis-network may fail to initialize on very old browsers; Chrome/Firefox/Safari from the past 3 years all work).

### Viewer artifact not appearing on PRs

Verify the workflow file was scaffolded:
```bash
ls .github/workflows/xera-graph.yml
```

If missing, run `npx @xera-ai/cli init --update` to refresh the scaffold (v0.6.3+).
```

- [ ] **Step 4: README.md — mark v0.6 complete**

Edit `README.md`. Update the v0.6 roadmap entry to indicate the project knowledge graph rollout is complete:

```markdown
| v0.6 | Project Knowledge Graph (graph foundation, TEST_OUTDATED, /xera-impact, HTML viewer) ✅ |
```

- [ ] **Step 5: Commit**

```bash
git add packages/core/package.json packages/skills/package.json packages/skills/version.json \
        packages/cli/package.json packages/cli/src/commands/init.ts packages/cli/src/commands/init-update.ts \
        docs/CONFIGURATION.md docs/TROUBLESHOOTING.md README.md
git commit -m "release: bump versions to v0.6.3 + viewer docs + roadmap update"
```

---

## Task 9: Final integration validation

**Files:** none

- [ ] **Step 1: Lint**

Run: `cd /home/user/xera && npm run lint`
Expected: zero errors. If errors, run `npm run lint:fix` and commit `chore: lint fixes for v0.6.3`.

- [ ] **Step 2: Typecheck**

Run: `cd /home/user/xera && npm run typecheck`
Expected: zero errors.

- [ ] **Step 3: All tests**

Run: `cd /home/user/xera && npx vitest run`
Expected: all unit tests pass; pre-existing `init-and-run` integration test still fails (live-server requirement, expected).

- [ ] **Step 4: Verify subcommand registration**

Run: `grep -E "'(graph-render|graph-record|graph-snapshot|graph-query|graph-backfill|graph-enrich|impact-prepare)':" packages/core/src/bin-internal/index.ts | wc -l`
Expected: 7.

- [ ] **Step 5: Render a real graph + open**

```bash
cd /home/user/xera
npm run --cwd packages/core xera-internal graph-snapshot 2>&1 || echo "skip if no graph events"
npm run --cwd packages/core xera-internal graph-render --out /tmp/xera-test-graph.html 2>&1
ls -la /tmp/xera-test-graph.html
```

Expected: file exists, > 100 KB (vis-network bundled).

- [ ] **Step 6: Validate HTML structure**

```bash
head -5 /tmp/xera-test-graph.html
grep -c "window.__GRAPH__\|vis-network" /tmp/xera-test-graph.html
```

Expected: starts with `<!DOCTYPE html>`; grep ≥ 2 matches.

- [ ] **Step 7: Commit any fixups**

```bash
git status
# If fixes were needed, commit. Otherwise no commit.
```

- [ ] **Step 8: Total v0.6.3 commits**

```bash
git log --oneline be973ee..HEAD | wc -l
```

Note this number for the PR body.

---

## Self-Review Checklist

- [ ] All 9 tasks have working test → fail → impl → pass → commit flow (T1, T6, T7 are non-TDD due to vendored binary / yaml / template)
- [ ] No `TBD`, `TODO`, `implement later`, or placeholder text
- [ ] Every file path is absolute or repo-relative
- [ ] Type signatures consistent: `VisNode.group: 'Ticket'|...`; `RenderOpts.depth: 1|2|3`; `GraphStats` shape stable
- [ ] Version bumps: core 0.4.2 → 0.4.3, skills 0.4.2 → 0.4.3
- [ ] vis-network vendored under templates with Apache-2.0 license
- [ ] CI workflow + scaffold template both publish artifact + sticky comment
- [ ] README v0.6 roadmap marked complete
- [ ] Spec coverage: §7 (HTML viewer), §11.5 (CI artifact), §11.6 (disputed marker — visible via red color when `latest_failures` populated)

---

## Spec Coverage Map

| Spec section | Plan task |
|---|---|
| §7.1 Tech stack (vis-network vendored, vanilla JS, self-contained) | 1 (vendor), 3 (template) |
| §7.2 Command surface (`--since`, `--ticket --depth`, `--out`) | 5 (graph-render flags) |
| §7.3 UX (topbar, canvas, sidepanel, footer) | 3 (HTML+CSS) |
| §7.4 Node styling (Ticket=blue/dot, Scenario=color-by-status/square, POM=yellow/diamond, Area=gray/hexagon, Failure=red/triangle) | 2 (transform builders) |
| §7.5 Edge styling (modifies=red dashed, jira-linked=blue dashed, similar=purple dotted, default=gray solid) | 2 (buildEdge function) |
| §7.6 Interactions (click ego-highlight, hover tooltip, search, filter chips) | 3 (graph.js) |
| §7.7 Performance modes (full/ticket-only/text-fallback) | 5 (decidePerformanceMode), 2 (transform handles modes) |
| §7.8 Gitignore for `.xera/graph.html` | already in v0.6.0 init template |
| §11.5 CI publishes viewer artifact + sticky PR comment | 6 (.github/workflows/ci.yml), 7 (consumer scaffold) |
| §11.6 Disputed runs visual marker | 2 (Failure node uses red — implicit; explicit dispute outline deferred to v0.6.x patch since `classification.disputed` events don't materialize into `latest_failures` yet) |

---

## Out of scope (deferred)

- Explicit dispute outline rendering (red dashed border on disputed Failure nodes) — current design colors all failures red; distinguishing disputed-vs-not requires snapshot-level dispute aggregation that's not yet built. Deferred to v0.6.3.x patch.
- Live dashboard (Next.js) — v1.0+
- Multi-graph comparison view (e.g. before/after PR) — v0.7+
- Right-click context menu beyond "Copy /xera-impact command" — v0.6.x patch
