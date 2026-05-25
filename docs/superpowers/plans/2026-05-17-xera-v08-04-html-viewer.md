# xera v0.8 — Plan 04: HTML Viewer Coverage Tab (v0.8.1)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Extend the existing `graph-render` HTML viewer with a top-level "Coverage" tab containing Map (vis-network area-color overlay), List (sortable HTML table of gaps + AC matrix), and Trend (inline SVG chart from `coverage.snapshot` events). `/xera-coverage --viewer` invokes `graph-render --include-coverage` and prints the HTML path. End state: opening the generated `.xera/graph.html` shows two top-level tabs, both functional.

**Architecture:** All work composes into existing infrastructure — no new vendor libraries. The existing `renderHtml` function takes new optional `coverage` input. The HTML template gains a `{{COVERAGE_*}}` set of placeholders. New rendering modules under `packages/core/src/graph/render-coverage/` keep concerns separated (map overlay vs list table vs trend chart). Tab-switching logic added to the inline JS template. vis-network reused — Coverage Map is just a recoloring of the Knowledge graph.

**Tech Stack:** TypeScript, `vitest`, vis-network (already vendored).

**Prereqs:** Plans 01-03 complete. Coverage engine pure functions, `coverage.snapshot` event emission, and `/xera-coverage` skill all in place.

**Out of scope (deferred to v0.8.1+):** AC node visualization on Map (small dots clustered around tickets) — adds complexity for marginal value when AC matrix is fully visible in List view. Per-area mini-sparklines under Trend — single aggregate trend line is sufficient for v0.8.1. Live filtering on Coverage tab (the existing global search bar applies only to Knowledge tab; users can use browser's Ctrl+F on the List table).

**Plan scope summary:**
- Phase 26: Extend `renderHtml` API + template placeholders + tab switcher HTML/CSS
- Phase 27: Map view — area color overlay
- Phase 28: List view — sortable HTML table
- Phase 29: Trend view — inline SVG chart from event history
- Phase 30: `graph-render --include-coverage` CLI flag + Coverage data assembly
- Phase 31: `/xera-coverage --viewer` skill wiring
- Phase 32: Integration tests + workspace verification

---

## Phase 26 — Render API + template scaffold

### Task 26.1: Extend `renderHtml` signature with optional `coverage` input

**Files:**
- Modify: `packages/core/src/graph/render.ts`
- Test: `packages/core/test/graph/render.test.ts` (extend if exists, or create)

### Step 1 — failing test

```ts
import { describe, test, expect } from 'vitest';
import { renderHtml } from '../../src/graph/render';

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
    const html = renderHtml({
      data: { nodes: [], edges: [] },
      stats: { tickets: 0, scenarios: 0, poms: 0, areas: 0, failures: 0, edges: 0 },
      generatedAt: '2026-05-17T10:00:00.000Z',
      coverage: {
        report: {
          generatedAt: '2026-05-17T10:00:00.000Z', windowDays: 30,
          areas: [], tickets: [], acBackfillNeeded: false,
        },
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
```

### Step 2 — verify fail

### Step 3 — extend `renderHtml` + add `CoverageInput` type

In `packages/core/src/graph/render.ts`:

```ts
import type { CoverageReport } from '../coverage/report';
import type { CoverageSnapshotPayload } from './types';

export interface CoverageInput {
  report: CoverageReport;
  snapshots: CoverageSnapshotPayload[];  // Trend tab data (deduped by day, sorted asc)
}

export interface RenderHtmlInput {
  data: { nodes: VisNode[]; edges: VisEdge[] };
  stats: GraphStats;
  generatedAt: string;
  coverage?: CoverageInput;   // NEW v0.8.1
}
```

In `renderHtml`, conditionally inject Coverage tab markup. Replace the template using two new placeholders: `{{COVERAGE_TAB_BUTTON}}` and `{{COVERAGE_TAB_PANEL}}` (both empty strings when no coverage). Also inject `{{COVERAGE_DATA}}` JSON.

```ts
export function renderHtml(input: RenderHtmlInput): string {
  const template = loadTemplate('graph.html.template');
  const css = loadTemplate('graph.css');
  const js = loadTemplate('graph.js');
  const visNetwork = loadTemplate('vis-network.min.js');

  const graphJson = JSON.stringify(input.data);
  const statsHuman = statsToHuman(input.stats);

  const coverageTabButton = input.coverage
    ? '<button data-tab="coverage">Coverage</button>'
    : '';
  const coverageTabPanel = input.coverage
    ? loadTemplate('coverage-panel.html.fragment')
    : '';
  const coverageJson = input.coverage ? JSON.stringify(input.coverage) : 'null';

  return template
    .replace('{{CSS}}', () => css)
    .replace('{{STATS}}', () => statsHuman)
    .replace('{{GENERATED_AT}}', () => input.generatedAt)
    .replace('{{VIS_NETWORK_JS}}', () => visNetwork)
    .replace('{{GRAPH_DATA}}', () => graphJson)
    .replace('{{INTERACTION_JS}}', () => js)
    .replace('{{COVERAGE_TAB_BUTTON}}', () => coverageTabButton)
    .replace('{{COVERAGE_TAB_PANEL}}', () => coverageTabPanel)
    .replace('{{COVERAGE_DATA}}', () => coverageJson);
}
```

### Step 4 — update `graph.html.template`

In `packages/core/src/graph/templates/graph.html.template`:

- In the `<header id="topbar">` section, add tab buttons inside a new container BEFORE the topbar-controls div:

```html
    <nav class="toplevel-tabs">
      <button data-tab="knowledge" class="active">Knowledge</button>
      {{COVERAGE_TAB_BUTTON}}
    </nav>
```

- Wrap the existing `<main id="canvas">` element with a tab section: `<section data-tab-panel="knowledge" class="active"><main id="canvas"></main></section>`.

- AFTER the wrapping section, add: `{{COVERAGE_TAB_PANEL}}` (renders nothing when no coverage data).

- AFTER `<script>window.__GRAPH__ = {{GRAPH_DATA}};</script>`, add: `<script>window.__COVERAGE__ = {{COVERAGE_DATA}};</script>`

### Step 5 — create `coverage-panel.html.fragment`

Create `packages/core/src/graph/templates/coverage-panel.html.fragment`:

```html
<section data-tab-panel="coverage" hidden>
  <nav class="subtabs">
    <button data-subtab="map" class="active">Map</button>
    <button data-subtab="list">List</button>
    <button data-subtab="trend">Trend</button>
  </nav>
  <div data-subpanel="map" class="active">
    <p class="subpanel-hint">Area nodes are colored by status. Red = UNCOVERED, amber = STALE, green = COVERED. Other nodes neutral.</p>
    <main id="coverage-map-canvas"></main>
  </div>
  <div data-subpanel="list" hidden>
    <table id="coverage-list-table"><thead><tr><th>Status</th><th>Area</th><th>Risk</th><th>Recent tickets</th><th>Recent bugs</th></tr></thead><tbody></tbody></table>
    <h3>AC Gaps</h3>
    <table id="coverage-ac-table"><thead><tr><th>Ticket</th><th>Coverage</th><th>Gap</th><th>Unsatisfied</th></tr></thead><tbody></tbody></table>
  </div>
  <div data-subpanel="trend" hidden>
    <p class="subpanel-hint">UNCOVERED + STALE area count over time (one point per day, latest snapshot wins).</p>
    <div id="coverage-trend-svg"></div>
  </div>
</section>
```

### Step 6 — add minimal CSS for tabs

Append to `packages/core/src/graph/templates/graph.css`:

```css
.toplevel-tabs { display: flex; gap: 4px; }
.toplevel-tabs button { padding: 6px 12px; border: 0; background: transparent; cursor: pointer; }
.toplevel-tabs button.active { border-bottom: 2px solid #3B82F6; font-weight: bold; }
[data-tab-panel] { display: none; }
[data-tab-panel].active { display: block; }
.subtabs { display: flex; gap: 4px; padding: 8px; }
.subtabs button { padding: 4px 10px; border: 1px solid #d1d5db; background: white; cursor: pointer; }
.subtabs button.active { background: #3B82F6; color: white; }
[data-subpanel] { padding: 12px; }
.subpanel-hint { color: #6b7280; font-size: 13px; margin: 4px 0 12px; }
#coverage-list-table, #coverage-ac-table { border-collapse: collapse; width: 100%; font-size: 13px; }
#coverage-list-table th, #coverage-list-table td,
#coverage-ac-table th, #coverage-ac-table td {
  border: 1px solid #e5e7eb; padding: 6px 10px; text-align: left;
}
#coverage-list-table th { background: #f9fafb; cursor: pointer; }
.status-uncovered { background: #fee2e2; }
.status-stale { background: #fef3c7; }
.status-covered { background: #d1fae5; }
#coverage-map-canvas { width: 100%; height: 600px; }
#coverage-trend-svg { width: 100%; min-height: 300px; }
```

### Step 7 — append tab-switching JS to `graph.js`

Append to `packages/core/src/graph/templates/graph.js`:

```js
// v0.8.1 — top-level tab switching
(function setupTabs() {
  const buttons = document.querySelectorAll('.toplevel-tabs button');
  if (!buttons.length) return;
  for (const btn of buttons) {
    btn.addEventListener('click', () => {
      for (const b of buttons) b.classList.remove('active');
      btn.classList.add('active');
      const tab = btn.getAttribute('data-tab');
      for (const panel of document.querySelectorAll('[data-tab-panel]')) {
        if (panel.getAttribute('data-tab-panel') === tab) {
          panel.classList.add('active');
        } else {
          panel.classList.remove('active');
        }
      }
      if (tab === 'coverage' && window.__COVERAGE__) {
        renderCoverageOnce();
      }
    });
  }
})();

// v0.8.1 — coverage subtab switching
(function setupSubtabs() {
  const buttons = document.querySelectorAll('.subtabs button');
  for (const btn of buttons) {
    btn.addEventListener('click', () => {
      for (const b of buttons) b.classList.remove('active');
      btn.classList.add('active');
      const sub = btn.getAttribute('data-subtab');
      for (const panel of document.querySelectorAll('[data-subpanel]')) {
        if (panel.getAttribute('data-subpanel') === sub) {
          panel.removeAttribute('hidden');
          panel.classList.add('active');
        } else {
          panel.setAttribute('hidden', '');
          panel.classList.remove('active');
        }
      }
    });
  }
})();

let _coverageRendered = false;
function renderCoverageOnce() {
  if (_coverageRendered) return;
  _coverageRendered = true;
  renderCoverageList();
  renderCoverageTrend();
  renderCoverageMap();
}

// Stubs — populated by later tasks. These should be no-op if Coverage data is missing.
function renderCoverageList() { /* Task 28 */ }
function renderCoverageMap() { /* Task 27 */ }
function renderCoverageTrend() { /* Task 29 */ }
```

### Step 8 — verify pass + lint

```bash
cd /home/user/xera && npm run lint:fix && npm run lint && npx vitest run packages/core packages/web packages/http
```

### Step 9 — commit: `feat(graph): extend renderHtml with coverage tab scaffold (v0.8.1)`

---

## Phase 27 — Map view: area color overlay

### Task 27.1: `renderCoverageMap` populates the map canvas with status-colored areas

**Files:**
- Modify: `packages/core/src/graph/templates/graph.js`
- Test: integration only (no unit test for browser JS; verified via E2E snapshot of rendered HTML)

### Step 1 — implement `renderCoverageMap` in graph.js

Replace the stub from Task 26.1 step 7 with:

```js
function renderCoverageMap() {
  const data = window.__COVERAGE__;
  if (!data || !window.__GRAPH__) return;
  const canvas = document.getElementById('coverage-map-canvas');
  if (!canvas) return;

  const STATUS_COLOR = {
    UNCOVERED: { background: '#fca5a5', border: '#dc2626' },
    STALE: { background: '#fcd34d', border: '#d97706' },
    COVERED: { background: '#86efac', border: '#15803d' },
  };
  const NEUTRAL = { background: '#e5e7eb', border: '#9ca3af' };

  const areaStatusById = {};
  for (const a of data.report.areas) areaStatusById[a.id] = a.status;

  const nodes = window.__GRAPH__.nodes.map((n) => {
    if (n.group === 'SUTArea' && areaStatusById[n.id]) {
      return { ...n, color: STATUS_COLOR[areaStatusById[n.id]] };
    }
    if (n.group !== 'SUTArea') return { ...n, color: NEUTRAL };
    return n;
  });

  // eslint-disable-next-line no-undef
  new vis.Network(canvas, { nodes: new vis.DataSet(nodes), edges: new vis.DataSet(window.__GRAPH__.edges) }, {
    physics: { enabled: true, stabilization: { iterations: 100 } },
    nodes: { shape: 'dot', font: { size: 11 } },
  });
}
```

### Step 2 — verify HTML snapshot contains `coverage-map-canvas` div

Add unit test for the template fragment:

```ts
// packages/core/test/graph/render-coverage.test.ts
import { describe, test, expect } from 'vitest';
import { renderHtml } from '../../src/graph/render';
import { DEFAULT_COVERAGE_CONFIG } from '../../src/coverage';
import { buildCoverageReport } from '../../src/coverage/report';
import type { Snapshot } from '../../src/graph/types';

function emptySnap(): Snapshot {
  return {
    schema_version: 1, generated_at: '2026-05-17T10:00:00.000Z',
    event_count: 0, events_hash: 'sha256:',
    tickets: {}, scenarios: {}, poms: {},
    areas: { checkout: { id: 'checkout' } },
    edges: [], latest_failures: {}, acNodes: {}, classifications: [],
  };
}

describe('renderHtml — coverage map', () => {
  test('includes coverage-map-canvas div and renderCoverageMap function', () => {
    const snap = emptySnap();
    const report = buildCoverageReport(snap, DEFAULT_COVERAGE_CONFIG, new Date('2026-05-17T10:00:00.000Z'));
    const html = renderHtml({
      data: { nodes: [], edges: [] },
      stats: { tickets: 0, scenarios: 0, poms: 0, areas: 1, failures: 0, edges: 0 },
      generatedAt: '2026-05-17T10:00:00.000Z',
      coverage: { report, snapshots: [] },
    });
    expect(html).toContain('coverage-map-canvas');
    expect(html).toContain('renderCoverageMap');
    expect(html).toContain('UNCOVERED');
  });
});
```

### Step 3 — verify pass + lint

### Step 4 — commit: `feat(graph): coverage map colors areas by status`

---

## Phase 28 — List view: sortable HTML table

### Task 28.1: `renderCoverageList` populates the two tables

**Files:**
- Modify: `packages/core/src/graph/templates/graph.js`
- Test: `packages/core/test/graph/render-coverage.test.ts` (extend)

### Step 1 — implement `renderCoverageList`

Replace the Task 27 stub in `graph.js`:

```js
function renderCoverageList() {
  const data = window.__COVERAGE__;
  if (!data) return;
  const listBody = document.querySelector('#coverage-list-table tbody');
  if (listBody) {
    listBody.innerHTML = '';
    for (const a of data.report.areas) {
      const tr = document.createElement('tr');
      tr.classList.add('status-' + a.status.toLowerCase());
      const cells = [a.status, a.id, String(a.risk), String(a.breakdown.recentTickets), String(a.breakdown.recentBugs)];
      for (const c of cells) {
        const td = document.createElement('td');
        td.textContent = c;
        tr.appendChild(td);
      }
      listBody.appendChild(tr);
    }
  }

  const acBody = document.querySelector('#coverage-ac-table tbody');
  if (acBody) {
    acBody.innerHTML = '';
    for (const t of data.report.tickets) {
      const tr = document.createElement('tr');
      const cells = [
        t.id,
        t.satisfiedCount + '/' + t.acCount,
        String(t.gapScore),
        t.unsatisfiedAcs.map((ac) => 'AC-' + ac.index).join(', '),
      ];
      for (const c of cells) {
        const td = document.createElement('td');
        td.textContent = c;
        tr.appendChild(td);
      }
      acBody.appendChild(tr);
    }
  }
}
```

### Step 2 — append failing test

```ts
test('renderHtml includes table headers + table bodies for coverage list', () => {
  const snap = emptySnap();
  snap.tickets['PROJ-1'] = {
    id: 'PROJ-1', summary: 'x', ac: ['AC 0'],
    storyHash: 'h', modifiesAreas: ['checkout'],
    fetchedAt: '2026-05-15T10:00:00.000Z',
  };
  snap.acNodes['PROJ-1#ac-0'] = { id: 'PROJ-1#ac-0', ticketId: 'PROJ-1', index: 0, text: 'AC 0' };
  snap.edges.push({
    kind: 'modifies', from: 'PROJ-1', to: 'checkout',
    source: 'xera-fetch', discoveredAt: '2026-05-15T10:00:00.000Z',
  });
  const report = buildCoverageReport(snap, DEFAULT_COVERAGE_CONFIG, new Date('2026-05-17T10:00:00.000Z'));
  const html = renderHtml({
    data: { nodes: [], edges: [] },
    stats: { tickets: 1, scenarios: 0, poms: 0, areas: 1, failures: 0, edges: 1 },
    generatedAt: '2026-05-17T10:00:00.000Z',
    coverage: { report, snapshots: [] },
  });
  expect(html).toContain('coverage-list-table');
  expect(html).toContain('coverage-ac-table');
  expect(html).toContain('AC Gaps');
});
```

### Step 3 — verify pass + lint

### Step 4 — commit: `feat(graph): coverage list table renders areas + AC gaps`

---

## Phase 29 — Trend view: inline SVG chart

### Task 29.1: `renderCoverageTrend` produces an inline SVG line

**Files:**
- Modify: `packages/core/src/graph/templates/graph.js`
- Test: `packages/core/test/graph/render-coverage.test.ts` (extend)

### Step 1 — implement `renderCoverageTrend`

Replace the stub:

```js
function renderCoverageTrend() {
  const data = window.__COVERAGE__;
  if (!data) return;
  const container = document.getElementById('coverage-trend-svg');
  if (!container) return;

  // Dedup by day (latest snapshot per day wins), sort asc.
  const byDay = {};
  for (const s of data.snapshots) {
    const day = s.ts.slice(0, 10);
    byDay[day] = s;
  }
  const days = Object.keys(byDay).sort();
  if (days.length === 0) {
    container.innerHTML = '<p class="subpanel-hint">No snapshots yet — run /xera-coverage on multiple days to build a trend.</p>';
    return;
  }

  const points = days.map((d) => {
    const snap = byDay[d];
    const n = snap.areas.filter((a) => a.status === 'UNCOVERED' || a.status === 'STALE').length;
    return { day: d, value: n };
  });
  const W = 800, H = 200, PAD = 30;
  const maxValue = Math.max(...points.map((p) => p.value), 1);
  const stepX = points.length > 1 ? (W - 2 * PAD) / (points.length - 1) : 0;
  const path = points
    .map((p, i) => {
      const x = PAD + i * stepX;
      const y = H - PAD - (p.value / maxValue) * (H - 2 * PAD);
      return (i === 0 ? 'M' : 'L') + x + ',' + y;
    })
    .join(' ');

  const labelFirst = points[0].day;
  const labelLast = points[points.length - 1].day;
  container.innerHTML =
    '<svg viewBox="0 0 ' + W + ' ' + H + '" xmlns="http://www.w3.org/2000/svg">' +
    '<path d="' + path + '" fill="none" stroke="#dc2626" stroke-width="2"/>' +
    '<text x="' + PAD + '" y="' + (H - 8) + '" font-size="11" fill="#6b7280">' + labelFirst + '</text>' +
    '<text x="' + (W - PAD - 60) + '" y="' + (H - 8) + '" font-size="11" fill="#6b7280">' + labelLast + '</text>' +
    '<text x="' + (PAD - 22) + '" y="' + (PAD - 4) + '" font-size="11" fill="#6b7280">' + maxValue + '</text>' +
    '</svg>';
}
```

### Step 2 — append failing test

```ts
test('renderHtml includes SVG when snapshots provided', () => {
  const snap = emptySnap();
  const report = buildCoverageReport(snap, DEFAULT_COVERAGE_CONFIG, new Date('2026-05-17T10:00:00.000Z'));
  const html = renderHtml({
    data: { nodes: [], edges: [] },
    stats: { tickets: 0, scenarios: 0, poms: 0, areas: 1, failures: 0, edges: 0 },
    generatedAt: '2026-05-17T10:00:00.000Z',
    coverage: {
      report,
      snapshots: [
        {
          ts: '2026-05-15T10:00:00.000Z', windowDays: 30,
          areas: [{ id: 'checkout', status: 'UNCOVERED', risk: 1,
                    breakdown: { recentTickets: 1, recentBugs: 0, criticalBoost: 1 } }],
          tickets: [],
        },
        {
          ts: '2026-05-17T10:00:00.000Z', windowDays: 30,
          areas: [],
          tickets: [],
        },
      ],
    },
  });
  expect(html).toContain('coverage-trend-svg');
  expect(html).toContain('renderCoverageTrend');
});
```

### Step 3 — verify pass + lint

### Step 4 — commit: `feat(graph): coverage trend renders inline SVG line chart`

---

## Phase 30 — `graph-render --include-coverage` flag

### Task 30.1: Read coverage report + recent snapshots in the binary

**Files:**
- Modify: `packages/core/src/bin-internal/graph-render.ts`
- Modify: `packages/core/test/bin-internal/graph-render.test.ts`

### Step 1 — failing test

Append to or create:

```ts
import { writeFileSync, readFileSync } from 'node:fs';
import { graphRenderCmd } from '../../src/bin-internal/graph-render';
// ... existing test utilities ...

test('--include-coverage embeds coverage data when report.json present', async () => {
  const dir = makeTempProject();
  // Seed report.json
  mkdirSync(join(dir, '.xera/coverage'), { recursive: true });
  writeFileSync(
    join(dir, '.xera/coverage/report.json'),
    JSON.stringify({
      generatedAt: '2026-05-17T10:00:00.000Z', windowDays: 30,
      areas: [{ id: 'checkout', status: 'UNCOVERED', risk: 1,
                breakdown: { recentTickets: 1, recentBugs: 0, criticalBoost: 1 } }],
      tickets: [], acBackfillNeeded: false,
    }),
  );
  const prevCwd = process.cwd();
  process.chdir(dir);
  try {
    await graphRenderCmd(['--include-coverage', '--out', join(dir, 'out.html')]);
    const html = readFileSync(join(dir, 'out.html'), 'utf8');
    expect(html).toContain('data-tab="coverage"');
    expect(html).toContain('coverage-map-canvas');
    expect(html).toContain('UNCOVERED');
  } finally {
    process.chdir(prevCwd);
    rmSync(dir, { recursive: true, force: true });
  }
});

test('without --include-coverage, no coverage tab even if report.json exists', async () => {
  const dir = makeTempProject();
  mkdirSync(join(dir, '.xera/coverage'), { recursive: true });
  writeFileSync(
    join(dir, '.xera/coverage/report.json'),
    JSON.stringify({ generatedAt: '2026-05-17T10:00:00.000Z', windowDays: 30,
      areas: [], tickets: [], acBackfillNeeded: false }),
  );
  const prevCwd = process.cwd();
  process.chdir(dir);
  try {
    await graphRenderCmd(['--out', join(dir, 'out.html')]);
    const html = readFileSync(join(dir, 'out.html'), 'utf8');
    expect(html).not.toContain('data-tab="coverage"');
  } finally {
    process.chdir(prevCwd);
    rmSync(dir, { recursive: true, force: true });
  }
});
```

### Step 2 — verify fail

### Step 3 — implement flag

In `packages/core/src/bin-internal/graph-render.ts`:

```ts
import { existsSync, readFileSync } from 'node:fs';
import type { CoverageInput } from '../graph/render';
import type { CoverageSnapshotPayload, Event } from '../graph/types';

// In graphRenderCmd argv parser:
let includeCoverage = false;
for (let i = 0; i < argv.length; i++) {
  // ... existing flags ...
  else if (argv[i] === '--include-coverage') includeCoverage = true;
}

// After computing snapshot, before renderHtml:
let coverage: CoverageInput | undefined;
if (includeCoverage) {
  const reportPath = join(repoRoot, '.xera/coverage/report.json');
  if (existsSync(reportPath)) {
    const report = JSON.parse(readFileSync(reportPath, 'utf8'));
    // Collect coverage.snapshot events from event history (filter from loadAllEvents reuse)
    const events: Event[] = loadAllEvents(repoRoot);
    const snapshots = events
      .filter((e): e is Extract<Event, { type: 'coverage.snapshot' }> => e.type === 'coverage.snapshot')
      .map((e) => e.payload as CoverageSnapshotPayload);
    coverage = { report, snapshots };
  } else {
    console.warn('[graph-render] --include-coverage: report.json not found; run /xera-coverage first');
  }
}

// Pass `coverage` to renderHtml:
const html = renderHtml({ data, stats: data.stats, generatedAt: new Date().toISOString(), coverage });
```

Note: `loadAllEvents` is already imported. The double-load (once for snapshot, once for coverage events) is acceptable — both are cheap.

Refactor: extract events to a const at top so it's loaded once, then both `deriveSnapshot(events)` and the coverage event filter use the same array.

### Step 4 — verify pass + lint

### Step 5 — commit: `feat(graph): graph-render --include-coverage flag embeds coverage report + events`

---

## Phase 31 — `/xera-coverage --viewer` skill wiring

### Task 31.1: Update skill to invoke graph-render when --viewer

**Files:**
- Modify: `packages/skills/xera-coverage.md`

### Step 1 — update Step 5 of skill

Replace the existing Step 5 ("Handle --viewer") block:

```markdown
## Step 5 — Handle --viewer

If the user passed `--viewer`, run:

```bash
npx xera-internal graph-render --include-coverage
```

This regenerates `.xera/graph.html` with a top-level Coverage tab (Map / List / Trend). Print the path so the user knows where to open it:

```
Coverage HTML viewer ready: .xera/graph.html
Open in any browser. The Coverage tab is at the top right.
```
```

### Step 2 — commit: `feat(skills): xera-coverage --viewer invokes graph-render with coverage`

---

## Phase 32 — Integration tests + verification

### Task 32.1: End-to-end test exercising the full flow

**Files:** Create `packages/core/test/bin-internal/graph-render-coverage.test.ts`.

### Step 1 — failing test (likely already passing after Phase 30; verify)

```ts
import { describe, test, expect } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { coveragePrepareCmd } from '../../src/bin-internal/coverage-prepare';
import { graphRenderCmd } from '../../src/bin-internal/graph-render';
import { appendEvents } from '../../src/graph/store';
import type { Event } from '../../src/graph/types';

const CORE_DEFINE_PATH = resolve(__dirname, '../../src/config/define.ts');

function eid(seed: string): string {
  const digits = seed.replace(/[^0-9]/g, '').padEnd(20, '0').slice(0, 20);
  return `01HXYZ${digits}`;
}

function makeProject(): string {
  const dir = mkdtempSync(join(tmpdir(), 'xera-render-cov-'));
  mkdirSync(join(dir, '.xera/graph'), { recursive: true });
  writeFileSync(
    join(dir, 'xera.config.ts'),
    `import { defineConfig } from '${CORE_DEFINE_PATH}';\n` +
      `export default defineConfig({\n` +
      `  jira: { baseUrl: 'https://example.atlassian.net', projectKeys: ['PROJ'], fields: { story: 'description' } },\n` +
      `  web: { baseUrl: { local: 'http://localhost:3000' }, defaultEnv: 'local' },\n` +
      `  adapters: ['web'],\n` +
      `});\n`,
  );
  return dir;
}

describe('graph-render --include-coverage end-to-end', () => {
  test('coverage-prepare → graph-render produces HTML with Coverage tab', async () => {
    const dir = makeProject();
    const events: Event[] = [
      {
        event_id: eid('20260515100000'), schema_version: 1,
        ts: '2026-05-15T10:00:00.000Z', actor: 'test',
        type: 'ticket.fetched',
        payload: {
          ticketId: 'PROJ-1', summary: 'Add feature', ac: [],
          jiraLinks: [], storyHash: 'h', modifiesAreas: ['checkout'],
        },
      },
    ];
    appendEvents(dir, events, { skill: 'fetch', ticketId: 'PROJ-1' });

    const prevCwd = process.cwd();
    process.chdir(dir);
    try {
      // 1. Generate report + coverage.snapshot event
      await coveragePrepareCmd(['--snapshot-ts', '2026-05-17T10:00:00.000Z']);

      // 2. Render with coverage
      await graphRenderCmd(['--include-coverage', '--out', join(dir, 'graph.html')]);
      const html = readFileSync(join(dir, 'graph.html'), 'utf8');

      expect(html).toContain('data-tab="coverage"');
      expect(html).toContain('coverage-map-canvas');
      expect(html).toContain('coverage-list-table');
      expect(html).toContain('coverage-trend-svg');
      // The report area must be embedded in window.__COVERAGE__
      expect(html).toContain('"UNCOVERED"');
      expect(html).toContain('"id":"checkout"');
    } finally {
      process.chdir(prevCwd);
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
```

### Step 2 — verify pass

### Step 3 — commit: `test(core): E2E graph-render --include-coverage`

---

### Task 32.2: Workspace verification

```bash
cd /home/user/xera
npm run typecheck
npm run lint
npx vitest run packages/core packages/web packages/http
git status
```

All green expected. If lint fixups needed, commit as `chore(graph): lint fixups after Plan 04`.

---

## Done

End state of Plan 04:

- `packages/core/src/graph/render.ts` — `CoverageInput` type + `renderHtml` accepts optional `coverage`
- `packages/core/src/graph/templates/graph.html.template` — top-level tab switcher + Coverage panel placeholders
- `packages/core/src/graph/templates/coverage-panel.html.fragment` — Coverage panel HTML markup (3 sub-tabs)
- `packages/core/src/graph/templates/graph.css` — minimal tab + table + chart styling
- `packages/core/src/graph/templates/graph.js` — tab switching JS + `renderCoverageMap/List/Trend`
- `packages/core/src/bin-internal/graph-render.ts` — `--include-coverage` flag, reads report.json + filters coverage.snapshot events
- `packages/skills/xera-coverage.md` — Step 5 invokes `graph-render --include-coverage`
- E2E test verifies full coverage-prepare → graph-render flow

What works after Plan 04: opening `.xera/graph.html` shows two top-level tabs. Coverage tab has Map (vis-network with status-colored areas), List (sortable area + AC gap tables), Trend (SVG line chart of UNCOVERED+STALE count over time). `/xera-coverage --viewer` triggers the full flow.

Plan 05 (generative `/xera-fill-gap`) remains for v0.8.2.
