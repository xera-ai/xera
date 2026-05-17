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

## Step 3 — Read report.json

If a normal (non-`--why`, non-`--json`) run, read `.xera/coverage/report.json`. Check `acBackfillNeeded`:

- If `true`: print this warning BEFORE the report (the actual backfill flow ships in v0.8.0-beta / Plan 03):

  ```
  ⚠ AC backfill is needed for legacy scenarios. AC-level coverage may be
    incomplete until /xera-coverage backfill runs (planned v0.8.0-beta).
  ```

## Step 4 — Print report.md

Read `.xera/coverage/report.md` and print it verbatim to the terminal.

## Step 5 — Handle --viewer

If the user passed `--viewer`, print:

```
HTML viewer for coverage is planned for v0.8.1.
For now, the report.md above is the full output.
```

(Plan 04 will wire `--viewer` through to `bun run xera:graph-render --include-coverage`.)

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
