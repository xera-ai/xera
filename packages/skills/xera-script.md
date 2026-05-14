---
name: xera-script
description: Generate the Playwright spec.ts and any new Page Objects for a ticket from its Gherkin feature. Use when QA wants AI to produce test code from the agreed-on Gherkin.
---

The user invoked `/xera-script <TICKET>`. If no key, ask.

1. Verify `.xera/{{TICKET}}/test.feature` exists. Otherwise say "Generate Gherkin first with `/xera-feature {{TICKET}}`." STOP.

2. Read `.xera/{{TICKET}}/meta.json`:
   - If `script_generated_from_feature_hash === feature_hash` AND `.xera/{{TICKET}}/spec.ts` exists, ask "spec.ts is up-to-date. Regenerate? (y/N)". Default no.

3. List existing shared POMs by reading `shared/page-objects/` (every `.ts` file, parse exported class names). Pass this list to yourself as context for reuse decisions.

4. Read `node_modules/@xera/prompts/script-from-feature.md`. Follow its hard rules.

5. Read `.xera/{{TICKET}}/test.feature` and `.xera/{{TICKET}}/story.md`. Generate:
   - `.xera/{{TICKET}}/spec.ts`
   - `.xera/{{TICKET}}/page-objects/<ClassName>.ts` for each new POM
   Do not modify anything under `shared/`.

6. Run quality gates:
   - `bun run xera:typecheck {{TICKET}}` — if exit 2, read errors, fix in the generated files, retry up to 2 times.
   - `bun run xera:lint {{TICKET}}` — same retry policy. If a CSS selector is truly necessary, add `// xera-allow-css: <reason>` on the line above it.

7. Update meta.json: `script_generated_at`, `script_generated_from_feature_hash`.

8. Summarize: list of files written, count of new POMs, mention any POM that *looked* reusable but didn't quite fit (suggest the user might want `/xera-promote` later).
   Suggest: "Run the test now with `/xera-exec {{TICKET}}`, or do the whole pipeline with `/xera-run {{TICKET}}`."
