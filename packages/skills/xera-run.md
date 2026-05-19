---
name: xera-run
description: Run the full xera pipeline for a ticket end-to-end — fetch story, generate Gherkin, generate Playwright spec, execute, diagnose, post a comment to the configured issue tracker (Jira or GitHub). Use when QA wants to test a ticket from scratch.
---

The user invoked `/xera-run <TICKET>`. If no key, ask.

This skill orchestrates the other six skills with quality gates between each step. If any step fails non-recoverably, STOP and surface the cause.

## Step 0 — Health gate (environment only)

Run: `bunx xera doctor --strict`
If non-zero exit → STOP. Show the output verbatim. Suggest the user fix env and re-run.

This runs the environment-level checks (bun, `xera.config.ts`, baseUrl reachability, auth files, OpenAPI, `.env`, editor skill layout). The ticket-specific gate runs as Step 1.6 after fetch, since `.xera/{{TICKET}}/` legitimately does not exist on the very first invocation of `/xera-run`.

## Step 1 — Fetch

Follow the same instructions as `xera-fetch.md`, but never prompt the user about re-fetching here.

**Sub-steps 1–3 of xera-fetch (tracker call → write `story.md` + `meta.json`)**: skip if `story.md` exists AND `meta.json` shows a `story_hash` < 24 hours old. Otherwise refresh.

**Sub-step 4 of xera-fetch (cognitive AC body-extraction)**: re-run whenever `story.md` frontmatter shows `acceptanceCriteriaSource: none` AND `acceptanceCriteria:` block is empty — even when sub-steps 1–3 were skipped. The extraction is cheap and idempotent (writes back to the same frontmatter). Skipping it permanently is what causes projects with AC-in-body workflow to have empty AC across the graph.

**Sub-step 6 of xera-fetch (extract-areas → `graph-input.json`)**: gate this on **file existence**, not story freshness. If `.xera/{{TICKET}}/graph-input.json` is missing or fails `JSON.parse`, run the `extract-areas.md` prompt and (over)write the file — even when sub-steps 1–3 were skipped. This is cheap, idempotent, and required by Step 1.5 and by downstream coverage/impact features. Without it, `xera:graph-record fetch` silently records `modifiesAreas=[]` (see [#109](https://github.com/xera-ai/xera/issues/109)).

**Sub-step 7 of xera-fetch (`xera:graph-record fetch`)**: always run — it's non-fatal and idempotent. Skipping it is what causes the graph to fall out of sync with `.xera/<TICKET>/`.

## Step 1.5 — Auto-trigger impact analysis (v0.6.2)

After `/xera-fetch` completes, check whether this ticket modifies areas that other tests depend on.

Read `xera.config.run.autoImpact` (defaults: `{ enabled: true, threshold: 8.0 }`). If `enabled === false`, SKIP this step.

Run:

```bash
bun run xera:impact-prepare {{TICKET}} --quiet
```

This writes `.xera/impact/{{TICKET}}.json` (no markdown). Exit code 2 means the ticket is not yet in graph — surface a warning and proceed (graph data only accumulates over time).

Read the JSON. Count scenarios with `riskScore >= autoImpact.threshold` (default **8.0** per v0.6.4).

- If **0** scenarios above threshold → continue **silently** to Step 2. Do not show any prompt; do not log the result. The impact analysis ran but found nothing actionable.
- If **≥1** above threshold → prompt the user as before: `[Y]es / [n]o / [details]`.

This means the auto-trigger is effectively a "high-risk alarm" rather than a per-run interruption. With the default threshold raised to 8.0, prompts only fire for tickets that genuinely affect P0 scenarios in heavily-shared SUT areas. Teams that want the older, chatty behavior can lower the threshold via `xera.config.run.autoImpact.threshold`.

- **[Y]:** Iterate `bun run xera:exec <owner-ticket>` for each unique owner ticket. After each, check status; if all pass, continue to Step 2. If any fail, surface the failure and STOP — the user should diagnose existing-test breakage before introducing more changes.
- **[n]:** Continue to Step 2.
- **[details]:** Suggest the user run `/xera-impact {{TICKET}}` interactively for full details, then ask again.

Non-fatal: if `xera:impact-prepare` itself exits abnormally, log the warning but continue to Step 2 — graph features are advisory, not gating.

## Step 1.6 — Ticket health gate

Run: `bunx xera doctor --strict {{TICKET}}`

This re-runs doctor with the ticket arg now that `/xera-fetch` has materialized `.xera/{{TICKET}}/` (story.md, meta.json, graph-input.json). Checks include: artifact dir present, `graph-input.json` parses with a valid `modifiesAreas` array, and `story.md` frontmatter has acceptanceCriteria (or an actionable hint if not).

If non-zero exit → STOP. Show the output verbatim. The most common failures are recoverable in-place (re-run a single substep of `/xera-fetch`); pick the hint that matches the failing check.

## Step 2 — Feature

Follow `xera-feature.md`. If `feature_generated_from_story_hash !== story_hash`, regenerate. If unchanged AND spec.ts exists, skip feature generation entirely.

## Step 3 — Script

Follow `xera-script.md`. If `script_generated_from_feature_hash !== feature_hash`, regenerate. Else skip.

## Step 4 — Exec

Run `bun run xera:exec {{TICKET}}`.

## Step 5 — Normalize

Run `bun run xera:normalize {{TICKET}}`. This writes `normalized.json` AND emits `run.completed` events to the graph for every PASS/FAIL scenario in the run, so `latest_failures` and risk scoring stay in sync with reality (see #118 — earlier versions silently rendered failed scenarios green on `graph.html`).

## Step 6 — Diagnose + report + post

Follow `xera-report.md` from step 3 onwards. If the user is the SAMPLE-001 ticket (meta.source === "local"), do NOT post a comment and do NOT prompt about posting — only print the drafted comment.

## Step 7 — Summary

Print a single-paragraph summary covering: overall result, classification, per-scenario counts, link to the posted comment (if posted — Jira link or GitHub issue-comment anchor), and the reproduce command (`bunx xera-internal exec {{TICKET}} --replay=<runId>`).
