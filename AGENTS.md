# AGENTS.md

Instructions for AI coding agents (Claude Code, Codex, Cursor, etc.) working in this repository.

## Project at a glance

xera is an **AI-native test framework** that lets QA engineers generate, run, and diagnose Playwright/HTTP tests by invoking Claude Code skills against Jira tickets. The end-user surface is two CLI commands (`xera init`, `xera doctor`) plus nine Claude Code skills (`/xera-run`, `/xera-fetch`, `/xera-feature`, `/xera-script`, `/xera-exec`, `/xera-report`, `/xera-impact`, `/xera-promote`, `/xera-eval`). Everything else is internal plumbing invoked by skills via `bun run xera:*` scripts (26 `xera-internal` subcommands).

Since v0.6, xera maintains a **project knowledge graph** — an event-sourced, repo-local data layer that records every fetch / script / exec / report / promote, derives a snapshot, and powers TEST_OUTDATED classification, `/xera-impact` analysis, an HTML viewer, and dispute capture. Graph events are sharded one-file-per-skill-invocation so concurrent QA causes no git merge conflicts.

**Tech**: Bun ≥1.1, TypeScript 6.0 strict, Playwright 1.60, zod 4, biome 2, vitest-compatible `bun:test`. ESM-only. Vendored `vis-network` (Apache-2.0) for the HTML viewer.

**Authoritative docs**:
- Core design spec: `docs/superpowers/specs/2026-05-14-xera-core-web-design.md`
- v0.6 knowledge graph spec: `docs/superpowers/specs/2026-05-16-xera-v06-project-knowledge-graph-design.md`
- v0.7 HTTP adapter spec: `docs/superpowers/specs/2026-05-16-xera-v07-http-adapter-design.md`
- All implementation plans: `docs/superpowers/plans/`
- Architecture overview: `docs/ARCHITECTURE.md`
- Configuration reference: `docs/CONFIGURATION.md`

When in doubt about *why* something is shaped a certain way, the design spec is canonical.

## Workspace layout

```
packages/
  core/         # @xera-ai/core — config, paths, hashing, lock, log, Jira client,
                # 8-bucket classifier, auth state, graph/ module (v0.6+),
                # xera-internal binary (26 subcommands)
  cli/          # @xera-ai/cli — public CLI: init (--shape web|api|mixed) + doctor only
                # templates/ includes xera-graph.yml (CI viewer scaffold)
  web/          # @xera-ai/web — Playwright adapter
                # (executor with --grep, trace normalizer, secret scrubber, generator)
  http/         # @xera-ai/http — HTTP API adapter (v0.7+)
                # (executor, auth strategies, OpenAPI loader, CONTRACT_DRIFT detection)
  skills/       # @xera-ai/skills — 9 Claude Code skill .md files
  prompts/      # @xera-ai/prompts — 9 versioned LLM prompt templates
fixtures/
  sample-app/   # Next.js app for integration tests
  mock-jira/    # Bun.serve mock for offline Jira
  golden-tickets/ # Classifier-test fixtures (v0.1)
  golden-eval/  # /xera-eval rubric fixtures (v0.2 + EVAL-007/008/009)
  golden-graph/ # snapshot/dedup/corrupt + TEST_OUTDATED scenarios (v0.6)
  golden-impact/ # impact-prepare BFS scenarios (depth-1/2/empty) (v0.6)
docs/
.github/workflows/  # ci.yml (incl. graph-viewer job), nightly-e2e.yml, publish.yml
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

The six packages reference each other with **explicit caret semver** (`"@xera-ai/core": "^0.8.0"`), **not** `workspace:*`. This was a deliberate fix after `bun publish`'s `workspace:*` substitution lagged by one lockfile version on first launch. Keep using explicit semver until Bun fixes that.

**All six packages share one version** — `cli`, `core`, `web`, `http`, `prompts`, `skills` move in lockstep via the `fixed` group in `.changeset/config.json`. A patch/minor/major bump declared in any single changeset propagates to all six. "Xera v0.8.1" = every package at `0.8.1`. This trades some npm churn (packages without code changes still get a new published version) for a single unambiguous marketing version.

**Versions are bumped by [changesets](https://github.com/changesets/changesets), not by hand.** Two things take care of changesets automatically; you only intervene if neither fires.

1. **Auto-changeset workflow** (`.github/workflows/auto-changeset.yml`) — on every PR open / push / title edit, parses the PR title as a conventional commit (`feat:`, `fix:`, `feat!:`, etc.), detects which `packages/<pkg>/` directories changed, and commits `.changeset/auto-pr-<N>.md` back to the PR branch. `docs|chore|test|refactor|style|build|ci` titles are intentionally skipped (no release needed). Manual changesets — any `.changeset/*.md` that isn't `auto-pr-<N>.md` — take precedence and short-circuit auto-generation.

2. **changeset-bot** (GitHub App, [github.com/apps/changeset-bot](https://github.com/apps/changeset-bot)) — comments on every PR with the impact summary and a "Click here to add a changeset" link if both auto-generation and manual creation failed. It's wired into branch protection as a required check, so PRs missing a changeset cannot merge.

Manual override, if you ever need it:

```bash
bunx changeset            # interactive: pick packages + bump type
git add .changeset/*.md
```

Once any changeset (auto or manual) is on `main`, `release.yml` opens a "Version Packages" PR that applies the bumps and regenerates `CHANGELOG.md`. Merging that PR triggers the publish step (`bun run release`) which builds and publishes any package whose version isn't already on npm. `updateInternalDependencies: patch` in `.changeset/config.json` means a `web` bump cascades into a `cli` patch bump automatically.

Do not hand-bump `version` fields or push `v*` tags — changesets owns the bump path. The legacy `publish.yml` workflow is kept as a manual fallback (workflow_dispatch only).

`bun` exports condition in each package's `package.json` points at `./src/index.ts` for monorepo dev, `./dist/index.js` for published consumers. This is why tests work without a pre-build step.

## Adapter pattern

The `TestAdapter` interface in `packages/core/src/adapter/types.ts` is the extension point. v0.1 shipped `WebAdapter` (`@xera-ai/web`); v0.7 shipped `HttpAdapter` (`@xera-ai/http`). Future adapters (mobile, performance, security) each get their own package + spec + plan and implement `TestAdapter`. The classifier framework, status writer, Jira comment builder, **graph layer**, and skills are adapter-agnostic — a new adapter inherits TEST_OUTDATED, `/xera-impact`, and the HTML viewer for free.

**Do not add adapter implementations into `@xera-ai/core`.** They belong in their own package.

## Project knowledge graph (v0.6+)

Three architectural invariants to internalize:

1. **Skills are the orchestrator, binaries are deterministic.** AI calls for graph features (`extract-areas.md`, `similarity-match.md`, `classify-outdated.md`) happen in the skill `.md` workflow — the skill writes the LLM output to a JSON file (`graph-input.json`, `enrichment-input.json`, `outdated-decisions.json`), then `xera-internal graph-*` reads + validates + emits events. Never make a `xera-internal` subcommand call Claude.

2. **Shard-by-session events.** `appendEvents()` writes ONE file per skill invocation under `.xera/graph/events/<yyyy-mm>/<ULID>-<skill>-<ticket>.jsonl`. Never append into a shared file. This is what makes concurrent QA conflict-free.

3. **Snapshot is gitignored, regenerable.** Events are the source of truth (committed). Snapshot is derived (gitignored, < 1 s rebuild via `xera-internal graph-snapshot`).

When adding any new event type:
- Update `packages/core/src/graph/types.ts` (EventPayloadMap + Event union)
- Update `packages/core/src/graph/schema.ts` Zod discriminated union
- Update `deriveSnapshot()` in `store.ts` if the event materializes into a node/edge
- Add a golden fixture under `fixtures/golden-graph/` if the behavior is observable

## Things to be careful about

- **Public CLI surface**: only `xera init` and `xera doctor`. Adding a public command requires a spec update. Everything else is `xera-internal` (called by skills via `bun run xera:*`).

- **Skill `.md` content** (`packages/skills/`): user-facing instructions for Claude Code sessions. Copy verbatim from the implementation plan; don't paraphrase or condense.

- **Prompt templates** (`packages/prompts/`): independently versioned. A breaking change to prompt format requires a major bump (1.x → 2.x). Skill files reference prompts by path.

- **Secret scrubber** (`packages/web/src/trace-normalizer/scrub-rules.ts`): the regex list and header blacklist are security-sensitive. Adding rules is fine. **Removing or relaxing** a rule requires explicit review and a corresponding adversarial test fixture in `test/trace-normalizer/scrub-adversarial.test.ts`.

- **Auth state encryption** (`packages/core/src/auth/encrypt.ts`): AES-256-GCM with a per-project `XERA_AUTH_KEY`. Do not weaken the algorithm, key length, or auth-tag check.

- **Hash-based drift detection** (`packages/core/src/artifact/{meta,hash}.ts`): skills compare `story_hash` / `feature_hash` / `script_hash` to decide whether to regenerate. Don't bypass these by always regenerating.

- **`.xera/.auth/` is gitignored** and encrypted on disk. The `.xera/.auth/.cache/<role>.json` staging file is plaintext storageState used by Playwright — gitignored as well.

## Commit conventions

`<scope>: <summary>` where scope is the package name (`core`, `web`, `http`, `cli`, `skills`, `prompts`), the workspace area (`fixtures`, `docs`, `ci`), or `chore`/`build` for cross-cutting changes. Examples from history:

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

Normal path: changesets handles it (see [Workspace deps](#workspace-deps) above). Push a PR with a `.changeset/*.md`, merge it, then merge the bot-opened "Version Packages" PR — `release.yml` builds + publishes automatically and creates per-package git tags (`@xera-ai/<pkg>@<version>`).

Verify after a release:
```bash
curl -s https://registry.npmjs.org/@xera-ai/cli/latest | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['version'], d['dependencies'])"
```

### Emergency / manual fallback

If `release.yml` fails mid-publish or you need to re-push a specific package, dispatch `publish.yml` from the Actions tab (`workflow_dispatch`). It runs the same build-then-`bun publish` per package and skips any version already on npm.

## Spec → plan → implement

For any non-trivial change:

1. Discuss the idea (brainstorming).
2. Write a spec under `docs/superpowers/specs/YYYY-MM-DD-<topic>.md`.
3. Write a plan under `docs/superpowers/plans/YYYY-MM-DD-<topic>.md` (or multiple files if large).
4. Implement task-by-task with TDD; each task ends with a commit.

Bug fixes, dep bumps, refactors of code you're already touching, and doc tweaks don't need this flow. Use judgment.

## What's already shipped

| Version | Highlights |
|---|---|
| **v0.1** | Core platform + Web adapter, Jira REST + MCP, encrypted auth state, 4-bucket classifier, deterministic secret scrubber, sample-app + mock-jira fixtures, nightly E2E |
| **v0.2** | AI gen evaluation harness (`/xera-eval`), `golden-eval/` rubric fixtures |
| **v0.3** | Prompt injection defense (boundary tags `<XR_*>` + `injection-follow` refusal label across all prompts) |
| **v0.5** | Self-healing selector drift — `/xera-report` auto-proposes POM heal, applies, re-runs, stages on pass / reverts on fail |
| **v0.6.0** | Graph foundation — event store, snapshot, 4 graph subcommands, cost telemetry, 5 skill emission patches |
| **v0.6.1** | TEST_OUTDATED classifier (5th bucket), lazy similarity enrichment, dispute event capture, Jira sub-task routing |
| **v0.6.2** | `/xera-impact` skill, auto-trigger in `/xera-run`, `RunSchema.autoImpact` config |
| **v0.6.3** | HTML viewer (vendored vis-network), CI artifact + sticky PR comment, consumer scaffold `xera-graph.yml` |
| **v0.6.4** | QA polish — `--grep` per-scenario filter, priority auto-detect from AC keywords, threshold tuning, disputed marker in viewer, `xera doctor --auto-enrich`, `xera-internal disputes` CLI |
| **v0.7** | HTTP API adapter (`@xera-ai/http`) — no-browser executor, pre-auth helpers (`defineHttpAuthSetup`, `presetHttpAuth`), OpenAPI loader; 3 new classifier buckets (`CONTRACT_DRIFT`, `RATE_LIMITED`, `AUTH_EXPIRED`); `xera init --shape web\|api\|mixed`; `script-from-feature-http.md` prompt; `xera:auth-setup` subcommand |
| **v0.8** | Release pipeline overhaul — all six packages unified at one version (`fixed` group in `.changeset/config.json`); `release.yml` (changesets-driven publish) replaces tag-triggered `publish.yml` (kept as manual fallback); `auto-changeset.yml` infers bumps from conventional-commit PR titles; `xera-automation` GitHub App mints installation tokens so bot pushes trigger downstream CI; branch protection on `main` + changeset-bot required-comment; legacy v0.x npm versions unpublished or deprecated, registry starts fresh from 0.8.0 |

Repo at `xera-ai/xera`, public, MIT. 6 packages on npm under `@xera-ai/*` — all currently at the same `fixed`-group version. Starter template at `xera-ai/xera-starter`. ~350 unit tests across `@xera-ai/core` + `@xera-ai/web` + `@xera-ai/http`.

**Not yet shipped** (each is a separate future spec): `/xera-sprint` multi-ticket orchestration, production trace → test backfill, Mobile/Performance/Security adapters, live dashboard.
