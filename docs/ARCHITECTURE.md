# xera Architecture

For the full specs see [design docs](superpowers/specs/) (v0.1 core, v0.2 eval, v0.3 prompt injection, v0.5 self-heal, v0.6 project knowledge graph). This is a shorter overview for developers contributing to xera itself.

## Layers

```
End user (QA)
  │ uses `bunx xera init` once (scaffolds CI workflow + npm scripts)
  │ then `/xera-*` slash commands in Claude Code
  ▼
Skills (`.claude/skills/xera-*.md`) — 8 user-facing workflows
  │ tell the session LLM what to do
  │ session LLM calls `bun run xera:*`
  ▼
`xera-internal` binary (in @xera-ai/core) — 19 subcommands
  │ deterministic helpers + graph data layer
  │ writes artifacts to .xera/<TICKET>/
  │ writes events to .xera/graph/events/
  ▼
@xera-ai/web — Playwright adapter (supports --grep per-scenario filter)
  │ generator helpers (validate, typecheck, lint)
  │ executor + trace normalizer + secret scrubber
  ▼
Playwright + the user's app under test
```

## v0.6 addition: Project Knowledge Graph

A repo-local event-sourced data layer running parallel to the v0.1 artifact pipeline. Skills emit events on every fetch/script/exec/report/promote. The derived snapshot powers three user-facing features:

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
          │  • classify (TEST_OUTDATED)  │  → /xera-report 5-bucket
          │  • impact (riskScore + BFS)  │  → /xera-impact
          │  • render (vis-network HTML) │  → CI artifact + sticky comment
          │  • disputes (CLI report)     │  → QA-lead weekly review
          └──────────────────────────────┘
```

## Key invariants

- The public CLI exposes only `init` and `doctor`. Everything else is via skills.
- Skill prompts + `xera-internal` form a closed pair: the skill knows when to call which subcommand and what to do with its output.
- Every `xera-internal` subcommand reads from disk and writes to disk. No subcommand keeps state across invocations.
- AI work happens in the QA's Claude Code session — there is no `claude` binary shell-out from `xera-internal`. Even the graph similarity / TEST_OUTDATED classifier calls Claude **from the skill** (skill writes input JSON, calls binary, binary reads input).
- Secret scrubbing is deterministic and runs before LLM ever sees normalized run data.
- Graph events are sharded one-file-per-skill-invocation → zero git merge conflicts when multiple QA work in parallel.

## Packages

| Package | Responsibility | Public bin |
|---|---|---|
| `@xera-ai/core` | Config, paths, hashing, lock, log, Jira client, classifier framework (5 buckets incl. TEST_OUTDATED), auth state, **graph module** (types, schema, store, similarity, enrich, classify, traverse, impact, render, cost) | `xera-internal` |
| `@xera-ai/cli` | Public CLI: `init`, `doctor` | `xera` |
| `@xera-ai/web` | Playwright adapter (executor with `--grep` support) | — |
| `@xera-ai/skills` | Claude Code skill `.md` files (8 user-facing skills) | — |
| `@xera-ai/prompts` | Versioned LLM prompt templates (7 templates) | — |

## `xera-internal` subcommands (19)

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

**Universal:** `verify-prompts`, `doctor` (with `--auto-enrich` for CI)

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
