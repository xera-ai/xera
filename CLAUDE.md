# CLAUDE.md

Instructions for Claude Code working in this repository.

Claude Code follows the agent instructions in [`AGENTS.md`](AGENTS.md) — **read that first**. This file adds Claude Code–specific guidance on top of it: vendored skills, MCP usage, the skills↔prompts boundary, and a fast map of the codebase. Do not re-state AGENTS.md here; treat it as canonical for code conventions, publish flow, and spec → plan → implement.

## What this repo is (read this once)

xera is the **framework that ships Claude Code skills** (`/xera-run`, `/xera-fetch`, `/xera-feature`, `/xera-script`, `/xera-exec`, `/xera-report`, `/xera-promote`) plus the deterministic plumbing those skills call into. The end user is a QA engineer running `bunx xera init` in their own project, then driving Playwright tests from a Claude Code session.

In other words: when you edit this repo you are writing the prompts, skills, and helper binaries that an *end user's* Claude Code session will execute. Treat skill `.md` and prompt `.md` content as user-facing LLM instructions, not as internal docs.

## Codebase map (Claude Code lens)

```
packages/
  core/      @xera-ai/core      config, paths, hashing, lock, log, Jira client,
                                classifier, auth state, xera-internal binary
    src/bin-internal/           subcommands invoked by skills via `bun run xera:*`
                                (fetch, validate-feature, typecheck, lint, exec,
                                 normalize, report, post, status, unlock, promote)
    src/adapter/types.ts        TestAdapter interface — extension point
    src/classifier/             4-bucket failure classifier (adapter-agnostic)
    src/auth/                   AES-256-GCM encryption for storageState
    src/jira/                   REST + MCP backends behind one client
  web/       @xera-ai/web       Playwright adapter
    src/executor/               run Playwright + JSON reporter
    src/generator/              selector rules, lint, pom-scan, gherkin-validate
    src/trace-normalizer/       parse + scrub Playwright traces (security-sensitive)
    src/auth-setup/             defineAuthSetup + role runner
  cli/       @xera-ai/cli       public `xera` CLI: only `init` and `doctor`
    src/commands/               init, init-update, doctor
    templates/                  scaffold templates (xera.config, playwright.config,
                                tsconfig, env.example, auth-setup, sample/)
  skills/    @xera-ai/skills    Claude Code skill .md files (7 user-facing skills)
  prompts/   @xera-ai/prompts   versioned LLM prompt templates
                                (diagnose-failure, feature-from-story, script-from-feature)
fixtures/
  sample-app/                   Next.js login+dashboard target for integration tests
  mock-jira/                    Bun.serve mock Jira (deterministic tickets)
  golden-tickets/               classifier fixtures (cwd-sensitive — see AGENTS.md)
docs/
  ARCHITECTURE.md               condensed overview
  CONFIGURATION.md              user-facing config reference
  TROUBLESHOOTING.md            top-10 issues
  superpowers/specs/            design spec (authoritative)
  superpowers/plans/            implementation plans + POSTMORTEM.md
.claude/
  skills/                       vendored superpowers skills (use via Skill tool)
  commands/                     vendored superpowers commands (brainstorm,
                                write-plan, execute-plan)
.github/workflows/              ci.yml + nightly-e2e.yml
```

## Skills vs prompts boundary

A frequent source of confusion when editing in this repo:

- **Skills** (`packages/skills/*.md`) tell the *session LLM* the **workflow**: which `bun run xera:*` subcommand to call, what to read, what to write, in what order. They are deterministic-looking step lists with frontmatter declaring inputs/outputs.
- **Prompts** (`packages/prompts/*.md`) tell the session LLM **how to generate or diagnose**: rules for Gherkin output, selector strategy, classifier decision tree, etc. They are prompt templates with their own version line.
- A skill that needs AI generation **points at** a prompt template — the session LLM reads the prompt's frontmatter + body and follows it in the *same* session. **The prompt is data the skill points at, not a separate sub-agent.** Do not refactor a skill to "spawn" a prompt as an agent; that's wrong.

Copy text **verbatim** from the implementation plans under `docs/superpowers/plans/`. Don't paraphrase, condense, or add commentary outside frontmatter. Bump `version.json` and the relevant package version when a prompt changes shape.

## Vendored superpowers under `.claude/`

This repo vendors superpowers skills (`brainstorming`, `writing-plans`, `executing-plans`, `test-driven-development`, `systematic-debugging`, `verification-before-completion`, …) into `.claude/skills/` and three slash commands into `.claude/commands/`. They are intended for use **while developing this repo** — invoke them via the `Skill` tool when appropriate. They are not shipped to end users.

Do **not** confuse these with the `/xera-*` end-user skills in `packages/skills/`.

## `/xera-*` skills inside this repo

Most `/xera-*` skills (`/xera-run`, `/xera-fetch`, `/xera-feature`, `/xera-script`, `/xera-exec`, `/xera-report`, `/xera-promote`) expect a consumer project layout: a top-level `xera.config.ts`, a `.xera/<TICKET>/` artifact directory, generated POMs, etc. This monorepo does not have any of that, so running them here will fail or silently no-op.

To exercise them end-to-end, scaffold a throwaway project:

```bash
cd /tmp && rm -rf xera-tryout && mkdir xera-tryout && cd xera-tryout
bunx @xera-ai/cli init --yes
# then open Claude Code in that directory and run /xera-run SAMPLE-001
```

**Exception: `/xera-eval`** is the v0.2 maintainer-only eval harness and IS intended to run inside this repo. It is wired via `.claude/commands/xera-eval.md` (symlink to `packages/skills/xera-eval.md`) and drives `bun run xera:eval-*` against `fixtures/golden-eval/` + `fixtures/golden-tickets/`. See `docs/superpowers/specs/2026-05-14-xera-v02-eval-harness-design.md`.

## MCPs you can lean on (when present)

- **Atlassian MCP** — `mcp__plugin_engineering_atlassian__*` (and on some sessions `mcp__1c5dc37e-...`): useful for poking Jira tickets when iterating on the `xera-fetch` skill. The skill auto-detects MCP via the runtime backend selector in `packages/core/src/jira/`. **Unit tests must not rely on MCP being present** — they stub `fetch` against `mock-jira`.
- **GitHub MCP** — `mcp__github__*`: for reviewing PR diffs and inspecting CI status. Repository scope for this session is restricted to `xera-ai/xera` only. Do not create a PR unless the user explicitly asks for one.

## Quick reference

| Task | Command |
|---|---|
| Run all tests | `bun test` |
| Run one package's tests | `cd packages/<pkg> && bun test` |
| Run one test file | `bun test packages/web/test/trace-normalizer/scrub.test.ts` |
| Type check workspace | `bun run typecheck` |
| Type check one package | `cd packages/<pkg> && bun run typecheck` |
| Lint everything | `bun run lint` |
| Format / autofix | `bun run lint:fix` |
| Try the CLI locally | `cd /tmp && mkdir t && cd t && bunx @xera-ai/cli init --yes` |
| Verify a package on npm | `curl -s https://registry.npmjs.org/@xera-ai/<pkg>/latest \| python3 -m json.tool` |
| Where does `bun run xera:*` map to? | `packages/core/src/bin-internal/index.ts` |

Per-package build steps and the publish order live in [`AGENTS.md § Publish flow`](AGENTS.md#publish-flow). Tests do **not** require a build first — the `bun` exports condition resolves workspace packages from `./src/`.

## Reflexes that bite in this codebase

These show up repeatedly; internalize them before touching code.

- **`exactOptionalPropertyTypes` is on.** Never assign `undefined` to an optional property. Build objects with conditional assignment:
  ```ts
  const out: Ticket = { id, summary };
  if (maybeAC) out.acceptanceCriteria = maybeAC;
  ```
- **`noUncheckedIndexedAccess` is on.** `arr[0]` is `T | undefined`. Narrow it; use `!` only when the invariant is local and obvious.
- **ESM only in source.** Tests may use `createRequire`. Source code may not.
- **`bun:test`, not vitest.** Import from `'bun:test'`. Tests mirror `src/` paths under `packages/<pkg>/test/`.
- **Restore `process.cwd()` in `afterEach`** if a test calls `process.chdir(...)`. `fixtures/golden-tickets/` resolution depends on cwd; leaks cascade.
- **Skill `.md` is user-facing copy.** Match implementation plans word for word. Don't "improve the wording."
- **Workspace deps use explicit caret semver**, not `workspace:*`. Bump the caret in siblings when you bump a package version. See `AGENTS.md § Workspace deps` for why.
- **Don't weaken security-sensitive files.** `packages/web/src/trace-normalizer/scrub-rules.ts` and `packages/core/src/auth/encrypt.ts` require adversarial tests for relaxation. Adding rules is fine; removing is not.
- **Don't bypass hash-based drift detection.** `story_hash` / `feature_hash` / `script_hash` exist so skills can skip work; "always regenerate" defeats the design.

## Commit / PR etiquette (Claude-specific)

- Commit messages follow `<scope>: <summary>` (see `AGENTS.md § Commit conventions`). Keep them small and focused.
- **Never include the model identifier in commits, PR titles/bodies, or code comments.** Keep model identity in chat replies only.
- Only commit when the user explicitly asks. Only push to the branch designated by the session's task instructions (currently `claude/add-claude-documentation-gMM4u`).
- Do not create a PR unless the user explicitly asks for one.
- Don't use destructive git operations (`reset --hard`, `push --force`, branch deletion, `--no-verify`) without explicit user instruction.

## When in doubt

1. Check `AGENTS.md` first for rules.
2. Check `docs/superpowers/specs/2026-05-14-xera-core-web-design.md` for *why* something is shaped a certain way.
3. Check `docs/superpowers/plans/POSTMORTEM.md` for "we already hit this bug, here's the fix."
4. Ask the user before doing anything cross-cutting (adapter changes, prompt-format bumps, publish flow, security-rule relaxation).
