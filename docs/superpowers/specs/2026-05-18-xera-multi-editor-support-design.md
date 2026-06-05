# xera — Multi-Editor Skill/Command Scaffolding Design

**Status:** Draft for review
**Date:** 2026-05-18
**Author:** thanh@trinity-technology.com
**Scope:** `xera init` and `xera init --update` scaffold skills + slash commands for three editors: **Claude Code** (existing, refined in #106), **Cursor** (new), and **OpenAI Codex CLI** (new). `xera doctor` checks the right paths per detected editor. Single source of truth for skill body content remains `@xera-ai/skills`; CLI applies per-editor frontmatter transformation at scaffold time.
**Depends on:** PR #106 (Claude Code scaffolds skills at `.claude/skills/<n>/SKILL.md`).
**Out of scope (deferred):** AGENTS.md scaffolding in consumer projects (separate follow-up), Aider / Windsurf / Zed adapters (add when user demand surfaces), Codex slash-command parity (Codex has no project-level slash mechanism; user invokes the skill implicitly via chat), global / user-level Codex prompts in `~/.codex/prompts` (deprecated by OpenAI; ignore).

---

## 1. Goals & Scope

### 1.1 Goal

Today `xera init` scaffolds skills and commands for **Claude Code only**. A consumer project opened in Cursor or OpenAI Codex CLI gets no integration — the QA engineer can still run `npx xera-internal` scripts manually, but loses the orchestrated workflow (`/xera-run` chaining `/xera-fetch` → `/xera-feature` → `/xera-script` → ...).

The goal: one `xera init` produces a project that works equivalently in any of the three editors a user might open it with. Adding a fourth editor later means adding one adapter file.

### 1.2 Editor capability matrix (what each editor supports)

| Editor | Skill mechanism | Slash command mechanism | Discovery |
|---|---|---|---|
| Claude Code | `.claude/skills/<n>/SKILL.md` (directory + SKILL.md) | `.claude/commands/<n>.md` (flat) | Skill tool reads frontmatter `name` + `description` |
| Cursor (≥ v1.6 commands, ≥ v2.2 rule folders) | `.cursor/rules/<n>/RULE.md` (directory + RULE.md, "Agent mode" when only `description` + `alwaysApply: false`) | `.cursor/commands/<n>.md` (flat) | Rule frontmatter `description` makes it agent-attachable |
| OpenAI Codex CLI | `.agents/skills/<n>/SKILL.md` (directory + SKILL.md, scanned cwd → repo root) | ❌ no project-level slash; user-global `~/.codex/prompts` is deprecated | Frontmatter `name` + `description` (same as Claude) |

Key insight: **Claude and Codex use byte-identical `SKILL.md` files**; only the target path differs. Only Cursor needs frontmatter transformation.

### 1.3 In-scope deliverables

1. **Editor adapter registry** in `@xera-ai/cli`:
   - `packages/cli/src/editors/index.ts` — registry + `EditorAdapter` interface + name → adapter map
   - `packages/cli/src/editors/claude.ts` — Claude Code adapter
   - `packages/cli/src/editors/cursor.ts` — Cursor adapter (with frontmatter transform)
   - `packages/cli/src/editors/codex.ts` — Codex CLI adapter (skill only, no command)
   - `packages/cli/src/editors/detect.ts` — auto-detect helpers
   - `packages/cli/src/editors/frontmatter.ts` — minimal YAML frontmatter parse / serialize

2. **`xera init` editor resolution**:
   - New flag: `--editor <list>` where `<list>` = comma-separated `claude`, `cursor`, `codex`, or `all`. Default in `--yes` non-interactive mode without detection: `all`.
   - Auto-detect: if no `--editor` flag and the project already contains `.claude/`, `.cursor/`, or `.agents/`, scaffold only the detected editor(s).
   - Interactive (no flag, no `--yes`, no detection): multi-select prompt with all three options, `claude` pre-checked for backwards-compat with existing muscle memory.

3. **`xera init --update` editor resolution**:
   - Same `--editor` flag semantics as `init`.
   - Without `--editor`: refresh **only editors already present** (do not surprise-add a new editor). To opt in to a new editor on an existing project: `xera init --update --editor cursor` (additive).

4. **`xera doctor`**:
   - Detect installed editors.
   - For each editor, run that adapter's `doctorChecks`.
   - If no editor integration present: single check `xera editor integration present: false` with message `run xera init`.
   - Legacy flat-layout detection (the check from PR #106 for Claude) generalizes per-editor.

5. **Frontmatter transformer** (Cursor only, since Claude + Codex share Claude's format):
   - Input: `name: <n>` + `description: <desc>` (+ any other fields, preserved-or-dropped explicitly).
   - Cursor output: `description: <desc>` + `alwaysApply: false`. `name:` dropped (Cursor uses filename).
   - `globs:` deliberately NOT set — skills must be agent-chosen, not auto-attached on file pattern.

6. **`@xera-ai/skills` package: unchanged.** Single source of truth stays in Claude-format SKILL.md files. Transformation happens at CLI scaffold time, not at package build time.

### 1.4 Documentation updates (part of this PR)

Every doc that today says "Driven entirely by Claude Code skills" or implies Claude-only integration must be updated to reflect multi-editor support. Specifically:

- `README.md` — top-of-file tagline ("Driven entirely by Claude Code skills" → "Driven by AI coding-agent skills (Claude Code, Cursor, OpenAI Codex CLI)"), Prereqs line (Claude Code → "Claude Code / Cursor / OpenAI Codex CLI"), Quick-start "Then open Claude Code" → editor-agnostic instruction with per-editor sub-bullet.
- `CLAUDE.md` — "Skills vs prompts boundary" section + Codebase map's `packages/skills/` line: note that scaffolding now writes per-editor formats; update the example `npx @xera-ai/cli init` snippet if it implies Claude-only.
- `AGENTS.md` — `xera init` description should mention `--editor` flag and the per-editor outputs.
- `docs/PROJECT_CONTEXT.md` — anywhere it lists the editor target.
- `docs/ARCHITECTURE.md` — the Skills/Commands surface description.
- `docs/CONFIGURATION.md` — `xera init` flags table gains `--editor <list>` row.
- `docs/TROUBLESHOOTING.md` — add a row for "Skill not discovered in Cursor / Codex" pointing at `xera init --update --editor <name>` and at the legacy-flat-layout check.

Historical specs and plans under `docs/superpowers/specs/` and `docs/superpowers/plans/` are **not** updated (snapshots in time; immutable per repo convention).

### 1.5 Out-of-scope (deferred)

- **AGENTS.md scaffolding in consumer projects.** All three editors read `AGENTS.md` at project root, but we don't want to clobber an existing one. Decision deferred to a follow-up spec; this one only handles the editor-specific dirs (`.claude/`, `.cursor/`, `.agents/`).
- **Aider, Windsurf, Zed, etc.** Add an adapter when a user asks. The registry pattern keeps the cost ~1 file each.
- **Codex slash command parity.** Codex has no `.codex/commands/` or equivalent project-level mechanism. Custom prompts in `~/.codex/prompts/*.md` are user-global (not shareable via repo) and deprecated. We document this and rely on Codex's skill-implicit-invoke ("run xera for TICKET-123" → Codex agent finds the `xera-run` skill).
- **Cursor cross-rule discovery validation.** When `/xera-run` (Cursor command) body says "Follow xera-fetch.md", we assume Cursor's agent will discover and attach the `.cursor/rules/xera-fetch/` rule via its `description`. If field-testing shows this fails, fallback (deferred): prepend explicit `Referenced rules: @xera-fetch @xera-feature @xera-script @xera-exec @xera-report @xera-promote` to the Cursor command body.

---

## 2. Architecture

### 2.1 Editor adapter interface

`packages/cli/src/editors/index.ts`:

```ts
import type { ParsedFrontmatter } from './frontmatter';

export type EditorName = 'claude' | 'cursor' | 'codex';

export interface SkillInput {
  /** Slug like 'xera-run', no .md suffix */
  base: string;
  /** Body text AFTER frontmatter — bytes from @xera-ai/skills */
  body: string;
  /** Parsed frontmatter from the source .md file */
  frontmatter: ParsedFrontmatter;
}

export interface Check {
  name: string;
  ok: boolean;
  message?: string;
}

export interface EditorAdapter {
  name: EditorName;
  /** Does this editor's marker (dir/file) exist in cwd? */
  detect(cwd: string): boolean;
  /** Write the skill into this editor's required path(s) */
  scaffoldSkill(cwd: string, input: SkillInput): void;
  /** Write the slash command (optional — Codex has none) */
  scaffoldCommand?(cwd: string, input: SkillInput): void;
  /**
   * Migrate a legacy flat layout for this skill into the current required
   * layout (currently only Claude has the flat → directory legacy).
   * Return true if a migration happened (so the caller can log it).
   */
  legacyMigrate?(cwd: string, base: string): boolean;
  /** Doctor checks for this editor */
  doctorChecks(cwd: string, requiredSkills: string[]): Check[];
}

export const editors: Record<EditorName, EditorAdapter> = {
  claude: claudeAdapter,
  cursor: cursorAdapter,
  codex: codexAdapter,
};

export const ALL_EDITORS: EditorName[] = ['claude', 'cursor', 'codex'];
```

### 2.2 Detection

`packages/cli/src/editors/detect.ts`:

```ts
import { existsSync } from 'node:fs';
import { join } from 'node:path';

export function detectEditors(cwd: string): EditorName[] {
  const found: EditorName[] = [];
  if (existsSync(join(cwd, '.claude'))) found.push('claude');
  if (existsSync(join(cwd, '.cursor'))) found.push('cursor');
  if (existsSync(join(cwd, '.agents'))) found.push('codex');
  return found;
}
```

### 2.3 Frontmatter helper

`packages/cli/src/editors/frontmatter.ts`:

A minimal hand-rolled YAML parser/serializer for the frontmatter we actually produce (`name:`, `description:`, `alwaysApply:`, `globs:`). Avoids pulling in a full YAML dependency for what's effectively 2-4 string lines.

```ts
export interface ParsedFrontmatter {
  raw: string;                   // original frontmatter text (between --- and ---)
  fields: Record<string, string | boolean | string[]>;
}

export function parseFrontmatter(md: string): {
  frontmatter: ParsedFrontmatter;
  body: string;
};

export function serializeFrontmatter(
  fields: Record<string, string | boolean | string[]>,
): string;
```

`serializeFrontmatter` writes each field on its own line, no nested objects (we don't have any). Quotes string values containing `:` or `#`. Strings without those characters go unquoted to match common Cursor/Claude style.

### 2.4 Claude adapter

`packages/cli/src/editors/claude.ts`:

- `detect`: `existsSync(join(cwd, '.claude'))`
- `scaffoldSkill`: write `.claude/skills/<base>/SKILL.md` — frontmatter from source, body verbatim
- ~~`scaffoldCommand`: write `.claude/commands/<base>.md`~~ **Retired in #231.** Current Claude Code resolves `/<name>` through the Skill tool from `.claude/skills/`, so the dual write was redundant and a drift hazard. Adapter no longer defines `scaffoldCommand`.
- `legacyMigrate`: if `.claude/skills/<base>.md` exists and `.claude/skills/<base>/SKILL.md` doesn't, move content + delete legacy. (Same logic as PR #106, just extracted into the adapter.)
- `legacyCleanup` (#231): if `.claude/commands/<base>.md` exists (left over from older `xera init` runs), delete it. Called once per skill from both `xera init` and `xera init --update` so an upgrade lands in the current single-source layout without manual cleanup.
- `doctorChecks`: per-skill, check `.claude/skills/<base>/SKILL.md` exists; flag legacy flat layout with `xera init --update --editor claude` hint.

### 2.5 Cursor adapter

`packages/cli/src/editors/cursor.ts`:

- `detect`: `existsSync(join(cwd, '.cursor'))`
- `scaffoldSkill`: write `.cursor/rules/<base>/RULE.md` with **rule frontmatter**:
  - `description:` (taken from source verbatim — Cursor's "Agent" rule mode requires it)
  - `alwaysApply: false` (forces Agent mode rather than always-injected context)
  - Drop `name` (Cursor uses the parent directory name)
  - Drop any other Claude-specific fields
  - Body verbatim.
- `scaffoldCommand`: write `.cursor/commands/<base>.md` with **command frontmatter**:
  - `description:` (taken from source verbatim — becomes the label in Cursor's `/` slash menu)
  - **Do NOT include** `alwaysApply` (that field is a rule concept; commands are explicit-invoke templates)
  - Drop `name` and any other Claude-specific fields
  - Body verbatim.
- `legacyMigrate`: none (Cursor support is new; no legacy layout exists).
- `doctorChecks`: per-skill, check `.cursor/rules/<base>/RULE.md` and `.cursor/commands/<base>.md` exist.

### 2.6 Codex adapter

`packages/cli/src/editors/codex.ts`:

- `detect`: `existsSync(join(cwd, '.agents'))`
- `scaffoldSkill`: write `.agents/skills/<base>/SKILL.md` — frontmatter from source verbatim (same format as Claude), body verbatim.
- `scaffoldCommand`: **not implemented** (Codex has no project-level slash).
- `legacyMigrate`: none.
- `doctorChecks`: per-skill, check `.agents/skills/<base>/SKILL.md` exists.

### 2.7 Editor resolution

Shared helper used by both `init` and `init-update`:

```ts
export function resolveEditors(opts: {
  flag: string | undefined;     // --editor value if any
  cwd: string;
  isUpdate: boolean;            // init --update mode
  isYes: boolean;               // --yes non-interactive
  prompt?: () => Promise<EditorName[]>;  // interactive multi-select
}): Promise<EditorName[]>;
```

Rules:

1. If `flag` is set: parse comma-separated names or `all`. Validate each is in `ALL_EDITORS`. Return.
2. Auto-detect via `detectEditors(cwd)`.
3. If `isUpdate`: return detected editors (refresh only what's already there). If detected is empty, return `[]` and warn the user that the project has no editor integration; suggest `--editor`.
4. If not `isUpdate` and detected non-empty: return detected (treat existing dirs as user's choice).
5. If not `isUpdate`, detected empty, `!isYes`: call `prompt()` → multi-select with `claude` pre-checked.
6. If not `isUpdate`, detected empty, `isYes`: return `ALL_EDITORS` (default `all`).

### 2.8 Init flow

`packages/cli/src/commands/init.ts` (replacing the current skills-copy block):

```ts
const targets = await resolveEditors({ flag: opts.editor, cwd, isUpdate: false, isYes: opts.yes, prompt: askEditors });
const skills = readSkillsPackage();  // returns { base, body, frontmatter }[]
for (const skill of skills) {
  for (const name of targets) {
    const adapter = editors[name];
    adapter.scaffoldSkill(cwd, skill);
    adapter.scaffoldCommand?.(cwd, skill);
  }
}
```

`readSkillsPackage()` does what `init.ts` does today: `readdirSync` on the resolved `@xera-ai/skills` directory, filter out `package.json`/`version.json`/`CHANGELOG.md`, parse each `.md`'s frontmatter.

### 2.9 Init-update flow

`packages/cli/src/commands/init-update.ts`:

For each skill × each resolved editor:

1. Call `adapter.legacyMigrate?.(cwd, base)`; log `migrated <base> to <new path>` if true.
2. Compute target paths (skill path + command path if applicable).
3. 3-way diff per path: missing / same / diff. Single prompt per skill covering all target paths within that editor; if multiple editors are being updated, prompt independently per editor (since the actual on-disk contents may differ).
4. If `overwrite`: write to all target paths.

### 2.10 Doctor flow

`packages/cli/src/checks.ts`:

```ts
const detected = detectEditors(cwd);
if (detected.length === 0) {
  checks.push({ name: 'xera editor integration present', ok: false, message: 'run xera init' });
} else {
  for (const name of detected) {
    checks.push(...editors[name].doctorChecks(cwd, REQUIRED_SKILLS));
  }
}
```

Check names follow the pattern `xera skills present (<editor>)` so multi-editor projects don't have name collisions.

---

## 3. Frontmatter mapping rules

Source (from `@xera-ai/skills/xera-run.md`):

```yaml
---
name: xera-run
description: Run the full xera pipeline for a Jira ticket end-to-end...
---
```

| Target file | Frontmatter written | Body |
|---|---|---|
| `.claude/skills/xera-run/SKILL.md` | source verbatim (`name:` + `description:`) | verbatim |
| ~~`.claude/commands/xera-run.md`~~ | retired in #231 — slash commands now resolved via Skill tool from `.claude/skills/` | n/a |
| `.cursor/rules/xera-run/RULE.md` | `description:` + `alwaysApply: false` (drop `name:`) | verbatim |
| `.cursor/commands/xera-run.md` | `description:` only (drop `name:` and any other Claude fields; no `alwaysApply`) | verbatim |
| `.agents/skills/xera-run/SKILL.md` | source verbatim (`name:` + `description:`) | verbatim |

Multi-line `description` values are preserved as a YAML block scalar (`description: |`) when the source uses one. The body of the file (everything after the closing `---`) is copied byte-for-byte across all targets.

---

## 4. CLI surface changes

### 4.1 New flag

```
--editor <list>    Editor(s) to scaffold for. Comma-separated names or "all".
                   Valid names: claude, cursor, codex.
                   Default: auto-detect from existing .claude/, .cursor/, .agents/.
                   With --yes and no detection: "all".
```

### 4.2 Updated help text

`xera init --help` and `xera init --update --help` both list `--editor` under the shared flag block.

### 4.3 Interactive prompt copy

When `xera init` (no `--yes`, no `--editor`, no detected dirs) reaches the editor question, render:

```
Which editor(s) should xera scaffold integration for?
  [x] Claude Code      (.claude/skills/)
  [ ] Cursor           (.cursor/rules/, .cursor/commands/)
  [ ] OpenAI Codex CLI (.agents/skills/)
(Multi-select; default: Claude Code. You can add more later with `xera init --update --editor <n>`.)
```

### 4.4 Init "Next steps" message

Per-editor lines added when the relevant editor was scaffolded. Existing Claude line stays; Cursor and Codex lines appended only when those editors are in the resolved set. Example for `--editor all`:

```
Next:
  ...
  3) Start testing:
       Claude Code:       /xera-run <TICKET>
       Cursor:            /xera-run <TICKET>  (slash menu)
       OpenAI Codex CLI:  type "run xera for <TICKET>" — Codex picks up the xera-run skill
```

---

## 5. Migration & backward compatibility

- **Existing Claude-only projects**: behavior unchanged on `xera init --update` (without `--editor`). Adapter resolution sees `.claude/` only → refreshes Claude only.
- **New Cursor or Codex user on an existing Claude project**: run `xera init --update --editor cursor` (or `codex`). The adapter for the new editor scaffolds its files; the Claude adapter still refreshes Claude side. To add both: `--editor claude,cursor,codex` or `--editor all`.
- **Doctor on multi-editor project**: emits one set of skill-present checks per detected editor, all under distinct names. No false negatives if a project has both `.claude/` and `.cursor/`.
- **Removing an editor**: not auto-handled (non-destructive guarantee). User manually deletes `.cursor/` etc. if they want to drop integration.

---

## 6. Testing strategy

Per editor adapter, unit tests under `packages/cli/test/editors/`:

- `claude.test.ts` — scaffold writes `.claude/skills/<n>/SKILL.md` with correct frontmatter; `scaffoldCommand` is undefined (retired in #231); `legacyMigrate` moves flat file to dir + SKILL.md; `legacyCleanup` removes any leftover `.claude/commands/<n>.md`.
- `cursor.test.ts` — scaffold writes `.cursor/rules/<n>/RULE.md` + `.cursor/commands/<n>.md` with **transformed** frontmatter (`name` dropped, `alwaysApply: false` added); body preserved byte-for-byte.
- `codex.test.ts` — scaffold writes `.agents/skills/<n>/SKILL.md` with source frontmatter intact; no command file produced.
- `detect.test.ts` — every combination of `.claude/`, `.cursor/`, `.agents/` presence returns the right editor set.
- `frontmatter.test.ts` — parse / serialize round-trips for single-line and multi-line `description`, boolean values, and frontmatter-less files (returns empty fields).

Integration tests under `packages/cli/test/integration/`:

- `init-editors.test.ts` (new) — covers:
  - `xera init -y --editor claude` → only `.claude/` scaffolded
  - `xera init -y --editor cursor` → only `.cursor/` scaffolded
  - `xera init -y --editor codex` → only `.agents/` scaffolded
  - `xera init -y --editor all` → all three scaffolded
  - `xera init -y` in a fresh dir → all three scaffolded (default for `--yes` + no detection)
  - `xera init -y` in a dir with pre-existing `.cursor/` → only `.cursor/` refreshed
- `init-update-add-editor.test.ts` (new) — start with `.claude/` only, run `init --update --editor cursor`, assert `.cursor/` added and `.claude/` still intact.

Doctor unit tests extend the existing `packages/cli/test/checks.test.ts`:
- multi-editor project: all detected editors emit checks under distinct names
- no editor: single negative check

---

## 7. Open questions to validate after implementation

1. **Cursor cross-rule discovery.** Does Cursor's agent reliably attach `xera-fetch` rule when the active `xera-run` command body says "Follow xera-fetch.md"? Confirm by running a real `/xera-run` in Cursor against the sample-app fixture. If unreliable, ship the fallback: prepend an explicit `Referenced rules: @xera-fetch ...` line to each Cursor command body.

2. **Codex implicit skill invocation.** Confirm Codex's agent picks up `.agents/skills/xera-run/SKILL.md` when the user types "run xera for TICKET-123". Per OpenAI docs the agent scans `.agents/skills/` repo-wide and decides to invoke based on the SKILL.md `description`. If unreliable, document the explicit invocation syntax (Codex docs reference but the exact syntax may evolve).

3. **`AGENTS.md` scaffolding.** All three editors read `AGENTS.md` at project root. Should `xera init` scaffold a stub if none exists, telling each agent about xera's commands and conventions? Tradeoff: helpful onboarding vs. clobbering / surprising users who already curate their own `AGENTS.md`. Default proposal: don't scaffold; add a doctor info-level hint suggesting users add the boilerplate themselves. Defer the decision to a follow-up after multi-editor lands.

---

## 8. Versioning & changelog

- Patch bump on `@xera-ai/cli` (new flag + new adapters; no breaking changes to existing flags).
- No version change for `@xera-ai/skills` (single source of truth, unchanged).
- Changeset note explains the multi-editor scaffolding and the new `--editor` flag.
