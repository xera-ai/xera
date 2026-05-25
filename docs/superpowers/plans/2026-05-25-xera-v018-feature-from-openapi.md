# xera v0.18 — Feature-from-OpenAPI (`/xera-feature --from-spec`) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `--from-spec` mode to `/xera-feature` that generates `test.feature` (plus a synthetic `story.md` + `meta.json`) directly from an OpenAPI document, with no fetched Jira/GitHub ticket. From `test.feature` onward the existing `feature → script → exec → report` pipeline is unchanged.

**Architecture:** A new deterministic `xera-internal feature-spec-prepare <KEY> [filters]` subcommand loads the OpenAPI spec (`config.http.spec` or `--spec`), flattens it via a new `extractOperations` function in `@xera-ai/http`, computes a stable `spec_hash`, and writes `spec-input.json` + a synthetic `story.md` + `meta.json` (`source: 'openapi'`). The `/xera-feature` skill gains a top `--from-spec` branch: it runs the prepare command, nonce-wraps `spec-input.json` as untrusted input (v0.3 defense), follows a new `feature-from-openapi.md` prompt to write `test.feature`, validates it, and stamps meta. No LLM runs inside any binary.

**Tech Stack:** Node runtime, TypeScript (`exactOptionalPropertyTypes` + `noUncheckedIndexedAccess` on), `vitest`, `@apidevtools/json-schema-ref-parser` (via existing `loadOpenApi`), `yaml`, markdown prompt templates, `xera-internal` CLI.

**Spec:** `docs/superpowers/specs/2026-05-25-xera-v018-feature-from-openapi-design.md`

**Notable scope decisions discovered during planning:**
- The core `OpenAPIDocument` type (`packages/core/src/classifier/contract-drift.ts:15`) is too narrow for extraction (only `responses`/`requestBody`). `extractOperations` reads the deref'd doc under its own loose local shape instead of widening the shared classifier type.
- `fetch.ts:renderStory` is private and its `acSource` union lacks `'openapi'`. Rather than export + widen it (touching the fetch provenance path), `feature-spec-prepare` carries a small local `renderSyntheticStory`. A test asserts the two emit the same frontmatter keys (documented invariant).
- Feature *generation* is LLM-driven, so CI cannot assert generated `test.feature` content. Tests cover the deterministic `prepare` output + that a committed representative feature validates.

---

## File Structure

### New files

- `packages/http/src/openapi/extract.ts` — `extractOperations(doc, filter)` + `extractInfo(doc)` + the `Extracted*` / `ExtractFilter` types. Pure, deterministic (sorted paths/methods/params/responses). Exported from `packages/http/src/index.ts`.
- `packages/http/test/openapi/extract.test.ts` — unit tests (count, determinism, filters, missing optional fields).
- `packages/core/src/bin-internal/feature-spec-prepare.ts` — `featureSpecPrepareCmd(argv)`. Loads config + spec, applies filters, computes `spec_hash`, writes `spec-input.json` + synthetic `story.md` + `meta.json`. Never throws on missing/unreachable spec (writes `operations:[] + reason`, exit 0). Contains the local `renderSyntheticStory`.
- `packages/core/test/bin-internal/feature-spec-prepare.test.ts` — unit tests (happy path, idempotency, drift, filters, no-spec, unreachable, invalid key, cwd restore).
- `packages/prompts/feature-from-openapi.md` — prompt template v1.0.0 (frontmatter + v0.3 untrusted-input preamble + API-Gherkin hard rules + quality bar + output format).
- `fixtures/golden-tickets-http/API-PETS-001/test.feature` *(or under a small `fixtures/golden-feature-spec/`)* — a committed, hand-written representative feature used by the integration test to exercise `validate-feature` (generation itself is not run in CI).

### Modified files

- `packages/http/src/index.ts` — export `extractOperations`, `extractInfo`, and the `Extracted*` types.
- `packages/core/src/artifact/meta.ts` — `source` enum `['jira','local']` → `['jira','local','github','openapi']` *(add `'github'` too if v0.16 left it unlisted — verify; otherwise just add `'openapi'`)*; add optional `spec_hash: z.string().optional()`.
- `packages/core/src/bin-internal/index.ts` — import + register `'feature-spec-prepare': featureSpecPrepareCmd` in `COMMANDS` (alphabetical slot near `fetch`).
- `packages/core/src/bin-internal/verify-prompts.ts` — add `'feature-from-openapi.md'` to `IN_SCOPE_PROMPTS`.
- `packages/core/test/bin-internal/verify-prompts.test.ts` — extend `seedPrompts` to write a valid `feature-from-openapi.md`; add a 1-line in-scope assertion.
- `packages/core/test/bin-internal/doctor.test.ts` — extend `seedGoodRepo` to write a valid `feature-from-openapi.md` so doctor's verify-prompts pass still holds.
- `packages/prompts/version.json` — `"prompts": "2.6.0"` → `"2.7.0"`; append `"feature-from-openapi.md"` to `templates`.
- `packages/skills/xera-feature.md` — insert the `--from-spec` branch as new step 0 (existing steps preserved verbatim below it). Update `description` to mention the `--from-spec` mode.
- `packages/cli/src/commands/init.ts` — add `if (wantsHttp) pkg.scripts['xera:feature-spec-prepare'] = 'xera-internal feature-spec-prepare';` next to the `xera:openapi-resolve` line (init.ts:382). No caret change: the prompts dep is pinned `^${CLI_VERSION}` (init.ts:389), lockstep.
- `packages/cli/src/commands/init-update.ts` — same script add (prompts dep is `^${CLI_VERSION}` at init-update.ts:143, lockstep — no caret change).
- `CLAUDE.md` — codebase map: prompts count 12 → 13 (add `feature-from-openapi`), bin-internal list (add `feature-spec-prepare` under a v0.18 line), `packages/skills` note that `xera-feature` has a `--from-spec` mode.
- `AGENTS.md` — `/xera-feature` description gains the `--from-spec` mode + flags.
- `docs/CONFIGURATION.md` — `--from-spec` flags table; note it reuses `http.spec`.
- `docs/TROUBLESHOOTING.md` — row: "`/xera-feature --from-spec` produced no scenarios" → check `http.spec` set/reachable + filters.

> **Version note:** Package `version` fields and sibling workspace carets are **changeset-owned** (v0.8+ PR-title-driven flow). Do **not** hand-edit them. Use a `feat:`-titled PR so `auto-changeset.yml` infers the minor bump. The consumer-scaffolded `@xera-ai/prompts` dep is pinned `^${CLI_VERSION}` (lockstep `fixed` group), so no caret edit is needed anywhere.

---

## Task 1: `extractOperations` in `@xera-ai/http` — TDD

**Files:** Create `packages/http/src/openapi/extract.ts`, `packages/http/test/openapi/extract.test.ts`.

- [ ] **Step 1 — failing test.** Write `extract.test.ts`: load `fixtures/mock-api/openapi.yaml` via `loadOpenApi` (relative to repo root; resolve path explicitly), call `extractOperations(doc)`. Assert: expected operation count; two successive calls produce identical `JSON.stringify`; `--tag`/`operationId`/`path` filters narrow correctly; an op without `operationId`/`tags`/`requestBody` is returned with those fields omitted (not `undefined`). Assert `extractInfo(doc)` → `{ title, version }`.
- [ ] **Step 2 — implement.** Write `extract.ts` per spec §2.2: loose local doc shape, sorted iteration (paths asc, methods in `['get','post','put','patch','delete']`, params by `(in,name)`, responses by status). Build objects with conditional assignment (no `undefined`). `requestBodySchema`/`requestBodyExample` from the first `content` media type. `responses[]` = `{ status, description?, schema? }`.
- [ ] **Step 3 — export.** Add exports to `packages/http/src/index.ts`. Run `cd packages/http && npx vitest run && npm run typecheck`.

## Task 2: `feature-spec-prepare` subcommand — TDD

**Files:** Create `packages/core/src/bin-internal/feature-spec-prepare.ts`, `packages/core/test/bin-internal/feature-spec-prepare.test.ts`.

- [ ] **Step 1 — failing test.** Seed a temp repo with `xera.config.ts` (http.spec → a fixture openapi) or inject via the same pattern `fetch.ts` uses; or pass `--spec <abs path to fixtures/mock-api/openapi.yaml>`. Assert: writes `spec-input.json` (with `key`, `source:'openapi'`, `specRef`, `info`, `operations`, `spec_hash`), synthetic `story.md` (frontmatter `acceptanceCriteriaSource: openapi`, `storyHash === spec_hash`), `meta.json` (`adapter:'http'`, `source:'openapi'`, `spec_hash`, `story_hash === spec_hash`). Idempotency: 2nd run prints "current", content stable. Drift: different `--tag` → different `spec_hash`, rewrites. No-spec/unreachable → `operations:[]` + `reason`, exit 0. Invalid key (`foo`) → non-zero via `run()`. `afterEach` restores `process.cwd()`.
- [ ] **Step 2 — implement.** Write `feature-spec-prepare.ts` per spec §2.3–§2.6: arg parse (`<KEY>` + repeatable `--tag/--operation/--path` + `--spec`), `resolveArtifactPaths` (validates key), `loadConfig`, resolve spec source, `import('@xera-ai/http')` → `loadOpenApi` + `extractOperations` (lazy import like `openapi-resolve.ts:49`), `hashString` for `spec_hash`, idempotency check via `readMeta`, write `spec-input.json` + `renderSyntheticStory` + `writeMeta`. Use `XERA_VERSION`/`PROMPTS_VERSION` from `../versions`.
- [ ] **Step 3 — register.** Add to `bin-internal/index.ts` `COMMANDS`. Run `cd packages/core && npx vitest run bin-internal/feature-spec-prepare.test.ts && npm run typecheck`.

## Task 3: `meta.json` schema extension

**Files:** `packages/core/src/artifact/meta.ts` (+ rely on Task 2 tests).

- [ ] Add `'openapi'` (and `'github'` if missing) to the `source` enum; add `spec_hash: z.string().optional()`. Confirm existing meta fixtures still parse: `cd packages/core && npx vitest run artifact`.

## Task 4: `feature-from-openapi.md` prompt (NEW v1.0.0)

**Files:** Create `packages/prompts/feature-from-openapi.md`; modify `packages/prompts/version.json`.

- [ ] Write the prompt per spec §5.2 — copy the v0.3 untrusted-input preamble verbatim from `feature-from-story.md:14-25`, then API-Gherkin hard rules, quality bar, output format. **This is user-facing LLM copy — match the spec's rule list exactly; do not paraphrase.**
- [ ] Bump `version.json` to `2.7.0` and append `"feature-from-openapi.md"` to `templates`.
- [ ] `cd packages/core && npx vitest run bin-internal/verify-prompts.test.ts` (will fail until Task 5 seeds it — sequence Task 5 alongside).

## Task 5: prompt governance (verify-prompts + doctor)

**Files:** `packages/core/src/bin-internal/verify-prompts.ts`, `packages/core/test/bin-internal/verify-prompts.test.ts`, `packages/core/test/bin-internal/doctor.test.ts`.

- [ ] Add `'feature-from-openapi.md'` to `IN_SCOPE_PROMPTS`.
- [ ] Extend `seedPrompts` (verify-prompts test) + `seedGoodRepo` (doctor test) to write a valid `feature-from-openapi.md` (frontmatter + untrusted-input preamble so the preamble check passes). Add a 1-line in-scope assertion.
- [ ] `cd packages/core && npx vitest run bin-internal/verify-prompts.test.ts bin-internal/doctor.test.ts`.

## Task 6: skill + CLI wiring

**Files:** `packages/skills/xera-feature.md`, `packages/cli/src/commands/init.ts`, `packages/cli/src/commands/init-update.ts`.

- [ ] Insert the `--from-spec` branch as step 0 in `xera-feature.md` per spec §5.1; preserve steps 1–8 verbatim below. Update the frontmatter `description` to mention `--from-spec`. **User-facing copy — follow the spec wording.**
- [ ] Add `xera:feature-spec-prepare` script (gated on `wantsHttp`) in `init.ts` (next to line 382) and `init-update.ts`. No caret edit (prompts dep is `^${CLI_VERSION}`, lockstep).
- [ ] `cd packages/cli && npx vitest run && npm run typecheck`.

## Task 7: integration + CLI scaffold tests

**Files:** http integration test (extend existing), `packages/cli/test/` (extend), committed golden feature fixture.

- [ ] Add an integration test: run `feature-spec-prepare API-PETS-001 --spec fixtures/mock-api/openapi.yaml` in a temp dir, assert artifacts, then `validate-feature` against the committed golden `test.feature`.
- [ ] CLI test: `xera init --shape api` scaffolds `xera:feature-spec-prepare`; `--shape web` does not.

## Task 8: docs + changeset

**Files:** `CLAUDE.md`, `AGENTS.md`, `docs/CONFIGURATION.md`, `docs/TROUBLESHOOTING.md`.

- [ ] Update the four docs per the File Structure list. Keep historical specs/plans immutable.
- [ ] Do **not** hand-write a changeset or hand-edit package versions — the `feat:` PR title drives `auto-changeset.yml`.

## Final verification

- [ ] `npm run typecheck` (workspace) — clean.
- [ ] `npm run lint` — clean (vendored `vis-network.min.js` excluded; don't touch).
- [ ] `npx vitest run` (workspace) — green.
- [ ] Manual smoke (optional, outside CI): scaffold `/tmp` api project, run `/xera-feature API-PETS-001 --from-spec`, confirm a valid `test.feature` and that `/xera-script API-PETS-001` consumes it.
- [ ] Confirm the synthetic `story.md` frontmatter keys match `fetch.ts:renderStory` output (invariant test from Task 2).
