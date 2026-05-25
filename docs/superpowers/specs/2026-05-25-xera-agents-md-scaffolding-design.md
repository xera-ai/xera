# xera — `AGENTS.md` Consumer Scaffolding Design

**Status:** Draft for review
**Date:** 2026-05-25
**Author:** thanh@trinity-technology.com
**Scope:** `xera init` (and `xera init --update`) scaffold an `AGENTS.md` at the consumer project root when none exists, giving any AI coding agent (Claude Code, Cursor, OpenAI Codex CLI — all read `AGENTS.md`) a concise map of xera's skills, scripts, and conventions. `xera doctor` reports whether it's present.
**Resolves:** Multi-editor spec (`2026-05-18-xera-multi-editor-support-design.md`) §7 open-question #3 ("Should `xera init` scaffold an `AGENTS.md` stub?") and its §1.5 deferral. This spec answers **yes — scaffold when missing, never clobber.**

**Out of scope (deferred):**
- **Merging / updating an existing `AGENTS.md`.** If the file exists we leave it entirely alone — no marker-section injection, no diff/merge. (A future spec could add an idempotent "xera section" upsert if users ask.)
- **Per-editor `AGENTS.md` variants.** The file is editor-agnostic by design; one template serves all three.
- **`CLAUDE.md` / `.cursorrules` generation.** Out of scope; those are editor-specific and separate.

---

## 1. Goals & Scope

### 1.1 Goal

The multi-editor work (PR for `2026-05-18` spec) scaffolds editor-specific skill/command dirs (`.claude/`, `.cursor/`, `.agents/`) but deliberately did **not** touch `AGENTS.md`, to avoid clobbering a user-curated file. The cost: a fresh `xera init` project gives the agent skill files but no top-level orientation. All three target editors read `AGENTS.md` at the project root as ambient project context, so a small scaffolded stub measurably improves first-run behavior ("what is xera, what can I run here").

Goal: `xera init` writes a concise, shape-aware `AGENTS.md` **iff** one does not already exist. An existing `AGENTS.md` (the user's own, possibly hand-curated) is never overwritten.

### 1.2 In-scope deliverables

1. **`packages/cli/templates/AGENTS.md.tmpl`** — editor-agnostic stub describing xera, the `/xera-*` skills, the `bun run xera:*` scripts, and project conventions. Shape-aware via the existing `render()` `{{#if wantsWeb}}` / `{{#if wantsHttp}}` blocks. Ends with a provenance marker comment.
2. **`xera init`** — after the existing file scaffolds, write `AGENTS.md` guarded by `!existsSync` (same pattern as the `openapi.yaml` placeholder, `init.ts:270-274`). Log "scaffolded AGENTS.md" or "kept existing AGENTS.md".
3. **`xera init --update`** — create `AGENTS.md` if missing; never overwrite. (Additive, consistent with init.)
4. **`xera doctor`** — one informational check: `AGENTS.md present` (ok when the file exists; not-ok with an actionable message when missing). Non-strict, so it never fails `doctor` by itself.
5. **Docs** — `docs/CONFIGURATION.md` (note the scaffolded file under `xera init` outputs), `CLAUDE.md` codebase map (templates line), `AGENTS.md` (this repo's — the `xera init` description).

### 1.3 Why "never clobber" (not merge)

An `AGENTS.md` is frequently hand-authored and carries project-specific instructions that an agent must respect. Silently overwriting or injecting into it on every `xera init`/`--update` would be surprising and potentially destructive. The simplest safe contract is: **own the file only when we create it from scratch.** `existsSync` is the entire gate — if anything is there, we don't touch it. This mirrors how `openapi.yaml` and `.gitignore` (append-only when the `# xera` marker is absent) are already handled.

### 1.4 Success criteria

- `xera init` in an empty dir produces `AGENTS.md` at root; its content lists the core `/xera-*` skills and reflects the chosen shape (web/api/mixed).
- `xera init` in a dir that already has `AGENTS.md` leaves the file byte-identical.
- `xera init --update` creates `AGENTS.md` when missing; leaves an existing one untouched.
- `xera doctor` shows `✓ AGENTS.md present` when present, `✗ AGENTS.md present — run \`xera init\` …` when missing (informational; exit unaffected in non-strict mode).

---

## 2. Template content

`AGENTS.md.tmpl` (rendered with existing `vars`; non-nested `{{#if}}` blocks only — `render()` does not support nested conditionals):

```md
# AGENTS.md

This project uses **xera** for AI-driven QA testing: AI coding-agent skills
generate, run, and diagnose Playwright/HTTP tests from issue-tracker tickets.
This file orients any AI agent (Claude Code, Cursor, OpenAI Codex CLI).

## Skills (how you drive xera)

- `/xera-run <TICKET>` — full pipeline: fetch → feature → script → exec → report
- `/xera-fetch <TICKET>` — pull the ticket into `.xera/<TICKET>/story.md`
- `/xera-feature <TICKET>` — generate the Gherkin `test.feature`
- `/xera-script <TICKET>` — generate the runnable spec
- `/xera-exec <TICKET>` / `/xera-report <TICKET>` — run tests + classify failures
- `/xera-coverage`, `/xera-impact`, `/xera-promote` — coverage, blast-radius, PR promotion

## Scripts (deterministic plumbing the skills call)

You rarely run these directly: `bun run xera:fetch`, `xera:exec`, `xera:report`,
`xera:doctor`, etc. Health check: `bunx @xera-ai/cli doctor`.

## Project conventions

{{#if wantsWeb}}- Web UI tests via Playwright (`@xera-ai/web`).
{{/if}}{{#if wantsHttp}}- HTTP API tests (`@xera-ai/http`), OpenAPI-aware when `http.spec` is set.
{{/if}}- Generated artifacts live under `.xera/<TICKET>/` — do not hand-edit; re-run the skill.
- Configuration is in `xera.config.ts`. Secrets go in `.env` (never commit it).
- Run `bunx @xera-ai/cli doctor` if anything looks misconfigured.

<!-- Scaffolded by `xera init`. Safe to edit — xera will not overwrite this file. -->
```

The marker comment is provenance only; the clobber gate is `existsSync`, not the marker.

---

## 3. CLI changes

### 3.1 `init.ts`

After the GitHub-workflow scaffold (≈`init.ts:267`) and before/with the openapi placeholder, add a guarded write:

```ts
const agentsTarget = join(cwd, 'AGENTS.md');
if (!existsSync(agentsTarget)) {
  scaffoldFile(agentsTarget, 'AGENTS.md.tmpl', vars);
  p.log.success('scaffolded AGENTS.md');
} else {
  p.log.info('kept existing AGENTS.md');
}
```

`vars` already carries `wantsWeb` / `wantsHttp`. No new vars needed.

### 3.2 `init-update.ts`

Add the same guarded write (create-if-missing, never overwrite) alongside the other update-time scaffolds.

### 3.3 `doctor` (`checks.ts`)

Add one env-level check near the editor-integration block (`checks.ts:399-417`):

```ts
checks.push({
  name: 'AGENTS.md present',
  ok: existsSync(join(cwd, 'AGENTS.md')),
  message: existsSync(join(cwd, 'AGENTS.md'))
    ? undefined
    : 'no AGENTS.md — run `xera init` to scaffold one (helps Cursor / Codex / Claude orient)',
});
```

(Built with conditional assignment to respect `exactOptionalPropertyTypes` — don't assign `undefined` to `message`; omit it when present.)

---

## 4. Test plan

- **`packages/cli/test/integration/init-shapes.test.ts`** (or a focused new test):
  - `xera init --shape api` → `AGENTS.md` exists at root and mentions HTTP API; `--shape web` → exists and mentions Web UI.
  - Pre-seed `AGENTS.md` with sentinel content, run `xera init`, assert the file is byte-identical (never clobbered).
- **`init-update`** test: missing → created; existing → untouched.
- **doctor**: `runChecks` includes an `AGENTS.md present` check; ok when the file exists, not-ok when absent. (Unit-level against a temp cwd.)

---

## 5. Versioning & migration

- Patch bump on `@xera-ai/cli` (additive scaffold + one doctor check; no breaking changes). Handled by the `feat:`/`fix:` PR-title → `auto-changeset.yml` flow; no hand-edited version fields.
- No new dependency, no config-schema change, no skill/prompt change.
- Back-compat: re-running `xera init` on an existing project is safe — an existing `AGENTS.md` is preserved.
