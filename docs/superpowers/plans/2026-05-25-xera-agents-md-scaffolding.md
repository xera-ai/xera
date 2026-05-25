# xera — `AGENTS.md` Consumer Scaffolding — Implementation Plan

> **For agentic workers:** Steps use checkbox (`- [ ]`) syntax for tracking. Small, contained change — no sub-agent orchestration needed.

**Goal:** `xera init` / `xera init --update` scaffold an `AGENTS.md` at the consumer project root **iff** none exists (never clobber). `xera doctor` reports presence.

**Spec:** `docs/superpowers/specs/2026-05-25-xera-agents-md-scaffolding-design.md`

**Architecture:** New `packages/cli/templates/AGENTS.md.tmpl` rendered via the existing `scaffoldFile`/`render` helper. Both `init.ts` and `init-update.ts` write it guarded by `!existsSync` (same pattern as the `openapi.yaml` placeholder). `checks.ts` gains one env-level `AGENTS.md present` check shown by `doctor`.

---

## File Structure

### New files
- `packages/cli/templates/AGENTS.md.tmpl` — editor-agnostic stub (skills, scripts, conventions), shape-aware via non-nested `{{#if wantsWeb}}` / `{{#if wantsHttp}}` blocks, ending with a provenance marker comment.

### Modified files
- `packages/cli/src/commands/init.ts` — guarded `scaffoldFile(join(cwd,'AGENTS.md'), 'AGENTS.md.tmpl', vars)` after the workflow scaffold; log scaffolded vs kept-existing.
- `packages/cli/src/commands/init-update.ts` — same guarded write (create-if-missing).
- `packages/cli/src/checks.ts` — add `AGENTS.md present` check near the editor-integration block; build the object with conditional `message` assignment (no `undefined`).
- `packages/cli/test/integration/init-shapes.test.ts` — assertions: AGENTS.md scaffolded per shape + never clobbered when pre-existing.
- `docs/CONFIGURATION.md` — note AGENTS.md under `xera init` outputs.
- `CLAUDE.md` — templates line mentions `AGENTS.md.tmpl`.
- `AGENTS.md` (this repo) — `xera init` description notes it scaffolds a consumer `AGENTS.md`.

---

## Task 1: template
- [ ] Create `packages/cli/templates/AGENTS.md.tmpl` with the content from spec §2. Verify only flat (non-nested) `{{#if}}` blocks are used.

## Task 2: init + init-update scaffolding
- [ ] `init.ts`: add the guarded write after the `xera-graph.yml` scaffold (`init.ts:267`). `existsSync` → either `scaffoldFile(...)` + `p.log.success('scaffolded AGENTS.md')` or `p.log.info('kept existing AGENTS.md')`.
- [ ] `init-update.ts`: add the same create-if-missing write; never overwrite.

## Task 3: doctor check
- [ ] `checks.ts`: push an `AGENTS.md present` check (env-level, near `checks.ts:399`). `ok = existsSync(join(cwd,'AGENTS.md'))`; set `message` only when missing (conditional assignment).

## Task 4: tests
- [ ] Extend `init-shapes.test.ts`: assert `AGENTS.md` exists after `init --shape api` and contains the HTTP API line; after `--shape web` contains the Web UI line.
- [ ] Add a never-clobber test: write `AGENTS.md` with sentinel text in the temp dir before `init`, assert it's byte-identical after. (Note: the spawn-based `runInit` creates a fresh temp dir; for the clobber test, write the sentinel into that dir before spawning — adjust the helper or add a dedicated test that creates the dir, seeds the file, then spawns init in it.)
- [ ] doctor: a unit test (temp cwd) asserting `runChecks` returns an `AGENTS.md present` check, ok when the file exists and not-ok when absent.

## Task 5: docs
- [ ] Update `docs/CONFIGURATION.md`, `CLAUDE.md`, and this repo's `AGENTS.md` per the File Structure list.

## Final verification
- [ ] `cd packages/cli && bun run typecheck && bun run build` (build needed for spawn-based integration tests).
- [ ] `bun test packages/cli` — green (excluding the environmental live-fixture `init-and-run`).
- [ ] `bun run lint` — clean.
- [ ] `feat:`-titled PR so `auto-changeset.yml` infers the `@xera-ai/cli` patch/minor; do not hand-edit versions.
