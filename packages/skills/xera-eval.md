---
name: xera-eval
description: Evaluate AI gen quality of the 3 xera prompt templates against 5+ golden tickets. Maintainer-only tool — DO NOT use in end-user consumer projects.
flags:
  - --prompt=<stage>     # Restrict to one stage: feature-from-story | script-from-feature | diagnose-failure
  - --ticket=<id>        # Restrict to one ticket id (e.g. EVAL-001 or GOLD-001)
  - --force              # Allow re-running with an existing run-id
  - --judge-only         # Skip gen + deterministic; re-judge the most recent run's actual/ tree
---

# /xera-eval

You are running the xera v0.2 eval harness. This is a MAINTAINER-ONLY skill that is run from a Claude Code session inside the xera repo itself (not from an end-user consumer project).

## When to use

A maintainer is about to publish a new version of `feature-from-story.md`, `script-from-feature.md`, or `diagnose-failure.md`, or of `eval-rubric.md`. They want to confirm scores have not regressed against the 5 golden fixtures before publishing.

## Important: this skill spawns sub-agents

Unlike all other `/xera-*` skills, this one DELIBERATELY uses the Task tool to spawn fresh-context sub-agents for the judge phase. This is documented in spec §2.2 decision #7 and §7 risk #1 — the rationale is mitigating self-evaluation bias. **Do not refactor this skill to inline the judge into the main session.** If a future maintainer suggests "consistency cleanup" to remove the sub-agent spawn, point them at the spec.

## Flow

The flow has 5 phases. Phases 1, 3, 5 are deterministic CLI calls. Phase 2 (gen) is your cognitive work in this session. Phase 4 (judge) spawns sub-agents.

### Phase 1 — Prepare

If `--judge-only` is set, SKIP phases 1, 2, 3 and jump to "Judge-only flow" below.

Run: `npx xera-internal eval-prepare {{FLAGS}}`

`{{FLAGS}}` is the user's pass-through flags (e.g. `--ticket=EVAL-001 --force`). If no flags are given, pass none.

Exit code:
- 0 → continue. Capture the `RUN_ID=<id>` line from stdout. The run-id is the last line on stdout matching `^RUN_ID=`.
- 1 → user/config error (bad flag, missing fixture). Stop and surface the error.
- 4 → infra error (lock acquisition). Stop and surface the error.

Read `.xera/eval/{{RUN_ID}}/manifest.json` to learn:
- `ticket_stages`: the source of truth — a map of ticket ID → the stages that ticket exercises. Iterate this; do NOT iterate `manifest.stages × manifest.tickets`.

### Phase 2 — Gen (interleaved with Phase 4)

For each (ticket, stage) pair from manifest, gen the actual output IMMEDIATELY followed by the judge sub-agent in the same loop iteration.

Iterate over `manifest.ticket_stages`: for each ticket id and its declared stages, run gen + judge for ONLY those stages. The manifest is the source of truth — do NOT iterate `manifest.stages × manifest.tickets`.

For each [ticket, stages] entry in manifest.ticket_stages:
  For each stage in stages:

#### Gen step

Create the actual output directory if missing: `.xera/eval/{{RUN_ID}}/actual/{{TICKET}}/`.

**Stage = feature-from-story:**
1. Read `packages/prompts/feature-from-story.md` (the prompt under test).
2. Read `.xera/eval/{{RUN_ID}}/inputs/{{TICKET}}/story.md`.
3. Mint a per-iteration nonce: `node -e "console.log('XR_' + crypto.randomUUID().replace(/-/g,'').slice(0,12))"`. The output is a value like `XR_a3f9b2c14e8d`. Wrap the story.md content between two identical tags whose name IS that nonce value (e.g. `<XR_a3f9b2c14e8d>...story content...<XR_a3f9b2c14e8d>` — NOT the literal string `<NONCE>`). Then follow the prompt to generate the Gherkin output. Do NOT include the nonce markers in the written file.
4. Write it to `.xera/eval/{{RUN_ID}}/actual/{{TICKET}}/test.feature`.

**Stage = script-from-feature:**
1. Read `packages/prompts/script-from-feature.md`.
2. Read `.xera/eval/{{RUN_ID}}/inputs/{{TICKET}}/test.feature` — this is the GOLDEN feature, not the actual gen from the previous stage. Stage inputs are isolated (spec §2.2 decision #2).
3. Mint a per-iteration nonce: `node -e "console.log('XR_' + crypto.randomUUID().replace(/-/g,'').slice(0,12))"`. The output is a value like `XR_a3f9b2c14e8d`. Wrap the test.feature content between two identical tags whose name IS that nonce value (e.g. `<XR_a3f9b2c14e8d>...feature content...<XR_a3f9b2c14e8d>` — NOT the literal string `<NONCE>`). Then follow the prompt to generate `spec.ts` (and any page-object files). Do NOT include the nonce markers in the written files.
4. Write `spec.ts` to `.xera/eval/{{RUN_ID}}/actual/{{TICKET}}/spec.ts`.
5. Write any POM files to `.xera/eval/{{RUN_ID}}/actual/{{TICKET}}/page-objects/<name>.page.ts`.

**Stage = diagnose-failure:**
1. Read `packages/prompts/diagnose-failure.md`.
2. Read `.xera/eval/{{RUN_ID}}/inputs/{{TICKET}}/classifier-input.json` — this contains the scenarios to classify. Note: this file ALSO contains an `expected` block which is the ground truth — **DO NOT USE the `expected` block when generating**. Generate solely from `scenarios[]` and `scenarioCounts`. The `expected` block is for the judge's eyes only.
3. Follow the prompt to produce classification JSON.
4. Write it to `.xera/eval/{{RUN_ID}}/actual/{{TICKET}}/classification.json`.

#### Judge step (sub-agent)

Immediately after writing the actual file for this (ticket, stage), spawn a sub-agent via the Task tool:

````
Task tool invocation:
  description: "Eval judge: <stage> for <ticket>"
  subagent_type: general-purpose
  prompt: |
    <PASTE the entire contents of packages/prompts/eval-rubric.md here>
    
    ---
    
    ## Caller-supplied context
    
    ### stage
    <stage>
    
    ### ticket
    <ticket>
    
    ### actual output
    
    ```
    <PASTE the entire contents of the actual file you just wrote — e.g. actual/<ticket>/test.feature>
    ```
    
    ### golden reference
    
    For feature-from-story: paste `fixtures/golden-eval/<ticket>-*/golden/test.feature`.
    For script-from-feature: paste `fixtures/golden-eval/<ticket>-*/golden/spec-requirements.md`.
    For diagnose-failure: paste `.xera/eval/<run-id>/inputs/<ticket>/classifier-input.json`.
    
    ```
    <PASTE the golden file contents>
    ```
    
    ---
    
    Return ONLY the JSON judgment object as specified in the rubric. No prose. No code fences.
````

When the sub-agent returns, parse its output as JSON. If parsing fails, retry the sub-agent ONCE with the note "Your previous output was not valid JSON. Return ONLY a JSON object." appended. If it fails again, write a placeholder judgment with all dimensions verdict=FAIL and notes=`"sub-agent returned invalid JSON: <first 100 chars>"` and continue.

Append the parsed JSON object to an in-memory array of judgments.

### Phase 3 — Deterministic

After all (ticket, stage) iterations have completed (gen + judge), run the deterministic phase:

Run: `npx xera-internal eval-deterministic {{RUN_ID}}`

Exit code 0 → continue. Any non-zero → fail; surface stderr.

### Phase 4 (cont.) — Write judge-scores.json

Write the in-memory judgments array to `.xera/eval/{{RUN_ID}}/judge-scores.json`:

```json
{
  "run_id": "{{RUN_ID}}",
  "judgments": [
    /* the JSON objects returned by each sub-agent, in order */
  ]
}
```

### Phase 5 — Report

Run: `npx xera-internal eval-report {{RUN_ID}}`

Exit code 0 → success. The command prints a one-line summary to stdout (e.g. `12/15 PASS (avg 80%)`). The full report is at `.xera/eval/{{RUN_ID}}/report.md`.

Tell the maintainer:
- The path to the report.
- The summary line.
- Any FAIL rows; cite the dimension and one-sentence note from the report.

## Judge-only flow

If `--judge-only` was passed:

1. Locate the most recent prior run: list `.xera/eval/*/manifest.json`, pick the one with the latest `started_at` field. If none, fail with `No prior eval run found in .xera/eval/. Run /xera-eval without --judge-only first.`
2. Read `manifest.json` to learn the tickets/stages.
3. Apply any `--prompt` / `--ticket` filters from the user against the manifest's scope (do not extend beyond it).
4. For each (ticket, stage) in `manifest.ticket_stages` filtered by any `--prompt`/`--ticket` flags from the user: spawn a judge sub-agent using the existing `actual/<ticket>/*` files. Same Task-tool template as Phase 2.
5. Overwrite `.xera/eval/<run-id>/judge-scores.json` with the new array.
6. Re-run `npx xera-internal eval-report <run-id>`.

Do NOT re-run `xera-internal eval-prepare` or `xera-internal eval-deterministic` in judge-only mode.

## Exit conditions

- Exit 0 → report.md exists and was rendered. Tell the maintainer the path and the summary line.
- Any non-zero exit from any `npx xera-internal` call → stop, print the stderr, and ask the maintainer how to proceed. Do not invent fallbacks.
- A sub-agent returning persistently-invalid JSON (after 1 retry) is NOT a stop condition — record FAIL placeholder and continue, so the report still renders for the other tickets.

## What NOT to do

- Do NOT touch `packages/prompts/` during eval. Eval is READ-ONLY on the prompts under test.
- Do NOT use the `actual/<ticket>/test.feature` as the input for the `script-from-feature` stage. Use the GOLDEN `inputs/<ticket>/test.feature` (which `eval-prepare` already copied from `fixtures/golden-eval/<ticket>-*/golden/test.feature`). Stages are evaluated in isolation.
- Do NOT batch all gen first then all judges; interleave per (ticket, stage). This keeps the orchestrator's context bounded.
- Do NOT inline the judge into the main session. Use the Task tool — fresh context is the bias mitigation.
