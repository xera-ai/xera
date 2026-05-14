---
name: xera-report
description: Classify the latest run, draft a Jira comment, and post it. Use after `/xera-exec` when QA wants the diagnosis and Jira update.
---

You are running `/xera-report <TICKET>` (or you were dispatched to this step by `/xera-run`). If no ticket key is provided, ask the user.

## Important — this skill does AI work

Step 4 below is *cognitive work that YOU, the session, must do*. It is not a shell command. Do not skip it. Do not call `bun run xera:report` until **you have personally written the file `.xera/{{TICKET}}/classifier-input.json`** by reasoning over the run artifacts. The CLI helper consumes that JSON; it does not produce it.

## Steps

1. **Verify** `.xera/{{TICKET}}/runs/` has at least one run directory. If not, tell the user: "Run the test first with `/xera-exec {{TICKET}}`." then STOP.

2. **Normalize the trace.** Run: `bun run xera:normalize {{TICKET}}`
   - Exit 0 → continue.
   - Otherwise show stderr to the user and STOP.

3. **Read** the latest `.xera/{{TICKET}}/runs/<latest>/normalized.json`. Also read every file below before proceeding to step 4:
   - `.xera/{{TICKET}}/test.feature`
   - `.xera/{{TICKET}}/story.md`
   - `.xera/{{TICKET}}/spec.ts`
   - `.xera/{{TICKET}}/status.json` (may not exist on the first run — that's fine)
   - `.xera/{{TICKET}}/meta.json`
   - `node_modules/@xera-ai/prompts/diagnose-failure.md` (the prompt template — read it in full; the rest of step 4 follows ITS rules)

4. **Classify (YOUR job, no CLI shortcut here).** Follow `diagnose-failure.md`'s decision algorithm scenario-by-scenario. For each scenario in `normalized.json`, decide:
   - `class`: one of `PASS`, `REAL_BUG`, `SELECTOR_DRIFT`, `FLAKY`, `TEST_BUG`
   - `confidence`: `low`, `medium`, or `high`
   - `rationale`: 1–3 sentences in English citing concrete evidence (URL, HTTP status, element name, prior run timestamps, hash drift, etc.)

   Then write a JSON file to `.xera/{{TICKET}}/classifier-input.json` with this exact shape:

   ```json
   {
     "runId": "<runId from normalized.json>",
     "scenarios": [
       {
         "name": "<scenario name>",
         "outcome": "PASS" | "FAIL" | "SKIPPED",
         "class": "PASS" | "REAL_BUG" | "SELECTOR_DRIFT" | "FLAKY" | "TEST_BUG",
         "confidence": "low" | "medium" | "high",
         "rationale": "..."
       }
     ],
     "scenarioCounts": { "total": N, "passed": N, "failed": N, "skipped": N }
   }
   ```

   **Do not skip this step.** If you find yourself about to call `bun run xera:report` without having written this file, stop and write the file first.

5. **Aggregate + draft.** Run: `bun run xera:report {{TICKET}} -- --input=.xera/{{TICKET}}/classifier-input.json`
   This CLI: aggregates per-scenario classifications into an overall verdict, updates `status.json` with history, and writes `jira-comment.draft.md`. If exit code is non-zero, surface the error to the user; do not proceed to post.

6. **Show the draft.** Read `.xera/{{TICKET}}/jira-comment.draft.md`. Display its content to the user verbatim. Ask: "Post to Jira? (Y/n)" (default: Y, unless `meta.json.source === "local"` for SAMPLE tickets — then never post).

7. **Post.** If user says yes (or `xera-run` is in auto mode with `postToJira: true`):
   - If an Atlassian MCP tool is available in this session (e.g., `mcp__atlassian__addCommentToJiraIssue` or `mcp__plugin_engineering_atlassian__addCommentToJiraIssue`), call it with `{{TICKET}}` and the draft contents. Capture the comment id.
   - Else run `bun run xera:post {{TICKET}}` (uses REST credentials from `.env`).

8. **Summarize** to the user: overall classification, scenario pass/fail counts, the reproduce command (`bunx xera-internal exec {{TICKET}} --replay=<runId>`), and the Jira comment URL if available.
