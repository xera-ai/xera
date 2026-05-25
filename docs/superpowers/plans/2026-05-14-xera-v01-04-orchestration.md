# xera v0.1 — Plan 04: Orchestration (Prompts + Skills)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Author the 3 versioned prompt templates and the 7 Claude Code skills that, together with `xera-internal`, drive the actual user workflow.

**Architecture:** Prompts and skills are content files (`.md`), not code. The session LLM reads a skill, follows its instructions, calls `npx xera-internal` for deterministic work, performs AI work using prompts as instructions, and writes outputs to `.xera/<TICKET>/`.

**Prereqs:** Plans 01–03 complete. `xera-internal` works end-to-end.

---

> **Status:** ✅ Completed 2026-05-14. All tasks in this plan are implemented and shipped. See [POSTMORTEM.md](POSTMORTEM.md) for bugs that surfaced in the plan code itself and post-launch patches.


## Phase 10 — Prompt templates

### Task 10.1: `feature-from-story.md`

**Files:**
- Create: `packages/prompts/feature-from-story.md`

- [x] **Step 1: Write the prompt**

```markdown
---
id: feature-from-story
version: 1.0.0
inputs:
  - story.md (markdown user story + acceptance criteria)
outputs:
  - test.feature (Gherkin)
---

# Generate a Gherkin feature file from a user story

You will read a user story written in markdown and produce a Gherkin (.feature) file that describes how to test the story end-to-end through the user-facing web app.

## Hard rules

1. **One `Feature:` block per file.** The Feature title must be the ticket key + summary (e.g. `JIRA-123: User login with email and password`). The Feature description must restate the "As a / I want / So that" if present.
2. **Each acceptance criterion becomes at least one `Scenario:`.** If an AC has multiple variants (e.g. "valid password" vs "invalid password"), each variant is its own Scenario.
3. **Use `Background:`** for repeated setup steps (e.g. "Given I am on the login page").
4. **Steps must be user-facing,** not implementation-facing. Bad: "Given the database has a user with email X." Good: "Given a user with email 'alice@example.com' is registered." Authentication setup belongs in xera's auth state, not in the feature.
5. **Use concrete example values** where the story is vague. E.g. for "the user enters an email" use a plausible email like `alice@example.com`. Use `examples` in `Scenario Outline` only when the story explicitly lists multiple inputs.
6. **No tags except** `@skip` (always-skip), `@only` (debug — never commit), `@env:<name>` (run only when `XERA_ENV` matches).
7. **Quote literal text** with double quotes in steps that mention button labels or visible text (e.g. `When I click the "Sign in" button`).
8. **Do not invent acceptance criteria.** If the story is ambiguous, write the most reasonable Scenario you can and add a `# Note:` comment line above the Scenario explaining the assumption.

## Quality bar

- The output must parse as valid Gherkin (the `xera:validate-feature` step will check this).
- Every Scenario must end with at least one assertion (`Then` or `Then ... And`).
- Prefer 3–6 steps per Scenario. If more, split.

## Output

Write only the Gherkin content. No code fences, no preamble, no trailing prose. The first line must be `Feature:` (after optional `# Note:` comments).
```

- [x] **Step 2: Commit**

```bash
git add packages/prompts/feature-from-story.md
git commit -m "prompts: feature-from-story v1.0.0"
```

---

### Task 10.2: `script-from-feature.md`

**Files:**
- Create: `packages/prompts/script-from-feature.md`

- [x] **Step 1: Write the prompt**

```markdown
---
id: script-from-feature
version: 1.0.0
inputs:
  - test.feature
  - story.md
  - shared/page-objects/*.ts (already on disk, scanned by skill)
  - xera.config.ts
outputs:
  - spec.ts
  - page-objects/*.ts (new POMs only)
---

# Generate a Playwright spec.ts from a Gherkin feature

You will read a Gherkin feature file and write the corresponding Playwright TypeScript test file, plus any new Page Object Model classes the spec needs.

## Hard rules

1. **One `spec.ts`** for the whole feature. Use `test.describe(<Feature title>)` containing one `test()` per `Scenario`. Use `test.beforeEach()` for `Background` steps.
2. **Page Object Models** for every distinct page or large UI region the spec interacts with (login, dashboard, etc.). Each POM is its own `.ts` file in either `shared/page-objects/` (reuse) or `page-objects/` next to spec.ts (new).
3. **Reuse before creating.** Before writing a new POM, scan `shared/page-objects/` (the skill will list its contents for you). If a POM with the right class name exists and its public methods cover what you need, import and use it. Do NOT modify shared/ — propose changes to the human instead.
4. **Selector strategy (priority order):**
   1. `getByRole(...)` — most stable, accessibility-friendly
   2. `getByLabel(...)` / `getByText(...)` — visible text
   3. `getByTestId(...)` — when `data-testid` exists
   4. CSS / XPath — last resort. CSS only if accompanied by `// xera-allow-css: <reason>` comment on the previous line. XPath is forbidden.
5. **No auto-generated class names** like `MuiButton-root-xyz`, `tw-2x9a`. Use roles instead.
6. **Assertions must be explicit.** Every Scenario must have at least one `expect(...)` assertion that verifies the `Then` step.
7. **Use `test.use({ storageState })` automatically** if `xera.config.ts.web.auth.strategy === 'storageState'` and the scenario implies an authenticated session. The skill stages the storageState path for you; refer to it as a relative path under `.xera/.auth/.cache/<role>.json`.
8. **Imports:** always `import { test, expect } from '@playwright/test';`. Other imports as needed.
9. **No timeouts shorter than the Playwright default.** Do not pass custom `timeout` options unless the story explicitly mentions a deadline.
10. **No `console.log`** in spec.ts.

## POM contract

For each POM, write a class with:

- Constructor takes `page: Page` and stores `Locator` properties for every element used.
- One method per user action (e.g. `fillEmail`, `submit`, `goto`).
- No assertions inside POMs — assertions belong in the spec.

Example shape:

```ts
import type { Page, Locator } from '@playwright/test';
export class LoginPage {
  readonly page: Page;
  readonly emailInput: Locator;
  readonly passwordInput: Locator;
  readonly submitButton: Locator;
  readonly errorMessage: Locator;
  constructor(page: Page) {
    this.page = page;
    this.emailInput = page.getByLabel('Email');
    this.passwordInput = page.getByLabel('Password');
    this.submitButton = page.getByRole('button', { name: 'Sign in' });
    this.errorMessage = page.getByRole('alert');
  }
  async goto() { await this.page.goto('/login'); }
  async fillEmail(v: string) { await this.emailInput.fill(v); }
  async fillPassword(v: string) { await this.passwordInput.fill(v); }
  async submit() { await this.submitButton.click(); }
}
```

## Quality bar

- `tsc --noEmit` must pass on the generated files.
- `xera:lint` must pass (no `prefer-role-over-css`, `no-auto-classname`, `no-xpath` warnings unless explicitly justified).
- Each new POM must be referenced by spec.ts.

## Output

Write each file separately. Tell the skill the path of each file you produce. The skill writes them; you do not.
```

- [x] **Step 2: Commit**

```bash
git add packages/prompts/script-from-feature.md
git commit -m "prompts: script-from-feature v1.0.0"
```

---

### Task 10.3: `diagnose-failure.md`

**Files:**
- Create: `packages/prompts/diagnose-failure.md`

- [x] **Step 1: Write the prompt**

```markdown
---
id: diagnose-failure
version: 1.0.0
inputs:
  - .xera/<TICKET>/runs/<latest>/normalized.json
  - .xera/<TICKET>/test.feature
  - .xera/<TICKET>/story.md
  - .xera/<TICKET>/spec.ts
  - .xera/<TICKET>/status.json (history)
  - .xera/<TICKET>/meta.json (hashes)
outputs:
  - classifier-input.json (consumed by `xera-internal report`)
---

# Diagnose a failed Playwright run

You will read a normalized run output (already secret-scrubbed) and decide what category each failed scenario belongs to.

## Inputs you must read

1. `normalized.json` — per-scenario pass/fail, plus for failures: errorMessage, networkAtFailure, consoleAtFailure, screenshotPath.
2. `test.feature` — what the test was *supposed* to verify.
3. `story.md` — the business intent behind the test.
4. `spec.ts` — the actual code that ran.
5. `status.json` — previous runs of the same scenario (history field).
6. `meta.json` — hashes. Specifically: did `story_hash` or `feature_hash` change since the previous run? Has `spec.ts` changed?

## Classification taxonomy

Choose exactly one class per scenario:

- **PASS** — the scenario passed.
- **REAL_BUG** — the app behaves differently from the story.
  - Examples: element shown with wrong text; HTTP 500 on a request that should succeed; missing required UI.
- **SELECTOR_DRIFT** — the UI changed but the story did not.
  - Examples: button text changed from "Sign in" to "Login"; element id renamed.
  - Evidence: similar element nearby in DOM; identical scenarios passed in prior runs.
- **FLAKY** — inconsistent failure not caused by test or app changes.
  - Evidence: prior 3+ runs passed; no spec change; failure at a wait/timing step; transient network error.
- **TEST_BUG** — the test code or Gherkin is wrong.
  - Examples: assertion contradicts story; wrong URL; bug in POM.

## Decision algorithm

1. If outcome is PASS → class = PASS.
2. If element NOT in DOM at failure point:
   - Search for similar element nearby (text, role variants).
   - Found similar → SELECTOR_DRIFT.
   - Not found AND story does not require the element → TEST_BUG.
   - Not found AND story requires it → REAL_BUG.
3. If element IN DOM but assertion mismatch:
   - Mismatch matches story intent → REAL_BUG.
   - Mismatch contradicts story (spec asserts wrong thing) → TEST_BUG.
4. If timeout / network error:
   - Prior runs passed, no spec change → FLAKY.
   - Network 5xx from app endpoint → REAL_BUG.
5. If `spec.ts` changed recently AND failure mode is novel → TEST_BUG.

## Confidence

- **high** — clear evidence in normalized.json + history.
- **medium** — heuristic match but one piece of evidence missing.
- **low** — first run AND ambiguous evidence; classify conservatively (TEST_BUG or SELECTOR_DRIFT) but mark low.

## Rationale

Each scenario must include a 1–3 sentence `rationale` written in English explaining why you chose the class. Reference concrete evidence (URL, status code, element name, prior run timestamp).

## Output format

Write `classifier-input.json` with this shape:

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

The skill will pass this file to `npx xera-internal report -- --input=<path>`.
```

- [x] **Step 2: Commit**

```bash
git add packages/prompts/diagnose-failure.md
git commit -m "prompts: diagnose-failure v1.0.0"
```

---

## Phase 11 — Claude Code Skills

Each skill is a `.md` file with frontmatter and instructions for the session LLM. The skill is the **only** primary user interface — every other CLI command in this plan is invoked transitively from a skill.

### Task 11.1: `xera-fetch.md`

**Files:**
- Create: `packages/skills/xera-fetch.md`

- [x] **Step 1: Write the skill**

```markdown
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

3. Run: `npx xera-internal fetch {{TICKET}}`
   - Exit 0 → continue.
   - Exit 1 → user/config error. Read stderr, show the user the fix instructions, STOP.
   - Exit 4 → infra error. Show error, STOP.

4. Read `.xera/{{TICKET}}/story.md` and `.xera/{{TICKET}}/meta.json`. Summarize to the user:
   - Ticket key, summary
   - First 200 chars of story
   - Whether AC was found in a separate field

5. Suggest next step: "Generate Gherkin? Run `/xera-feature {{TICKET}}` or run the full pipeline with `/xera-run {{TICKET}}`."
```

- [x] **Step 2: Commit**

```bash
git add packages/skills/xera-fetch.md
git commit -m "skills: xera-fetch"
```

---

### Task 11.2: `xera-feature.md`

**Files:**
- Create: `packages/skills/xera-feature.md`

- [x] **Step 1: Write the skill**

```markdown
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

3. Read the prompt template from `node_modules/@xera-ai/prompts/feature-from-story.md`. Follow its hard rules.

4. Read `.xera/{{TICKET}}/story.md` and write `.xera/{{TICKET}}/test.feature` following the prompt. Do NOT include any text outside the Gherkin file body.

5. Run: `npx xera-internal validate-feature {{TICKET}}`
   - Exit 0 → success.
   - Exit 2 → parse error. Read the line/message, rewrite test.feature to fix it, re-run. Try at most 2 retries. If still failing, show the user the parser output and stop.

6. Update `.xera/{{TICKET}}/meta.json`:
   - `feature_generated_at` = now (ISO)
   - `feature_generated_from_story_hash` = the current `story_hash`
   - `feature_hash` = sha256 of the file contents (the skill will compute by reading the file and using the same hashing scheme as `xera-internal`; just record `feature_generated_at` and let `xera:fetch`-style helpers re-hash as needed).

7. Summarize to the user: number of scenarios, list of scenario names. Suggest: "Generate Playwright spec? `/xera-script {{TICKET}}`."
```

- [x] **Step 2: Commit**

```bash
git add packages/skills/xera-feature.md
git commit -m "skills: xera-feature"
```

---

### Task 11.3: `xera-script.md`

**Files:**
- Create: `packages/skills/xera-script.md`

- [x] **Step 1: Write the skill**

```markdown
---
name: xera-script
description: Generate the Playwright spec.ts and any new Page Objects for a ticket from its Gherkin feature. Use when QA wants AI to produce test code from the agreed-on Gherkin.
---

The user invoked `/xera-script <TICKET>`. If no key, ask.

1. Verify `.xera/{{TICKET}}/test.feature` exists. Otherwise say "Generate Gherkin first with `/xera-feature {{TICKET}}`." STOP.

2. Read `.xera/{{TICKET}}/meta.json`:
   - If `script_generated_from_feature_hash === feature_hash` AND `.xera/{{TICKET}}/spec.ts` exists, ask "spec.ts is up-to-date. Regenerate? (y/N)". Default no.

3. List existing shared POMs by reading `shared/page-objects/` (every `.ts` file, parse exported class names). Pass this list to yourself as context for reuse decisions.

4. Read `node_modules/@xera-ai/prompts/script-from-feature.md`. Follow its hard rules.

5. Read `.xera/{{TICKET}}/test.feature` and `.xera/{{TICKET}}/story.md`. Generate:
   - `.xera/{{TICKET}}/spec.ts`
   - `.xera/{{TICKET}}/page-objects/<ClassName>.ts` for each new POM
   Do not modify anything under `shared/`.

6. Run quality gates:
   - `npx xera-internal typecheck {{TICKET}}` — if exit 2, read errors, fix in the generated files, retry up to 2 times.
   - `npx xera-internal lint {{TICKET}}` — same retry policy. If a CSS selector is truly necessary, add `// xera-allow-css: <reason>` on the line above it.

7. Update meta.json: `script_generated_at`, `script_generated_from_feature_hash`.

8. Summarize: list of files written, count of new POMs, mention any POM that *looked* reusable but didn't quite fit (suggest the user might want `/xera-promote` later).
   Suggest: "Run the test now with `/xera-exec {{TICKET}}`, or do the whole pipeline with `/xera-run {{TICKET}}`."
```

- [x] **Step 2: Commit**

```bash
git add packages/skills/xera-script.md
git commit -m "skills: xera-script"
```

---

### Task 11.4: `xera-exec.md`

**Files:**
- Create: `packages/skills/xera-exec.md`

- [x] **Step 1: Write the skill**

```markdown
---
name: xera-exec
description: Run the Playwright test for a ticket. Refreshes auth state automatically. Use when QA wants to execute an existing spec without regenerating.
---

The user invoked `/xera-exec <TICKET>`. If no key, ask.

1. Verify `.xera/{{TICKET}}/spec.ts` exists. If not: "Generate the spec first with `/xera-script {{TICKET}}`." STOP.

2. Run: `npx xera-internal exec {{TICKET}}`
   - Exit 0 → all scenarios passed.
   - Exit 1 → user/config error (lock held, missing env var). Show the error verbatim and STOP.
   - Exit 3 → test failure. This is expected; continue.
   - Exit 4 → infra error (Playwright crashed). Show stderr; STOP.

3. Read the latest run directory: `.xera/{{TICKET}}/runs/<latest>/`. Tell the user the runId.

4. Suggest: "Diagnose this run with `/xera-report {{TICKET}}`."
```

- [x] **Step 2: Commit**

```bash
git add packages/skills/xera-exec.md
git commit -m "skills: xera-exec"
```

---

### Task 11.5: `xera-report.md`

**Files:**
- Create: `packages/skills/xera-report.md`

- [x] **Step 1: Write the skill**

```markdown
---
name: xera-report
description: Classify the latest run, draft a Jira comment, and post it. Use after `/xera-exec` when QA wants the diagnosis and Jira update.
---

The user invoked `/xera-report <TICKET>`. If no key, ask.

1. Verify `.xera/{{TICKET}}/runs/` has at least one run directory. If not: "Run the test first with `/xera-exec {{TICKET}}`." STOP.

2. Run: `npx xera-internal normalize {{TICKET}}`
   - Exit 0 → continue.
   - Otherwise show stderr, STOP.

3. Read the latest `.xera/{{TICKET}}/runs/<latest>/normalized.json`. Also read:
   - `.xera/{{TICKET}}/test.feature`
   - `.xera/{{TICKET}}/story.md`
   - `.xera/{{TICKET}}/spec.ts`
   - `.xera/{{TICKET}}/status.json` (may not exist on first run)
   - `.xera/{{TICKET}}/meta.json`

4. Read `node_modules/@xera-ai/prompts/diagnose-failure.md`. Follow its decision algorithm. Produce `classifier-input.json` matching the exact shape described. Save to `.xera/{{TICKET}}/classifier-input.json`.

5. Run: `npx xera-internal report {{TICKET}} -- --input=.xera/{{TICKET}}/classifier-input.json`

6. Read the drafted Jira comment at `.xera/{{TICKET}}/jira-comment.draft.md`. Show it to the user. Ask: "Post to Jira? (Y/n)"

7. If yes:
   - If Atlassian MCP is available, use `addCommentToJiraIssue` with the draft as the body. Capture the comment id.
   - Else: run `npx xera-internal post {{TICKET}}` (will use REST creds from .env).

8. Summarize result and link to the Jira comment (if MCP returned a URL).
```

- [x] **Step 2: Commit**

```bash
git add packages/skills/xera-report.md
git commit -m "skills: xera-report"
```

---

### Task 11.6: `xera-run.md`

**Files:**
- Create: `packages/skills/xera-run.md`

- [x] **Step 1: Write the skill**

```markdown
---
name: xera-run
description: Run the full xera pipeline for a Jira ticket end-to-end — fetch story, generate Gherkin, generate Playwright spec, execute, diagnose, post to Jira. Use when QA wants to test a ticket from scratch.
---

The user invoked `/xera-run <TICKET>`. If no key, ask.

This skill orchestrates the other six skills with quality gates between each step. If any step fails non-recoverably, STOP and surface the cause.

## Step 0 — Health gate

Run: `npx xera doctor --strict {{TICKET}}`
If non-zero exit → STOP. Show the output verbatim. Suggest the user fix env and re-run.

## Step 1 — Fetch

Follow the same instructions as `xera-fetch.md`, but never prompt the user about re-fetching here — just proceed unless story.md already exists and meta.json shows a `story_hash` < 24 hours old (then skip fetch).

If meta is missing or story_hash is older, refresh.

## Step 2 — Feature

Follow `xera-feature.md`. If `feature_generated_from_story_hash !== story_hash`, regenerate. If unchanged AND spec.ts exists, skip feature generation entirely.

## Step 3 — Script

Follow `xera-script.md`. If `script_generated_from_feature_hash !== feature_hash`, regenerate. Else skip.

## Step 4 — Exec

Run `npx xera-internal exec {{TICKET}}`.

## Step 5 — Normalize

Run `npx xera-internal normalize {{TICKET}}`.

## Step 6 — Diagnose + report + post

Follow `xera-report.md` from step 3 onwards. If the user is the SAMPLE-001 ticket (meta.source === "local"), do NOT post to Jira and do NOT prompt about posting — only print the drafted comment.

## Step 7 — Summary

Print a single-paragraph summary covering: overall result, classification, per-scenario counts, link to Jira comment (if posted), and the reproduce command (`npx xera-internal exec {{TICKET}} --replay=<runId>`).
```

- [x] **Step 2: Commit**

```bash
git add packages/skills/xera-run.md
git commit -m "skills: xera-run (orchestrator)"
```

---

### Task 11.7: `xera-promote.md`

**Files:**
- Create: `packages/skills/xera-promote.md`

- [x] **Step 1: Write the skill**

```markdown
---
name: xera-promote
description: Promote a Page Object Model from a single ticket's .xera/<TICKET>/page-objects/ to shared/page-objects/ so other tests can reuse it. Use when QA notices a POM is generally useful.
---

The user invoked `/xera-promote <TICKET> <PomClassName>`.

1. Verify `.xera/<TICKET>/page-objects/<PomClassName>.ts` exists. If not, list available POMs in that directory and ask the user to pick.

2. Check `shared/page-objects/<PomClassName>.ts`:
   - If it does NOT exist → safe to promote.
   - If it exists with identical content → just delete the ticket-local copy and update the import (run `npx xera-internal promote {{TICKET}} {{POM}}` will refuse; manually delete with the user's confirmation).
   - If it exists with different content → STOP. Show a unified diff. Ask the user to reconcile manually.

3. Run: `npx xera-internal promote {{TICKET}} {{POM}}`
   - This moves the file and rewrites the import in `.xera/{{TICKET}}/spec.ts`.

4. Run `npx xera-internal typecheck {{TICKET}}` to confirm nothing broke. If errors, surface them.

5. Suggest the user commit the changes:
   ```
   git add shared/page-objects/{{POM}}.ts .xera/{{TICKET}}/
   git commit -m "tests: promote {{POM}} from {{TICKET}}"
   ```
```

- [x] **Step 2: Commit**

```bash
git add packages/skills/xera-promote.md
git commit -m "skills: xera-promote"
```

---

### Task 11.8: Skills version snapshot

**Files:**
- Modify: `packages/skills/version.json`

- [x] **Step 1: Update version.json**

```json
{
  "skills": "0.1.0",
  "compatible_prompts": "^1.0.0",
  "skill_files": [
    "xera-run.md",
    "xera-fetch.md",
    "xera-feature.md",
    "xera-script.md",
    "xera-exec.md",
    "xera-report.md",
    "xera-promote.md"
  ]
}
```

- [x] **Step 2: Commit**

```bash
git add packages/skills/version.json
git commit -m "skills: lock v0.1.0 manifest"
```

---

## End of Plan 04

At this point the framework has all the user-facing instructions assembled. End-to-end run is possible in principle but not yet verified against a real sample app — that comes in the next plan.

Verify:

```bash
npm run lint
npm run typecheck
npx vitest run
```

Continue with [Plan 05: Fixtures, Tests, Docs, Release](2026-05-14-xera-v01-05-fixtures-and-release.md).
