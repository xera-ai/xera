# xera v0.6 — Project Knowledge Graph Design

**Status:** Draft for review
**Date:** 2026-05-16
**Author:** thanh@trinity-technology.com
**Scope:** v0.6.0 – v0.6.3 — graph foundation + TEST_OUTDATED classifier bucket + `/xera-impact` skill + static HTML viewer
**Depends on:** v0.1 (core + classifier), v0.3 (prompt-injection defense — graph stores ticket text, untrusted-input handling reused), v0.5 (self-healing selector drift — graph integrates with existing heal sub-flow)
**Out of scope (deferred):** SQLite backend for >50k events (v0.7+), code-level edges from git/PR signals (v0.7+), interactive web app dashboard (v1.0+), cross-repo graph federation (never — local-first), sprint mode `/xera-sprint` (v0.7 — depends on graph), prod trace backfill (v0.8 — depends on graph)

---

## 1. Goals & Scope

### 1.1 Goal

Give xera a persistent, repo-local, AI-augmented knowledge graph that links tickets ↔ scenarios ↔ POMs ↔ SUT areas ↔ failures, then surface that graph through:

1. A new `TEST_OUTDATED` classifier bucket (5th alongside BUG / FLAKE / SELECTOR_DRIFT / ENV_ERROR) that distinguishes "test asserts behavior a later ticket has intentionally changed" from "test asserts behavior that's actually broken".
2. A new `/xera-impact <TICKET>` skill that answers "which existing scenarios may be affected by this ticket's changes?" before merge, then re-runs them.
3. A static HTML viewer (`.xera/graph.html`) for QA managers and ad-hoc inspection.

The core pain point: QA teams abandon test automation after 6 months because they cannot trace which tests relate to which tickets. When ticket B modifies behaviour that ticket A's tests assert, the tests fail mysteriously and look like regressions. Graph closes this loop.

### 1.2 Why this is the killer feature for v0.6

Every previous version added a vertical feature (classifier, eval harness, prompt-injection defense, self-heal). v0.6 adds the horizontal foundation that future features compose against:

- `/xera-sprint` (v0.7) reads graph to roll up team-scale state
- Prod trace backfill (v0.8) inserts events into graph, gaining inherited classification value
- AC coverage matrix (v0.7+) is a graph projection
- Test ownership / smart notifications: graph-derived

Graph is also the only feature whose value scales with project age — competitors can copy skills overnight but cannot copy 6 months of accumulated context.

### 1.3 In-scope deliverables

- `packages/core/src/graph/` module: types, schema, store, similarity, traverse, classify, render, enrich, cost
- 6 new bin-internal subcommands: `graph-record`, `graph-snapshot`, `graph-query`, `graph-enrich`, `graph-render`, `impact-prepare`
- 3 new prompt templates: `extract-areas.md` (v1.0.0), `similarity-match.md` (v1.0.0), `classify-outdated.md` (v1.0.0)
- `/xera-impact <TICKET>` skill (v0.6.2)
- 5 existing skills patched to emit graph events: `xera-fetch`, `xera-script`, `xera-exec`, `xera-report`, `xera-promote`
- TEST_OUTDATED bucket integrated into existing classifier flow + v0.5 self-heal sub-flow (skip heal when TEST_OUTDATED)
- Static HTML viewer with vendored `vis-network.min.js`
- 8 new golden fixtures (5 `golden-graph/`, 3 `golden-impact/`) + 5 new EVAL fixtures
- Schema versioning + backfill command for pre-v0.6 projects

### 1.4 Explicit non-goals

- **No real-time graph sync** — graph is repo-local, eventually consistent via git
- **No cross-repo federation** — each xera project has its own graph
- **No vector store dependency** — similarity computed by Claude at-fetch-time with rolling window
- **No SaaS backend** — fully local-first, gitignored snapshot rebuildable in <1s
- **No automatic test regeneration** — TEST_OUTDATED proposes; QA decides
- **No mutation of existing 4 buckets** — TEST_OUTDATED chen vào pre-classifier, leaves FLAKE/ENV_ERROR/SELECTOR_DRIFT/BUG behavior unchanged when no candidate ticket exists

---

## 2. High-Level Architecture

### 2.1 Package boundary

Graph is a new data layer **inside `@xera-ai/core`**, not a separate package. Rationale:
- Graph is adapter-agnostic (web, future api/mobile adapters share it identically)
- Core already hosts comparable data layers (classifier, auth state, Jira client)
- Separate package would force premature publish-cycle coupling

### 2.2 Module layout

```
packages/core/src/
  graph/
    types.ts                  Node/Edge/Event TS union types
    schema.ts                 schema_version + Zod validators
    store.ts                  Read events, derive snapshot, atomic write
    similarity.ts             Format prompt for Claude similarity query
    enrich.ts                 Batch + on-demand similarity enrichment (§11.2)
    traverse.ts               BFS query: "ticket X → impacted scenarios"
    classify.ts               TEST_OUTDATED detection logic
    render.ts                 HTML viewer generator
    cost.ts                   LLM cost telemetry writer (§11.7)
    templates/
      graph.html.template     HTML shell with placeholders
      graph.css               styles (inlined into HTML)
      graph.js                interaction logic (inlined)
      vis-network.min.js      vendored, Apache-2.0, ~200KB
  bin-internal/
    graph-record.ts           Subcommand: emit events (called by skills)
    graph-snapshot.ts         Subcommand: rebuild snapshot from events
    graph-query.ts            Subcommand: ASCII text dump
    graph-enrich.ts           Subcommand: batch + on-demand similarity (§11.2)
    graph-render.ts           Subcommand: generate .xera/graph.html
    impact-prepare.ts         Subcommand: compute impact for /xera-impact
```

### 2.3 Data flow

```
┌──────────────────────┐
│  /xera-fetch         │──┐
│  /xera-script        │  │
│  /xera-exec          │  │ writes events via
│  /xera-report        │──┤ `npx xera-internal graph-record`
│  /xera-promote       │  │
└──────────────────────┘  │
                          ▼
              ┌──────────────────────────────┐
              │  .xera/graph/                │
              │    events/<ULID>-*.jsonl     │   (committed)
              │    snapshot.json             │   (gitignored)
              └──────────────────────────────┘
                          │ read-only consumers
                          ▼
       ┌─────────────────────────────────────────────┐
       │  classify.ts     (TEST_OUTDATED detection)  │
       │  impact-prepare  (/xera-impact data prep)   │
       │  render.ts       (HTML viewer)              │
       │  graph-query     (ASCII text dump)          │
       └─────────────────────────────────────────────┘
```

### 2.4 Skill ↔ graph boundary

Skill `.md` files **never import** the graph module. Skills call `npx xera-internal graph-record <action> <TICKET>` via bin-internal — the subcommand re-reads artifacts (`story.md`, `.feature`, POM `.ts`, classifier output) and synthesizes events. This preserves the xera architectural rule: skill = LLM-readable workflow, binary = deterministic plumbing.

### 2.5 Package version impact

| Package | Change |
|---|---|
| `@xera-ai/core` | Add `src/graph/` + 5 bin-internal subcommands. Bump 0.3.0 → 0.4.0 → 0.4.1 → 0.4.2 → 0.4.3 (phased per v0.5 precedent: each xera release bumps package minor by 1) |
| `@xera-ai/skills` | Patch 5 skills to emit; add `xera-impact.md` at .2. Bump 0.3.0 → 0.4.0 → 0.4.1 → 0.4.2 → 0.4.3 in lockstep |
| `@xera-ai/prompts` | Add `similarity-match.md` + `classify-outdated.md`. Bump 2.1.0 → 2.2.0 (at v0.6.1) |
| `@xera-ai/web` | No change |
| `@xera-ai/cli` | Bump caret deps + update init template to gitignore `.xera/graph/snapshot.json` and `.xera/graph.html` |

---

## 3. Data Model & Schema

### 3.1 Event log

Append-only JSONL files in `.xera/graph/events/`. Filename pattern:

```
<ULID>-<skill>-<ticketId>.jsonl
```

Example: `01H7BX2NXY3R8YQR6F9TKE-xera-fetch-ABC-100.jsonl`. ULID prefix ensures chronological sort. One file per skill invocation. Atomic write (tmp + rename).

Event record:

```jsonc
{
  "event_id": "01H7BX2NXY...",       // ULID, unique per event
  "schema_version": 1,
  "ts": "2026-05-16T08:23:14Z",
  "actor": "xera-fetch",             // emitting skill
  "type": "ticket.fetched",
  "payload": { /* typed by event type */ }
}
```

### 3.2 Nine event types

| Type | Emitted by | Payload shape |
|---|---|---|
| `ticket.fetched` | xera-fetch | `{ ticketId, summary, ac[], jiraLinks[], storyHash, modifiesAreas[] }` |
| `ticket.enriched` | graph-enrich | `{ ticketId, enrichedAt, similarCount }` — marks lazy enrichment complete (§11.2) |
| `scenario.generated` | xera-script | `{ scenarioId, ticketId, name, gherkin, priority, featureHash, generatedAt }` |
| `pom.generated` | xera-script | `{ pomId, ticketId, filePath, route, locators[], scope }` |
| `pom.promoted` | xera-promote | `{ pomId, fromPath, toPath }` |
| `run.completed` | xera-exec | `{ scenarioId, ticketId, runId, status, traceId?, runtime }` |
| `run.classified` | xera-report | `{ scenarioId, runId, classification, confidence, evidence? }` |
| `classification.disputed` | xera-report --dispute | `{ runId, scenarioId, originalClassification, disputedTo, qaReason?, qaActor }` (§11.6) |
| `edge.discovered` | xera-fetch / graph-enrich / xera-script / xera-report | `{ kind, from, to, confidence?, source }` |

### 3.3 Node and edge model

```
Nodes:                         Edges (kind → relation):
  Ticket    (id, summary, AC)    tests:        Ticket → Scenario
  Scenario  (id, name, p0/p1/p2) uses:         Scenario → POM
  POM       (id, route)          covers:       POM → SUTArea
  SUTArea   (id = slug)          modifies:     Ticket → SUTArea  (AI-derived)
  Failure   (id, traceId, ts)    jira-linked:  Ticket → Ticket   (blocks/duplicates/relates/supersedes)
                                 similar:      Ticket → Ticket   (Claude-derived, confidence ∈ [0,1])
                                 ran:          Failure → Scenario
```

### 3.4 Identity rules

Identifiers must survive refactors:

- `ticketId` = Jira key, immutable
- `scenarioId` = `sha1(ticketId + ":" + normalize(scenario.name))` — survives file rename
- `pomId` = `sha1(basename(filepath))` — survives `/xera-promote` (local → shared move)
- `areaId` = slug (`/checkout` → `checkout`) — manual merge via `xera graph merge-area <a> <b>` if AI splits same area into two slugs

### 3.5 Snapshot

Derived state, **gitignored**, rebuilt locally:

```jsonc
{
  "schema_version": 1,
  "generated_at": "2026-05-16T08:24:00Z",
  "event_count": 142,
  "events_hash": "sha256:abc...",
  "tickets":   { "ABC-1": { /* node */ }, ... },
  "scenarios": { "<sha>": { /* node */ }, ... },
  "poms":      { "<sha>": { /* node */ }, ... },
  "areas":     { "checkout": { /* node */ }, ... },
  "edges":     [ /* flat sorted array */ ],
  "latest_failures": { "<scenarioId>": { /* latest Failure node */ } }
}
```

Rebuild trigger: `events_hash` mismatch with on-disk events. Any consumer (classifier, impact, render) auto-rebuilds if stale.

### 3.6 Concurrency model

The shard-by-session pattern (one event file per skill invocation) eliminates git merge conflicts entirely:

| Scenario | Result |
|---|---|
| 2 QA fetch different tickets concurrently | Different files, no conflict |
| 2 QA fetch same ticket concurrently | Different files (different ULIDs); replay takes latest by ULID; both kept in history |
| 2 QA modify same POM | Code-level git conflict on the `.ts` file (normal git); graph events independent |
| 2 QA promote same POM | Idempotent — both `pom.promoted` events have same `(pomId, toPath)`; snapshot dedupes |
| Force-push rewrite branch | Event files lost with branch (acceptable; not worse than losing test files) |

### 3.7 Schema versioning

Three-layer policy:

- **Additive change** (new optional field, new event kind) → still `v1`. Loader uses Zod `passthrough()`.
- **Breaking change** (renamed field, restructured shape) → bump to `v2`. Ship `core/graph/migrations/v1-to-v2.ts`. Migration emits new events under `events/v2/`, leaves `v1/` immutable.
- **Refusal:** loader sees `vN` events but core is `vN-1` → exit code 3, message "Run xera doctor --upgrade or pin @xera-ai/core@x.y.z". No silent drop.

### 3.8 Storage trade-off

| Criterion | JSONL + JSON snapshot | SQLite |
|---|---|---|
| PR review | ✅ text diffable | ❌ binary |
| Append concurrency | ✅ per-file, no lock | ⚠️ lock |
| Complex query | ❌ requires replay | ✅ SQL |
| Dependencies | ✅ zero | ❌ better-sqlite3 |
| Size @ 1k events | ~500 KB | ~200 KB |

Snapshot acts as in-memory materialized view, mitigating the "replay" cost. Re-evaluate SQLite when graph exceeds 10k events.

---

## 4. Event Emission Per Skill

Each skill, after its primary work completes, invokes `npx xera-internal graph-record <action> <ticket> [flags]`. The subcommand re-reads artifacts and synthesizes events. Skill `.md` files are NOT responsible for event payload shape.

### 4.1 `/xera-fetch <TICKET>`

**Trigger:** after `story.md` written, before returning to user.

**New LLM sub-step** (in skill `.md`, before `graph-record` call):
> "Read the just-fetched `<TICKET>`'s AC. Output JSON `{ modifiesAreas: [areaSlug] }`. Use `extract-areas.md` prompt template."

Output → `.xera/<TICKET>/graph-input.json`. **Note: similarity edges are NOT computed here** — they are deferred to on-demand (see §11.2 for rationale). Only the cheap, single-ticket-only `modifiesAreas` extraction runs at fetch time (~2s, single AC, no rolling window).

Then:

```bash
npx xera-internal graph-record fetch <TICKET>
```

**Events emitted:**

| Event | Source |
|---|---|
| `ticket.fetched` ×1 | `story.md` frontmatter + `graph-input.json.modifiesAreas` |
| `edge.discovered` `kind:"jira-linked"` ×N | `story.md.linked_issues[]` |

`edge.discovered` `kind:"similar"` events are emitted later by `xera:graph-enrich` (lazy, on-demand) — see §11.2.

**Idempotency:** re-fetch → new events; snapshot dedupe by `(type, ticketId)` keeps latest ULID. History preserved.

### 4.2 `/xera-script <TICKET>`

**Trigger:** after `.feature` + POMs + `.spec.ts` written.

```bash
npx xera-internal graph-record script <TICKET>
```

**Events emitted:**

| Event | Source |
|---|---|
| `scenario.generated` ×N | Parse `.feature` → one event per scenario, detect `@p0/@p1/@p2` tag (default p1) |
| `pom.generated` ×M | Each `poms/*.ts`; AST parse for `route` (from `goto()`) and locator list |
| `edge.discovered` `kind:"uses"` ×(N×M) | Parse `.spec.ts`: each `new XxxPage(page)` → Scenario → POM |
| `edge.discovered` `kind:"covers"` ×M | Each POM → SUTArea (areaId from route slug) |
| `edge.discovered` `kind:"modifies"` ×K | Each area from owner ticket's `modifiesAreas` (re-emitted to close Scenario↔Ticket↔Area triangle) |

**Re-script** (featureHash change): emit all events again; snapshot dedupes.

### 4.3 `/xera-exec <TICKET>`

**Trigger:** after Playwright JSON reporter writes results.

```bash
npx xera-internal graph-record exec <TICKET> --run-id <ULID>
```

**Events emitted:**

| Event | Source |
|---|---|
| `run.completed` ×N | Each scenario in reporter output: `{ scenarioId, ticketId, runId, status, traceId?, runtime }` |

Note: `/xera-exec` emits raw pass/fail only. Classification is `/xera-report`'s job.

### 4.4 `/xera-report <TICKET>`

Primary consumer of graph (for TEST_OUTDATED detection) and an emitter.

**Trigger:** after classifier picks bucket for each failure.

```bash
npx xera-internal graph-record classify <TICKET> --run-id <ULID>
```

**Events emitted:**

| Event | Source |
|---|---|
| `run.classified` ×N | Each failure: `{ scenarioId, runId, classification, confidence, relatedTickets? }`. `relatedTickets` populated only when classification = TEST_OUTDATED. |

### 4.5 `/xera-promote <TICKET> <POM-PATH>`

**Trigger:** after `git mv` succeeds.

```bash
npx xera-internal graph-record promote --pom-id <sha> --from <oldPath> --to <newPath>
```

**Events emitted:** `pom.promoted` ×1. `pomId` is stable across move, so existing `uses` edges remain valid.

### 4.6 Failure semantics & atomicity

- **Skill crash mid-flow** → event file not written (atomic tmp + rename). Graph stays consistent. Re-running the skill emits again (idempotent via ULID dedupe).
- **Subcommand `graph-record` crash** → non-zero exit. Skill `.md` logs warning *"Graph event not recorded — run `xera doctor` to rebuild"* but does NOT fail the parent skill. Graph is a secondary feature; core flow must not break.
- **Pre-existing tickets** (no graph events yet) → handled by one-shot `npx xera-internal graph-backfill` (see §8).

---

## 5. TEST_OUTDATED Classifier Extension

The 5th classifier bucket. Distinguishes "test asserts behavior an intervening ticket has intentionally changed" from "test asserts behavior that is actually broken".

### 5.1 Decision tree

```
Test failed
  │
  ├─ FLAKE?  (retries pass) ────────────────────────────────► done (1)
  ├─ ENV_ERROR? (network/auth/fixture in trace) ────────────► done (2)
  │
  ├─ Pre-check graph (deterministic, no LLM):
  │   "Are there tickets that modify this scenario's SUT area
  │    AFTER scenario.featureHash was generated?"
  │
  │   ├─ No candidates ──────────────────────────────────────► fall through to existing 4-bucket
  │   │                                                        (SELECTOR_DRIFT or BUG)
  │   │
  │   └─ ≥1 candidate ──► LLM call `classify-outdated.md`
  │                       ├─ conf ≥ 0.7 ► TEST_OUTDATED (new bucket)
  │                       │              + skip v0.5 heal flow
  │                       └─ conf < 0.7 ► fall through to 4-bucket,
  │                                       but log candidates in
  │                                       `evidence` for QA visibility
```

### 5.2 Why pre-check before LLM

The graph pre-check (graph traversal in `findCandidateTickets`) is cheap and filters ~95% of failures. Only scenarios in actively-modified areas reach the LLM step. This bounds token cost and avoids regressions in classification latency.

### 5.3 Why TEST_OUTDATED is checked before SELECTOR_DRIFT

TEST_OUTDATED can manifest with a SELECTOR_DRIFT signal — e.g., a label rename "Sign in" → "Log in" makes the locator fail to resolve. If v0.5 self-heal runs first, it auto-fixes the locator while the underlying issue is that the entire scenario references the old label and needs regeneration. Pre-check ensures the right bucket wins.

### 5.4 Module signature

```ts
// packages/core/src/graph/classify.ts
type Input = {
  scenarioId: string;
  runId: string;
  traceClassification: 'FLAKE' | 'ENV_ERROR' | 'SELECTOR_DRIFT' | 'BUG';
};

type Output = {
  classification: 'FLAKE' | 'ENV_ERROR' | 'SELECTOR_DRIFT' | 'BUG' | 'TEST_OUTDATED';
  confidence: number;
  evidence?: {
    candidateTickets: Array<{
      ticketId: string;
      summary: string;
      modifiedArea: string;
      relevantAcRef: string;
    }>;
    expectedByTest?: string;
    actualInApp?: string;
    reasoning?: string;
    proposedAction?: 'regenerate-scenario' | 'review-and-decide';
  };
};

export async function classify(input: Input, graph: Snapshot): Promise<Output>;
```

### 5.5 Graph query for candidates

```ts
function findCandidateTickets(graph: Snapshot, scenario: Scenario): Ticket[] {
  // 1. POMs the scenario uses
  const poms = graph.edges
    .filter(e => e.kind === 'uses' && e.from === scenario.id)
    .map(e => e.to);

  // 2. SUT areas covered by those POMs
  const areas = graph.edges
    .filter(e => e.kind === 'covers' && poms.includes(e.from))
    .map(e => e.to);

  // 3. Tickets with `modifies` edge to those areas, fetched after scenario
  return graph.edges
    .filter(e => e.kind === 'modifies' && areas.includes(e.to))
    .map(e => graph.tickets[e.from])
    .filter(t => t && t.fetchedAt > scenario.generatedAt)
    .filter(t => t.id !== scenario.ticketId);  // exclude the scenario's own owner
}
```

### 5.6 Prompt template `classify-outdated.md` (v1.0.0)

Structure:
- Reuse v0.3 `## Handling untrusted input` nonce-wrap preamble (ticket text is untrusted)
- Inputs: scenario gherkin, original AC, candidate tickets' summary+AC, failure summary (expected vs actual)
- Decision rubric (3 rules):
  1. If candidate ticket's NEW AC matches what the app actually did → TEST_OUTDATED
  2. If candidate ticket's NEW AC matches neither old nor new behavior → BUG (lean)
  3. If multiple candidates with conflicting AC → AMBIGUOUS
- Strict JSON output schema (refusal-friendly: returns `AMBIGUOUS` instead of guessing low-confidence)
- Confidence threshold default 0.7 (configurable via `xera.config.ts`)

Added to `IN_SCOPE_PROMPTS` in verify-prompts.

### 5.7 Confidence threshold rationale

Default 0.7:
- Too low → false positives (real bugs misclassified as TEST_OUTDATED, QA ignores → ships to prod)
- Too high → false negatives (real outdated tests look like bugs, wasting investigation time)

0.7 chosen via golden fixtures (§7). User can override:

```ts
// xera.config.ts
export default defineConfig({
  testOutdated: { threshold: 0.7 }
});
```

### 5.8 AMBIGUOUS handling

When LLM returns `AMBIGUOUS` or confidence < threshold: fall through to `traceClassification`, but populate `evidence.candidateTickets` so `/xera-report` posts a Jira comment of the form *"Note: TICKET-200 modified this area recently, manual review suggested"*. QA gets the signal without being misled.

### 5.9 Interaction with v0.5 self-healing

Updated sub-flow in `/xera-report.md`:

```
1. Read classifier output
2. classification === 'TEST_OUTDATED' ?
     YES → SKIP heal-locator flow. Post Jira comment "Test update needed —
            see TICKET-200 (AC2)". Propose
            `xera-script ABC-100 --refresh-from ABC-200`.
     NO  → continue existing v0.5 heal flow (SELECTOR_DRIFT path)
```

### 5.10 Classification output JSON

Persisted to `.xera/<TICKET>/classification.json` and emitted as `run.classified` event:

```jsonc
{
  "classification": "TEST_OUTDATED",
  "confidence": 0.87,
  "evidence": {
    "candidateTickets": [{
      "ticketId": "ABC-200",
      "summary": "Rename Sign in button to Log in",
      "modifiedArea": "/login",
      "relevantAcRef": "AC2: Button label must read 'Log in'"
    }],
    "expectedByTest": "Sign in",
    "actualInApp": "Log in",
    "reasoning": "TICKET-200 (merged 3 days ago) explicitly renamed this button per AC2. This is a missing test update, not a regression.",
    "proposedAction": "regenerate-scenario"
  }
}
```

---

## 6. `/xera-impact` Skill (v0.6.2)

Pre-flight: before merge, answer "which scenarios may break?"

### 6.1 Command surface

```bash
/xera-impact <TICKET>                       # default: depth=2, all priorities
/xera-impact <TICKET> --depth 1             # narrower
/xera-impact <TICKET> --min-priority p0     # P0-only
```

### 6.2 Skill flow

```
1. Verify graph current:
     npx xera-internal graph-snapshot --check
     (auto-rebuild if events_hash mismatch)

2. Compute impact (pure data, no LLM):
     npx xera-internal impact-prepare <TICKET> [--depth N] [--min-priority P]
     → write .xera/impact/<TICKET>.md      (human-readable)
     → write .xera/impact/<TICKET>.json    (machine-readable for re-run)

3. Display terminal summary.

4. Prompt 4-way:
     [Y] Re-run all N impacted scenarios
     [p] Re-run P0 only
     [s] Select scenarios interactively
     [n] Skip — report only

5. If Y/p/s → invoke `npx xera-internal exec --from-impact <TICKET>`.
6. After exec, suggest `/xera-report <TICKET>` (which runs TEST_OUTDATED check).
```

### 6.3 Risk score formula

```
score = priority_weight × 3
      + edge_type_weight
      + edge_confidence × 2
      − days_since_last_pass × 0.1

priority_weight    : P0=3, P1=2, P2=1
edge_type_weight   :
  modifies-same-area     : 5   (direct collision)
  uses-shared-POM        : 4
  jira-linked.blocks     : 4
  jira-linked.duplicates : 3
  jira-linked.relates    : 2
  similar (× confidence) : 1
```

Tunable per project via `xera.config.ts`. Default values calibrated against `fixtures/golden-impact/`.

### 6.4 Impact report (`.xera/impact/<TICKET>.md`)

```markdown
# Impact Analysis — ABC-200

**Target:** Rename "Sign in" button to "Log in" (P1)
**Modified areas:** /login
**Total impacted:** 12 scenarios (3 high · 5 medium · 4 low)
**Generated:** 2026-05-16T08:34Z

## High-risk

### ABC-100 / "user signs in" [P0]   score 8.5
- Edge: TICKET-200 → modifies → /login → covered-by → LoginPage POM → used-by → this scenario
- Last passed: 2026-05-10 (6 days ago)
- Hint: scenario steps reference "Sign in" 3 times → very likely TEST_OUTDATED if re-run

### ABC-145 / "user resets password" [P0]   score 7.0
- Edge: ... → LoginPage POM → ...

## Medium-risk
...

## Low-risk
...

## Re-run commands
- All:        npx xera-internal exec --from-impact ABC-200
- P0 only:    npx xera-internal exec --from-impact ABC-200 --min-priority p0
- Select:     npx xera-internal exec --from-impact ABC-200 --select
```

### 6.5 Terminal output

```
Impact analysis for ABC-200  →  .xera/impact/ABC-200.md

12 scenarios impacted (3 high · 5 medium · 4 low)

Top 3:
  ABC-100 / "user signs in"          [P0]  8.5   modifies-LoginPage-direct
  ABC-145 / "user resets password"   [P0]  7.0   modifies-LoginPage-direct
  ABC-178 / "admin signs in"         [P1]  5.2   similar=0.83

Re-run impacted scenarios?  [Y]es / [p] P0 only / [s]elect / [n]o
>
```

### 6.6 Edge cases

| Case | Behavior |
|---|---|
| Ticket not in graph | Exit 2, *"Run /xera-fetch ABC-200 first"* |
| Empty impact | *"No prior scenarios in /login area — new feature area"*, no re-run prompt |
| Snapshot stale | Auto rebuild silently, log *"Graph snapshot rebuilt (12 new events)"* |
| Impact > 50 scenarios | Markdown renders top 20; rest in `<TICKET>-full.json` |
| `--depth 0` | Direct scenarios of target only, ignore cross-ticket edges |

### 6.7 End-to-end loop

```
/xera-impact ABC-200            → list 12 scenarios
   user picks Y
/xera-exec --from-impact ABC-200 → 9 pass, 3 fail
/xera-report                     → classifier runs TEST_OUTDATED check, 3 fail labelled TEST_OUTDATED
   → propose: regenerate 3 scenarios from ABC-200 AC
```

3 commands replace what was a half-day of manual investigation.

---

## 7. HTML Viewer (v0.6.3)

Single self-contained HTML file. Generated by `npx xera-internal graph-render`. Opened in a browser, works offline, no server.

### 7.1 Stack

- `vis-network` (~200 KB minified, vendored, Apache-2.0)
- Vanilla JS + CSS — no framework
- `window.__GRAPH__ = {...}` for inline data
- Template at `core/graph/templates/graph.html.template`; render.ts substitutes `{{GRAPH_DATA}}`, `{{STATS}}`, `{{GENERATED_AT}}`

### 7.2 Command surface

```bash
npx xera-internal graph-render                            # full snapshot
npx xera-internal graph-render --since 90d                # time filter
npx xera-internal graph-render --ticket ABC-200 --depth 2 # ego-graph around one ticket
```

### 7.3 UX

Top bar with stats (N tickets, M scenarios, K POMs) and filters (priority, date range, search).
Main canvas: force-directed graph, nodes colored by type, edges styled by kind.
Side panel: details for selected node (full ticket text, POM file path, last-run trace links).

### 7.4 Node styling

| Type | Color | Shape | Size cue |
|---|---|---|---|
| Ticket | Blue #3B82F6 | dot | scaled by scenario count |
| Scenario | Green/Yellow/Red by last-run status | square | priority-tagged (P0 larger) |
| POM | Yellow #F59E0B | diamond | size = usage count |
| SUTArea | Gray #6B7280 | hexagon | fixed |
| Failure | Red #EF4444 | triangle | timestamp ≤ 7 days |

### 7.5 Edge styling

- `modifies` — red dashed
- `tests/uses/covers` — gray solid
- `jira-linked` — blue dashed
- `similar` — purple dotted, thickness = confidence

### 7.6 Interactions

- Click ticket → BFS depth=2 highlight impacted scenarios, dim rest
- Click scenario → side panel: gherkin + last-run trace link
- Hover edge → tooltip with edge metadata (confidence, source)
- Double-click ticket → open `.xera/<TICKET>/story.md` in new tab (file:// permitting)
- Right-click → context menu: "Copy /xera-impact command"
- Top-right filters: hide passing scenarios, show only P0, since-date

### 7.7 Performance ceilings

| Graph size | Behavior |
|---|---|
| < 500 nodes | Full feature set, smooth |
| 500–2000 | Default render shows ticket nodes only; expand on click; banner *"Performance mode"* |
| 2000–10000 | Slow; fallback to text dump `.xera/graph.txt`, print *"Graph too large for HTML viewer"* |
| > 10000 | Recommend `xera:graph-compact` (v0.7+); not shipped in v0.6 |

### 7.8 Gitignore

`.xera/graph.html` is gitignored. Regenerated locally. CI may publish as workflow artifact.

---

## 8. Error Handling & Edge Cases

### 8.1 Backfill for pre-v0.6 projects

One-shot `npx xera-internal graph-backfill`. Reads:
- All existing `.xera/<TICKET>/story.md`, `.feature`, `*.spec.ts`, POMs
- Historical `.xera/<TICKET>/run-*.json` if retained

Synthesizes events with `ts` from file mtime (chronologically approximate), `actor: "xera-backfill"`. Does **not** call LLM during backfill itself — `similar` edges build forward, `modifiesAreas` empty initially.

After backfill completes, `xera doctor` detects unenriched backfilled tickets and prompts the enrichment wizard (§11.4) — opt-in batch LLM enrichment with cost preview. This prevents silent TEST_OUTDATED degradation: team gets explicit choice between paying token cost upfront or running enrichment lazily on-demand.

`--dry-run` prints summary *"will create 142 events, 89 nodes, 234 edges"* before committing.

### 8.2 Corrupt event files

Loader is tolerant:

```ts
for (const file of glob('.xera/graph/events/**/*.jsonl')) {
  try {
    for (const line of file.lines()) {
      const event = SchemaEvent.safeParse(JSON.parse(line));
      if (!event.success) { log.warn('skip-event', file, line); continue; }
      apply(event.data);
    }
  } catch (e) {
    log.warn('skip-file', file, e);   // one bad file doesn't break the graph
  }
}
```

`xera doctor` reports skipped files. CI fails if > 5 files corrupt.

### 8.3 LLM output validation (untrusted)

All Claude outputs (`similar`, `modifiesAreas`, `classify-outdated`) pass through Zod validator + bounds check:
- `confidence ∈ [0, 1]` — clamp if outside
- `ticketId` matches `^[A-Z]+-\d+$` and exists in graph — drop if fake
- `areaSlug` matches `^[a-z0-9-]+$` — sanitize
- `similar[]` per fetch capped at 10 — truncate
- JSON parse failure → log + skip, no auto-retry (avoid token-burn loops)

Strict-mode nonce-wrap preamble (v0.3 reuse) surrounds prompts that consume untrusted ticket text.

### 8.4 Hashing & drift detection

Snapshot stores `events_hash = sha256(sorted-file-list + each-file-content-hash)`. Every consumer recomputes and rebuilds if mismatch.

Pre-commit hook: if `events/*.jsonl` changed but no snapshot rebuild, hook rebuilds silently and logs *"Graph drift — rebuilding snapshot"*. Does not block commit.

### 8.5 Skill called on ungraphed ticket

| Skill | Behavior |
|---|---|
| `/xera-impact` | Exit 2, *"Run /xera-fetch ABC-200 first"* |
| `/xera-report` | Skip TEST_OUTDATED check, fall through 4-bucket |
| `/xera-exec` | Runs normally; `run.completed` only emitted if `scenarioId` resolvable |

Graph absence degrades quality, never breaks core flow.

### 8.6 PII / privacy

Graph events contain `ticket.summary` + `ticket.ac[]` — possibly PII (sample user names, emails in AC).

Mitigation:
- `scrub-rules.ts` (already hardened in v0.5) extended to run on `summary` and `ac[]` before event write
- AC field gains `redacted: boolean`; viewer renders `[REDACTED]`
- Embedding similarity stays accurate (Claude reads scrubbed text)
- Config: `xera.config.graph.redactionRules: 'default' | 'strict' | 'off'`

### 8.7 Performance ceilings

| Scale | Behavior |
|---|---|
| < 500 events | Full feature set |
| 500–2000 | Snapshot rebuild < 1s; viewer OK |
| 2000–10000 | Snapshot ~3s; viewer performance mode |
| > 10000 | Recommend `xera:graph-compact` (v0.7+) |
| > 50000 | Recommend SQLite migration; re-evaluate architecture |

`xera doctor` warns at thresholds.

---

## 9. Testing Strategy

### 9.1 Unit tests (vitest)

| Module | Test |
|---|---|
| `graph/store.ts` | Write events to tmp, replay, assert snapshot shape |
| `graph/store.ts` | Corrupt one line, assert skip + warn |
| `graph/store.ts` | Two files same ticket → dedupe by latest ULID |
| `graph/similarity.ts` | Stub Claude, assert prompt format + JSON validation |
| `graph/traverse.ts` | Fixture graph with 20 nodes, assert BFS depth=2 results |
| `graph/classify.ts` | Mock graph + stub LLM; test ≥0.7, <0.7, ambiguous |
| `graph/classify.ts` | Golden fixture pairs: TEST_OUTDATED vs BUG vs SELECTOR_DRIFT |
| `graph/render.ts` | Render snapshot fixture; assert HTML contains node IDs + valid structure |
| `bin-internal/graph-record.ts` | E2E: mock `/xera-fetch`, assert event file written correctly |
| `bin-internal/impact-prepare.ts` | Load fixture graph, query, assert markdown output snapshot-match |

### 9.2 Golden fixtures

```
fixtures/
  golden-graph/
    test-outdated-label-change/     TICKET-200 renames button, TICKET-100 test fails
      events/
        001-fetch-ABC-100.jsonl
        002-script-ABC-100.jsonl
        003-fetch-ABC-200.jsonl
        ...
      expected-classification.json
      expected-impact-ABC-200.md
    test-outdated-multi-candidate/  2 tickets modify same area
    test-outdated-ambiguous/        LLM must refuse, fall through to BUG
    test-outdated-false-positive/   AC change but app behavior unrelated → BUG
    test-outdated-stale-snapshot/   Events newer than snapshot → auto rebuild
  golden-impact/
    impact-depth-1/                 Direct uses only
    impact-depth-2/                 Through jira-linked
    impact-empty/                   No prior tests in area
```

### 9.3 Eval harness extension

Reuse v0.2 `/xera-eval` infrastructure. Add `classify-outdated` and `similarity-match` to `IN_SCOPE_PROMPTS`. New EVAL fixtures:

- EVAL-008 classify-outdated · label-change (gold: TEST_OUTDATED, conf ≥ 0.85)
- EVAL-009 classify-outdated · ac-rewording-but-behavior-same (gold: BUG)
- EVAL-010 similarity-match · clear-jira-link-exists (gold: empty similar list)
- EVAL-011 similarity-match · soft-relation-only (gold: 1–2 similar, conf 0.7–0.9)
- EVAL-012 similarity-match · unrelated (gold: empty list)

Rubric: 0/1/2 per criterion; release gate ≥ 80% average.

### 9.4 CI E2E

`.github/workflows/ci.yml` adds job:

```yaml
graph-e2e:
  steps:
    - start fixtures/sample-app
    - npx xera init                            # scaffold throwaway project
    - npx xera-internal graph-backfill --dry-run     # exit 0
    - npx xera-internal graph-render                 # .xera/graph.html exists, >10KB
    - parse HTML, assert window.__GRAPH__ valid JSON
```

Smoke-level, not a substitute for unit/integration.

---

## 10. Versioning & Rollout

### 10.1 Phased release (Approach B)

**xera v0.6.0 — Graph foundation** (no user-facing skill new)
- `@xera-ai/core` 0.3.0 → 0.4.0
- `@xera-ai/skills` 0.3.0 → 0.4.0
- `@xera-ai/prompts` 2.1.0 → 2.2.0 (new `extract-areas.md` v1.0.0 — cheap area-extraction prompt for `/xera-fetch`)
- Adds `core/graph/` + 4 subcommands (`graph-record`, `graph-snapshot`, `graph-query`, `graph-enrich`)
- 5 skill `.md` files patched to emit events
- `/xera-fetch` extracts `modifiesAreas` only — similarity edges deferred (§11.2)
- Cost telemetry: `.xera/cost-log.jsonl` writer + `xera doctor` summary (§11.7)
- Backfill enrichment wizard via `xera doctor` (§11.4)
- Tests: unit + 5 golden-graph fixtures + e2e smoke
- Risk: event-emission bug slows skills → mitigated by non-fatal exit code on `graph-record` failure

**xera v0.6.1 — TEST_OUTDATED bucket + similarity enrichment**
- `@xera-ai/core` 0.4.0 → 0.4.1
- `@xera-ai/prompts` 2.2.0 → 2.3.0 (new `classify-outdated.md` v1.0.0, `similarity-match.md` v1.0.0)
- `@xera-ai/skills` 0.4.0 → 0.4.1 (`/xera-report` sub-flow updated to skip v0.5 heal on TEST_OUTDATED; supports `--dispute` flag)
- Notification routing: TEST_OUTDATED posts Jira sub-task to original ticket's assignee (§11.3)
- New event type: `classification.disputed` (§11.6)
- Lazy similarity enrichment fires from `findCandidateTickets` on first miss
- Tests: golden EVAL-008/009 + 4 classifier unit cases + 1 dispute-flow integration test
- Risk: false-positive TEST_OUTDATED → conservative threshold 0.7 + config override + dispute-event capture

**xera v0.6.2 — `/xera-impact` skill + `/xera-run` auto-trigger**
- `@xera-ai/core` 0.4.1 → 0.4.2 (`impact-prepare.ts`)
- `@xera-ai/skills` 0.4.1 → 0.4.2 (new `xera-impact.md`; `/xera-run` patched to auto-call impact-prepare per §11.1)
- Adds `xera:exec --from-impact` flag
- Config `xera.config.run.autoImpact` controls auto-trigger behavior
- Tests: golden-impact fixtures + integration + auto-trigger smoke
- Risk: re-run interactive UX scope creep → locked to list+propose (decision §6)

**xera v0.6.3 — HTML viewer + CI publishing**
- `@xera-ai/core` 0.4.2 → 0.4.3 (`render.ts`, vendored vis-network)
- `@xera-ai/skills` 0.4.2 → 0.4.3 (CHANGELOG only)
- `@xera-ai/cli` adds `.github/workflows/xera-graph.yml.template` to scaffold; init template copies it
- New `npx xera-internal graph-render`
- CI publishes `.xera/graph.html` as PR artifact + sticky comment (§11.5)
- Disputed runs visually distinct in viewer (§11.6)
- Tests: render fixture snapshot, HTML structure validation, CI workflow snapshot
- Risk: vendored JS size — accept ~500KB output HTML, document trade-off

### 10.2 Workspace dep bumps

Each sub-release bumps explicit caret on consumer packages (`@xera-ai/cli`, `@xera-ai/web`) per AGENTS.md publish flow. Init template updated to gitignore `.xera/graph/snapshot.json` and `.xera/graph.html`.

### 10.3 Rollback strategy

- Sub-releases are independent: rollback reverts one package version without disturbing prior sub-releases
- Schema `v1` unchanged across v0.6.x; events from .0 readable by .3 and vice versa
- Downgrade from .3 to .0: viewer disappears, data intact

### 10.4 Documentation updates

- `README.md` roadmap: v0.6 = Project Knowledge Graph (push mobile adapter to v0.7)
- `docs/CONFIGURATION.md`: new `graph` section (redactionRules, testOutdated.threshold, impact.depth)
- `docs/TROUBLESHOOTING.md`: add "Graph snapshot stale", "events file corrupt", "TEST_OUTDATED false positive", "Backfill from existing project"
- `docs/ARCHITECTURE.md`: add graph module overview + data-flow diagram

---

## 11. QA Workflow Integration

This section captures **how QA actually interacts with v0.6 day-to-day**, addressing seven friction points identified after first-pass spec review. Without these, the technical architecture is sound but adoption stalls.

### 11.1 Auto-trigger in `/xera-run` (don't make QA remember `/xera-impact`)

`/xera-run <TICKET>` is the primary entry point QA uses 80%+ of the time. v0.6 extends `/xera-run` to call impact automatically, never asking QA to remember a separate command.

**Updated `/xera-run` flow:**

```
1. /xera-fetch <TICKET>
2. Auto-check impact:
     npx xera-internal impact-prepare <TICKET> --quiet
   If top-score scenarios exist (default threshold: ≥1 scenario with score ≥6.0):
     Prompt: "Found 3 high-risk impacted scenarios. Re-run before continuing? [Y/n]"
     If yes → run impacted scenarios first, route results to next step
3. /xera-script <TICKET>
4. /xera-exec <TICKET>
5. /xera-report <TICKET>
```

`/xera-impact` standalone skill still ships for explicit pre-merge audit (CI usage, ad-hoc inspection). But the default QA flow gets impact for free.

Config: `xera.config.run.autoImpact: { enabled: true, threshold: 6.0 }`.

### 11.2 Lazy similarity (don't slow down every fetch)

The Claude similarity rolling window adds ~5–10s and 50K input tokens per fetch. Over a sprint of 20 fetches that's 3 minutes of pure latency and meaningful token cost — for a feature most fetches don't immediately benefit from.

**Move similarity computation out of `/xera-fetch`. Run on-demand:**

- When `/xera-impact <TICKET>` runs and target ticket has no `similar` edges yet → trigger `xera:graph-enrich --ticket <TICKET>` first
- When `classify.findCandidateTickets()` returns no candidates AND ticket has no enrichment → trigger enrichment, then re-query (one-time cost per ticket lifetime)
- Manual: `npx xera-internal graph-enrich --since 7d` to batch-enrich recent tickets

Each enrichment writes `edge.discovered kind:"similar"` events and marks the ticket node as `enrichedAt: <timestamp>`. Snapshot field `tickets[id].enrichedAt` distinguishes enriched vs not.

This makes `/xera-fetch` snappy (only `modifiesAreas` extraction, ~2s) while preserving full similarity-edge value where it pays off.

### 11.3 Notification routing (right person, not current QA)

The original design dumped TEST_OUTDATED messages into the current QA session — but the *current* QA may have no context or authority over the affected ticket.

**Routing rule** (updated `/xera-report` sub-flow):

When TEST_OUTDATED is detected for scenario owned by `<ORIGINAL_TICKET>`:

1. Post a Jira sub-task **on `<ORIGINAL_TICKET>`** (not current ticket) with body:
   *"Test for this ticket may be outdated due to changes introduced by `<CURRENT_TICKET>`. Confidence: 0.87. Run `xera-script <ORIGINAL_TICKET> --refresh-from <CURRENT_TICKET>` to regenerate."*
2. Tag original ticket's assignee (read from Jira) — they get the notification, not current QA
3. Current QA session shows summary line only:
   *"3 impact tickets notified (ABC-100, ABC-145, ABC-178). No action required from you."*
4. Config opt-out: `xera.config.report.testOutdatedNotify: 'jira-subtask' | 'comment' | 'console-only'`

This routes signal to the right person and prevents QA-fatigue from notifications they can't act on.

### 11.4 Backfill enrichment UX (avoid silent degradation)

Backfilled tickets have no `modifiesAreas` and no `similar` edges. TEST_OUTDATED silently skips them. Team thinks the feature works but 80% of historical tickets are invisible to it.

**Enrichment wizard via `xera doctor`:**

```
$ xera doctor

✓ Config valid
✓ Auth state present
⚠ Graph: 200 tickets backfilled, 0 enriched
    These tickets won't participate in TEST_OUTDATED detection until enriched.
    Estimated cost: ~$2 (one-time, 200 LLM calls × ~$0.01 each).

    [E]nrich now / [D]efer / [S]kip
```

Three modes:
- **Enrich now** → batch-call enrichment, write `ticket.enriched` event per ticket, gated by progress bar
- **Defer** → write `.xera/graph/enrichment-deferred` marker; doctor re-prompts next run
- **Skip** → write `.xera/graph/enrichment-skipped` marker; doctor stays quiet, but `xera:graph-enrich --ticket <ID>` still works on-demand

### 11.5 Viewer artifact via CI (manager doesn't need CLI)

The viewer is manager-facing, but the original design required QA/dev to run CLI locally and screenshot. This bottlenecks manager visibility.

**CI publishes viewer automatically.** Add to `.github/workflows/ci.yml` (and consumer projects' templates):

```yaml
- name: Build graph viewer
  run: npx xera-internal graph-render
- name: Upload viewer
  uses: actions/upload-artifact@v4
  with:
    name: xera-graph
    path: .xera/graph.html
- name: Comment on PR
  uses: actions/github-script@v7
  with:
    script: |
      // sticky comment with artifact link
```

Manager sees PR → clicks "xera-graph" artifact → opens HTML in browser. No clone, no CLI. Per-PR snapshot of graph state.

For end-user consumer projects, scaffold template `.github/workflows/xera-graph.yml.template` shipped via `npx xera init`.

### 11.6 Dispute event (feedback loop for classifier)

When QA disagrees with TEST_OUTDATED (or any classification), there's no recorded signal — the classifier never learns.

**New event type: `classification.disputed`.** Emitted by `/xera-report` when QA invokes:

```bash
/xera-report <TICKET> --dispute <runId> --to <classification>
```

Or interactive: after `/xera-report` displays classification, prompt:
*"Agree with classification? [Y]es / [d]ispute"*

Payload:
```jsonc
{
  "type": "classification.disputed",
  "payload": {
    "runId": "<ULID>",
    "scenarioId": "<sha>",
    "originalClassification": "TEST_OUTDATED",
    "originalConfidence": 0.87,
    "disputedTo": "BUG",
    "qaReason": "<free text, optional>",
    "qaActor": "<git author email>"
  }
}
```

v0.6 does NOT change classifier logic based on disputes — that's v0.7 work (rubric refinement input). v0.6 just captures the signal. Disputes visible in viewer (red outline on disputed runs) and `xera doctor` summary.

### 11.7 Cost telemetry (no surprises in billing)

Every LLM call routes through a shared helper that logs to `.xera/cost-log.jsonl` (gitignored, per-machine):

```jsonc
{ "ts": "2026-05-16T08:23Z", "skill": "xera-fetch", "prompt": "extract-areas", "tokens_in": 1240, "tokens_out": 89, "model": "claude-...", "cost_estimate_usd": 0.012 }
```

`xera doctor` summary:
```
LLM cost (past 7 days):
  Total calls: 142
  Estimated:   $3.20 USD
  Top skill:   xera-fetch (62 calls, $1.40)
```

Soft cap config: `xera.config.cost.dailyCapUsd: 5`. When `xera doctor` detects daily spend exceeds cap, warns at next skill invocation (does not block).

### 11.8 Summary — friction reductions

| Friction (original spec) | Resolved in §11 |
|---|---|
| Every `/xera-fetch` adds 5-10s | §11.2 lazy similarity |
| `/xera-impact` requires habit change | §11.1 auto-trigger in `/xera-run` |
| TEST_OUTDATED notifies wrong person | §11.3 Jira sub-task routing |
| Backfilled projects silently degraded | §11.4 enrichment wizard |
| Viewer requires local CLI | §11.5 CI artifact + PR comment |
| No QA override / classifier feedback | §11.6 dispute event |
| Token cost invisible | §11.7 cost-log + doctor summary |

### 11.9 Rollout mapping to v0.6.x

| Item | Ships in |
|---|---|
| §11.2 lazy similarity | v0.6.0 (foundation — `/xera-fetch` design fixed at start) |
| §11.4 backfill UX | v0.6.0 (with backfill itself) |
| §11.7 cost telemetry | v0.6.0 (foundation helper) |
| §11.3 notification routing | v0.6.1 (with TEST_OUTDATED) |
| §11.6 dispute event | v0.6.1 (with TEST_OUTDATED) |
| §11.1 auto-trigger in `/xera-run` | v0.6.2 (with `/xera-impact`) |
| §11.5 viewer CI artifact | v0.6.3 (with viewer) |

---

## 12. Open Questions / Future Work

- **v0.7 sprint mode** depends on graph; design once v0.6 ships
- **v0.7 graph-compact** to archive cold events (>6 months) into summary nodes
- **v0.7 classifier learning** from `classification.disputed` events (§11.6)
- **v0.8 prod-trace backfill** inserts events from Sentry/PostHog session replays
- **v1.0 dashboard** as live dashboard (replaces static HTML when multi-user demand emerges)
- **Code-level edges** from git history (file-path mapping ticket ↔ POM) — deferred until graph proves load-bearing
- **Multi-language i18n** in similarity matching — defer until customer demand

---

## 13. References

- v0.1 design: `2026-05-14-xera-core-web-design.md`
- v0.2 eval harness: `2026-05-14-xera-v02-eval-harness-design.md`
- v0.3 prompt injection: `2026-05-15-xera-v03-prompt-injection-defense-design.md`
- v0.5 self-healing: `2026-05-15-xera-v05-self-healing-selector-drift-design.md`
- POSTMORTEM (running): `docs/superpowers/plans/POSTMORTEM.md`
