---
name: xera-exec
description: Run the Playwright test for a ticket. Refreshes auth state automatically. Use when QA wants to execute an existing spec without regenerating.
---

The user invoked `/xera-exec <TICKET>`. If no key, ask.

1. Verify `.xera/{{TICKET}}/spec.ts` exists. If not: "Generate the spec first with `/xera-script {{TICKET}}`." STOP.

2. Run: `npx xera-internal exec {{TICKET}}`
   `npx xera-internal exec` automatically picks the runner based on `meta.json.adapter` (web or http).
   - Exit 0 → all scenarios passed.
   - Exit 1 → user/config error (lock held, missing env var). Show the error verbatim and STOP.
   - Exit 3 → test failure. This is expected; continue.
   - Exit 4 → infra error (Playwright crashed). Show stderr; STOP.

3. Read the latest run directory: `.xera/{{TICKET}}/runs/<latest>/`. Tell the user the runId.

4. Suggest: "Diagnose this run with `/xera-report {{TICKET}}`."

## Step 5 — Record graph events

`/xera-report` calls `npx xera-internal normalize {{TICKET}}` as its first step, which now emits the `run.completed` events for this run automatically (see #118). No explicit `graph-record exec` call is needed here.

If you skip `/xera-report` (e.g. running `/xera-exec` standalone for a smoke check), trigger the same emission with:

```bash
npx xera-internal normalize <TICKET>
```

Non-fatal. (The lower-level `npx xera-internal graph-record exec <TICKET> --run-id <RUN_ID>` still works for manual replay, but produces duplicate events if `xera-internal normalize` already ran for the same run.)
