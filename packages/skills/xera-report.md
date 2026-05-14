---
name: xera-report
description: Classify the latest run, draft a Jira comment, and post it. Use after `/xera-exec` when QA wants the diagnosis and Jira update.
---

The user invoked `/xera-report <TICKET>`. If no key, ask.

1. Verify `.xera/{{TICKET}}/runs/` has at least one run directory. If not: "Run the test first with `/xera-exec {{TICKET}}`." STOP.

2. Run: `bun run xera:normalize {{TICKET}}`
   - Exit 0 → continue.
   - Otherwise show stderr, STOP.

3. Read the latest `.xera/{{TICKET}}/runs/<latest>/normalized.json`. Also read:
   - `.xera/{{TICKET}}/test.feature`
   - `.xera/{{TICKET}}/story.md`
   - `.xera/{{TICKET}}/spec.ts`
   - `.xera/{{TICKET}}/status.json` (may not exist on first run)
   - `.xera/{{TICKET}}/meta.json`

4. Read `node_modules/@xera-ai/prompts/diagnose-failure.md`. Follow its decision algorithm. Produce `classifier-input.json` matching the exact shape described. Save to `.xera/{{TICKET}}/classifier-input.json`.

5. Run: `bun run xera:report {{TICKET}} -- --input=.xera/{{TICKET}}/classifier-input.json`

6. Read the drafted Jira comment at `.xera/{{TICKET}}/jira-comment.draft.md`. Show it to the user. Ask: "Post to Jira? (Y/n)"

7. If yes:
   - If Atlassian MCP is available, use `addCommentToJiraIssue` with the draft as the body. Capture the comment id.
   - Else: run `bun run xera:post {{TICKET}}` (will use REST creds from .env).

8. Summarize result and link to the Jira comment (if MCP returned a URL).
