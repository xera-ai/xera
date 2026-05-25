# xera v0.8 — Coverage Gap & AC Matrix Design

**Status:** Draft for review
**Date:** 2026-05-17
**Author:** thanh@trinity-technology.com
**Scope:** v0.8.0 — coverage report (area-level + AC-level matrix), risk-ranked gap list, `/xera-coverage` + `/xera-fill-gap` skills, AC backfill for legacy scenarios, `/xera-script` extension to record `satisfiesAcs` eagerly. v0.8.1 — Coverage tab in HTML viewer (Map / List / Trend) composed into existing `graph-render`. v0.8.2 — generative `/xera-fill-gap` (area mode + ticket AC mode).
**Depends on:** v0.6 (project knowledge graph — reuses TicketNode, ScenarioNode, PomNode, AreaNode, FailureNode, `modifies`/`covers`/`tests` edges, event JSONL shard pattern, snapshot rebuild, `graph-render` HTML viewer), v0.7 (HTTP adapter — adapter-agnostic; coverage is computed from graph, not from runner).
**Out of scope (deferred):** AC content-hash IDs (use `ticketId#ac-N` index), synthetic-ticket gap-fill for areas with zero tickets (F2), git-churn risk signal, adjacent P0/P1 priority boost, production-incident integration, per-environment coverage rollup, cross-repo coverage. Each gets its own spec when feedback indicates need.

---

## 1. Goals & Scope

### 1.1 Goal

A QA engineer working in a xera project today gets per-ticket workflows (`/xera-run`, `/xera-impact`, `/xera-promote`) but no answer to the leverage question: **where are we *not* testing yet, and what should we write next?** v0.6 made the graph data available to answer this; v0.8 turns that data into an actionable surface across three audiences:

| Audience | Surface | Question answered |
|---|---|---|
| QA engineer | `/xera-coverage` CLI list | "Which area / which ticket AC should I write a test for next?" |
| Engineering manager / director | HTML viewer Coverage tab | "Are we testing the right things; is coverage trending up or down?" |
| QA engineer (generative) | `/xera-fill-gap` | "Draft scenarios for me so I don't start from a blank file." |

Coverage in v0.8 is computed **from the existing v0.6 graph**, not from runtime coverage instrumentation. Two units of coverage are reported:

- **Area-level**: does any test cover this page/route slug? Reuses existing `POM --covers--> Area` edges and `FailureNode.ts` recency.
- **AC-level**: is each acceptance criterion of each ticket satisfied by at least one passing scenario? Adds one new node kind (`ACNode`) and one new edge (`satisfies`).

### 1.2 In-scope deliverables

**v0.8.0 — engineer-actionable list + AC matrix (one shippable patch):**

- Graph schema additions in `@xera-ai/core`:
  - `ACNode` (new node kind; id = `${ticketId}#ac-${index}`)
  - `satisfies` edge (Scenario → ACNode, confidence-bearing like `similar`)
  - `coverage.snapshot` event payload type added to graph event union
- Coverage engine in `@xera-ai/core`:
  - `packages/core/src/coverage/status.ts` — `computeAreaStatus()`, `computeAcStatus()`, `computeTicketStatus()`
  - `packages/core/src/coverage/risk.ts` — `computeAreaRisk()`, `computeAcGapScore()`
  - `packages/core/src/coverage/report.ts` — JSON + markdown report builders
- Binary subcommands (under `npx xera-internal`, in `packages/core/src/bin-internal/`):
  - `coverage-prepare` — walk snapshot, compute statuses + risks, write JSON + markdown report
  - `ac-coverage-backfill-prepare` — assemble unmapped scenario list for legacy tickets
  - `ac-coverage-backfill-finalize` — validate AI mapping decisions, materialize `satisfies` edges
- New prompt: `packages/prompts/map-ac-to-scenarios.md` (v1.0.0) — used during backfill
- Prompt updates (no version bump on the package, only on individual prompt versions):
  - `packages/prompts/script-from-feature-web.md` — output schema extended with `satisfiesAcs: number[]`
  - `packages/prompts/script-from-feature-http.md` — same extension
- New skill: `packages/skills/xera-coverage.md` (v0.8.0)
- `/xera-script` skill changes: writes the new `satisfiesAcs` field on `scenario.generated` events
- Config schema additions in `@xera-ai/core`: new `coverage` block (optional)
- Test fixtures: `fixtures/golden-coverage/` (six scenarios, see §10)

**v0.8.1 — strategic viewer (incremental):**

- Extend existing `graph-render` binary with `--include-coverage` flag (no new binary)
- New rendering modules in `packages/core/src/graph/render/coverage/`:
  - `map-overlay.ts` — vis-network color overlay per area status
  - `list.ts` — sortable HTML table for gap list
  - `trend.ts` — inline SVG line chart (~60 LOC, no new vendor)
  - `ac-cluster.ts` — small AC dots clustered around TicketNode (off by default, toggle)
- HTML template extension (`packages/core/src/graph/templates/`) — top-level tab switcher between Knowledge and Coverage
- `/xera-coverage --viewer` flag invokes `graph-render --include-coverage` after `coverage-prepare`
- Snapshot emission: `coverage-prepare` writes a `coverage.snapshot` event each run (gated by `coverage.autoSnapshotOnCoverage`, default `true`)

**v0.8.2 — generative auto-propose (incremental):**

- Binary subcommands:
  - `fill-gap-prepare` — assemble area or ticket context (tickets, AC, summaries, adjacent existing scenarios for style reference) into `context.json`
  - `fill-gap-finalize` — validate AI proposal JSON, write `.xera/<TICKET>/feature.draft.md`
- New prompt: `packages/prompts/propose-scenarios.md` (v1.0.0)
- New skill: `packages/skills/xera-fill-gap.md` (v0.8.2)
- `/xera-eval` extension: new `proposeScenarios` rubric + `fixtures/golden-eval/coverage/` (≥3 fixtures, parallel to existing eval rubrics)

### 1.3 Out-of-scope (deferred — each gets its own spec when feedback warrants)

- **AC content-hash IDs.** v0.8 uses `${ticketId}#ac-${index}`. Index is unstable across AC reordering; story-hash drift triggers re-enrichment so the practical leakage is small. Switch to content hash if AC reordering becomes a measurable pain point.
- **Synthetic tickets (F2).** `/xera-fill-gap` only works when ≥1 ticket already modifies the area. Areas with zero tickets remain visible in the report but cannot be auto-proposed; user must create a Jira ticket first.
- **Git-churn risk signal.** Maintenance cost of file-path-to-area mapping after refactors exceeds marginal value given ticket-density already captures activity.
- **Adjacent P0/P1 priority boost.** Overlaps with `/xera-impact`. Reconsider if signal voids appear after v0.8.0 rollout.
- **Production-incident integration.** Requires external system; out of band for v0.8.
- **Per-environment coverage rollup.** v0.8 reports one coverage state, computed from the single graph.
- **Cross-repo / cross-project coverage.** Graph is per-project; aggregation deferred to v1.x.
- **Adjacent-similarity-driven proposals.** `/xera-fill-gap` proposes from ticket AC only, not from similar tickets in other areas. v0.9+ could chain with `similar` edges.

### 1.4 Why bundle area + AC matrix in v0.8.0?

Both are "coverage reporting" computed from the graph. They share:

- Config block (`coverage.staleAfterDays`, `coverage.criticalAreas`)
- Report file (`.xera/coverage/report.{json,md}`)
- `/xera-coverage` skill surface
- Markdown rendering pipeline
- Risk formula spirit ("count in window × multiplier")
- `--why` flag

Splitting them across v0.8.0 / v0.8.1 would duplicate scaffolding and make the spec harder to read. The schema cost (1 node kind, 1 edge kind, 1 event payload) is small. AC backfill is the largest sub-deliverable, but it follows the existing graph-enrich lazy pattern verbatim (skill → AI → JSON → binary validates).

### 1.5 Success criteria

A maintainer can, from a clean checkout:

1. `npm install && npm run typecheck && npx vitest run` — all green, including new `packages/core/test/coverage/` suite.
2. `npx xera-internal verify-prompts` — reports ok with **10 in-scope prompts** (was 9: adds `map-ac-to-scenarios.md`; `propose-scenarios.md` appears at v0.8.2). After v0.8.2: 11.
3. In a freshly scaffolded test project, seed a graph snapshot from `fixtures/golden-coverage/mixed.json`. Run `/xera-coverage`. Output groups areas into UNCOVERED / STALE / COVERED with correct sort order; AC GAPS section lists tickets with unsatisfied ACs.
4. Run `/xera-coverage --why checkout`. Output shows the formula expansion (`3 × 2 + 2 = 8`) and lists contributing tickets + bug events.
5. Run `/xera-coverage --why PROJ-105`. Output shows AC list with ✓/✗ per AC and which scenario(s) satisfy each.
6. Run `/xera-script <new-ticket>` end-to-end (against existing `fixtures/sample-app`). Confirm generated `scenario.generated` events include `satisfiesAcs: number[]`. Confirm graph snapshot rebuild materializes `satisfies` edges.
7. (v0.8.1) Run `/xera-coverage --viewer`. Confirm `.xera/graph/index.html` opens with two top-level tabs (Knowledge, Coverage), Coverage has Map / List / Trend sub-tabs. Click an area on Map → side panel shows the same `--why` breakdown.
8. (v0.8.1) After running `/xera-coverage` three times across different days (simulated via `--ts` flag in tests), Trend tab shows three data points; viewer dedups multiple snapshots from the same day.
9. (v0.8.2) Run `/xera-fill-gap checkout` against `fixtures/golden-coverage/uncovered-only.json`. Skill loads context, calls prompt, presents 3+ proposals, accepts user picks, writes `.xera/<TICKET>/feature.draft.md`. Skill does **not** auto-chain into `/xera-script`.
10. (v0.8.2) Run `/xera-fill-gap --ticket PROJ-105` against `fixtures/golden-coverage/ac-gap.json`. Proposals address only the unsatisfied ACs of PROJ-105.
11. `npx xera-internal doctor` reports ok across all phases.

If any of those breaks, the corresponding phase is not ready.

---

## 2. Architecture

### 2.1 Schema additions

`packages/core/src/graph/types.ts` (additions):

```ts
export type ACNode = {
  kind: 'AC';
  id: string;        // `${ticketId}#ac-${index}`
  ticketId: string;
  index: number;     // 0-based, position in ticket.acceptanceCriteria
  text: string;      // ticket.acceptanceCriteria[index] at materialization time
};

export type SatisfiesEdge = {
  kind: 'satisfies';
  source: string;    // ScenarioNode.id
  target: string;    // ACNode.id
  confidence: number; // [0, 1]
  discoveredAt: string; // ISO8601
  source_label: 'eager' | 'backfill';
};

export type CoverageSnapshotPayload = {
  ts: string;        // ISO8601
  windowDays: number;
  areas: Array<{
    id: string;      // area slug
    status: 'UNCOVERED' | 'STALE' | 'COVERED';
    risk: number;
    breakdown: {
      recentTickets: number;
      recentBugs: number;
      criticalBoost: 1 | 2;
    };
  }>;
  tickets: Array<{
    id: string;
    acCount: number;
    satisfiedCount: number;
    gapScore: number;
  }>;
};

// Existing GraphEvent union extended:
export type GraphEvent =
  | TicketFetchedEvent
  | ScenarioGeneratedEvent      // payload extended with satisfiesAcs: number[]
  | PomEmittedEvent
  | RunCompletedEvent
  | RunClassifiedEvent
  | EnrichmentEvent
  | CoverageSnapshotEvent;      // NEW: { kind: 'coverage.snapshot', payload: CoverageSnapshotPayload }
```

`packages/core/src/graph/schema.ts` (additions): Zod validators for `ACNode`, `SatisfiesEdge`, and `CoverageSnapshotPayload`. Slug validation reuses existing area slug regex `^[a-z0-9-]+$` for the ticketId prefix.

Graph snapshot (`Graph` type in `store.ts`) extends with:

```ts
acNodes: Record<string, ACNode>;       // keyed by id
satisfiesEdges: SatisfiesEdge[];       // append-only
```

Snapshot rebuild logic: on `scenario.generated` events that carry `satisfiesAcs`, materialize `satisfies` edges; on `ticket.fetched`, materialize `ACNode` entries (one per AC); on `ac-coverage.backfilled` events (new sub-event from backfill flow), materialize `satisfies` edges with `source_label: 'backfill'`.

### 2.2 Coverage engine (`packages/core/src/coverage/`)

```
coverage/
  status.ts          computeAreaStatus, computeAcStatus, computeTicketStatus
  risk.ts            computeAreaRisk, computeAcGapScore + weight constants
  report.ts          buildCoverageReport (JSON), renderMarkdown
  why.ts             buildWhyArea, buildWhyTicket (drill-down output)
  index.ts           re-exports
```

Pure functions over a `Graph` snapshot + `CoverageConfig`. No I/O. Binaries in `bin-internal/` are the only place that read/write disk.

**`computeAreaStatus(area, graph, config)`:**

```
UNCOVERED → no POM has covers→area edge
STALE     → ≥1 POM covers area, but no run.classified=PASS for any
            scenario using a POM in this area within last windowDays,
            OR latest classification for any such scenario is in
            {REAL_BUG, SELECTOR_DRIFT, TEST_OUTDATED} unresolved
COVERED   → ≥1 PASS within windowDays AND no unresolved bad classification
```

**`computeAreaRisk(area, graph, config)`:**

```
risk = recent_tickets × critical_boost + recent_bugs

  recent_tickets  = #tickets with modifies→area AND fetchedAt within windowDays
  critical_boost  = 2 if area ∈ config.criticalAreas else 1
  recent_bugs     = #run.classified events for scenarios using POMs in this
                    area within windowDays where classification ∈
                    {REAL_BUG, TEST_OUTDATED}
```

**`computeScenarioStatus(scenario, graph, config)`** (helper):

```
PASSING     → latest run.classified for this scenario within windowDays = PASS
              AND no outstanding REAL_BUG / SELECTOR_DRIFT / TEST_OUTDATED
              classification on this scenario
NOT_PASSING → otherwise (no runs, stale runs, or unresolved bad classification)
```

**`computeAcStatus(ac, graph, config)`:**

```
SATISFIED   → ≥1 satisfies edge from a PASSING scenario
UNSATISFIED → no satisfies edges, OR all satisfying scenarios are NOT_PASSING
```

Rationale: AC status is decided per-scenario, not per-area. A scenario can touch multiple areas via its POMs; AC coverage shouldn't be all-or-nothing on the union. Per-scenario PASSING is the signal that actually answers "is this AC verified?". Area-level status (UNCOVERED / STALE / COVERED) remains for the area gap report; the two are independent derivations from the same `run.classified` events, so they can't lie to each other.

**`computeTicketStatus(ticket, graph, config)`:**

```
COMPLETE   → all ACs SATISFIED
INCOMPLETE → ≥1 AC UNSATISFIED
```

**`computeAcGapScore(ticket, graph, config)`:**

```
gap_score = unsatisfied_count × ticket_recency_boost

  ticket_recency_boost:
    fetchedAt ≤ 7d  → 2.0
    fetchedAt ≤ 30d → 1.0
    older           → 0.5
```

Constants live in `risk.ts`:

```ts
export const RISK_WEIGHTS = {
  criticalBoost: 2,
  bugClassifications: new Set(['REAL_BUG', 'TEST_OUTDATED']),
  recencyBoosts: { recent: 2.0, withinWindow: 1.0, older: 0.5 },
  recencyThresholdDays: 7,
};
```

User cannot override weights via config in v0.8 — they're constants. Document in `docs/CONFIGURATION.md` that weight tuning is a tracked future config knob.

### 2.3 Skill ↔ binary boundary

Coverage report (read-only):

```
graph snapshot (.xera/graph/snapshot.json)
  │
  ▼
xera-internal coverage-prepare [--snapshot-ts ISO] [--no-emit-event]
  ├─→ .xera/coverage/report.json     (machine, schema-validated)
  ├─→ .xera/coverage/report.md       (human, terminal-friendly)
  └─→ .xera/graph/events/<YYYY-MM>/<ULID>-coverage-<session>.jsonl
                                      (one `coverage.snapshot` event;
                                       skipped if --no-emit-event or
                                       config.autoSnapshotOnCoverage=false)
  │
  ▼
/xera-coverage skill reads report.md, prints to terminal
  │
  ▼ (if --viewer)
xera-internal graph-render --include-coverage
  └─→ .xera/graph/index.html         (Coverage tab populated from report.json
                                       + coverage.snapshot events filtered by
                                       --since for Trend tab)
```

Generative (write):

```
xera-internal fill-gap-prepare {--area <slug> | --ticket <ID>}
  └─→ .xera/coverage/<area-or-ticket>/context.json
  │
  ▼ /xera-fill-gap skill loads context, invokes prompt propose-scenarios.md
  │
  ▼ skill writes
.xera/coverage/<area-or-ticket>/proposals.json
  │
  ▼ skill prompts user to pick proposal IDs
  │
  ▼ for each picked:
xera-internal fill-gap-finalize --area <slug> --accept <proposal-id>
                                --ticket <TICKET>          (required: which
                                                            existing ticket
                                                            this scenario
                                                            belongs to)
  └─→ .xera/<TICKET>/feature.draft.md
  │
  ▼ skill prints next-step suggestion: /xera-script <TICKET>
```

`fill-gap-finalize` does **not** invoke `/xera-script` or write `.xera/<TICKET>/meta.json`. The draft is a hint for the user; `/xera-script` is the user's next manual step. Atomic boundary same as `/xera-impact` (which suggests reruns but doesn't run them).

AC backfill (one-time per legacy ticket, lazy on first `/xera-coverage`):

```
/xera-coverage skill
  │
  ▼ runs coverage-prepare first
  ▼ if report shows tickets with acCount > 0 and no satisfies edges:
xera-internal ac-coverage-backfill-prepare
  └─→ .xera/coverage/ac-backfill-input.json
       { tickets: [{ id, summary, acs: [...], scenarios: [{ id, gherkin }] }] }
  │
  ▼ skill invokes prompt map-ac-to-scenarios.md, writes
.xera/coverage/ac-backfill-decisions.json
       { mappings: [{ scenarioId, satisfiesAcs: number[] }] }
  │
  ▼
xera-internal ac-coverage-backfill-finalize
  ├─→ validates each decision against ACNode.text similarity (warn if Δ large)
  └─→ .xera/graph/events/<YYYY-MM>/<ULID>-ac-backfill-<session>.jsonl
       (one ac-coverage.backfilled event per ticket; idempotent on
        scenarioId — re-running overwrites existing satisfies edges from
        previous backfill, never duplicates)
```

Backfill is idempotent and skipped automatically when no legacy gap exists.

### 2.4 Why this shape

- **Determinism boundary (per CLAUDE.md):** AI never runs inside a binary. Coverage-prepare is fully deterministic. AC mapping calls a prompt only on first run per ticket, and the mapping is then frozen as graph events.
- **No new framework / runtime / vendor.** Coverage Map reuses vis-network already vendored for v0.6 graph viewer. Trend chart is inline SVG (~60 LOC).
- **Reusable risk formula.** Single `recent_tickets × critical_boost + recent_bugs` formula in `risk.ts`. AC gap score follows the same "count × multiplier" shape.
- **AC matrix piggybacks on graph events.** `satisfies` edges are emitted via the same JSONL event stream — no new storage, no new sync logic, no new gitignore entry beyond the existing `.xera/graph/snapshot.json`.

---

## 3. Config schema additions

`packages/core/src/config/schema.ts` (Zod schema):

```ts
const CoverageConfigSchema = z.object({
  staleAfterDays: z.number().int().positive().default(30),
  criticalAreas: z.array(z.string().regex(/^[a-z0-9-]+$/)).default([]),
  autoSnapshotOnCoverage: z.boolean().default(true),
}).default({});

// Existing top-level Config schema gains:
//   coverage: CoverageConfigSchema
```

Example `xera.config.ts`:

```ts
import { defineConfig } from '@xera-ai/core';

export default defineConfig({
  adapters: ['web', 'http'],
  // ...
  coverage: {
    staleAfterDays: 30,
    criticalAreas: ['checkout', 'auth', 'billing'],
    autoSnapshotOnCoverage: true,
  },
});
```

All three fields optional with sensible defaults. `staleAfterDays` is reused as both:

- the recency window for area STALE/COVERED classification
- the recency window for `recent_tickets` and `recent_bugs` counts in risk formula

Single threshold → no two-knob mismatch.

CLI `init` wizard does **not** prompt for coverage config (defaults are sane for first run). User edits `xera.config.ts` to set `criticalAreas` after initial use.

`init --upgrade` does not migrate any existing config (no breaking changes to other blocks).

`cli/doctor` adds gentle warning if `coverage.staleAfterDays > 90` ("very large window — coverage will be slow to react to drift") or if any `criticalAreas` slug doesn't appear in any AreaNode ("`<slug>` is marked critical but no ticket modifies this area; check spelling").

---

## 4. CLI surface

### 4.1 `/xera-coverage` skill

Skill file: `packages/skills/xera-coverage.md` (v0.8.0).

Inputs: none required. Optional flags forwarded to binary via skill template:

| Flag | Behavior |
|---|---|
| (none) | List, default sort: UNCOVERED then STALE by risk desc, then AC GAPS by gap_score desc |
| `--why <area-or-ticket>` | Drill-down breakdown for one area slug or ticket ID |
| `--all` | Include COVERED areas section in output (collapsed by default) |
| `--viewer` | After list, also run `graph-render --include-coverage` and print HTML path |
| `--json` | Print raw `report.json` instead of markdown (for scripting) |
| `--no-snapshot` | Skip emitting `coverage.snapshot` event this run (testing) |

Terminal output (default):

```
$ /xera-coverage

Coverage report — generated 2026-05-17 · window 30d

UNCOVERED — 4 areas, sorted by risk

  #1  checkout   risk 8    3 tickets · 2 bugs · critical ×2
  #2  profile    risk 4    3 tickets · 1 bug
  #3  auth       risk 2    1 ticket · critical ×2
  #4  admin      risk 0    (no recent activity)

STALE — 2 areas, has tests but no PASS in 30d

  #1  billing    last PASS 47d ago · 1 outstanding REAL_BUG
  #2  search     last PASS 31d ago

AC GAPS — 3 tickets with unsatisfied acceptance criteria

  PROJ-105  3/5 ACs covered · gap_score 4
    ✗ AC-2  Tax line item shows in cart preview
    ✗ AC-4  Receipt email includes order summary
  PROJ-107  1/3 ACs covered · gap_score 4
    ✗ AC-2  Search results paginate after 20 items
    ✗ AC-3  Search shows "no results" state
  PROJ-101  4/5 ACs covered · gap_score 1
    ✗ AC-3  Apple Pay declined card error message

COVERED — 5 areas (collapsed; show with --all)

Next:
  /xera-coverage --why <area-or-TICKET>      full breakdown
  /xera-coverage --viewer                     open HTML viewer
  /xera-fill-gap <area>                       draft scenarios for an area
  /xera-fill-gap --ticket <TICKET>            draft scenarios for AC gaps
```

`--why` for an area:

```
$ /xera-coverage --why checkout

Area: checkout (UNCOVERED, critical)

Risk score: 8
  recent_tickets × critical_boost + recent_bugs
  = 3 × 2 + 2 = 8

Recent tickets (3, last 30d):
  PROJ-101  2026-05-15  Add Apple Pay to checkout
  PROJ-102  2026-05-10  Refund flow improvements
  PROJ-103  2026-04-20  Tax line item

Recent bugs (2, last 30d):
  2026-05-14  REAL_BUG       scenario "checkout completes with valid card"
  2026-05-09  TEST_OUTDATED  scenario "checkout shows tax"

No POM covers this area. To draft scenarios:
  /xera-fill-gap checkout
```

`--why` for a ticket:

```
$ /xera-coverage --why PROJ-105

Ticket: PROJ-105 (INCOMPLETE, 3/5 ACs covered)
  Title: Add tax line item to checkout
  Fetched: 2026-05-12 (5d ago, recency boost ×2.0)
  AC gap score: 4 (2 unsatisfied × 2.0)

Acceptance Criteria:
  ✓ AC-0  User sees subtotal       — scenario "checkout shows subtotal"
  ✓ AC-1  User sees discount line   — scenario "checkout shows discount"
  ✗ AC-2  Tax line item shows in cart preview
  ✓ AC-3  Total includes tax       — scenario "checkout total includes tax"
  ✗ AC-4  Receipt email includes order summary

To draft scenarios for unsatisfied ACs:
  /xera-fill-gap --ticket PROJ-105
```

`--json` output is the contents of `.xera/coverage/report.json` printed to stdout (newline-terminated). Useful for grep/jq pipelines and CI gates.

Exit codes:

| Code | Meaning |
|---|---|
| 0 | Report generated, no errors |
| 1 | Graph snapshot missing or corrupt; skill recommends `npx xera-internal graph-backfill` |
| 2 | Config invalid (`coverage.criticalAreas` contains non-slug, etc.) |

### 4.2 `/xera-fill-gap` skill (v0.8.2)

Skill file: `packages/skills/xera-fill-gap.md` (v0.8.2).

Inputs (one of):

| Flag | Behavior |
|---|---|
| `<area>` (positional) | Fill UNCOVERED area: propose scenarios from tickets modifying that area |
| `--ticket <TICKET>` | Fill UNSATISFIED ACs of a specific ticket |

Mutually exclusive. Skill errors if both / neither provided.

Output: writes `.xera/<TICKET>/feature.draft.md` for each accepted proposal. Prints next-step hint. Skill does NOT chain into `/xera-script`.

Idempotency: if `feature.draft.md` already exists, prompt user (overwrite / skip). If `meta.json` already exists for the ticket, also write `feature.draft.md` (next to the live `feature.md`) and let `/xera-script` merge or replace.

### 4.3 Doctor extensions

`cli/doctor` v0.8 additions:

- Warn if `coverage.staleAfterDays > 90`.
- Warn if any `criticalAreas` slug doesn't appear as an AreaNode in the snapshot.
- Warn if any ticket has `acceptanceCriteria.length > 0` but no `ACNode` materialized (signals graph rebuild needed).
- Warn if more than 30% of scenarios lack `satisfies` edges (signals backfill needed; suggest running `/xera-coverage` which auto-triggers backfill).

All warnings, no hard fails.

---

## 5. Skills + prompts

### 5.1 `packages/skills/xera-coverage.md` (NEW, v0.8.0)

Workflow:

1. Validate cwd is a xera project (config + `.xera/graph/snapshot.json` present).
2. Run `npx xera-internal coverage-prepare` (with `--snapshot-ts` only if test mode).
3. Read `.xera/coverage/report.json`. If `acBackfillNeeded === true`:
   - Run `npx xera-internal ac-coverage-backfill-prepare`.
   - Read `.xera/coverage/ac-backfill-input.json`.
   - Invoke prompt `map-ac-to-scenarios.md` with input as data.
   - Write LLM output to `.xera/coverage/ac-backfill-decisions.json`.
   - Run `npx xera-internal ac-coverage-backfill-finalize`.
   - Re-run `coverage-prepare` to recompute with new `satisfies` edges.
4. Read `.xera/coverage/report.md`, print to terminal.
5. If `--viewer`: run `npx xera-internal graph-render --include-coverage`, print HTML path.
6. Print next-step suggestions.

Skill .md follows existing skill conventions (frontmatter + workflow steps, verbatim from implementation plan).

### 5.2 `packages/skills/xera-fill-gap.md` (NEW, v0.8.2)

Workflow:

1. Validate inputs (area slug exists in graph, or ticket ID exists with INCOMPLETE status).
2. Run `npx xera-internal fill-gap-prepare --area <slug>` or `--ticket <TICKET>`.
3. Read `.xera/coverage/<id>/context.json`.
4. Invoke prompt `propose-scenarios.md` with context as data.
5. Write LLM output to `.xera/coverage/<id>/proposals.json`.
6. Print proposals to user, prompt for picks.
7. For each picked proposal: run `npx xera-internal fill-gap-finalize --accept <id> --ticket <TICKET>`.
8. Print final next-step hint.

### 5.3 `packages/prompts/map-ac-to-scenarios.md` (NEW, v1.0.0)

Used during AC backfill. Input shape (passed to LLM as JSON):

```json
{
  "tickets": [
    {
      "id": "PROJ-105",
      "summary": "Add tax line item to checkout",
      "acs": [
        "User sees subtotal",
        "User sees discount line",
        "Tax line item shows in cart preview",
        "Total includes tax",
        "Receipt email includes order summary"
      ],
      "scenarios": [
        { "id": "PROJ-105#scenario-0", "gherkin": "...", "name": "..." }
      ]
    }
  ]
}
```

Output schema:

```json
{
  "mappings": [
    { "scenarioId": "PROJ-105#scenario-0", "satisfiesAcs": [0, 1, 3] }
  ]
}
```

Rules in prompt body:

- For each scenario, list which AC indices (0-based) it asserts.
- Empty array if scenario asserts nothing in the AC list (e.g. pure setup scenario).
- Do not invent ACs.
- Conservative: if a scenario plausibly tests an AC but doesn't explicitly assert it, exclude.

### 5.4 `packages/prompts/propose-scenarios.md` (NEW, v1.0.0)

Used during `/xera-fill-gap`. Input shape:

```json
{
  "mode": "area" | "ticket",
  "area": "checkout",
  "tickets": [
    { "id": "PROJ-101", "summary": "...", "acs": [...] }
  ],
  "unsatisfiedAcs": [             // populated only in "ticket" mode
    { "ticketId": "PROJ-105", "index": 2, "text": "Tax line item..." }
  ],
  "existingScenarios": [          // adjacent area scenarios for style ref
    { "areaSlug": "auth", "gherkin": "..." }
  ]
}
```

Output schema:

```json
{
  "proposals": [
    {
      "id": "P1",
      "ticketId": "PROJ-101",
      "title": "Customer pays with Apple Pay",
      "rationale": "Ticket adds Apple Pay; no scenario covers this path.",
      "gherkin": "Scenario: Customer pays with Apple Pay\n  Given ...\n  When ...\n  Then ...",
      "satisfiesAcs": [0, 2]
    }
  ]
}
```

Rules:

- Always 3-5 proposals (LLM picks count based on coverage gap size).
- Each proposal MUST link to exactly one existing ticket (the `ticketId` field).
- In `ticket` mode: every proposal MUST address at least one unsatisfied AC.
- In `area` mode: proposals cover distinct ACs / behaviors; avoid duplicating an existing scenario referenced in `existingScenarios`.
- Gherkin format follows existing `script-from-feature-*.md` style (Given/When/Then, no Background unless data setup is shared).
- Each proposal's `rationale` is one sentence explaining the gap it fills.

### 5.5 Updates to existing prompts

`packages/prompts/script-from-feature-web.md` and `script-from-feature-http.md`:

- Output schema extended with `satisfiesAcs: number[]` per generated scenario.
- Rule added: "For each scenario, list AC indices (0-based) it asserts. Empty array if scenario asserts no AC."
- Version bump on the prompt: web 1.2.0 → 1.3.0, http 1.0.0 → 1.1.0.

### 5.6 In-scope prompts list update

Current: 9 in-scope prompts. After v0.8.0: 10. After v0.8.2: 11.

```
diagnose-failure
feature-from-story
script-from-feature-web
script-from-feature-http
heal-locator
extract-areas
similarity-match
classify-outdated
eval-rubric
map-ac-to-scenarios            (NEW v0.8.0)
propose-scenarios              (NEW v0.8.2)
```

`npx xera-internal verify-prompts` validates count.

---

## 6. Binaries

All new binaries follow the existing `bin-internal/` shape (entry point in `index.ts`, subcommand module in own file, JSON I/O only, no shell-out, no AI).

| Subcommand | Phase | Input | Output | Purpose |
|---|---|---|---|---|
| `coverage-prepare` | v0.8.0 | `.xera/graph/snapshot.json` + config | `report.json`, `report.md`, optional `coverage.snapshot` event | Compute all coverage state |
| `ac-coverage-backfill-prepare` | v0.8.0 | snapshot | `ac-backfill-input.json` | Assemble unmapped scenario list |
| `ac-coverage-backfill-finalize` | v0.8.0 | `ac-backfill-decisions.json` (from skill+AI) | `ac-coverage.backfilled` event | Validate + emit satisfies edges |
| `fill-gap-prepare` | v0.8.2 | snapshot + `--area` or `--ticket` | `context.json` | Assemble proposal context |
| `fill-gap-finalize` | v0.8.2 | `proposals.json` (from skill+AI) + `--accept <id>` + `--ticket <ID>` | `.xera/<TICKET>/feature.draft.md` | Materialize accepted proposal |
| `graph-render` (extended) | v0.8.1 | snapshot + report.json + events | `.xera/graph/index.html` | Add Coverage tab when `--include-coverage` |

Each binary has typed CLI parsing (`packages/core/src/bin-internal/util/args.ts` pattern) and emits structured stderr on errors.

`coverage-prepare` CLI:

```
xera-internal coverage-prepare [options]
  --snapshot-ts ISO         Override "now" for testing (default: real now)
  --no-emit-event           Skip emitting coverage.snapshot event
  --output-dir <path>       Default: .xera/coverage/
```

`fill-gap-finalize` CLI:

```
xera-internal fill-gap-finalize --accept <proposal-id>
                                --ticket <TICKET>
                                [--source-context <path>]   default: .xera/coverage/<id>/proposals.json
                                [--force]                    overwrite existing feature.draft.md
```

`graph-render --include-coverage` reads `.xera/coverage/report.json` if present and `coverage.snapshot` events from the graph event log. If `report.json` is missing it warns and renders Knowledge tab only.

---

## 7. Artifact layout

```
.xera/
  coverage/
    report.json                                machine-readable, schema-validated
    report.md                                  human-readable (cli output)
    ac-backfill-input.json                     transient, ok to delete
    ac-backfill-decisions.json                 transient, ok to delete
    <area-slug>/
      context.json                             transient (v0.8.2)
      proposals.json                           transient (v0.8.2)
    <TICKET>/                                  for --ticket mode
      context.json                             transient (v0.8.2)
      proposals.json                           transient (v0.8.2)
  <TICKET>/
    feature.draft.md                           output of /xera-fill-gap
    feature.md                                 unchanged (live feature file)
    ...
  graph/
    events/<YYYY-MM>/
      <ULID>-coverage-<session>.jsonl          NEW (v0.8.1+ when autoSnapshot)
      <ULID>-ac-backfill-<session>.jsonl       NEW (v0.8.0, one-time per ticket)
    snapshot.json                              extended with acNodes + satisfiesEdges
    index.html                                 extended with Coverage tab (v0.8.1)
```

`.gitignore` updates: `report.md`, `ac-backfill-*.json`, `**/context.json`, `**/proposals.json` — all transient. `.xera/coverage/report.json` IS committed (it's the durable artifact) similar to how `.xera/graph/events/` is committed. Final `.gitignore` template in `packages/cli/templates/.gitignore`:

```
# transient coverage scratch
.xera/coverage/*.md
.xera/coverage/ac-backfill-*.json
.xera/coverage/**/context.json
.xera/coverage/**/proposals.json
```

`.xera/coverage/report.json` IS committed (lockstep with graph events).

`feature.draft.md` is committed alongside `feature.md` — it's a starting point the user iterates on.

---

## 8. HTML viewer composition (v0.8.1)

Extends existing `graph-render` output (`.xera/graph/index.html`). The template gains a top-level tab switcher.

### 8.1 Top-level tabs

```html
<nav class="x-toplevel">
  <button data-tab="knowledge">Knowledge</button>
  <button data-tab="coverage">Coverage</button>
</nav>
<section data-tab="knowledge"><!-- existing vis-network --></section>
<section data-tab="coverage" hidden><!-- new --></section>
```

State preserved via `location.hash` (`#coverage`, `#coverage/list`).

### 8.2 Coverage sub-tabs

```
[ Map ]  [ List ]  [ Trend ]
```

**Map view:**

Reuses vis-network instance from Knowledge tab (clone graph data, replace node colors). Color mapping:

```ts
const STATUS_COLOR = {
  UNCOVERED: { background: '#fca5a5', border: '#dc2626' },  // red
  STALE:     { background: '#fcd34d', border: '#d97706' },  // amber
  COVERED:   { background: '#86efac', border: '#15803d' },  // green
};
```

Applied to AreaNode entries in `coverage` graph. Other node kinds (Ticket, Scenario, POM, Failure, AC) render with subdued / neutral colors so areas stand out.

Click area → side panel renders the `--why <area>` markdown converted to HTML (reuse `report.md` content sliced to area section). No new round-trip to binary; panel reads from `report.json` already embedded.

Optional toggle: "Show AC nodes" — when on, materializes AC small dots (radius 4px) clustered around their Ticket parent. Off by default to avoid 100+ extra nodes obscuring layout.

**List view:**

Plain `<table>` with sortable columns:

```
Status  | Area          | Risk | #Tickets | #Bugs | Last PASS  | Action
UNCOVERED checkout       8      3          2       —             [fill-gap]
STALE     billing        —      —          1       47d ago       [view in map]
...
```

Below: AC GAPS subtable, same column structure but per-ticket:

```
Ticket    | Coverage  | Gap | Unsatisfied ACs                    | Action
PROJ-105  | 3/5       | 4   | AC-2, AC-4                          [fill-gap]
...
```

Action buttons are anchor links — Map tab switches and highlights node; fill-gap shows a CLI command to copy.

**Trend view:**

Inline SVG line chart. Data: `coverage.snapshot` events from event log, deduped by date (last snapshot per day wins), filtered by viewer's `--since` flag (default 90 days). Two series:

```
Y: #UNCOVERED + #STALE areas (red line)
Y: % ACs satisfied across all tickets (green line, right Y axis)
X: date (UTC day)
```

Below chart: per-area sparkline rows for top 10 high-risk areas. Each sparkline shows status transitions (color blocks) over the time window.

Implementation: ~60 LOC of inline SVG generation in `render/coverage/trend.ts`. Path-string generation via simple linear interpolation. Tooltips via native `<title>` element (no JS hover handlers).

### 8.3 Performance

Default render: Map + List render synchronously (data already in `report.json`). Trend lazy-loads only when its tab is clicked — reads event JSONL files via async `fetch()` from the served directory (or inlines events if HTML is opened via `file://`).

For projects with >365 days of events: Trend caps at last 365 days unless `--since-days` flag overridden.

### 8.4 No new vendor libraries

Existing vendored `vis-network.min.js` (already excluded from biome via `biome.json`) suffices for Map. Trend is hand-rolled SVG. List is plain HTML/CSS. No chart.js, no d3, no plotly.

---

## 9. Mock targets & golden fixtures

### 9.1 `fixtures/golden-coverage/`

Six fixtures. Each is a complete `.xera/graph/snapshot.json` (no events needed; tests load snapshot directly).

| Fixture | Purpose |
|---|---|
| `uncovered-only.json` | 4 areas with tickets, no POMs anywhere. Validates UNCOVERED detection + risk sort. |
| `stale-only.json` | All areas have POMs but no recent PASS classifications. Validates STALE detection. |
| `mixed.json` | All 3 statuses present, multiple areas per status. Used for E2E `coverage-prepare` test. |
| `critical-boost.json` | Two areas with identical signals; one in `criticalAreas`. Validates ×2 multiplier. |
| `bug-history.json` | One area with REAL_BUG and TEST_OUTDATED events in window. Validates `recent_bugs` term. |
| `ac-gap.json` | One ticket with 5 ACs, 3 scenarios mapping to ACs 0/1/3 via `satisfies` edges. Validates `computeAcStatus` + gap_score. |

Each fixture includes a sibling `.expected.json` that is the asserted `report.json` output. Tests do `expect(report).toEqual(expected)`.

### 9.2 `fixtures/golden-eval/coverage/` (v0.8.2)

For `/xera-eval` rubric on `propose-scenarios.md`. ≥3 fixtures, each with:

- `input.json` (matches prompt input schema)
- `rubric.md` (assertions: must include scenarios for AC X, must not duplicate existing scenario Y, must follow Gherkin format)
- Sample output JSON from a baseline model run for regression comparison

Pattern follows v0.2 eval design.

---

## 10. Test plan

### 10.1 Unit tests (`packages/core/test/coverage/`)

```
status.test.ts        computeAreaStatus / computeAcStatus / computeTicketStatus
                      across all 6 golden-coverage fixtures
risk.test.ts          computeAreaRisk: window edges (29d/30d/31d), critical_boost,
                      bug_history additivity, zero-cases
                      computeAcGapScore: recency tier boundaries (7d/30d/31d)
report.test.ts        buildCoverageReport JSON shape; renderMarkdown snapshot
why.test.ts           buildWhyArea + buildWhyTicket against fixtures
schema.test.ts        Zod validators for ACNode, SatisfiesEdge, CoverageSnapshotPayload
```

Run order matters: place `coverage/` after existing `graph/` tests so failures in the foundation surface first.

### 10.2 Integration tests (`packages/core/test/bin-internal/`)

```
coverage-prepare.test.ts                       E2E with mixed.json
ac-coverage-backfill-prepare.test.ts           E2E identifies unmapped tickets
ac-coverage-backfill-finalize.test.ts          E2E validates + emits events
fill-gap-prepare.test.ts                       E2E for both --area and --ticket modes
fill-gap-finalize.test.ts                      E2E writes feature.draft.md, --force overwrite
graph-render-coverage.test.ts                  E2E renders Coverage tab HTML, snapshot
```

For binaries that orchestrate AI calls in production, tests stub the AI step: pass in a pre-baked `decisions.json` / `proposals.json` and verify the binary's validate-and-materialize half.

### 10.3 Skill tests

Skill `.md` files are validated by `npx xera-internal verify-prompts` against the in-scope list and version line presence. No end-to-end skill test in v0.8 (skills run in Claude Code sessions, not in `npx vitest run`). Manual smoke per §1.5.

### 10.4 Eval suite

`npx xera-internal eval-deterministic` already covers existing prompts. v0.8 adds:

- `map-ac-to-scenarios` rubric (v0.8.0) — 3 fixtures in `golden-eval/coverage/` (mapping precision + recall).
- `propose-scenarios` rubric (v0.8.2) — 3+ fixtures, asserts proposals cover the gap, link to real ticket, Gherkin parses.

Eval failures don't block release but appear in the eval report.

### 10.5 Manual smokes

Per §1.5 success criteria 3–10.

---

## 11. Migration & back-compat

### 11.1 Graph schema

`acNodes` and `satisfiesEdges` are additive fields on the `Graph` type. Old snapshots without these fields are loaded as empty (Zod default `[]`). Snapshot rebuild from existing events auto-populates `acNodes` from existing `ticket.fetched` events (ACs were already present in event payload as `acceptanceCriteria`); legacy `scenario.generated` events don't carry `satisfiesAcs`, so the backfill flow runs on first `/xera-coverage`.

### 11.2 Existing skills

`/xera-script` skill .md gets a one-paragraph addition: the LLM output schema now requires `satisfiesAcs` per scenario. The prompt template change is what enforces this; skill text only mirrors it for the session LLM's awareness.

Other skills (`/xera-fetch`, `/xera-feature`, `/xera-exec`, `/xera-report`, `/xera-impact`, `/xera-promote`, `/xera-eval`) are unchanged.

### 11.3 Existing config

No breaking changes. `coverage` is a new optional block.

### 11.4 Existing artifacts

No file shape changes. `.xera/<TICKET>/feature.md` is unchanged. `.xera/coverage/` is a new directory; first run creates it.

### 11.5 Existing CI workflows

`xera-graph.yml` workflow template (v0.6) is unchanged; v0.8.1 publishes Coverage tab through the same `index.html` artifact upload.

### 11.6 Version bumps

Driven by changesets per usual workflow. Anticipated:

- `@xera-ai/core` minor (config schema additive but new) — 0.9.x → 0.10.0
- `@xera-ai/skills` minor — 0.9.x → 0.10.0
- `@xera-ai/prompts` minor — 0.9.x → 0.10.0 (new prompts + edit on existing)
- `@xera-ai/web`, `@xera-ai/http` patch (caret bump on core) — 0.9.x → 0.10.0 (fixed group)
- `@xera-ai/cli` patch — doctor checks added

All six packages bump in lockstep per the fixed-group changeset config.

Spec milestone numbering (`v0.8`) is independent from package semver (`0.10.0`) — see CLAUDE.md note.

---

## 12. Security posture

- No new untrusted-input surfaces. Coverage report reads only from the local graph snapshot, which was already vetted in v0.6.
- AI prompt input (for backfill + propose) includes ticket summaries and acceptance criteria — already on-disk from Jira via existing `/xera-fetch`. No new disclosure.
- `feature.draft.md` is a starting point, not executable. Cannot leak.
- HTML viewer is generated locally and opened via `file://`; no new network calls. Trend tab only reads same-origin events.
- AC text in `ACNode.text` is stored as a copy of `ticket.acceptanceCriteria[index]` at materialization time. If a ticket is re-fetched and AC text changes, story-hash drift triggers regeneration of all `ACNode` rows for that ticket; old text is discarded. No long-term staleness.
- `propose-scenarios.md` prompt is subject to v0.3 prompt-injection defense: ticket fields are wrapped in `<untrusted_external_data>` envelope before being passed to the session LLM. Reuses existing `wrapUntrusted()` helper from `@xera-ai/core`.

---

## 13. Risks & mitigations

| Risk | Likelihood | Mitigation |
|---|---|---|
| Snapshot pollution from local `xera coverage` runs | High | Trend tab dedups by date when reading; never dedups on write. JSONL ~1 KB/event; storage cost negligible. Config flag `autoSnapshotOnCoverage` lets user opt out. |
| Risk weights drift after user feedback | Medium | Weights are consts in `risk.ts`, documented in `docs/CONFIGURATION.md`. Not in UI. Easy to bump. |
| AC reordering invalidates `satisfies` edges (index-based ID) | Low | Story-hash drift on re-fetch triggers re-enrichment; satisfies edges with mismatched AC text get warnings on snapshot rebuild. Migration to content-hash ID deferred to v0.9 if pain emerges. |
| AC text changes silently (Jira edit without ticket refetch) | Low | `coverage-prepare` warns when `ACNode.text !== ticket.acceptanceCriteria[index]` and recommends `npx xera-internal graph-backfill`. |
| AI proposes scenario that duplicates existing one | Medium | `fill-gap-prepare` includes `existingScenarios` from adjacent areas in context.json; prompt rule "avoid duplicating an existing scenario." Verified via eval rubric. |
| Viewer perf with >365 days of events | Low | Trend lazy-loads on tab click; caps at 365 days unless override. |
| POM `covers` edge stale after refactor | Low | Reuses existing `graph-enrich` lifecycle from v0.6. No new code path. |
| User runs `/xera-fill-gap` without graph snapshot | Low | Skill validates snapshot presence; fails with clear message + `/xera-fetch` suggestion. |
| Backfill misclassifies AC → Scenario mapping | Medium | Backfill stores `source_label: 'backfill'` + `confidence` on `satisfies` edge. UI can filter / re-prompt low-confidence edges later. Eval rubric measures precision against fixtures. |
| Critical-areas list contains typo | Low | `doctor` warns. Snapshot generation tolerates (untyped slug = no match = no boost). |

---

## 14. Resolved decisions

### 14.1 3-state area model vs. binary

Decided: 3-state (UNCOVERED / STALE / COVERED). Captures QA's mental model. STALE category enables `/xera-impact` chaining without duplicating that surface.

### 14.2 AC ID encoding

Decided: `${ticketId}#ac-${index}`, 0-based. Simple, debug-friendly. Content-hash deferred (see §1.3).

### 14.3 Eager + lazy backfill for `satisfies`

Decided: both. Eager via `/xera-script` LLM output (no extra AI call). Lazy via dedicated backfill prompt for legacy scenarios (one-time per ticket).

### 14.4 Risk formula simplicity

Decided: `recent_tickets × critical_boost + recent_bugs`. Hard 30-day window (not exponential decay). Each row in UI shows `3 tickets · 2 bugs · critical ×2` so user never has to read the formula.

### 14.5 AC gap score formula

Decided: `unsatisfied_count × recency_boost(7d/30d/older)`. Simple tier function. Same spirit as risk formula.

### 14.6 Generative scope (F1 vs F2)

Decided: F1 only — `/xera-fill-gap` requires an existing ticket. Synthetic-ticket support (F2) deferred. User with truly untracked work must create a Jira ticket first.

### 14.7 Skill granularity

Decided: 2 skills — `/xera-coverage` (read) + `/xera-fill-gap` (write). Matches existing impact/promote/script granularity. No combined skill.

### 14.8 Viewer composition

Decided: extend existing `graph-render` with `--include-coverage` flag, add top-level tab. No separate `coverage-render` binary. Reuses vis-network. Trend chart is inline SVG, no new vendor.

### 14.9 No new config knob for weights

Decided: weights are consts in v0.8. Document in `CONFIGURATION.md` that override is a tracked future feature. Reduces surface area for misconfiguration.

### 14.10 Snapshot emission default-on

Decided: `autoSnapshotOnCoverage: true` by default. Reasoning: most users will only run `xera coverage` a few times per week, so daily-dedup is fine; CI usually runs once per push. Opt-out is one config line.

### 14.11 AC backfill triggers automatically

Decided: `/xera-coverage` auto-runs backfill on first invocation per ticket. No separate "init coverage" step. Idempotent — subsequent runs are no-ops for tickets already backfilled.

### 14.12 `feature.draft.md` lives alongside `feature.md`

Decided: drafts and live features coexist in `.xera/<TICKET>/`. User decides when to promote draft → live (manually, via `/xera-script`). Avoids fragile auto-merge logic.

---

## 15. Roadmap context

What v0.8 unlocks for later versions:

- **v0.9** could add **AC content-hash IDs** if reorder pain emerges, and **`xera-feature --from-spec openapi.yaml`** (originally listed for v0.8 in v0.7 spec §1.3, now deferred). With AC matrix existing, OpenAPI-derived AC ↔ Scenario mapping has a target node type.
- **v1.0** can introduce **cross-adapter coverage** — web tickets that call endpoint X join api tickets testing endpoint X via shared `Endpoint` node. AC matrix established the precedent for fine-grained coverage units.
- **v1.x** **production-incident integration** lights up `recent_bugs` term with real signal beyond classifier output.
- **v1.x** **synthetic tickets** (F2) for areas without any Jira ticket.
- **v1.x** **manager dashboard rollups** (cross-repo, multi-project) on top of the per-project HTML viewer.

Each is a separate spec.

---
