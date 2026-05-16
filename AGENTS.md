# AGENTS.md

Instructions for AI coding agents (Claude Code, Codex, Cursor, etc.) working in this repository.

## Project at a glance

xera is an **AI-native test framework** that lets QA engineers generate, run, and diagnose Playwright tests by invoking Claude Code skills against Jira tickets. The end-user surface is two CLI commands (`xera init`, `xera doctor`) plus seven Claude Code skills (`/xera-run`, `/xera-fetch`, `/xera-feature`, `/xera-script`, `/xera-exec`, `/xera-report`, `/xera-promote`). Everything else is internal plumbing invoked by skills via `bun run xera:*` scripts.

**Tech**: Bun ≥1.1, TypeScript 5.6 strict, Playwright 1.60, zod, biome, vitest-compatible `bun:test`. ESM-only.

**Authoritative docs**:
- Design spec: `docs/superpowers/specs/2026-05-14-xera-core-web-design.md`
- Implementation plans: `docs/superpowers/plans/`
- Architecture overview: `docs/ARCHITECTURE.md`
- Configuration reference: `docs/CONFIGURATION.md`

When in doubt about *why* something is shaped a certain way, the design spec is canonical.

## Workspace layout

```
packages/
  core/         # @xera-ai/core — config, paths, hashing, lock, log, Jira client, classifier, auth state, xera-internal binary
  cli/          # @xera-ai/cli — public CLI: init + doctor only
  web/          # @xera-ai/web — Playwright adapter (executor, trace normalizer, secret scrubber, generator helpers)
  skills/       # @xera-ai/skills — Claude Code skill .md files
  prompts/      # @xera-ai/prompts — versioned LLM prompt templates
fixtures/
  sample-app/   # Next.js app for integration tests
  mock-jira/    # Bun.serve mock for offline Jira
  golden-tickets/ # Classifier-test fixtures
docs/
.github/workflows/
```

## Running things

```bash
bun install
bun test                      # all packages
cd packages/core && bun test  # one package
bun run typecheck             # tsc --noEmit across workspace
bun run lint                  # biome check
bun run lint:fix              # biome check --write
```

Per-package build (only needed before publishing — tests use `src/` via the `bun` exports condition):

```bash
cd packages/core && bun run build && bunx tsc --emitDeclarationOnly
cd packages/web  && bun run build && bunx tsc --declaration --emitDeclarationOnly --outDir dist
cd packages/cli  && bun run build
```

## Code conventions

**TypeScript is strict.** The root `tsconfig.base.json` enables `strict`, `noUncheckedIndexedAccess`, and `exactOptionalPropertyTypes`. Common pitfalls:

- `exactOptionalPropertyTypes` rejects passing `undefined` to an optional field declared as `foo?: string` (you'd need `foo?: string | undefined` to allow that). **Always use conditional assignment** instead of explicit `undefined`:

  ```ts
  // bad
  return { acceptanceCriteria: maybeAC ?? undefined };
  // good
  const out: Ticket = { ... };
  if (maybeAC) out.acceptanceCriteria = maybeAC;
  return out;
  ```

- `noUncheckedIndexedAccess` means `arr[0]` is `T | undefined`. Use `!` only when invariant is obvious; otherwise narrow with a check.

- ESM only. No `require()` in source code (tests can use `createRequire` if needed).

**Tests use `bun:test`**, not vitest/jest. Pattern:

```ts
import { describe, expect, test, beforeEach, afterEach, mock } from 'bun:test';
```

Tests live at `packages/<pkg>/test/<area>/<name>.test.ts` mirroring `src/`. Use `mkdtempSync` + `rmSync` for tmp dirs. **If a test calls `process.chdir(...)`, restore cwd in `afterEach`** — leaks break unrelated tests (`fixtures/golden-tickets/` resolution depends on cwd).

**Lint rules:**

- biome handles general style/formatting.
- Selector lint (in `@xera-ai/web/generator/selector-rules.ts`) enforces `getByRole > getByLabel > getByTestId > CSS (with `// xera-allow-css: <reason>`) > XPath (forbidden)`. **Do not weaken these rules** to silence a warning — fix the selector.

## Workspace deps

The five packages reference each other with **explicit caret semver** (`"@xera-ai/core": "^0.1.4"`), **not** `workspace:*`. This was a deliberate fix after `bun publish`'s `workspace:*` substitution lagged by one lockfile version on first launch. Keep using explicit semver until Bun fixes that.

When bumping a package version, also bump the caret range in any sibling that depends on it, run `bun install`, then `bun publish`.

`bun` exports condition in each package's `package.json` points at `./src/index.ts` for monorepo dev, `./dist/index.js` for published consumers. This is why tests work without a pre-build step.

## Adapter pattern

The `TestAdapter` interface in `packages/core/src/adapter/types.ts` is the extension point. v0.1 has one adapter (`WebAdapter` in `@xera-ai/web`). Future adapters (mobile, API, performance, security) each get their own package + spec + plan and implement `TestAdapter`. The classifier framework, status writer, Jira comment builder, and skills are adapter-agnostic.

**Do not add adapter implementations into `@xera-ai/core`.** They belong in their own package.

## Things to be careful about

- **Public CLI surface**: only `xera init` and `xera doctor`. Adding a public command requires a spec update. Everything else is `xera-internal` (called by skills via `bun run xera:*`).

- **Skill `.md` content** (`packages/skills/`): user-facing instructions for Claude Code sessions. Copy verbatim from the implementation plan; don't paraphrase or condense.

- **Prompt templates** (`packages/prompts/`): independently versioned. A breaking change to prompt format requires a major bump (1.x → 2.x). Skill files reference prompts by path.

- **Secret scrubber** (`packages/web/src/trace-normalizer/scrub-rules.ts`): the regex list and header blacklist are security-sensitive. Adding rules is fine. **Removing or relaxing** a rule requires explicit review and a corresponding adversarial test fixture in `test/trace-normalizer/scrub-adversarial.test.ts`.

- **Auth state encryption** (`packages/core/src/auth/encrypt.ts`): AES-256-GCM with a per-project `XERA_AUTH_KEY`. Do not weaken the algorithm, key length, or auth-tag check.

- **Hash-based drift detection** (`packages/core/src/artifact/{meta,hash}.ts`): skills compare `story_hash` / `feature_hash` / `script_hash` to decide whether to regenerate. Don't bypass these by always regenerating.

- **`.xera/.auth/` is gitignored** and encrypted on disk. The `.xera/.auth/.cache/<role>.json` staging file is plaintext storageState used by Playwright — gitignored as well.

## Commit conventions

`<scope>: <summary>` where scope is the package name (`core`, `web`, `cli`, `skills`, `prompts`), the workspace area (`fixtures`, `docs`, `ci`), or `chore`/`build` for cross-cutting changes. Examples from history:

```
core: add zod config schema
web: scrub-rules catalog with regex tests
cli: implement xera init with interactive scaffold + skills copy
prompts: feature-from-story v1.0.0
chore: rename to @xera-ai npm scope and xera-ai/xera GitHub repo
build: add bun exports condition so tests resolve workspaces from src
```

Commits should be small and focused. If you're about to do a multi-line summary, that's usually a sign to split.

## Publish flow

```bash
# In dep order
cd packages/web  && rm -rf dist && bun run build && bunx tsc --declaration --emitDeclarationOnly --outDir dist && bun publish --access public
cd packages/core && rm -rf dist && bun run build && bunx tsc --emitDeclarationOnly && bun publish --access public
cd packages/cli  && rm -rf dist && bun run build && bun publish --access public
# Skills + prompts have no build step
cd packages/skills  && bun publish --access public
cd packages/prompts && bun publish --access public
```

**Always `bun publish`, never `npm publish`.** npm doesn't substitute `workspace:*` (we use explicit semver now, but the publish tool still differs in handling other Bun-specific fields).

After publishing, verify:
```bash
curl -s https://registry.npmjs.org/@xera-ai/cli/latest | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['version'], d['dependencies'])"
```

## Spec → plan → implement

For any non-trivial change:

1. Discuss the idea (brainstorming).
2. Write a spec under `docs/superpowers/specs/YYYY-MM-DD-<topic>.md`.
3. Write a plan under `docs/superpowers/plans/YYYY-MM-DD-<topic>.md` (or multiple files if large).
4. Implement task-by-task with TDD; each task ends with a commit.

Bug fixes, dep bumps, refactors of code you're already touching, and doc tweaks don't need this flow. Use judgment.

## What's already shipped (v0.1)

- 5 packages on npm under `@xera-ai/*`
- Repo at `xera-ai/xera`, public, MIT
- Starter template repo at `xera-ai/xera-starter`
- GitHub release: https://github.com/xera-ai/xera/releases/tag/v0.1.0
- 102 unit tests across `@xera-ai/core` + `@xera-ai/web`
- Web adapter, Jira REST + MCP, encrypted auth state, 4-bucket failure classifier, deterministic secret scrubber, Next.js + mock-Jira fixtures, nightly E2E workflow.

What's not yet shipped: CI mode, self-healing auto-fix, AI gen evaluation rubric, Mobile/API/Performance/Security adapters. Each is a separate future spec.
