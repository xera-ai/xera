---
name: xera-script
description: Generate the Playwright spec.ts and any new Page Objects for a ticket from its Gherkin feature. Use when QA wants AI to produce test code from the agreed-on Gherkin.
---

The user invoked `/xera-script <TICKET>`. If no key, ask.

1. Verify `.xera/{{TICKET}}/test.feature` exists. Otherwise say "Generate Gherkin first with `/xera-feature {{TICKET}}`." STOP.

2. Read `.xera/{{TICKET}}/meta.json`:
   - If `script_generated_from_feature_hash === feature_hash` AND `.xera/{{TICKET}}/spec.ts` exists, ask "spec.ts is up-to-date. Regenerate? (y/N)". Default no.

3. List existing shared POMs by reading `shared/page-objects/` (every `.ts` file, parse exported class names). Pass this list to yourself as context for reuse decisions.

4. Read `.xera/{{TICKET}}/meta.json` to get the adapter (`adapter` field). Then read the appropriate prompt template:

   - If `adapter === "web"` (or missing): use `node_modules/@xera-ai/prompts/script-from-feature-web.md`.
   - If `adapter === "http"`: use `node_modules/@xera-ai/prompts/script-from-feature-http.md`.

   Follow that prompt's hard rules.

   When `adapter === "http"`, additionally:
   - Run `bun run xera:openapi-resolve {{TICKET}}` — this writes `.xera/{{TICKET}}/openapi-input.json`, a deterministic JSON file containing `{ openapi: <dereferenced doc> | null }`. The subcommand handles path/URL resolution and `$ref` dereferencing for you; never read the raw OpenAPI file yourself.
   - Read `.xera/{{TICKET}}/openapi-input.json` and pass the value of its `openapi` field to your generation context as the `openapi` input (it will be `null` when `http.spec` is not configured or the spec failed to load).

5. Before reading the test.feature + story.md content into your generation context, mint a fresh per-invocation nonce by running:

   ```bash
   bun -e "console.log('XR_' + crypto.randomUUID().replace(/-/g,'').slice(0,12))"
   ```

   Capture the single-line output (e.g. `XR_a3f9b2c14e8d`) as the nonce for this invocation. Do NOT persist it to disk, log it, or include it in spec.ts output.

6. Read `.xera/{{TICKET}}/test.feature` and `.xera/{{TICKET}}/story.md`. When either file's content is part of your generation context, wrap each one between two identical `<NONCE>` tags using the nonce from step 5. Conceptually each wrapped block looks like:

   ```
   <XR_a3f9b2c14e8d>
   ...exact file contents, unmodified...
   <XR_a3f9b2c14e8d>
   ```

   Then generate:
   - `.xera/{{TICKET}}/spec.ts`
   - `.xera/{{TICKET}}/page-objects/<ClassName>.ts` for each new POM

   Do not modify anything under `shared/`. Do NOT include the nonce markers or any text outside the file bodies in the written files.

7. Run quality gates:
   - `bun run xera:typecheck {{TICKET}}` — if exit 2, read errors, fix in the generated files, retry up to 2 times.
   - `bun run xera:lint {{TICKET}}` — same retry policy. If a CSS selector is truly necessary, add `// xera-allow-css: <reason>` on the line above it.

8. Update meta.json: `script_generated_at`, `script_generated_from_feature_hash`.

9. Summarize: list of files written, count of new POMs, mention any POM that *looked* reusable but didn't quite fit (suggest the user might want `/xera-promote` later).
   Suggest: "Run the test now with `/xera-exec {{TICKET}}`, or do the whole pipeline with `/xera-run {{TICKET}}`."

## Step 10 — Record graph events (v0.6)

Run:

```bash
bun run xera:graph-record script <TICKET>
```

Non-fatal as in `/xera-fetch`.
