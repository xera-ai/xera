---
name: xera-exec
description: Run the Playwright test for a ticket. Refreshes auth state automatically. Use when QA wants to execute an existing spec without regenerating.
---

The user invoked `/xera-exec <TICKET>`. If no key, ask.

1. Verify `.xera/{{TICKET}}/spec.ts` exists. If not: "Generate the spec first with `/xera-script {{TICKET}}`." STOP.

2. Run: `bun run xera:exec {{TICKET}}`
   - Exit 0 → all scenarios passed.
   - Exit 1 → user/config error (lock held, missing env var). Show the error verbatim and STOP.
   - Exit 3 → test failure. This is expected; continue.
   - Exit 4 → infra error (Playwright crashed). Show stderr; STOP.

3. Read the latest run directory: `.xera/{{TICKET}}/runs/<latest>/`. Tell the user the runId.

4. Suggest: "Diagnose this run with `/xera-report {{TICKET}}`."
