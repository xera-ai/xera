# xera — Cross-Ticket Dashboard Design

**Status:** Draft for review
**Date:** 2026-06-06
**Author:** thanh@trinity-technology.com
**Scope:** A single `xera dashboard` command that aggregates last-run PASS/FAIL + classification breakdown across every ticket in the project, surfaces recent failures, stale tickets, and critical-area incidents. Text mode for terminal, JSON for CI, HTML for browser drill-down.

**Why now:** xera v0.1–v0.21 designed around per-ticket workflows (one ticket per `/xera-run`). v0.6 graph viewer aggregates *structure* (areas, scenarios, failures as nodes). v0.8 coverage aggregates *AC satisfaction*. Neither aggregates *latest test results*. A QA lead trying to answer "how is the project doing right now?" has to shell-loop `status` or click 24 cards in the graph viewer. This spec closes that gap.

**Depends on:**
- v0.1 status artifact (`packages/core/src/artifact/status.ts` — per-ticket `.xera/<TICKET>/status.json`)
- v0.6 graph snapshot (`packages/core/src/graph/store.ts`'s `deriveSnapshot` — area/scenario mapping)
- v0.21 HTML serve (`packages/cli/src/commands/show-report.ts` — serves at `127.0.0.1:9323`, can be reused)
- v0.6 vis-network bundle (`packages/core/src/graph/templates/vis-network.min.js` — NOT needed; dashboard uses plain HTML table)

**Resolved design decisions:**

1. **Deterministic binary, no AI.** `xera-internal dashboard` walks `.xera/<TICKET>/status.json` files + graph snapshot. No LLM, no prompt template, no JSON-output validation against LLM. Same pattern as `graph-render`, `coverage-prepare`.
2. **`xera dashboard` CLI wraps it,** mirroring `xera show-report`'s pattern. CLI handles `--html` (serve), `--json` (stdout), default (text).
3. **Source-of-truth = `.xera/<TICKET>/status.json`.** No re-running tests. Stale tickets surface via `lastRun` timestamp in status. If a ticket has no `status.json` yet (`/xera-fetch` ran but no `/xera-exec`), it shows as `NEVER_RUN`.
4. **Graph snapshot for area enrichment.** Reuses `deriveSnapshot(loadAllEvents(cwd))` to map ticket → areas. Doesn't refetch.
5. **HTML viewer = static, no JS framework.** A single self-contained `dashboard.html` with embedded JSON + plain CSS-styled table. Sort/filter via vanilla DOM (no Vue/React/vis-network). Lightweight, vendored bundles avoided.
6. **`--html` serves on `127.0.0.1:9323`** — same port + mechanism as `show-report`. Reuses serving code or extracts a shared `serveHtml(path)` helper. Random-port fallback if 9323 busy.
7. **Click ticket in HTML → opens that ticket's Playwright HTML report** in a new tab if available (relative link to `.xera/<TICKET>/runs/<latest>/playwright-report/index.html`). Otherwise: shows status + scenario list.
8. **Filters are server-side (binary), not client-side.** Text/JSON mode applies filters at data load. HTML viewer ships full data + a client-side filter form. Reason: text/JSON consumers expect pre-filtered output; HTML users want interactive exploration.
9. **`status.json` lacks per-scenario detail.** It has total/passed/failed counts. For per-scenario breakdown (which scenarios failed and why), HTML viewer reads `runs/<run-id>/normalized.json`. Text mode doesn't need it.
10. **No new artifact written.** Dashboard is read-only. Doesn't emit a graph event, doesn't snapshot dashboard state.

**Out of scope (deferred):**

- **Historical trend charts** (PASS rate over time, MTTR per ticket). Requires per-run rollup not currently captured.
- **Jira/GitHub status sync** — dashboard reads xera artifacts, not tracker state. (`xera-coverage` already does AC backfill; dashboard stays out.)
- **Auto-refresh / WebSocket live updates** in HTML viewer. Static snapshot per server invocation.
- **Diff between two dashboard runs** ("what changed since yesterday"). Useful but needs persisted state.
- **Slack/email notifications.** A `--json` consumer can drive these.
- **`/xera-dashboard` skill.** Dashboard is a deterministic readout; no AI needed. Power users hit `npx xera dashboard` directly. (Editors/IDE integration: future.)

---

## 1. Goals & Scope

### 1.1 Goal

Answer this question in under 1 second from any xera project's terminal: *"For each ticket in this project, what was the latest test result and what failed?"*

A QA lead opens the project, runs `npx xera dashboard`, and within one screen they see:
- How many tickets exist, how many last passed, how many last failed, how many never ran
- Distribution of failure classifications (REAL_BUG vs SELECTOR_DRIFT vs FLAKY vs ...)
- The most recent 10 failures (ticket + classification + confidence + timestamp + scenario count)
- Tickets last run > 7 days ago (stale)
- Critical areas (per `config.coverage.criticalAreas`) with at least one failing ticket
- Top areas by failure count this week

For CI / Slack integration: `npx xera dashboard --json` emits the same payload as structured JSON.

For drill-down: `npx xera dashboard --html` serves an interactive HTML at `127.0.0.1:9323` with a sortable, filterable table where clicking a ticket opens its Playwright HTML report (if `exec --reporter=html` was used).

### 1.2 In-scope deliverables

**Binary** (`packages/core/src/bin-internal/`)
1. `dashboard.ts` — `dashboardCmd(argv)` subcommand:
   - `--since <duration>` (e.g. `24h`, `7d`) — restrict failures table + filter aggregates
   - `--classification <class>` (repeatable) — filter by classification enum
   - `--area <slug>` (repeatable) — filter to tickets touching named areas
   - `--failing-only` — drop PASS + NEVER_RUN tickets
   - `--json` — emit JSON to stdout, no text
   - `--html <path>` — write self-contained HTML to path (default `.xera/dashboard.html`); does NOT serve
   - (default) — text mode to stdout
2. `index.ts` — dispatch entry `'dashboard': dashboardCmd`

**Data layer** (`packages/core/src/dashboard/`)
3. `types.ts` — `DashboardSnapshot`, `TicketRow`, `RecentFailure`, `AreaStat`, `ClassificationBin`. Pure types.
4. `collect.ts` — `collectDashboard(cwd, opts)` returns `DashboardSnapshot`. Walks `.xera/<TICKET>/status.json`, reads graph snapshot for area enrichment, applies filters. Pure function (cwd + opts → snapshot).
5. `render-text.ts` — `renderText(snapshot): string` ASCII table + boxes.
6. `render-html.ts` — `renderHtml(snapshot): string` self-contained HTML.

**CLI** (`packages/cli/src/commands/`)
7. `dashboard.ts` — `xera dashboard [flags]` wraps `dashboardCmd` but adds `--serve` flag that calls `dashboardCmd --html <tmpfile>` then serves via shared `serveHtmlReport(dir, port)` helper.
8. `packages/cli/src/index.ts` — register `dashboard` in command parser.

**Shared serve helper** (refactor `show-report.ts`)
9. Extract `serveHtmlFile(filePath, port)` (or `serveHtmlDir(dir, port)`) from `show-report.ts` so dashboard reuses without copying.

**Skills** — none. Power users hit the binary directly.

**Templates** — none scaffolded; dashboard runs against `.xera/` at user's project root.

**Docs**
10. `docs/CONFIGURATION.md` — new "Dashboard" section under "Reporting" or new top-level.
11. `docs/guides/dashboard.md` — short tutorial (optional, can defer).
12. `AGENTS.md.tmpl` — add `npx xera dashboard` to the scripts table.

### 1.3 Out of scope

See header.

### 1.4 Success criteria

- `npx xera dashboard` exits 0 in a project with no `.xera/<TICKET>/` dirs (gracefully reports "no tickets yet").
- Project with 24 tickets (sample fixture): text output ≤ 40 lines, fits one terminal screen.
- `--json` emits valid JSON validating against `DashboardSnapshotSchema`.
- `--html` writes self-contained HTML that opens directly in browsers (no CDN deps, no JS framework imports).
- `--serve` opens browser at `127.0.0.1:9323` (or fallback port).
- Click on a ticket row in HTML opens `.xera/<TICKET>/runs/<latest>/playwright-report/index.html` in new tab (relative `file://` or served path).
- `--since=24h` correctly excludes tickets whose `lastRun > 24h ago` from "Recent failures" but keeps them in "Stale" surface.
- Filters compose: `--failing-only --classification=REAL_BUG --area=checkout` returns only failing tickets in `checkout` classified as REAL_BUG.

---

## 2. Architecture — Source Data

### 2.1 `.xera/<TICKET>/status.json` (existing, per-ticket)

Schema from `packages/core/src/artifact/status.ts`:

```ts
{
  result: 'PASS' | 'FAIL' | 'UNKNOWN',
  classification: ClassificationEnum,   // PASS | REAL_BUG | TEST_BUG | SELECTOR_DRIFT
                                         // FLAKY | TEST_OUTDATED | CONTRACT_DRIFT
                                         // RATE_LIMITED | AUTH_EXPIRED
  confidence: number,
  scenarios: { total: number, passed: number, failed: number },
  lastRun: ISO_timestamp,
  history: Array<{ ts, result, class }>,  // last 5 runs (per status.ts:19)
}
```

Dashboard's first read: `glob('.xera/*/status.json')`. Each match is a ticket. Dirs without `status.json` (just-fetched but never exec'd) → ticket exists in graph but result = `NEVER_RUN`.

### 2.2 Graph snapshot — area enrichment

`deriveSnapshot(loadAllEvents(cwd))` returns:

```ts
{
  tickets: Record<ticketId, { id, fetchedAt, areas: string[], ... }>,
  scenarios: Record<scenarioId, { ticketId, name, ... }>,
  edges: Edge[],   // areas → tickets via `modifies`
}
```

Dashboard uses `snap.tickets[ticketId].areas` to map a ticket to its areas. Tickets in `.xera/` not present in graph (race: status written but `graph-record` not yet) get `areas: []` — degrade gracefully.

### 2.3 Per-run normalized output (HTML viewer only)

For HTML drill-down, dashboard reads `.xera/<TICKET>/runs/<latest>/normalized.json` to populate the scenario-level detail panel. This file is large (full scenario list + failure rationales); read on-demand only when a row is expanded.

### 2.4 Run metadata for "stale"

Stale = `Date.now() - new Date(status.lastRun).getTime() > 7 * 24 * 60 * 60 * 1000` (default). Configurable via `config.dashboard.staleAfterDays` (defaults to 7). New optional schema field — see §6.

### 2.5 Critical areas

From `config.coverage.criticalAreas: string[]` (already exists). Dashboard surfaces failures in any ticket whose `areas` includes a critical area.

---

## 3. Architecture — `DashboardSnapshot`

### 3.1 Type

```ts
export interface DashboardSnapshot {
  generated_at: string;                      // ISO timestamp
  totals: {
    tickets: number;
    last_pass: number;
    last_fail: number;
    never_run: number;
    scenarios_pass: number;
    scenarios_fail: number;
  };
  classifications: ClassificationBin[];      // sorted desc by count
  tickets: TicketRow[];                      // filtered + sorted by lastRun desc
  recent_failures: RecentFailure[];          // top N from tickets where result=FAIL
  stale: TicketRow[];                        // tickets with lastRun > staleAfterDays
  critical_alerts: AreaStat[];               // critical areas with failing tickets
  top_failing_areas: AreaStat[];             // areas sorted desc by failure count
  filters_applied: AppliedFilters;
}

export interface TicketRow {
  ticketId: string;
  result: 'PASS' | 'FAIL' | 'UNKNOWN' | 'NEVER_RUN';
  classification: string | null;
  confidence: number | null;
  scenarios: { total: number; passed: number; failed: number };
  lastRun: string | null;                    // null = NEVER_RUN
  areas: string[];                           // from graph snapshot
  has_html_report: boolean;                  // detected at collect time
}

export interface RecentFailure {
  ticketId: string;
  classification: string;
  confidence: number;
  lastRun: string;
  scenarios_failed: number;
  scenarios_total: number;
  areas: string[];
}

export interface ClassificationBin {
  classification: string;
  count: number;                             // # of tickets with this latest classification
}

export interface AreaStat {
  area: string;
  failing_tickets: string[];                 // ticketIds
  is_critical: boolean;
}

export interface AppliedFilters {
  since?: string;                            // duration string, echoed back
  classifications?: string[];
  areas?: string[];
  failing_only?: boolean;
}
```

A corresponding Zod schema (`DashboardSnapshotSchema`) ships in `types.ts` so the `--json` output is validatable by external tools.

### 3.2 `collectDashboard(cwd, opts)`

Pseudocode:

```ts
export function collectDashboard(
  cwd: string,
  opts: { since?: string; classifications?: string[]; areas?: string[]; failingOnly?: boolean },
): DashboardSnapshot {
  const config = loadConfigSync(cwd);   // for criticalAreas + dashboard.staleAfterDays
  const snap = deriveSnapshot(loadAllEvents(cwd));
  const sinceMs = opts.since ? parseDuration(opts.since) : undefined;
  const sinceCutoff = sinceMs ? Date.now() - sinceMs : 0;
  const staleAfterMs = (config.dashboard?.staleAfterDays ?? 7) * 86_400_000;
  
  // Walk ticket dirs
  const xeraDir = join(cwd, '.xera');
  const ticketDirs = existsSync(xeraDir) ? readdirSync(xeraDir, { withFileTypes: true })
    .filter(d => d.isDirectory() && /^[A-Z][A-Z0-9-]+$/.test(d.name))   // skip .auth, graph, coverage, etc.
    .map(d => d.name) : [];

  const tickets: TicketRow[] = [];
  for (const ticketId of ticketDirs) {
    const statusPath = join(xeraDir, ticketId, 'status.json');
    const areas = snap.tickets[ticketId]?.areas ?? [];
    const hasHtml = existsLatestPlaywrightReport(xeraDir, ticketId);
    if (!existsSync(statusPath)) {
      tickets.push({ ticketId, result: 'NEVER_RUN', classification: null, confidence: null,
        scenarios: { total: 0, passed: 0, failed: 0 }, lastRun: null, areas, has_html_report: hasHtml });
      continue;
    }
    const status = readStatus(statusPath);
    tickets.push({ ticketId, result: status.result, classification: status.classification,
      confidence: status.confidence, scenarios: status.scenarios, lastRun: status.lastRun,
      areas, has_html_report: hasHtml });
  }

  // Apply filters
  let filtered = tickets;
  if (opts.failingOnly) filtered = filtered.filter(t => t.result === 'FAIL');
  if (opts.classifications?.length) filtered = filtered.filter(t => t.classification && opts.classifications!.includes(t.classification));
  if (opts.areas?.length) filtered = filtered.filter(t => t.areas.some(a => opts.areas!.includes(a)));

  // Aggregate
  const totals = computeTotals(filtered);
  const classifications = aggregateClassifications(filtered);
  const recent_failures = filtered
    .filter(t => t.result === 'FAIL' && t.lastRun && (sinceMs ? new Date(t.lastRun).getTime() >= sinceCutoff : true))
    .sort((a, b) => new Date(b.lastRun!).getTime() - new Date(a.lastRun!).getTime())
    .slice(0, 10)
    .map(t => ({ ticketId: t.ticketId, classification: t.classification!, confidence: t.confidence!,
      lastRun: t.lastRun!, scenarios_failed: t.scenarios.failed, scenarios_total: t.scenarios.total, areas: t.areas }));
  const stale = filtered
    .filter(t => t.lastRun && Date.now() - new Date(t.lastRun).getTime() > staleAfterMs && t.result !== 'NEVER_RUN');
  const critical_alerts = buildAreaStats(filtered, config.coverage?.criticalAreas ?? []);
  const top_failing_areas = buildTopFailingAreas(filtered);

  return {
    generated_at: new Date().toISOString(),
    totals, classifications, tickets: filtered.sort((a, b) => /* lastRun desc, NEVER_RUN last */),
    recent_failures, stale, critical_alerts, top_failing_areas,
    filters_applied: { ...opts },
  };
}
```

`existsLatestPlaywrightReport(xeraDir, ticketId)` checks `runs/<latest>/playwright-report/index.html`. Latest is determined by lexicographic sort of run dirs (run IDs are ulids → sorts chronologically).

### 3.3 Edge cases

- **No `.xera/` directory** → empty snapshot, text "no tickets yet — run `/xera-fetch <TICKET>` to add one".
- **`.xera/` exists but no ticket dirs** → same as above.
- **Ticket dir exists with `story.md` but no `status.json`** → row included as `NEVER_RUN`.
- **Status file unreadable** (corrupt JSON, schema mismatch) → row included as `UNKNOWN` with an inline warning, **does not throw** (one bad ticket shouldn't break the whole dashboard).
- **Filter excludes all rows** → snapshot still emitted (counts = 0), text mode shows "no tickets match filters: ...".
- **`--since=invalid`** → throw at the binary boundary with `parseDuration` error.

---

## 4. Text Mode Output (`render-text.ts`)

Aim: one terminal screen for a 24-ticket project. Use box-drawing chars for the summary, simple aligned columns for the table. No color libraries (chalk/picocolors); use ANSI escape codes minimally and only when `process.stdout.isTTY`.

### 4.1 Layout

```
╔═══════════════════════════════════════════════════════════════════════╗
║ xera Dashboard — last run summary across 24 tickets                    ║
╠═══════════════════════════════════════════════════════════════════════╣
║ Tickets:  24    PASS: 18 (75%)   FAIL: 5 (21%)   NEVER_RUN: 1 (4%)    ║
║ Scenarios: 187  PASS: 169 (90%)  FAIL: 18                              ║
╚═══════════════════════════════════════════════════════════════════════╝

Classifications (last run, failing tickets only):
  REAL_BUG          ████████████ 8
  SELECTOR_DRIFT    █████████    6
  FLAKY             ██           2
  TEST_OUTDATED     ██           2

Recent failures (last 7d):
  TICKET-042  FAIL  REAL_BUG          conf=0.85  2026-06-06T08:23  scenarios 3/5  areas: checkout
  TICKET-018  FAIL  SELECTOR_DRIFT    conf=0.92  2026-06-06T07:11  scenarios 4/6  areas: auth, login
  TICKET-091  FAIL  REAL_BUG          conf=0.78  2026-06-05T22:40  scenarios 2/3  areas: checkout
  TICKET-074  FAIL  FLAKY             conf=0.65  2026-06-05T10:02  scenarios 1/8  areas: profile
  TICKET-002  FAIL  CONTRACT_DRIFT    conf=0.90  2026-06-04T18:33  scenarios 3/3  areas: api-checkout

Stale (last run > 7d ago):
  TICKET-007  PASS  2026-05-28T12:00  areas: reports
  TICKET-019  PASS  2026-05-27T09:14  areas: settings

Critical areas with failures:
  ⚠ checkout: 2 failing tickets (042, 091)
  ⚠ auth: 1 failing ticket (018)

Top failing areas:
  checkout (2)   auth (1)   api-checkout (1)   profile (1)

→ Inspect a ticket:   /xera-report <TICKET>
→ Fill coverage gap:  /xera-fill-gap <area-or-TICKET>
→ HTML viewer:        npx xera dashboard --serve
```

### 4.2 Rules

- Box width: 75 chars (fits most 80-col terminals with 5-char margin).
- Tables: align columns by max content width, capped at 20 chars per col (truncate with `…`).
- Bars (`█`): scale to longest classification count. Width = `Math.round((count / max) * 12)`.
- Timestamps: ISO format, drop seconds if tight.
- Confidence: 2 decimals.
- Areas: comma-separated, truncate to 30 chars total per row with `…`.
- Empty sections (no recent failures, no stale, no criticals) → suppress the heading entirely.
- ANSI colors: only if TTY. PASS=green, FAIL=red, NEVER_RUN=gray, UNKNOWN=yellow.

### 4.3 `--failing-only` text rendering

When this filter is set:
- Totals box still shows full counts (with `(filtered: N)` suffix).
- "Recent failures" becomes "All failing tickets" (no time filter, no top-10 cap).
- Stale + critical alerts + top areas still computed against *full* set so user sees context.

---

## 5. JSON Mode (`--json`)

Stdout-only. Pretty-printed (2-space indent) by default for human grep-ability; `--json-compact` minifies. JSON validates against `DashboardSnapshotSchema` exported from `types.ts`.

Use case: pipe into `jq`, into Slack webhook, into CI annotations. Example:

```bash
npx xera dashboard --json --failing-only \
  | jq -r '.tickets[] | "\(.ticketId) \(.classification) conf=\(.confidence)"'
```

Schema lives next to types so CLI consumers can `import { DashboardSnapshotSchema } from '@xera-ai/core'` and parse safely.

---

## 6. Config Schema Addition

`packages/core/src/config/schema.ts` adds optional `dashboard` block:

```ts
const DashboardSchema = z.object({
  staleAfterDays: z.number().int().positive().default(7),
  recentFailureLimit: z.number().int().positive().default(10),
}).prefault({});

const XeraConfigSchema = z.object({
  // ...existing fields...
  dashboard: DashboardSchema.optional(),
});
```

Both fields have sensible defaults; the block is optional. Backwards-compatible.

---

## 7. HTML Viewer (`render-html.ts`)

Single self-contained file. No CDN, no framework. ~400 lines of HTML/CSS/vanilla JS.

### 7.1 Structure

```html
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>xera Dashboard — {{project_name}}</title>
  <style>/* inline ~150 lines */</style>
</head>
<body>
  <header>
    <h1>xera Dashboard</h1>
    <div class="generated">Generated {{ts}} · {{ticket_count}} tickets</div>
  </header>

  <section class="totals">
    <div class="totals-card pass">PASS<br>{{n}} ({{pct}}%)</div>
    <div class="totals-card fail">FAIL<br>{{n}} ({{pct}}%)</div>
    <div class="totals-card never">NEVER_RUN<br>{{n}} ({{pct}}%)</div>
  </section>

  <section class="classifications">
    <h2>Classifications</h2>
    <ul>{{#each bins}}<li><span class="label">{{class}}</span><span class="bar" style="width:{{pct}}%"></span><span class="count">{{n}}</span></li>{{/each}}</ul>
  </section>

  <section class="critical-alerts">{{#if alerts}}<h2>⚠ Critical alerts</h2>...{{/if}}</section>

  <section class="filters">
    <input type="search" placeholder="Filter ticket ID, classification, area...">
    <button data-filter="failing-only">Failing only</button>
    <button data-filter="stale">Stale only</button>
    <select multiple class="classification-filter">{{#each classifications}}<option>{{this}}</option>{{/each}}</select>
  </section>

  <table class="tickets" id="tickets-table">
    <thead><tr>
      <th data-sort="ticketId">Ticket</th>
      <th data-sort="result">Result</th>
      <th data-sort="classification">Classification</th>
      <th data-sort="confidence">Conf</th>
      <th data-sort="scenarios">Scenarios</th>
      <th data-sort="lastRun">Last run</th>
      <th data-sort="areas">Areas</th>
    </tr></thead>
    <tbody>
      {{#each tickets}}
      <tr data-ticket="{{ticketId}}" data-result="{{result}}" data-class="{{classification}}" data-areas="{{areas|join:','}}" data-lastrun="{{lastRun}}">
        <td>
          {{#if has_html_report}}
          <a href=".xera/{{ticketId}}/runs/latest/playwright-report/index.html" target="_blank">{{ticketId}}</a>
          {{else}}{{ticketId}}{{/if}}
        </td>
        <td class="result-{{result|lower}}">{{result}}</td>
        <td>{{classification}}</td>
        <td>{{confidence|fixed:2}}</td>
        <td>{{scenarios.passed}}/{{scenarios.total}}</td>
        <td title="{{lastRun}}">{{lastRun|relative}}</td>
        <td>{{areas|join:', '|truncate:30}}</td>
      </tr>
      {{/each}}
    </tbody>
  </table>

  <script>
    const SNAPSHOT = {{snapshotJson}};
    // ~80 lines of vanilla JS: sort handler, filter form, search filter.
  </script>
</body>
</html>
```

### 7.2 Embedded JSON

The full `DashboardSnapshot` is embedded as `const SNAPSHOT = {...}`. Client-side filters mutate the visible rows only — no re-fetch. Keeps the HTML self-contained.

### 7.3 Click ticket → Playwright report

The `<a href=".xera/{{ticketId}}/runs/latest/playwright-report/index.html" target="_blank">` is a relative `file://` link. Works when the HTML is opened from the project root (or served from there). For `--serve` mode, the static server roots at the project cwd so all relative paths resolve.

When `has_html_report: false`, render the ticket ID as plain text with a tooltip: "No Playwright report — run `xera-internal exec <TICKET> --reporter=html`".

### 7.4 Why no vis-network / no framework

Vis-network is heavy (~1.5 MB) and meant for graph visualization. A dashboard is a table + summary cards. Plain HTML + CSS Grid renders fast, works offline, and avoids the vendored-bundle maintenance burden (`vis-network.min.js` LICENSE issue). No framework: keeps the build deterministic and the file size under 50 KB.

---

## 8. CLI Wrapper (`packages/cli/src/commands/dashboard.ts`)

Wraps the binary but adds `--serve`:

```ts
export async function dashboardCommand(opts: DashboardOpts): Promise<number> {
  if (opts.serve) {
    const tmpHtml = join(tmpdir(), `xera-dashboard-${Date.now()}.html`);
    // Invoke binary to write HTML
    const code = await spawn('npx', ['xera-internal', 'dashboard', '--html', tmpHtml, ...passthroughFilters(opts)]);
    if (code !== 0) return code;
    return serveHtmlFile(tmpHtml, opts.port ?? 9323, opts.cwd ?? process.cwd());
  }
  // For text / --json / --html <path>: just delegate to the binary
  return await spawn('npx', ['xera-internal', 'dashboard', ...buildBinaryArgs(opts)]);
}
```

Register in `packages/cli/src/index.ts`:

```ts
program.command('dashboard')
  .description('Cross-ticket dashboard of latest test results')
  .option('--since <duration>', 'filter recent failures, e.g. 24h, 7d')
  .option('--classification <class>', 'filter by classification (repeatable)', collect, [])
  .option('--area <slug>', 'filter to tickets touching named areas (repeatable)', collect, [])
  .option('--failing-only', 'drop PASS + NEVER_RUN tickets')
  .option('--json', 'emit JSON to stdout')
  .option('--html [path]', 'write self-contained HTML', '.xera/dashboard.html')
  .option('--serve', 'serve HTML at 127.0.0.1:9323 (opens browser)')
  .option('--port <port>', 'serve port (default 9323)', '9323')
  .action(dashboardCommand);
```

### 8.1 Shared serve helper

Extract from `packages/cli/src/commands/show-report.ts` into `packages/cli/src/serve.ts`:

```ts
export async function serveHtmlFile(filePath: string, port: number, rootDir: string): Promise<number> {
  // node:http server, routes /dashboard.html → filePath, all other paths → rootDir-relative file
  // Opens browser via `open` package (already used by show-report)
}
```

Both `show-report` and `dashboard` consume it. `show-report` switches to importing this shared helper (no behavior change).

---

## 9. Tests

**Unit tests** (`packages/core/test/dashboard/`)

- `types.test.ts` — `DashboardSnapshotSchema` parses + rejects malformed payloads.
- `collect.test.ts` — golden fixture project `.xera/` with 5 tickets (2 PASS, 2 FAIL different classifications, 1 NEVER_RUN); verify `collectDashboard` returns expected snapshot. Verify filters: `--since`, `--classification`, `--area`, `--failing-only`. Verify edge cases: missing `.xera/`, malformed status.json.
- `render-text.test.ts` — snapshot test of text output for the same fixture. Width/alignment locked.
- `render-html.test.ts` — output contains `<table>`, contains all ticket IDs, embedded JSON parses round-trip.

**CLI / integration**

- `packages/cli/test/dashboard.test.ts` — `xera dashboard` exits 0 in fixture project; `--json` produces valid JSON; `--html` writes file.
- (Skip integration for `--serve` — port binding flakes in CI.)

**Fixtures** (`fixtures/golden-dashboard/`)

- `5-tickets/` — pre-seeded `.xera/` with 5 tickets covering each result + classification combo + 1 stale + 1 in critical area. Used by collect + render tests.

---

## 10. AGENTS.md scaffold update

Add to the scripts table in `packages/cli/templates/AGENTS.md.tmpl`:

```markdown
| `npx xera dashboard` | Cross-ticket dashboard (text/JSON/HTML) for last-run aggregate |
| `npx xera dashboard --serve` | Serve interactive HTML at 127.0.0.1:9323 |
```

Conditional on `wantsWeb || wantsHttp` (any tested adapter).

---

## 11. Versioning & Release

Minor bump across the `fixed` group (auto-changeset infers from `feat:` PR title). Target: v0.23.0.

No breaking changes; `dashboard` config block is optional.

---

## 12. Open Questions

1. **Serve mode browser open** — already used in `show-report` via `open` package; reuse OR ditch in favor of just printing the URL? Recommendation: keep the `open` behavior (existing UX consistency).
2. **HTML viewer auto-refresh** — should the server poll the source files and live-reload? Out of scope per §header but worth a note in the docs.
3. **Per-scenario detail** — should HTML table expand a row to show failed scenarios + rationales? Recommendation: yes for v1 if it's < 30 LOC of JS (likely is — fetch normalized.json on click, render simple list). Defer if not.
4. **Color in text mode** — picocolors is already a dep in CLI but not core. Use plain ANSI escape codes in `render-text.ts` to avoid taking a dep on picocolors in core, OR move dashboard rendering to CLI. Recommendation: plain ANSI escape codes in core, gated on `process.stdout.isTTY`.
5. **`xera dashboard --watch`** — re-run every N seconds with `clear` between. Useful for local dev. Defer to follow-up.

---

## 13. References

- v0.6 graph design: `docs/superpowers/specs/2026-05-16-xera-v06-project-knowledge-graph-design.md` (`deriveSnapshot`, store layer)
- v0.8 coverage: `docs/superpowers/specs/2026-05-17-xera-v08-coverage-gap-design.md` (similar binary + HTML viewer pattern)
- v0.21 show-report: `packages/cli/src/commands/show-report.ts` (HTML serve mechanism to reuse)
- Status artifact: `packages/core/src/artifact/status.ts`
