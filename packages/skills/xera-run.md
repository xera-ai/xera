---
name: xera-run
description: Run the full xera pipeline for a Jira ticket end-to-end — fetch story, generate Gherkin, generate Playwright spec, execute, diagnose, post to Jira. Use when QA wants to test a ticket from scratch.
---

The user invoked `/xera-run <TICKET>`. If no key, ask.

This skill orchestrates the other six skills with quality gates between each step. If any step fails non-recoverably, STOP and surface the cause.

## Step 0 — Health gate

Run: `bunx xera doctor --strict {{TICKET}}`
If non-zero exit → STOP. Show the output verbatim. Suggest the user fix env and re-run.

## Step 1 — Fetch

Follow the same instructions as `xera-fetch.md`, but never prompt the user about re-fetching here — just proceed unless story.md already exists and meta.json shows a `story_hash` < 24 hours old (then skip fetch).

If meta is missing or story_hash is older, refresh.

## Step 2 — Feature

Follow `xera-feature.md`. If `feature_generated_from_story_hash !== story_hash`, regenerate. If unchanged AND spec.ts exists, skip feature generation entirely.

## Step 3 — Script

Follow `xera-script.md`. If `script_generated_from_feature_hash !== feature_hash`, regenerate. Else skip.

## Step 4 — Exec

Run `bun run xera:exec {{TICKET}}`.

## Step 5 — Normalize

Run `bun run xera:normalize {{TICKET}}`.

## Step 6 — Diagnose + report + post

Follow `xera-report.md` from step 3 onwards. If the user is the SAMPLE-001 ticket (meta.source === "local"), do NOT post to Jira and do NOT prompt about posting — only print the drafted comment.

## Step 7 — Summary

Print a single-paragraph summary covering: overall result, classification, per-scenario counts, link to Jira comment (if posted), and the reproduce command (`bunx xera-internal exec {{TICKET}} --replay=<runId>`).
