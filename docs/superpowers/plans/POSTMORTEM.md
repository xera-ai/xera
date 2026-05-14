# xera v0.1 — Post-Launch Postmortem

**Plan status:** All 74 tasks across `01-foundation.md` → `05-fixtures-and-release.md` are code-complete. Boxes ticked. v0.1.0 shipped on 2026-05-14.

This document captures **where reality diverged from the plan** — bugs the plan code had, gotchas discovered during implementation, and patches landed after the initial release while running real end-to-end tests.

If you're picking up the codebase, read `AGENTS.md` first for the current rules. Use this doc to understand *why* certain shapes exist.

---

## Bugs in the original plan code

These were fixed inline during implementation. The plan was written without execution, so the snippets had small but real defects.

| Where | Symptom | Fix |
|---|---|---|
| Plan 01 / Task 0.2 | `package.json` templates used `"@xera-ai/X": "workspace:*"` | Bun's publish-time `workspace:*` substitution lags lockfile by one version, so consumers of published packages couldn't resolve. Switched to explicit caret semver (e.g. `"^0.1.4"`). |
| Plan 01 / Task 1.2 | Test fixture hard-coded `${process.cwd()}/packages/core/src/config/define.ts` | Breaks when test runs from `packages/core` dir. Changed to `resolve(import.meta.dir, '../../src/config/define.ts')`. |
| Plan 01 / Task 1.7 | File-lock test used `require('node:os')` | Doesn't work in ESM Bun tests. Switched to `import`. |
| Plan 02 / Task 5.1 | `JWT_RE` first segment required `{8,}` but test fixture `eyJhbGciOi` has only 7 chars | Changed quantifier to `{7,}`. Real JWTs have 20+ char first segments, so detection isn't weakened. |
| Plan 03 / Task 8.1 | `bun build` for core was failing on `chromium-bidi` resolution | Added `--external @playwright/test --external @xera-ai/web --external zod` to the build script. |
| Plan 03 / Task 9.2 | Plan's `init.ts` rendered consumer config with literal `undefined` for optional fields | TypeScript's `exactOptionalPropertyTypes: true` rejects this. Fixed throughout: build objects with conditional assignment instead. |

---

## Gotchas not covered by the plan

These weren't bugs per se — the plan just didn't anticipate them.

### 1. Workspace dev requires built `dist/` for downstream packages

Initial plan assumed Bun would resolve workspace imports from `src/` automatically. Reality: package.json `exports` field pointed at `./dist/index.js`, so consumers (including the workspace's own packages depending on each other) needed `dist/` to exist before tests ran.

**Fix (commit `b915156`, `f309777`):** Added a `bun` exports condition:

```json
"exports": {
  ".": {
    "bun": "./src/index.ts",
    "import": "./dist/index.js",
    "types": "./dist/index.d.ts"
  }
}
```

Bun's runtime picks `bun` first → resolves to TS source in monorepo dev. Node consumers pick `import` → resolves to compiled JS. **`src/` must be in `files`** in published `package.json` so the `bun` condition still works for consumers running under Bun.

### 2. `bun publish` substitution of `workspace:*` lags by one version

When you bump a workspace package and `bun publish`, the version that gets substituted into a sibling's `dependencies` is the **lockfile-recorded version**, not the just-updated `package.json` version. So `cli@0.1.3` ended up depending on `core@0.1.2`, which still had the original `workspace:*` poison.

**Fix:** Use explicit caret semver in all cross-workspace deps. Never `workspace:*`. (Captured in `AGENTS.md § Workspace deps`.)

### 3. `bun` exports condition pointing at `src/` requires shipping `src/`

After fix #1, an attempt to drop the `bun` condition broke consumers because the bundled `dist/index.js` had unresolvable transitive workspace imports. Adding `src/` to the published `files` array fixed both paths.

### 4. Claude Code skills vs slash commands are different mechanisms

Plan put skill `.md` files into `.claude/skills/`. Claude Code auto-discovers **slash commands** from `.claude/commands/`, not `.claude/skills/`. The latter is for the Skill tool invoked by name.

**Fix (commit `1d72618`):** Init now copies skill `.md` files to **both** `.claude/skills/` and `.claude/commands/`.

### 5. `@xera-ai/cli` needs `@xera-ai/skills` as a dep

`init.ts` does `require.resolve('@xera-ai/skills/package.json')` to locate the skill files for copying. Plan didn't list `@xera-ai/skills` as a dependency of `@xera-ai/cli`, so installing the CLI standalone via `bunx` failed.

**Fix:** Added the dep + bumped CLI version.

---

## End-to-end test patches (rounds 1–3)

After publishing v0.1.0, first real run against `xera-trinity-test` against Trinity's ESS app surfaced 7 more issues. Each round bumped affected packages and re-published.

### Round 1 — `@xera-ai/cli@0.1.10` + `@xera-ai/skills@0.1.1` + `@xera-ai/core@0.1.6`

Commit: `7f0d15f`

- **`xera-report` skill skipped AI classification.** Session would shell out to `bun run xera:report` without first writing `classifier-input.json`. Rewrote the skill to call out step 4 as "cognitive work YOU must do, not a CLI command" with an explicit "do not skip" guard.
- **`story.md` had duplicate `## Story` heading.** `renderStory` in `bin-internal/fetch.ts` was prepending `## Story\n\n` even when the Jira description already started with that heading. Now detects and avoids the double-heading; same logic for `## Acceptance Criteria`.
- **`xera-internal exec` generated per-ticket `playwright.config.ts`.** Duplicated the root config, was missing `testMatch`/`video`/`screenshot`, forced the AI to patch it on every run. Dropped the per-ticket gen entirely. Now uses the single root config + passes `XERA_BASE_URL` (and `XERA_ENV`) as env vars so the root config can resolve the right baseURL at runtime.

### Round 2 — `@xera-ai/cli@0.1.11` + `@xera-ai/web@0.1.6` + `@xera-ai/core@0.1.7`

Commit: `3045836`

- **`xera:typecheck` failed with TS5057 "Cannot find tsconfig.json".** `typecheckTicket` was invoking `tsc --project <ticketDir>` which required a tsconfig in the ticket dir. Now walks up from the ticket dir to find the nearest tsconfig (project root's) and uses that, filtering errors back to those originating inside the ticket.
- **`bun-types` was in the consumer's tsconfig template but never installed.** Removed `bun-types` from `templates/tsconfig.json.tmpl`.
- **Playwright `--reporter=json` wrote to stdout** so `xera:normalize` couldn't find the report. Now `xera-internal exec` sets `PLAYWRIGHT_JSON_OUTPUT_NAME` to `<runDir>/report.json` via env var.

### Round 3 — `@xera-ai/cli@0.1.12`

Commit: `4e148dd`

- **Generated `spec.ts` uses `process.env.X` but consumer tsconfig didn't include node types** → TS2591 `Cannot find name 'process'`. The AI was scrambling each run with `declare const process` shims. Added `@types/node` to the consumer's `devDependencies` in `init.ts` and added `"node"` to the tsconfig template's `types[]`.

---

## Current published versions (as of 2026-05-14)

```
@xera-ai/core    @ 0.1.7
@xera-ai/web     @ 0.1.6
@xera-ai/cli     @ 0.1.12
@xera-ai/skills  @ 0.1.1
@xera-ai/prompts @ 1.0.0
```

`bunx @xera-ai/cli init` is the canonical entry point for new projects.

---

## What we'd do differently next time

1. **Always execute the plan against a clean machine before declaring it done.** Three of the bugs (bun condition, `.claude/commands/`, `@types/node`) would have surfaced if we'd done a fresh-clone smoke test before publishing 0.1.0.
2. **Distinguish "monorepo dev" from "published consumer" early.** The `exports` shape, file list, and workspace pinning each have different requirements for each context. Treat them as two distinct package configurations from day one.
3. **Plans should include a "first end-to-end run" task explicitly.** Not just unit tests in CI — actually scaffold a fresh project from the template and run the full pipeline against a real (or fixture) Jira ticket + app.
4. **Skills and prompts are user-facing copy.** Treat them like ad copy: don't summarize, don't condense, never paraphrase from the plan during implementation. The original "from the plan" content is the contract.

---

*This document is intentionally append-only. Future rounds of patches go below.*
