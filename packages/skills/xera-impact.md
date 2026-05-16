---
name: xera-impact
description: Pre-flight impact analysis. Given a ticket, identify scenarios that may be affected by its changes (graph-walk via project knowledge graph), then optionally re-run them. Use before merging or when AC has just changed for a ticket. Available v0.6.2+.
---

The user invoked `/xera-impact <TICKET> [--depth 1|2|3] [--min-priority p0|p1|p2]`. If no key, ask.

This skill walks the project knowledge graph (`.xera/graph/`) to find scenarios that depend on the modified areas of `<TICKET>`. It does NOT re-fetch or re-script — it's strictly a query + optional re-execution.

## Step 1 — Verify graph snapshot is fresh

Run:

```bash
bun run xera:graph-snapshot --check
```

If stale, the subcommand auto-rebuilds. If `<TICKET>` is not in the graph, this step will succeed but Step 2 will exit with code 2 — that means you must run `/xera-fetch {{TICKET}}` first.

## Step 2 — Compute impact

Run:

```bash
bun run xera:impact-prepare {{TICKET}} [--depth N] [--min-priority P]
```

Pass through any flags the user provided. On exit code 2, surface: *"Ticket {{TICKET}} not in graph — run `/xera-fetch {{TICKET}}` first"* and STOP.

The subcommand writes:
- `.xera/impact/{{TICKET}}.json` (machine-readable)
- `.xera/impact/{{TICKET}}.md` (human-readable)

## Step 3 — Display summary

Read `.xera/impact/{{TICKET}}.json`. If `scenarios.length === 0`, show:

```
Impact analysis for {{TICKET}} → no prior scenarios in modified areas
(this is normal for new feature areas; nothing to re-run)
```

And STOP.

Otherwise, count scenarios in 3 score buckets (high ≥7.0, medium ≥4.0, low <4.0). Display:

```
Impact analysis for {{TICKET}}  →  .xera/impact/{{TICKET}}.md

N scenarios impacted (H high · M medium · L low)

Top 3:
  <ticketId> / "<name>"   [Pn]   <score>   <edge-summary>
  ...
```

## Step 4 — Prompt re-run

Ask the user: `Re-run impacted scenarios?  [Y]es / [p] P0 only / [s]elect / [n]o`

- **[n]:** STOP. The user can inspect `.xera/impact/{{TICKET}}.md` separately.

- **[Y]:** Group impacted scenarios by their owner ticket (`scenario.ticketId`). For each owner ticket, build a regex from the impacted scenario names — e.g. `"user signs in|user resets password"` — and invoke:

  ```bash
  bun run xera:exec <owner-ticket> --grep "<NAME_REGEX>"
  ```

  The `--grep` flag (added in v0.6.4) makes Playwright run **only the named scenarios**, not the entire spec. Build the regex by joining `impacted[].name` with `|` and escaping any regex special characters in the names. If a scenario name contains characters like `(`, `)`, or `|`, escape them with `\\`.

  Collect each invocation's `RUN_ID` and surface them in the final summary.

- **[p]:** Filter to `priority === 'p0'` scenarios, then proceed as [Y] above (use `--grep` per owner ticket).

- **[s]:** Show numbered list with checkboxes; let the user pick a subset. Proceed as [Y] using the selected subset for the `--grep` regex.

## Step 5 — Recommend follow-up

After exec runs complete, recommend:

```
{{N}} owner tickets re-run. Run `/xera-report {{TICKET}}` next to classify failures
(TEST_OUTDATED detection will flag failures caused by THIS ticket's AC change).
```

## Edge cases

- If `xera:impact-prepare` exits non-zero for any reason other than 2 (e.g. graph corrupted), surface the stderr and STOP.
- If a re-run via `xera:exec` fails non-recoverably, continue with remaining tickets but note the failure in the final summary.
- Respect `xera.config.run.autoImpact.enabled = false` — skip this skill if invoked recursively from `/xera-run` and config disables it.
