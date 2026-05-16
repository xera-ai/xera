---
name: xera-fetch
description: Fetch a Jira ticket and write its user story to .xera/<TICKET>/story.md. Use when QA wants to start working on a ticket without yet generating tests.
---

You are running inside a project repo configured for xera. The user has invoked `/xera-fetch <TICKET>`.

If the user did not provide a ticket key, ask: "Which Jira ticket key?" and wait. The key must look like `PROJ-123`.

1. Check whether `.xera/{{TICKET}}/story.md` already exists.
   - If yes, read its first line to confirm the ticket key matches.
   - If the file exists and the user did not explicitly ask to re-fetch, ask: "story.md exists for {{TICKET}}. Re-fetch from Jira and overwrite? (y/N)". Default to no.

2. Detect Jira backend:
   - If an Atlassian MCP tool is available in this session (a tool whose name starts with `mcp__atlassian__` or `mcp__plugin_engineering_atlassian__`), use it:
     a. Call `getJiraIssue` (or equivalent) with the ticket key.
     b. Map the response into the shape `xera-internal fetch` expects: `{ key, summary, story, acceptanceCriteria?, attachments, raw }`.
        - `story` is the value of the field named in `xera.config.ts.jira.fields.story`.
        - `acceptanceCriteria` is the value of `jira.fields.acceptanceCriteria` if set.
        - `attachments` is the array of attachments, each mapped to `{ filename, url }`.
     c. Write that object as JSON to a temp file at `$TMPDIR/xera-mcp/{{TICKET}}.json` (create the dir if missing).
     d. Set the environment variable `XERA_MCP_JIRA=1` for the next subprocess call.
   - Else: use the REST backend implicitly via `JIRA_EMAIL` + `JIRA_API_TOKEN` from `.env`.

3. Run: `bun run xera:fetch {{TICKET}}`
   - Exit 0 → continue.
   - Exit 1 → user/config error. Read stderr, show the user the fix instructions, STOP.
   - Exit 4 → infra error. Show error, STOP.

4. Read `.xera/{{TICKET}}/story.md` and `.xera/{{TICKET}}/meta.json`. Summarize to the user:
   - Ticket key, summary
   - First 200 chars of story
   - Whether AC was found in a separate field

5. Extract modified areas (v0.6 graph foundation):

   After `story.md` is written, follow the `extract-areas.md` prompt template (located at `packages/prompts/extract-areas.md` in the xera install). The prompt instructs you to read the just-fetched ticket's `summary` and `ac` (from `story.md` frontmatter) and output JSON of the form `{ "modifiesAreas": ["slug", ...] }`.

   Write that JSON to `.xera/<TICKET>/graph-input.json`.

6. Record graph events:

   Run:

   ```bash
   bun run xera:graph-record fetch <TICKET>
   ```

   This is non-fatal: if it exits non-zero, log a warning *"Graph event not recorded — run `xera doctor` to rebuild"* but continue. Do not block the fetch flow on this.

7. Suggest next step: "Generate Gherkin? Run `/xera-feature {{TICKET}}` or run the full pipeline with `/xera-run {{TICKET}}`."
