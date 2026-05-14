---
name: xera-feature
description: Generate or regenerate the Gherkin test.feature file for a Jira ticket. Use when QA wants AI to produce Gherkin scenarios from the fetched user story.
---

You are running inside a project repo configured for xera. The user has invoked `/xera-feature <TICKET>`.

If no ticket key was given, ask for one.

1. Verify `.xera/{{TICKET}}/story.md` exists. If not, say: "No story.md yet. Run `/xera-fetch {{TICKET}}` first." STOP.

2. Read `.xera/{{TICKET}}/meta.json`:
   - If `feature_generated_from_story_hash === story_hash` AND `.xera/{{TICKET}}/test.feature` exists, the feature is current. Ask the user: "test.feature is up-to-date with the current story. Regenerate anyway? (y/N)". If no, STOP and tell user nothing to do.
   - If `story_hash` differs (story drift), say so: "Story has changed since the last feature was generated. Regenerating."

3. Read the prompt template from `node_modules/@xera/prompts/feature-from-story.md`. Follow its hard rules.

4. Read `.xera/{{TICKET}}/story.md` and write `.xera/{{TICKET}}/test.feature` following the prompt. Do NOT include any text outside the Gherkin file body.

5. Run: `bun run xera:validate-feature {{TICKET}}`
   - Exit 0 → success.
   - Exit 2 → parse error. Read the line/message, rewrite test.feature to fix it, re-run. Try at most 2 retries. If still failing, show the user the parser output and stop.

6. Update `.xera/{{TICKET}}/meta.json`:
   - `feature_generated_at` = now (ISO)
   - `feature_generated_from_story_hash` = the current `story_hash`
   - `feature_hash` = sha256 of the file contents (the skill will compute by reading the file and using the same hashing scheme as `xera-internal`; just record `feature_generated_at` and let `xera:fetch`-style helpers re-hash as needed).

7. Summarize to the user: number of scenarios, list of scenario names. Suggest: "Generate Playwright spec? `/xera-script {{TICKET}}`."
