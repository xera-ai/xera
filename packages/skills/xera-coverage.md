---
name: xera-coverage
description: Show area-level and AC-level coverage report for the current xera project; sort by risk; drill-down via --why; optional HTML viewer (v0.8.1+). Available v0.8.0+.
---

The user invoked `/xera-coverage [--why <area-or-TICKET>] [--all] [--json] [--viewer]`. Read flag arguments and forward to the binary.

This skill walks the project knowledge graph (`.xera/graph/`) to identify untested areas and unsatisfied acceptance criteria. It does NOT modify graph state or run tests — strictly read-only reporting plus an optional snapshot event for trend history.

## Step 1 — Verify project layout

Confirm the cwd is a xera project: `xera.config.ts` exists. If not, surface:

```
xera.config.ts not found — this command must run inside a xera project.
```

And STOP.

## Step 2 — Run coverage-prepare

Pass through the user's flags:

```bash
bun run xera:coverage-prepare [--why <id>] [--all] [--json] [--no-emit-event]
```

Flag handling:

- **`--why <id>`** — binary prints drill-down to stdout, no files written. Return that output to the user; do not continue to Step 3.
- **`--json`** — binary prints `report.json` to stdout. Return as-is.
- **No flag (default), or `--all`** — binary writes `.xera/coverage/report.json` and `.xera/coverage/report.md`, plus emits a `coverage.snapshot` event (unless config disables it).

Exit codes:

- `0` — report generated.
- `1` — unknown flag passed.
- `2` — `xera.config.ts` missing or invalid; surface stderr and STOP.
- `4` — internal error; surface stderr and STOP.

## Step 3 — Detect + run AC backfill if needed

Read `.xera/coverage/report.json`. If `acBackfillNeeded === true`:

### 3a — Assemble unmapped context

```bash
bun run xera:ac-coverage-backfill-prepare
```

This writes `.xera/coverage/ac-backfill-input.json` listing tickets with at least one **unmapped** scenario (a scenario that has no `satisfies` edge to any of its ticket's ACs). Tickets with partially mapped scenarios surface only their unmapped scenarios — finalize is additive per scenarioId (#119), so generating decisions for just the unmapped set will not clobber prior mappings.

If the input file is `{ "tickets": [] }`, skip to Step 4 — there's nothing to backfill (the `acBackfillNeeded` flag in report.json may be a leftover stale state; re-running `coverage-prepare` will refresh it).

### 3b — Invoke the AC-mapping prompt

Mint a fresh per-invocation nonce:

```bash
bun -e "console.log('XR_' + crypto.randomUUID().replace(/-/g,'').slice(0,12))"
```

Capture the single-line output as the nonce.

Read `.xera/coverage/ac-backfill-input.json` and `node_modules/@xera-ai/prompts/map-ac-to-scenarios.md`. Generate the AC mapping decisions following that prompt's rules. Wrap the input JSON between two identical `<NONCE>` tags before feeding it to your generation context.

Write the prompt output to `.xera/coverage/ac-backfill-decisions.json`. The output schema is:

```json
{
  "mappings": [
    { "scenarioId": "<id>", "satisfiesAcs": [<indices>], "confidence": <0-1> }
  ]
}
```

### 3c — Materialize the satisfies edges

```bash
bun run xera:ac-coverage-backfill-finalize
```

This validates the decisions JSON and emits one `ac-coverage.backfilled` event per ticket. Each event materializes the `satisfies` edges in the graph snapshot.

### 3d — Re-run coverage-prepare

```bash
bun run xera:coverage-prepare --no-emit-event
```

This regenerates `.xera/coverage/report.json` with the newly materialized `satisfies` edges. After this, `acBackfillNeeded` should be `false` (or only `true` for tickets the AI declined to map — those are an AI quality issue and need a human eye).

## Step 4 — Print report.md

Read `.xera/coverage/report.md` and print it verbatim to the terminal.

## Step 5 — Handle --viewer

If the user passed `--viewer`, run:

```bash
bun run xera:graph-render --include-coverage
```

This regenerates `.xera/graph.html` with a top-level Coverage tab (Map / List / Trend). Print the path so the user knows where to open it:

```
Coverage HTML viewer ready: .xera/graph.html
Open in any browser. The Coverage tab is at the top right.
```

## Step 6 — Print next-step hints

After the report (skip for `--why` and `--json` runs):

```
Next:
  /xera-coverage --why <area-or-TICKET>   full breakdown
  /xera-coverage --viewer                  HTML viewer (v0.8.1)
  /xera-fill-gap <area>                    draft scenarios (v0.8.2)
  /xera-fill-gap --ticket <TICKET>         draft AC gap scenarios (v0.8.2)
```

## Edge cases

- Graph snapshot not present yet: `loadAllEvents` returns `[]` → empty report. That's fine; surface "no events yet, run /xera-fetch on a ticket first" hint after Step 6.
- Config has invalid `coverage.criticalAreas` slug → binary exits 2 with parse error; surface and STOP.
