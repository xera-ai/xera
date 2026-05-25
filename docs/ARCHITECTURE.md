# xera Architecture

For the full specs see [design docs](superpowers/specs/) (v0.1 core, v0.2 eval, v0.3 prompt injection, v0.5 self-heal, v0.6 project knowledge graph, v0.7 http-adapter, v0.8 coverage-gap, v0.18 feature-from-openapi, v0.19 contract-drift-web-and-heal; v0.9 adversarial-explore is shipped without a published spec). This is a shorter overview for developers contributing to xera itself.

## Layers

```
End user (QA)
  │ uses `bunx xera init --shape web|api|mixed --tracker jira|github` once
  │ (scaffolds CI workflow + npm scripts + per-editor skill paths)
  │ then `/xera-*` slash commands in their AI coding agent (Claude Code, Cursor, or Codex CLI)
  ▼
Skills — 12 user-facing workflows (Claude Code / Cursor / OpenAI Codex CLI via the editor adapter registry in `packages/cli/src/editors/`)
  │ tell the session LLM what to do
  │ session LLM calls `bun run xera:*`
  ▼
`xera-internal` binary (in @xera-ai/core) — 36 subcommands
  │ deterministic helpers + graph data layer + coverage engine
  │ writes artifacts to .xera/<TICKET>/
  │ writes events to .xera/graph/events/
  ▼
Adapters (dispatched by `meta.json.adapter`):
  • @xera-ai/web   — Playwright browser adapter (`--grep` per-scenario filter)
  • @xera-ai/http  — Playwright APIRequestContext adapter (no browser, OpenAPI-aware)
  │ generator helpers (validate, typecheck, lint)
  │ executor + trace normalizer + secret scrubber
  ▼
Playwright + the user's app / HTTP API under test
```

### Editor skill paths

`xera init` scaffolds skills and commands for each supported editor:

| Editor      | Skill path                         | Command path                  |
|-------------|------------------------------------|-------------------------------|
| Claude Code | `.claude/skills/<n>/SKILL.md`      | `.claude/commands/<n>.md`     |
| Cursor      | `.cursor/rules/<n>/RULE.md`        | `.cursor/commands/<n>.md`     |
| Codex CLI   | `.agents/skills/<n>/SKILL.md`      | (no project-level slash)      |

## v0.6 addition: Project Knowledge Graph

A repo-local event-sourced data layer running parallel to the v0.1 artifact pipeline. Skills emit events on every fetch/script/exec/report/promote. The derived snapshot powers several read-only consumers — classify, impact, coverage (added in v0.8), render, and disputes:

```
   xera-fetch ──┐
   xera-script ─┤    events.jsonl (append-only, committed)
   xera-exec ───┼──► snapshot.json (gitignored, derived)
   xera-report ─┤
   xera-promote ┘
                          │
                          ▼
          ┌──────────────────────────────┐
          │  Consumers (read-only):      │
          │  • classify (TEST_OUTDATED)  │  → /xera-report 9-class
          │  • impact (riskScore + BFS)  │  → /xera-impact
          │  • coverage (3-state areas)  │  → /xera-coverage + /xera-fill-gap
          │  • render (vis-network HTML) │  → CI artifact + sticky comment
          │  • disputes (CLI report)     │  → QA-lead weekly review
          └──────────────────────────────┘
```

## Key invariants

- The public CLI exposes `init`, `doctor`, and `samples remove`. Everything else is via skills.
- Skill prompts + `xera-internal` form a closed pair: the skill knows when to call which subcommand and what to do with its output.
- Every `xera-internal` subcommand reads from disk and writes to disk. No subcommand keeps state across invocations.
- AI work happens in the QA's coding-agent session — there is no AI binary shell-out from `xera-internal`. Even the graph similarity / TEST_OUTDATED classifier calls the LLM **from the skill** (skill writes input JSON, calls binary, binary reads input).
- Secret scrubbing is deterministic and runs before LLM ever sees normalized run data.
- Graph events are sharded one-file-per-skill-invocation → zero git merge conflicts when multiple QA work in parallel.

## Packages

| Package | Responsibility | Public bin |
|---|---|---|
| `@xera-ai/core` | Config, paths, hashing, lock, log, IssueProvider (jira + github backends behind a unified interface, v0.16+), classifier (9 classes: `REAL_BUG`, `CONTRACT_DRIFT`, `AUTH_EXPIRED`, `RATE_LIMITED`, `TEST_OUTDATED`, `TEST_BUG`, `SELECTOR_DRIFT`, `FLAKY`, `PASS`), auth state (AES-256-GCM), shared scrub rules (relocated from web in v0.7), **graph module** (types, schema, store, similarity, enrich, classify, traverse, impact, render, cost), **coverage module** (status, risk, report, why) | `xera-internal` |
| `@xera-ai/cli` | Public CLI: `init` (with `--shape web\|api\|mixed`, `--tracker jira\|github`, `--editor claude\|cursor\|codex\|all`), `doctor` (with `--strict [ticket]`), `samples remove` | `xera` |
| `@xera-ai/web` | Playwright browser adapter (executor with `--grep` support, trace normalizer, secret scrubber, POM-scan + Gherkin lint) | — |
| `@xera-ai/http` | HTTP API adapter (Playwright `APIRequestContext`, no browser). Pre-auth via `defineHttpAuthSetup` + `presetHttpAuth`; runtime `newAuthedContext` for generated `spec.ts`; OpenAPI loader for schema-aware generation + `CONTRACT_DRIFT` detection; `extractOperations` flattens a spec for `/xera-feature --from-spec` (v0.18) | — |
| `@xera-ai/skills` | 12 AI coding-agent skill `.md` files (`xera-run`, `xera-fetch`, `xera-feature`, `xera-script`, `xera-exec`, `xera-report`, `xera-impact`, `xera-promote`, `xera-eval`, `xera-coverage`, `xera-fill-gap`, `xera-explore`); scaffolded per editor (Claude Code / Cursor / Codex CLI) by `xera init`; dispatch by `meta.json.adapter` | — |
| `@xera-ai/prompts` | 14 versioned LLM prompt templates: `diagnose-failure`, `feature-from-story`, `feature-from-openapi` (v0.18), `script-from-feature-web`, `script-from-feature-http`, `heal-locator`, `contract-heal` (v0.19), `extract-areas`, `similarity-match`, `classify-outdated`, `eval-rubric`, `map-ac-to-scenarios`, `propose-scenarios`, `adversarial-scenarios` | — |

## `xera-internal` subcommands (36)

**Core flow (v0.1+):** `fetch`, `validate-feature`, `typecheck`, `lint`, `exec`, `normalize`, `report`, `post`, `status`, `unlock`, `promote`

**Eval harness (v0.2):** `eval-prepare`, `eval-deterministic`, `eval-report`

**Self-heal (v0.5):** `heal-prepare`

**Project knowledge graph (v0.6):**
- `graph-record <fetch|script|exec|classify|promote|dispute>` — emit events from artifacts
- `graph-snapshot [--check]` — derive / verify snapshot
- `graph-query [--ticket --format]` — ASCII or JSON dump
- `graph-backfill [--dry-run]` — synthesize events from existing artifacts
- `graph-enrich --ticket <id>` — populate similarity edges via Claude
- `graph-render [--since --ticket --depth --out]` — HTML viewer
- `impact-prepare <TICKET>` — risk-scored impact list
- `disputes [--since --format]` — QA dispute report

**HTTP adapter (v0.7):**
- `auth-setup [--role <name>] [--shape web|http|all]` — pre-authenticate, writes encrypted `.xera/.auth/{web,http}/<role>.json`
- `openapi-resolve` — load + dereference an OpenAPI spec for downstream classifier / generator use
- `exec`, `normalize`, `report` extended to dispatch by `meta.json.adapter`

**Coverage gap (v0.8):**
- `coverage-prepare` — reads snapshot, computes per-area status (UNCOVERED/STALE/COVERED), risk scores, and AC gap list; writes `report.json`
- `ac-coverage-backfill-prepare` — reads `report.json` AC gaps; writes `backfill-input.json` for skill-side `map-ac-to-scenarios.md` prompt
- `ac-coverage-backfill-finalize` — reads skill-written `backfill-output.json`; validates mappings; emits `ac-coverage.backfilled` event; materializes `satisfies` edges in the graph
- `fill-gap-prepare` — reads snapshot for a given area or ticket; writes `fill-gap-input.json` for skill-side `propose-scenarios.md` prompt
- `fill-gap-finalize` — reads skill-written `fill-gap-output.json`; writes `feature.draft.md` with the accepted Gherkin proposals

**Adversarial explore (v0.9, experimental):**
- `explore-prepare <TICKET> --categories <slugs> --user-hint <text>` — assembles `adversarial-input.json` from story, AC, existing feature/spec, adapter, and QA-supplied focus
- `explore-finalize <TICKET> --accept <ids|all|high-only>` — appends accepted proposals to `.xera/<TICKET>/explore.feature` with `@adversarial` tags

**Feature-from-OpenAPI (v0.18):**
- `feature-spec-prepare <KEY> [--spec --tag --operation --path]` — loads + flattens an OpenAPI doc (`extractOperations`), writes `spec-input.json` + a synthetic `story.md` + `meta.json` (`source: 'openapi'`) for `/xera-feature --from-spec`; deterministic, no LLM

**CONTRACT_DRIFT self-heal (v0.19):**
- `contract-heal-prepare <TICKET> <RUN_ID> <SCENARIO>` — assembles the drifting call + OpenAPI contract (documented statuses + required fields) + the `spec.ts` assertion line; web adapter short-circuits with `web-no-assertion`

**Universal:** `verify-prompts`, `doctor` (with `--auto-enrich` for CI; `--shape`-aware HTTP auth file + OpenAPI checks in v0.7; 3 new coverage checks in v0.8; `--strict [ticket]` accepts optional ticket since v0.16.1 — `--strict` alone runs strict env-only checks, `--strict <TICKET>` adds ticket-specific checks. See [#149](https://github.com/xera-ai/xera/issues/149) for the chicken-and-egg root cause).

## v0.8 addition: Coverage gap & AC matrix

The coverage gap feature answers "which SUT areas have no passing tests, and which acceptance criteria are unsatisfied?" It builds on the v0.6 graph: every ticket's `modifies` edges identify the areas it owns; every scenario's `run.classified` events record pass/fail history.

**Three-state area model.** Each area in the snapshot is classified as one of:
- `UNCOVERED` — no scenario has ever been linked to this area.
- `STALE` — scenarios exist but the most recent passing run is older than `coverage.staleAfterDays` (default 30).
- `COVERED` — at least one passing run within the staleness window.

**Data flow.** `coverage-prepare` is a pure deterministic binary: it reads the snapshot, applies the three-state logic and the risk formula (`recent_tickets × critical_boost + recent_bugs`), and writes `report.json`. The `/xera-coverage` skill reads that file and prints the gap report to the session. With `--viewer`, the skill instructs `graph-render` to include a Coverage tab (Map / List / Trend sub-views). When `autoSnapshotOnCoverage: true` (default), a `coverage.snapshot` event is emitted, which the Trend sub-view reads over time.

**AC backfill flow.** When `report.json` lists unsatisfied ACs, `/xera-coverage` runs the AC backfill: `ac-coverage-backfill-prepare` writes `backfill-input.json`, the skill reads the `map-ac-to-scenarios.md` prompt and calls the LLM in-session, then `ac-coverage-backfill-finalize` validates the output and materializes `satisfies` edges (ACNode → ScenarioNode) in the graph, emitting an `ac-coverage.backfilled` event.

**Generative gap-fill.** `/xera-fill-gap <area>` (area mode) or `/xera-fill-gap --ticket <TICKET>` (AC mode) invokes `fill-gap-prepare`, passes the input to the `propose-scenarios.md` prompt, then writes accepted proposals to `feature.draft.md` via `fill-gap-finalize`.

**New graph entities:** `ACNode` (one per acceptance-criteria line on a fetched ticket), `satisfies` edge (ACNode → ScenarioNode), `coverage.snapshot` event, `ac-coverage.backfilled` event.

## v0.9 addition: Adversarial exploration (experimental)

The `/xera-explore` skill answers "what could go wrong with this feature that the AC does not mention?" It is **opt-in**, **QA-internal**, and **not part of `/xera-run`** — `/xera-feature` continues to produce AC-driven scenarios as before, so PO review of `test.feature` is undisturbed.

**Flow.** The skill asks QA two interactive questions: (1) which of 8 adversarial categories to focus on (`negative`, `boundary`, `state-combination`, `race`, `error-recovery`, `a11y`, `security-smell`, `non-functional`), and (2) any specific concern as a free-text hint. `explore-prepare` assembles `adversarial-input.json` from the ticket's story, AC, existing `test.feature`, existing `spec.ts` (if present), adapter, and the chosen categories. The `adversarial-scenarios.md` prompt generates 5–10 proposals with `category` + `severity` (`low`/`medium`/`high`) metadata. QA accepts a subset via `all` / `high-only` / comma-separated IDs; `explore-finalize` appends them to `.xera/<TICKET>/explore.feature` tagged `@adversarial @adversarial-<category> @severity-<level>` for selective Playwright runs.

**Why a separate feature file.** `test.feature` is AC-aligned and PO-reviewed; `explore.feature` is QA-brainstormed adversarial coverage. Keeping them separate avoids tripling test runtime silently and lets QA review/merge adversarial scenarios into `test.feature` on their own cadence. `/xera-script` still reads only `test.feature` — QA merges in or runs adversarial scenarios manually until multi-feature `spec.ts` generation lands.

**Status.** v0.9.0 ships without golden-eval coverage and without `xera.config.ts.explore` config knobs — both deferred to follow-up releases. Treat AI output as a brainstorming partner, not a source of truth.

## v0.18 addition: Feature-from-OpenAPI

`/xera-feature <KEY> --from-spec` generates a Gherkin `test.feature` directly from an OpenAPI document — no fetched Jira/GitHub ticket. It's a **mode** of the existing skill (not a new skill) and is opt-in (never auto-chained from `/xera-run`); http-flavored.

**Flow.** The deterministic `feature-spec-prepare` subcommand loads the configured `http.spec` (or `--spec`), flattens it via `extractOperations` (sorted, hashable), applies `--tag`/`--operation`/`--path` filters, and writes `spec-input.json` + a synthetic `story.md` + `meta.json` (`source: 'openapi'`, `spec_hash`). The skill then nonce-wraps `spec-input.json` (the spec may be remote → untrusted) and follows the new `feature-from-openapi.md` prompt to emit API-flavored scenarios (one per operation happy-path + per documented error response). **Everything downstream — `/xera-script` → `/xera-exec` → `/xera-report`, graph, coverage — is unchanged**, because the synthetic ticket has the same artifact shape as a real one.

**AGENTS.md scaffolding.** Also in this line: `xera init` (and `--update`) write a root `AGENTS.md` orienting any AI agent (Claude Code / Cursor / Codex all read it) **only when one is absent** — a user-curated file is never overwritten; `xera doctor` reports its presence.

## v0.19 addition: Web CONTRACT_DRIFT detection and self-heal

**Detection.** Until v0.19, `CONTRACT_DRIFT` fired only for the `http` adapter. Web tests now match too: the opt-in `xeraNetwork` recorder (`@xera-ai/web`, a no-op unless `XERA_NETWORK_LOG` is set by `xera:exec`) captures scrubbed page responses to a `network.jsonl` sidecar; the normalizer prefers that sidecar and correlates calls per scenario; `/xera-report` runs each FAIL scenario's calls through the **existing** `classifyContractDrift`, **filtered to documented endpoints** (via `findOperation`) so page/asset loads never false-positive, and stamps `CONTRACT_DRIFT` per scenario. Config: a web/mixed project points at OpenAPI via `web.spec` (or `http.spec`, resolved by `resolveOpenApiSpec`).

**Self-heal.** Parallel to the v0.5 selector heal: when a scenario is `CONTRACT_DRIFT`, `contract-heal-prepare` assembles the drifting call + the OpenAPI contract + the `spec.ts` assertion line; the `contract-heal.md` prompt (v0.3 nonce-wrapped, strict JSON) proposes a single-line rewrite; the `xera-report` skill applies it verbatim, re-runs `xera:exec`, and `git add`s on pass / reverts on fail (single-heal sentinel shared with the selector heal). **Http-focused** — a web `CONTRACT_DRIFT` refuses with `web-no-assertion` (UI tests don't assert on the response directly); a `real-bug` refusal protects against healing a genuine backend break. `classifyContractDrift` itself is unchanged and still guarded by the v0.7 http golden fixtures.

## Extension model

To add a new test adapter (mobile, API, performance, security):

1. Create `packages/<adapter>/` implementing `TestAdapter` from `@xera-ai/core/adapter`.
2. Add the adapter id to `xera.config.ts.adapters`.
3. Write per-adapter generator helpers and a trace normalizer.
4. Reuse the classifier framework, status writer, Jira comment builder, graph emission patches, and skills as-is.

The classifier, reporter, **and graph layer** are adapter-agnostic by design. A new adapter inherits TEST_OUTDATED detection, impact analysis, and the HTML viewer for free.

## Test data

| Fixture dir | Used by |
|---|---|
| `fixtures/sample-app/` | Next.js login+dashboard SUT for e2e tests |
| `fixtures/mock-jira/` | Bun.serve mock Jira (deterministic tickets) |
| `fixtures/golden-tickets/` | Classifier rubric fixtures (v0.1) |
| `fixtures/golden-eval/` | `/xera-eval` rubric fixtures (v0.2 + EVAL-007 heal + EVAL-008/009 classify-outdated) |
| `fixtures/golden-graph/` | Snapshot/dedup/corrupt + TEST_OUTDATED scenarios (v0.6) |
| `fixtures/golden-impact/` | impact-prepare BFS scenarios (v0.6) |
| `fixtures/golden-coverage/` | coverage engine fixtures — 6 scenarios covering UNCOVERED/STALE/COVERED, risk formula, AC gaps (v0.8) |
| `fixtures/golden-tickets-http/` | HTTP-adapter classifier fixtures (v0.7) — `PASS`, `REAL_BUG`, `CONTRACT_DRIFT`, `RATE_LIMITED`, `AUTH_EXPIRED` |
| `fixtures/mock-api/` | Bun.serve mock HTTP API + `openapi.yaml` — target for http-adapter integration tests (v0.7) |
