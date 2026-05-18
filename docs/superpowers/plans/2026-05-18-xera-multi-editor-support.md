# xera — Multi-Editor Skill/Command Scaffolding Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend `xera init` / `xera init --update` / `xera doctor` to scaffold and validate skills + slash commands for three editors — Claude Code (existing), Cursor (new), OpenAI Codex CLI (new) — via a pluggable adapter registry.

**Architecture:** New `packages/cli/src/editors/` module with one adapter per editor (`claude.ts`, `cursor.ts`, `codex.ts`) implementing a shared `EditorAdapter` interface (skill writer, command writer, detect, legacy migrate, doctor checks). A `resolveEditors()` helper picks the target set from `--editor` flag, auto-detection, or interactive prompt. `init` / `init-update` / `checks` iterate the resolved set and delegate to each adapter. Single source of truth for skill bodies stays in `@xera-ai/skills`; Cursor's `RULE.md` frontmatter is transformed at scaffold time.

**Tech Stack:** TypeScript (ESM), Bun, `bun:test`, `cac` (CLI flag parsing), `@clack/prompts` (interactive multi-select).

**Spec:** [`docs/superpowers/specs/2026-05-18-xera-multi-editor-support-design.md`](../specs/2026-05-18-xera-multi-editor-support-design.md)

---

## File Structure

**New files:**
- `packages/cli/src/editors/frontmatter.ts` — minimal YAML frontmatter parse + serialize
- `packages/cli/src/editors/index.ts` — `EditorAdapter` interface, `EditorName` type, registry, `ALL_EDITORS`
- `packages/cli/src/editors/detect.ts` — `detectEditors(cwd)`
- `packages/cli/src/editors/claude.ts` — Claude Code adapter
- `packages/cli/src/editors/cursor.ts` — Cursor adapter (frontmatter transform)
- `packages/cli/src/editors/codex.ts` — OpenAI Codex CLI adapter (skill only)
- `packages/cli/src/editors/resolve.ts` — `resolveEditors()` helper
- `packages/cli/test/editors/frontmatter.test.ts`
- `packages/cli/test/editors/detect.test.ts`
- `packages/cli/test/editors/claude.test.ts`
- `packages/cli/test/editors/cursor.test.ts`
- `packages/cli/test/editors/codex.test.ts`
- `packages/cli/test/editors/resolve.test.ts`
- `packages/cli/test/integration/init-editors.test.ts`
- `packages/cli/test/integration/init-update-add-editor.test.ts`
- `.changeset/multi-editor-support.md`

**Modified files:**
- `packages/cli/src/commands/init.ts` — replace the in-place skills-copy loop with adapter dispatch; new `editors?: string` option
- `packages/cli/src/commands/init-update.ts` — same adapter-dispatch replacement, plus per-editor refresh / legacy migrate; new `editors?: string` option
- `packages/cli/src/checks.ts` — replace the hard-coded `.claude/skills/` check with adapter dispatch over detected editors
- `packages/cli/src/index.ts` — register `--editor <list>` flag, validate, pass through to init / init-update options
- 7 live docs (README.md, CLAUDE.md, AGENTS.md, docs/PROJECT_CONTEXT.md, docs/ARCHITECTURE.md, docs/CONFIGURATION.md, docs/TROUBLESHOOTING.md)

---

## Task 1: Frontmatter helper

**Files:**
- Create: `packages/cli/src/editors/frontmatter.ts`
- Test: `packages/cli/test/editors/frontmatter.test.ts`

A tiny purpose-built parser/serializer for the frontmatter shapes we actually produce: `name:`, `description:` (single-line or `|`-block), `alwaysApply: true|false`, `globs: [a, b]`. Avoids pulling in a full YAML dep.

- [ ] **Step 1: Write failing tests**

```ts
// packages/cli/test/editors/frontmatter.test.ts
import { describe, expect, test } from 'bun:test';
import { parseFrontmatter, serializeFrontmatter } from '../../src/editors/frontmatter';

describe('parseFrontmatter', () => {
  test('parses simple name + description', () => {
    const md = `---\nname: xera-run\ndescription: Run the full pipeline.\n---\n# Body\n`;
    const { frontmatter, body } = parseFrontmatter(md);
    expect(frontmatter.fields).toEqual({
      name: 'xera-run',
      description: 'Run the full pipeline.',
    });
    expect(body).toBe('# Body\n');
  });

  test('parses block scalar description', () => {
    const md = `---\nname: x\ndescription: |\n  Line 1\n  Line 2\n---\nBody\n`;
    const { frontmatter } = parseFrontmatter(md);
    expect(frontmatter.fields.description).toBe('Line 1\nLine 2');
  });

  test('parses boolean alwaysApply', () => {
    const md = `---\ndescription: r\nalwaysApply: false\n---\n`;
    const { frontmatter } = parseFrontmatter(md);
    expect(frontmatter.fields.alwaysApply).toBe(false);
  });

  test('returns empty fields and full body when no frontmatter', () => {
    const md = `# No frontmatter here\n`;
    const { frontmatter, body } = parseFrontmatter(md);
    expect(frontmatter.fields).toEqual({});
    expect(body).toBe(md);
  });
});

describe('serializeFrontmatter', () => {
  test('writes simple fields in declaration order', () => {
    const out = serializeFrontmatter({ name: 'xera-run', description: 'Run it.' });
    expect(out).toBe('---\nname: xera-run\ndescription: Run it.\n---\n');
  });

  test('writes block scalar for multi-line description', () => {
    const out = serializeFrontmatter({ description: 'Line 1\nLine 2' });
    expect(out).toBe('---\ndescription: |\n  Line 1\n  Line 2\n---\n');
  });

  test('writes boolean values bare', () => {
    const out = serializeFrontmatter({ description: 'r', alwaysApply: false });
    expect(out).toBe('---\ndescription: r\nalwaysApply: false\n---\n');
  });

  test('round-trips parse → serialize for a Claude-style skill header', () => {
    const md = `---\nname: xera-run\ndescription: Run the full xera pipeline for a Jira ticket end-to-end.\n---\n`;
    const { frontmatter } = parseFrontmatter(md);
    const out = serializeFrontmatter(frontmatter.fields);
    expect(out).toBe(md);
  });
});
```

- [ ] **Step 2: Run tests, verify failure**

Run: `bun test packages/cli/test/editors/frontmatter.test.ts`
Expected: All tests fail with `Cannot find module '../../src/editors/frontmatter'`.

- [ ] **Step 3: Implement the helper**

```ts
// packages/cli/src/editors/frontmatter.ts
export type FrontmatterValue = string | boolean | string[];

export interface ParsedFrontmatter {
  raw: string;
  fields: Record<string, FrontmatterValue>;
}

const FENCE = '---';

export function parseFrontmatter(md: string): {
  frontmatter: ParsedFrontmatter;
  body: string;
} {
  if (!md.startsWith(`${FENCE}\n`)) {
    return { frontmatter: { raw: '', fields: {} }, body: md };
  }
  const closeIdx = md.indexOf(`\n${FENCE}\n`, FENCE.length + 1);
  if (closeIdx < 0) {
    return { frontmatter: { raw: '', fields: {} }, body: md };
  }
  const raw = md.slice(FENCE.length + 1, closeIdx);
  const body = md.slice(closeIdx + `\n${FENCE}\n`.length);
  const fields: Record<string, FrontmatterValue> = {};
  const lines = raw.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    if (!line.trim()) continue;
    const m = line.match(/^([A-Za-z][A-Za-z0-9_-]*):\s*(.*)$/);
    if (!m) continue;
    const key = m[1]!;
    const value = m[2]!;
    if (value === '|') {
      // Block scalar — collect subsequent indented lines
      const collected: string[] = [];
      while (i + 1 < lines.length) {
        const next = lines[i + 1]!;
        if (/^ {2,}/.test(next)) {
          collected.push(next.replace(/^ {2}/, ''));
          i++;
        } else if (next.trim() === '') {
          // blank line inside block scalar — preserve
          collected.push('');
          i++;
        } else {
          break;
        }
      }
      // Trim trailing blank lines
      while (collected.length && collected[collected.length - 1] === '') collected.pop();
      fields[key] = collected.join('\n');
    } else if (value === 'true' || value === 'false') {
      fields[key] = value === 'true';
    } else {
      fields[key] = value;
    }
  }
  return { frontmatter: { raw, fields }, body };
}

export function serializeFrontmatter(
  fields: Record<string, FrontmatterValue>,
): string {
  const lines: string[] = [FENCE];
  for (const [key, value] of Object.entries(fields)) {
    if (typeof value === 'boolean') {
      lines.push(`${key}: ${value}`);
    } else if (Array.isArray(value)) {
      lines.push(`${key}: [${value.join(', ')}]`);
    } else if (value.includes('\n')) {
      lines.push(`${key}: |`);
      for (const sub of value.split('\n')) lines.push(`  ${sub}`);
    } else {
      lines.push(`${key}: ${value}`);
    }
  }
  lines.push(FENCE);
  return `${lines.join('\n')}\n`;
}
```

- [ ] **Step 4: Run tests, verify pass**

Run: `bun test packages/cli/test/editors/frontmatter.test.ts`
Expected: 7 pass, 0 fail.

- [ ] **Step 5: Commit**

```bash
git add packages/cli/src/editors/frontmatter.ts packages/cli/test/editors/frontmatter.test.ts
git commit -m "cli: add frontmatter parse/serialize helper for editor adapters"
```

---

## Task 2: EditorAdapter interface + registry stub

**Files:**
- Create: `packages/cli/src/editors/index.ts`

No test of its own — exists only to define the interface used by Tasks 4–6. Compiles only after those tasks land. Therefore: write the file but DON'T import the adapter modules yet; leave the registry export as `{}` with a TODO marker pointing at the populating tasks.

- [ ] **Step 1: Write the file**

```ts
// packages/cli/src/editors/index.ts
import type { ParsedFrontmatter } from './frontmatter';

export type EditorName = 'claude' | 'cursor' | 'codex';
export const ALL_EDITORS: readonly EditorName[] = ['claude', 'cursor', 'codex'] as const;

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
  detect(cwd: string): boolean;
  scaffoldSkill(cwd: string, input: SkillInput): void;
  scaffoldCommand?(cwd: string, input: SkillInput): void;
  legacyMigrate?(cwd: string, base: string): boolean;
  doctorChecks(cwd: string, requiredSkills: string[]): Check[];
}

// Populated by Tasks 4 (claude), 5 (cursor), 6 (codex).
// Imports added once each adapter file exists.
export const editors: Partial<Record<EditorName, EditorAdapter>> = {};
```

- [ ] **Step 2: Confirm typecheck passes**

Run: `cd packages/cli && bun run typecheck`
Expected: exit 0 (no type errors).

- [ ] **Step 3: Commit**

```bash
git add packages/cli/src/editors/index.ts
git commit -m "cli: add EditorAdapter interface + registry stub"
```

---

## Task 3: Detect helper

**Files:**
- Create: `packages/cli/src/editors/detect.ts`
- Test: `packages/cli/test/editors/detect.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
// packages/cli/test/editors/detect.test.ts
import { describe, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { detectEditors } from '../../src/editors/detect';

function fresh(): string {
  return mkdtempSync(join(tmpdir(), 'xera-detect-'));
}

describe('detectEditors', () => {
  test('returns [] for empty dir', () => {
    const d = fresh();
    try {
      expect(detectEditors(d)).toEqual([]);
    } finally {
      rmSync(d, { recursive: true, force: true });
    }
  });

  test('detects .claude/', () => {
    const d = fresh();
    try {
      mkdirSync(join(d, '.claude'));
      expect(detectEditors(d)).toEqual(['claude']);
    } finally {
      rmSync(d, { recursive: true, force: true });
    }
  });

  test('detects .cursor/', () => {
    const d = fresh();
    try {
      mkdirSync(join(d, '.cursor'));
      expect(detectEditors(d)).toEqual(['cursor']);
    } finally {
      rmSync(d, { recursive: true, force: true });
    }
  });

  test('detects .agents/ as codex', () => {
    const d = fresh();
    try {
      mkdirSync(join(d, '.agents'));
      expect(detectEditors(d)).toEqual(['codex']);
    } finally {
      rmSync(d, { recursive: true, force: true });
    }
  });

  test('returns all three when all present, in stable order', () => {
    const d = fresh();
    try {
      mkdirSync(join(d, '.cursor'));
      mkdirSync(join(d, '.agents'));
      mkdirSync(join(d, '.claude'));
      expect(detectEditors(d)).toEqual(['claude', 'cursor', 'codex']);
    } finally {
      rmSync(d, { recursive: true, force: true });
    }
  });
});
```

- [ ] **Step 2: Run tests, verify failure**

Run: `bun test packages/cli/test/editors/detect.test.ts`
Expected: All fail with `Cannot find module '../../src/editors/detect'`.

- [ ] **Step 3: Implement**

```ts
// packages/cli/src/editors/detect.ts
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { type EditorName, ALL_EDITORS } from './index';

const MARKERS: Record<EditorName, string> = {
  claude: '.claude',
  cursor: '.cursor',
  codex: '.agents',
};

export function detectEditors(cwd: string): EditorName[] {
  return ALL_EDITORS.filter((name) => existsSync(join(cwd, MARKERS[name])));
}
```

- [ ] **Step 4: Run tests, verify pass**

Run: `bun test packages/cli/test/editors/detect.test.ts`
Expected: 5 pass, 0 fail.

- [ ] **Step 5: Commit**

```bash
git add packages/cli/src/editors/detect.ts packages/cli/test/editors/detect.test.ts
git commit -m "cli: add editor detect helper"
```

---

## Task 4: Claude adapter

**Files:**
- Create: `packages/cli/src/editors/claude.ts`
- Test: `packages/cli/test/editors/claude.test.ts`
- Modify: `packages/cli/src/editors/index.ts` (register adapter)

Behaviour mirrors the post-PR-#106 logic currently in `init.ts` (skills → `.claude/skills/<name>/SKILL.md`, commands → `.claude/commands/<name>.md`, legacy flat → directory migration).

- [ ] **Step 1: Write failing tests**

```ts
// packages/cli/test/editors/claude.test.ts
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { claudeAdapter } from '../../src/editors/claude';
import { parseFrontmatter } from '../../src/editors/frontmatter';

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'xera-claude-'));
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

const SRC = `---\nname: xera-run\ndescription: Run the pipeline.\n---\nBody text.\n`;

function input() {
  const { frontmatter, body } = parseFrontmatter(SRC);
  return { base: 'xera-run', body, frontmatter };
}

describe('claudeAdapter', () => {
  test('scaffoldSkill writes .claude/skills/<base>/SKILL.md verbatim', () => {
    claudeAdapter.scaffoldSkill(dir, input());
    const path = join(dir, '.claude/skills/xera-run/SKILL.md');
    expect(existsSync(path)).toBe(true);
    expect(readFileSync(path, 'utf8')).toBe(SRC);
  });

  test('scaffoldCommand writes .claude/commands/<base>.md verbatim', () => {
    claudeAdapter.scaffoldCommand!(dir, input());
    const path = join(dir, '.claude/commands/xera-run.md');
    expect(readFileSync(path, 'utf8')).toBe(SRC);
  });

  test('legacyMigrate moves flat .md to directory layout and deletes original', () => {
    mkdirSync(join(dir, '.claude/skills'), { recursive: true });
    writeFileSync(join(dir, '.claude/skills/xera-run.md'), SRC);
    const migrated = claudeAdapter.legacyMigrate!(dir, 'xera-run');
    expect(migrated).toBe(true);
    expect(existsSync(join(dir, '.claude/skills/xera-run.md'))).toBe(false);
    expect(readFileSync(join(dir, '.claude/skills/xera-run/SKILL.md'), 'utf8')).toBe(SRC);
  });

  test('legacyMigrate returns false when nothing to migrate', () => {
    expect(claudeAdapter.legacyMigrate!(dir, 'xera-run')).toBe(false);
  });

  test('detect returns true when .claude/ exists', () => {
    mkdirSync(join(dir, '.claude'));
    expect(claudeAdapter.detect(dir)).toBe(true);
  });

  test('doctorChecks reports pass when all required skills present as <name>/SKILL.md', () => {
    for (const b of ['xera-run', 'xera-fetch']) {
      mkdirSync(join(dir, '.claude/skills', b), { recursive: true });
      writeFileSync(join(dir, '.claude/skills', b, 'SKILL.md'), '');
    }
    const checks = claudeAdapter.doctorChecks(dir, ['xera-run', 'xera-fetch']);
    const skillsCheck = checks.find((c) => c.name.includes('skills'));
    expect(skillsCheck?.ok).toBe(true);
  });

  test('doctorChecks flags legacy flat layout with migration hint', () => {
    mkdirSync(join(dir, '.claude/skills'), { recursive: true });
    writeFileSync(join(dir, '.claude/skills/xera-run.md'), '');
    const checks = claudeAdapter.doctorChecks(dir, ['xera-run']);
    const skillsCheck = checks.find((c) => c.name.includes('skills'));
    expect(skillsCheck?.ok).toBe(false);
    expect(skillsCheck?.message ?? '').toContain('xera init --update');
    expect(skillsCheck?.message ?? '').toContain('--editor claude');
  });
});
```

- [ ] **Step 2: Run tests, verify failure**

Run: `bun test packages/cli/test/editors/claude.test.ts`
Expected: All fail (module not found).

- [ ] **Step 3: Implement adapter**

```ts
// packages/cli/src/editors/claude.ts
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { serializeFrontmatter } from './frontmatter';
import type { Check, EditorAdapter, SkillInput } from './index';

function renderSource(input: SkillInput): string {
  return serializeFrontmatter(input.frontmatter.fields) + input.body;
}

export const claudeAdapter: EditorAdapter = {
  name: 'claude',

  detect(cwd) {
    return existsSync(join(cwd, '.claude'));
  },

  scaffoldSkill(cwd, input) {
    const target = join(cwd, '.claude/skills', input.base, 'SKILL.md');
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, renderSource(input));
  },

  scaffoldCommand(cwd, input) {
    const target = join(cwd, '.claude/commands', `${input.base}.md`);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, renderSource(input));
  },

  legacyMigrate(cwd, base) {
    const flat = join(cwd, '.claude/skills', `${base}.md`);
    const dir = join(cwd, '.claude/skills', base, 'SKILL.md');
    if (!existsSync(flat) || existsSync(dir)) return false;
    const content = readFileSync(flat);
    mkdirSync(dirname(dir), { recursive: true });
    writeFileSync(dir, content);
    unlinkSync(flat);
    return true;
  },

  doctorChecks(cwd, requiredSkills): Check[] {
    const skillsDir = join(cwd, '.claude/skills');
    if (!existsSync(skillsDir)) {
      return [{ name: 'xera skills present (claude)', ok: false, message: 'run `xera init`' }];
    }
    const missing: string[] = [];
    const legacyFlat: string[] = [];
    for (const base of requiredSkills) {
      if (existsSync(join(skillsDir, base, 'SKILL.md'))) continue;
      if (existsSync(join(skillsDir, `${base}.md`))) legacyFlat.push(base);
      else missing.push(base);
    }
    const check: Check = {
      name: 'xera skills present (claude)',
      ok: missing.length === 0 && legacyFlat.length === 0,
    };
    if (missing.length) {
      check.message = `missing: ${missing.map((b) => `${b}/SKILL.md`).join(', ')}`;
    } else if (legacyFlat.length) {
      check.message = `legacy flat layout — run \`xera init --update --editor claude\` to migrate`;
    }
    return [check];
  },
};
```

- [ ] **Step 4: Register in registry**

Edit `packages/cli/src/editors/index.ts`:

```ts
// Add at top after existing imports:
import { claudeAdapter } from './claude';

// Replace the registry stub:
export const editors: Partial<Record<EditorName, EditorAdapter>> = {
  claude: claudeAdapter,
};
```

- [ ] **Step 5: Run tests, verify pass**

Run: `bun test packages/cli/test/editors/claude.test.ts`
Expected: 7 pass, 0 fail.

- [ ] **Step 6: Commit**

```bash
git add packages/cli/src/editors/claude.ts packages/cli/src/editors/index.ts packages/cli/test/editors/claude.test.ts
git commit -m "cli: add Claude Code editor adapter"
```

---

## Task 5: Cursor adapter

**Files:**
- Create: `packages/cli/src/editors/cursor.ts`
- Test: `packages/cli/test/editors/cursor.test.ts`
- Modify: `packages/cli/src/editors/index.ts`

Cursor needs frontmatter transformation:
- `.cursor/rules/<base>/RULE.md`: `description:` + `alwaysApply: false` (drop `name:`)
- `.cursor/commands/<base>.md`: `description:` only (drop `name:` and `alwaysApply`)

- [ ] **Step 1: Write failing tests**

```ts
// packages/cli/test/editors/cursor.test.ts
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { cursorAdapter } from '../../src/editors/cursor';
import { parseFrontmatter } from '../../src/editors/frontmatter';

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'xera-cursor-'));
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

const SRC = `---\nname: xera-run\ndescription: Run the pipeline.\n---\nBody text.\n`;

function input() {
  const { frontmatter, body } = parseFrontmatter(SRC);
  return { base: 'xera-run', body, frontmatter };
}

describe('cursorAdapter', () => {
  test('scaffoldSkill writes .cursor/rules/<base>/RULE.md with rule frontmatter', () => {
    cursorAdapter.scaffoldSkill(dir, input());
    const path = join(dir, '.cursor/rules/xera-run/RULE.md');
    const written = readFileSync(path, 'utf8');
    expect(written.startsWith('---\n')).toBe(true);
    expect(written).toContain('description: Run the pipeline.');
    expect(written).toContain('alwaysApply: false');
    expect(written).not.toContain('name:');
    expect(written.endsWith('Body text.\n')).toBe(true);
  });

  test('scaffoldCommand writes .cursor/commands/<base>.md with description only', () => {
    cursorAdapter.scaffoldCommand!(dir, input());
    const path = join(dir, '.cursor/commands/xera-run.md');
    const written = readFileSync(path, 'utf8');
    expect(written).toContain('description: Run the pipeline.');
    expect(written).not.toContain('alwaysApply');
    expect(written).not.toContain('name:');
    expect(written.endsWith('Body text.\n')).toBe(true);
  });

  test('preserves body bytes verbatim including multi-line content', () => {
    const SRC2 = `---\nname: x\ndescription: d\n---\nLine1\nLine2\n\nLine4\n`;
    const { frontmatter, body } = parseFrontmatter(SRC2);
    cursorAdapter.scaffoldSkill(dir, { base: 'x', body, frontmatter });
    const written = readFileSync(join(dir, '.cursor/rules/x/RULE.md'), 'utf8');
    expect(written.endsWith('Line1\nLine2\n\nLine4\n')).toBe(true);
  });

  test('detect returns true when .cursor/ exists', () => {
    mkdirSync(join(dir, '.cursor'));
    expect(cursorAdapter.detect(dir)).toBe(true);
  });

  test('doctorChecks reports pass when all rules + commands present', () => {
    for (const b of ['xera-run', 'xera-fetch']) {
      mkdirSync(join(dir, '.cursor/rules', b), { recursive: true });
      mkdirSync(join(dir, '.cursor/commands'), { recursive: true });
      const { writeFileSync } = require('node:fs');
      writeFileSync(join(dir, '.cursor/rules', b, 'RULE.md'), '');
      writeFileSync(join(dir, '.cursor/commands', `${b}.md`), '');
    }
    const checks = cursorAdapter.doctorChecks(dir, ['xera-run', 'xera-fetch']);
    const skillsCheck = checks.find((c) => c.name.includes('skills'));
    expect(skillsCheck?.ok).toBe(true);
  });

  test('doctorChecks reports missing rule with hint', () => {
    const checks = cursorAdapter.doctorChecks(dir, ['xera-run']);
    const skillsCheck = checks.find((c) => c.name.includes('skills'));
    expect(skillsCheck?.ok).toBe(false);
    expect(skillsCheck?.message ?? '').toContain('xera-run/RULE.md');
  });
});
```

- [ ] **Step 2: Run tests, verify failure**

Run: `bun test packages/cli/test/editors/cursor.test.ts`
Expected: All fail (module not found).

- [ ] **Step 3: Implement adapter**

```ts
// packages/cli/src/editors/cursor.ts
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { type FrontmatterValue, serializeFrontmatter } from './frontmatter';
import type { Check, EditorAdapter, SkillInput } from './index';

function ruleFrontmatter(input: SkillInput): Record<string, FrontmatterValue> {
  const desc = input.frontmatter.fields.description;
  if (desc === undefined) {
    throw new Error(`Cursor scaffold requires 'description' in source frontmatter for ${input.base}`);
  }
  return { description: desc, alwaysApply: false };
}

function commandFrontmatter(input: SkillInput): Record<string, FrontmatterValue> {
  const desc = input.frontmatter.fields.description;
  if (desc === undefined) {
    throw new Error(`Cursor scaffold requires 'description' in source frontmatter for ${input.base}`);
  }
  return { description: desc };
}

function write(target: string, content: string): void {
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, content);
}

export const cursorAdapter: EditorAdapter = {
  name: 'cursor',

  detect(cwd) {
    return existsSync(join(cwd, '.cursor'));
  },

  scaffoldSkill(cwd, input) {
    const path = join(cwd, '.cursor/rules', input.base, 'RULE.md');
    write(path, serializeFrontmatter(ruleFrontmatter(input)) + input.body);
  },

  scaffoldCommand(cwd, input) {
    const path = join(cwd, '.cursor/commands', `${input.base}.md`);
    write(path, serializeFrontmatter(commandFrontmatter(input)) + input.body);
  },

  doctorChecks(cwd, requiredSkills): Check[] {
    const rulesDir = join(cwd, '.cursor/rules');
    const cmdsDir = join(cwd, '.cursor/commands');
    if (!existsSync(rulesDir)) {
      return [{ name: 'xera skills present (cursor)', ok: false, message: 'run `xera init --update --editor cursor`' }];
    }
    const missing: string[] = [];
    for (const base of requiredSkills) {
      if (!existsSync(join(rulesDir, base, 'RULE.md'))) missing.push(`${base}/RULE.md`);
      if (!existsSync(join(cmdsDir, `${base}.md`))) missing.push(`commands/${base}.md`);
    }
    const check: Check = {
      name: 'xera skills present (cursor)',
      ok: missing.length === 0,
    };
    if (missing.length) check.message = `missing: ${missing.join(', ')}`;
    return [check];
  },
};
```

- [ ] **Step 4: Register in registry**

Edit `packages/cli/src/editors/index.ts`:

```ts
// Add import alongside claudeAdapter:
import { cursorAdapter } from './cursor';

// Update registry:
export const editors: Partial<Record<EditorName, EditorAdapter>> = {
  claude: claudeAdapter,
  cursor: cursorAdapter,
};
```

- [ ] **Step 5: Run tests, verify pass**

Run: `bun test packages/cli/test/editors/cursor.test.ts`
Expected: 6 pass, 0 fail.

- [ ] **Step 6: Commit**

```bash
git add packages/cli/src/editors/cursor.ts packages/cli/src/editors/index.ts packages/cli/test/editors/cursor.test.ts
git commit -m "cli: add Cursor editor adapter (rule + command, frontmatter transform)"
```

---

## Task 6: Codex adapter

**Files:**
- Create: `packages/cli/src/editors/codex.ts`
- Test: `packages/cli/test/editors/codex.test.ts`
- Modify: `packages/cli/src/editors/index.ts`

Codex SKILL.md format = Claude SKILL.md format (verbatim). No slash command (Codex has no project-level slash mechanism). Target path: `.agents/skills/<base>/SKILL.md`.

- [ ] **Step 1: Write failing tests**

```ts
// packages/cli/test/editors/codex.test.ts
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { codexAdapter } from '../../src/editors/codex';
import { parseFrontmatter } from '../../src/editors/frontmatter';

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'xera-codex-'));
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

const SRC = `---\nname: xera-run\ndescription: Run the pipeline.\n---\nBody text.\n`;

function input() {
  const { frontmatter, body } = parseFrontmatter(SRC);
  return { base: 'xera-run', body, frontmatter };
}

describe('codexAdapter', () => {
  test('scaffoldSkill writes .agents/skills/<base>/SKILL.md verbatim', () => {
    codexAdapter.scaffoldSkill(dir, input());
    const path = join(dir, '.agents/skills/xera-run/SKILL.md');
    expect(readFileSync(path, 'utf8')).toBe(SRC);
  });

  test('exposes no scaffoldCommand', () => {
    expect(codexAdapter.scaffoldCommand).toBeUndefined();
  });

  test('detect returns true when .agents/ exists', () => {
    mkdirSync(join(dir, '.agents'));
    expect(codexAdapter.detect(dir)).toBe(true);
  });

  test('doctorChecks reports pass when all skills present', () => {
    for (const b of ['xera-run', 'xera-fetch']) {
      mkdirSync(join(dir, '.agents/skills', b), { recursive: true });
      writeFileSync(join(dir, '.agents/skills', b, 'SKILL.md'), '');
    }
    const checks = codexAdapter.doctorChecks(dir, ['xera-run', 'xera-fetch']);
    expect(checks[0]?.ok).toBe(true);
  });

  test('doctorChecks reports missing skill', () => {
    const checks = codexAdapter.doctorChecks(dir, ['xera-run']);
    expect(checks[0]?.ok).toBe(false);
    expect(checks[0]?.message ?? '').toContain('xera-run/SKILL.md');
  });
});
```

- [ ] **Step 2: Run tests, verify failure**

Run: `bun test packages/cli/test/editors/codex.test.ts`
Expected: All fail.

- [ ] **Step 3: Implement adapter**

```ts
// packages/cli/src/editors/codex.ts
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { serializeFrontmatter } from './frontmatter';
import type { Check, EditorAdapter, SkillInput } from './index';

export const codexAdapter: EditorAdapter = {
  name: 'codex',

  detect(cwd) {
    return existsSync(join(cwd, '.agents'));
  },

  scaffoldSkill(cwd, input) {
    const target = join(cwd, '.agents/skills', input.base, 'SKILL.md');
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, serializeFrontmatter(input.frontmatter.fields) + input.body);
  },

  // No scaffoldCommand — Codex has no project-level slash mechanism.

  doctorChecks(cwd, requiredSkills): Check[] {
    const skillsDir = join(cwd, '.agents/skills');
    if (!existsSync(skillsDir)) {
      return [{ name: 'xera skills present (codex)', ok: false, message: 'run `xera init --update --editor codex`' }];
    }
    const missing = requiredSkills.filter(
      (b) => !existsSync(join(skillsDir, b, 'SKILL.md')),
    );
    const check: Check = {
      name: 'xera skills present (codex)',
      ok: missing.length === 0,
    };
    if (missing.length) check.message = `missing: ${missing.map((b) => `${b}/SKILL.md`).join(', ')}`;
    return [check];
  },
};
```

- [ ] **Step 4: Register in registry**

Edit `packages/cli/src/editors/index.ts`:

```ts
// Add import:
import { codexAdapter } from './codex';

// Update registry (final form):
export const editors: Record<EditorName, EditorAdapter> = {
  claude: claudeAdapter,
  cursor: cursorAdapter,
  codex: codexAdapter,
};
```

Note: change the type from `Partial<Record<...>>` to `Record<...>` now that all three are registered.

- [ ] **Step 5: Run tests, verify pass**

Run: `bun test packages/cli/test/editors/codex.test.ts`
Expected: 5 pass, 0 fail.

- [ ] **Step 6: Commit**

```bash
git add packages/cli/src/editors/codex.ts packages/cli/src/editors/index.ts packages/cli/test/editors/codex.test.ts
git commit -m "cli: add OpenAI Codex CLI editor adapter (skill only)"
```

---

## Task 7: resolveEditors helper

**Files:**
- Create: `packages/cli/src/editors/resolve.ts`
- Test: `packages/cli/test/editors/resolve.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
// packages/cli/test/editors/resolve.test.ts
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { resolveEditors } from '../../src/editors/resolve';

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'xera-resolve-'));
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('resolveEditors', () => {
  test('flag "all" returns all three editors', async () => {
    expect(await resolveEditors({ flag: 'all', cwd: dir, isUpdate: false, isYes: true })).toEqual([
      'claude',
      'cursor',
      'codex',
    ]);
  });

  test('flag "claude,cursor" returns those two in order', async () => {
    expect(
      await resolveEditors({ flag: 'claude,cursor', cwd: dir, isUpdate: false, isYes: true }),
    ).toEqual(['claude', 'cursor']);
  });

  test('flag with invalid name throws with available list', async () => {
    await expect(
      resolveEditors({ flag: 'vim', cwd: dir, isUpdate: false, isYes: true }),
    ).rejects.toThrow(/vim.*claude.*cursor.*codex/);
  });

  test('no flag, no --yes, no detection → calls prompt', async () => {
    let called = false;
    const result = await resolveEditors({
      flag: undefined,
      cwd: dir,
      isUpdate: false,
      isYes: false,
      prompt: async () => {
        called = true;
        return ['claude'];
      },
    });
    expect(called).toBe(true);
    expect(result).toEqual(['claude']);
  });

  test('no flag, --yes, no detection → defaults to all three', async () => {
    expect(
      await resolveEditors({ flag: undefined, cwd: dir, isUpdate: false, isYes: true }),
    ).toEqual(['claude', 'cursor', 'codex']);
  });

  test('no flag, detection finds .cursor/ → returns ["cursor"]', async () => {
    mkdirSync(join(dir, '.cursor'));
    expect(
      await resolveEditors({ flag: undefined, cwd: dir, isUpdate: false, isYes: true }),
    ).toEqual(['cursor']);
  });

  test('update mode with no detection returns [] (caller warns)', async () => {
    expect(
      await resolveEditors({ flag: undefined, cwd: dir, isUpdate: true, isYes: true }),
    ).toEqual([]);
  });

  test('update mode with detection refreshes only detected', async () => {
    mkdirSync(join(dir, '.claude'));
    expect(
      await resolveEditors({ flag: undefined, cwd: dir, isUpdate: true, isYes: true }),
    ).toEqual(['claude']);
  });
});
```

- [ ] **Step 2: Run tests, verify failure**

Run: `bun test packages/cli/test/editors/resolve.test.ts`
Expected: All fail.

- [ ] **Step 3: Implement**

```ts
// packages/cli/src/editors/resolve.ts
import { detectEditors } from './detect';
import { type EditorName, ALL_EDITORS } from './index';

export interface ResolveOptions {
  flag: string | undefined;
  cwd: string;
  isUpdate: boolean;
  isYes: boolean;
  prompt?: () => Promise<EditorName[]>;
}

function parseFlag(flag: string): EditorName[] {
  if (flag === 'all') return [...ALL_EDITORS];
  const parts = flag.split(',').map((s) => s.trim()).filter(Boolean);
  const bad = parts.filter((p) => !(ALL_EDITORS as readonly string[]).includes(p));
  if (bad.length) {
    throw new Error(
      `--editor: unknown value(s) [${bad.join(', ')}]. Valid: ${ALL_EDITORS.join(', ')} (or 'all').`,
    );
  }
  return parts as EditorName[];
}

export async function resolveEditors(opts: ResolveOptions): Promise<EditorName[]> {
  if (opts.flag !== undefined) return parseFlag(opts.flag);
  const detected = detectEditors(opts.cwd);
  if (opts.isUpdate) return detected;
  if (detected.length > 0) return detected;
  if (opts.isYes) return [...ALL_EDITORS];
  if (opts.prompt) return opts.prompt();
  return [...ALL_EDITORS]; // safety net; shouldn't reach here with normal CLI plumbing
}
```

- [ ] **Step 4: Run tests, verify pass**

Run: `bun test packages/cli/test/editors/resolve.test.ts`
Expected: 8 pass, 0 fail.

- [ ] **Step 5: Commit**

```bash
git add packages/cli/src/editors/resolve.ts packages/cli/test/editors/resolve.test.ts
git commit -m "cli: add resolveEditors helper (flag / auto-detect / prompt / default)"
```

---

## Task 8: Add `--editor` flag to CLI surface

**Files:**
- Modify: `packages/cli/src/index.ts`

Add `--editor <list>` flag to the `init` command. Pass through to both `init` and `init --update` action handlers. Defer actual validation to `resolveEditors` (it throws with the helpful message); the CLI just forwards the raw string.

- [ ] **Step 1: Locate the option block**

In `packages/cli/src/index.ts`, find the `cli.command('init', ...)` chain (around line 67–96).

- [ ] **Step 2: Add the `--editor` option**

Insert AFTER the `--shape` option (line 70):

```ts
    .option('--editor <list>', 'Editor(s) to scaffold: claude,cursor,codex or "all" (default: auto-detect or all)')
```

- [ ] **Step 3: Add `editor` to the action handler's `opts` type**

Find the `async (opts: { ... }) =>` block (around line 98). Add to the type:

```ts
        editor?: string;
```

- [ ] **Step 4: Forward to update opts**

Inside `if (opts.update) { ... }`, before `await initUpdateCommand(updateOpts)`, add:

```ts
          if (opts.editor !== undefined) updateOpts.editor = opts.editor;
```

- [ ] **Step 5: Forward to init opts**

Below the existing `if (opts.openapiPath ...)` lines, add:

```ts
        if (opts.editor !== undefined) initOpts.editor = opts.editor;
```

- [ ] **Step 6: Add an `--editor` example**

In the `.example(...)` block, add:

```ts
    .example('xera init -y --shape web --editor claude,cursor')
```

- [ ] **Step 7: Typecheck**

Run: `cd packages/cli && bun run typecheck`
Expected: errors complaining that `editor` is not in `InitOptions` / `InitUpdateOptions`. That's the cue for Tasks 9 and 10 to add the field — fix in those tasks. Note the error and proceed.

- [ ] **Step 8: Commit**

```bash
git add packages/cli/src/index.ts
git commit -m "cli: add --editor flag to init/init --update"
```

---

## Task 9: Refactor init.ts to use adapter dispatch

**Files:**
- Modify: `packages/cli/src/commands/init.ts`

Replace the hard-coded skills-copy loop (currently writes to `.claude/skills/<base>/SKILL.md` and `.claude/commands/<base>.md`) with an adapter-driven loop. Add `editor?: string` to `InitOptions`.

- [ ] **Step 1: Read the current skills-copy block** to anchor the edit

Open `packages/cli/src/commands/init.ts`. The block to replace is the one written in PR #106 — starts with the comment `// Copy skill .md files from @xera-ai/skills into BOTH:` and ends just before the `// Add npm scripts` comment.

- [ ] **Step 2: Add `editor` to InitOptions**

In the `InitOptions` interface (top of file), add:

```ts
  /** Comma-separated editor names or "all"; defaults follow resolveEditors() */
  editor?: string;
```

- [ ] **Step 3: Replace the skills-copy loop**

Replace the entire block from `// Copy skill .md files from @xera-ai/skills into BOTH:` through (and including) the `for (const name of readdirSync(skillsSrcDir)) { ... }` loop with:

```ts
  // Resolve editor targets. Falls back to interactive multi-select prompt if
  // no flag, no --yes, and no editor markers already present in the cwd.
  const editorTargets = await resolveEditors({
    flag: opts.editor,
    cwd,
    isUpdate: false,
    isYes: opts.yes,
    prompt: async () => {
      const choice = await p.multiselect({
        message: 'Which editor(s) should xera scaffold for?',
        options: [
          { value: 'claude', label: 'Claude Code (.claude/skills/, .claude/commands/)' },
          { value: 'cursor', label: 'Cursor (.cursor/rules/, .cursor/commands/)' },
          { value: 'codex', label: 'OpenAI Codex CLI (.agents/skills/)' },
        ],
        initialValues: ['claude'],
        required: true,
      });
      if (typeof choice === 'symbol') cancel();
      return choice as EditorName[];
    },
  });

  // Scaffold each skill into each target editor.
  const skillsPkgPath = require.resolve('@xera-ai/skills/package.json');
  const skillsSrcDir = join(skillsPkgPath, '..');
  const SKILL_IGNORE = new Set(['package.json', 'version.json', 'CHANGELOG.md']);
  for (const name of readdirSync(skillsSrcDir)) {
    if (SKILL_IGNORE.has(name)) continue;
    if (!name.endsWith('.md')) continue;
    const raw = readFileSync(join(skillsSrcDir, name), 'utf8');
    const { frontmatter, body } = parseFrontmatter(raw);
    const base = name.replace(/\.md$/, '');
    const skillInput = { base, body, frontmatter };
    for (const editorName of editorTargets) {
      const adapter = editors[editorName];
      adapter.scaffoldSkill(cwd, skillInput);
      adapter.scaffoldCommand?.(cwd, skillInput);
    }
  }
```

- [ ] **Step 4: Add imports**

At the top of the file, add (or extend existing import block):

```ts
import { editors, type EditorName } from '../editors';
import { parseFrontmatter } from '../editors/frontmatter';
import { resolveEditors } from '../editors/resolve';
```

Remove now-unused imports (`mkdirSync`, `unlinkSync`, `dirname` — but verify they're not used elsewhere first by grepping in the file).

- [ ] **Step 5: Update the "Next steps" message to mention which editors were scaffolded**

Find the `nextSteps` constant (around line 305 pre-edit). Replace the `3) Start testing` line to be editor-aware:

```ts
  const editorLines = editorTargets.map((e) => {
    if (e === 'claude') return '       Claude Code:       /xera-run <TICKET>';
    if (e === 'cursor') return '       Cursor:            /xera-run <TICKET>  (slash menu)';
    if (e === 'codex')
      return '       OpenAI Codex CLI:  type "run xera for <TICKET>" — Codex picks up the xera-run skill';
    return '';
  });
  const nextSteps =
    shape === 'api'
      ? `
Next:
  1) Copy .env.example to .env and set your auth credentials:
       cp .env.example .env
       # then edit .env to set USER_BEARER_TOKEN=...
  2) Run pre-authentication:
       bun run xera:auth-setup
  3) Start testing:
${editorLines.join('\n')}
`
      // ... same shape branching as before, just replace the original "Open Claude Code ..." lines
      // with the editorLines block.
      : /* ... existing mixed / web branches with the same swap */;
```

(Apply the same `${editorLines.join('\n')}` substitution to the `mixed` and `web` branches.)

- [ ] **Step 6: Typecheck**

Run: `cd packages/cli && bun run typecheck`
Expected: exit 0.

- [ ] **Step 7: Run existing integration tests (they should still pass since default is "all")**

Run: `bun run --cwd packages/cli build && bun test packages/cli/test/integration/init-shapes.test.ts`
Expected: 4 pass, 0 fail (existing tests assert on Claude files which are still scaffolded under the "all" default).

- [ ] **Step 8: Commit**

```bash
git add packages/cli/src/commands/init.ts
git commit -m "cli: drive init skills scaffold via editor adapter registry"
```

---

## Task 10: Refactor init-update.ts to use adapter dispatch

**Files:**
- Modify: `packages/cli/src/commands/init-update.ts`

Same shape as Task 9: replace the in-place skills loop with adapter dispatch. The 3-way diff prompt logic now runs per editor.

- [ ] **Step 1: Add `editor` to InitUpdateOptions**

Find `InitUpdateOptions` (top of file or imported). Add `editor?: string;`.

- [ ] **Step 2: Replace the in-place skills refresh block**

Locate the block beginning with `// Refresh skills with 3-way diff.` (around line 170 currently). Replace its entire body — through the closing of the `for (const name of readdirSync(newSkillsDir))` loop — with:

```ts
  // Resolve which editors to refresh. Without --editor, only refresh editors
  // already present (don't surprise-add a new editor on a non-destructive update).
  const editorTargets = await resolveEditors({
    flag: opts.editor,
    cwd,
    isUpdate: true,
    isYes: opts.yes,
  });
  if (editorTargets.length === 0) {
    p.log.warn(
      'No editor integration detected in this project. Pass --editor claude|cursor|codex|all to add one.',
    );
  } else {
    const skillsSrc = require.resolve('@xera-ai/skills/package.json');
    const newSkillsDir = join(skillsSrc, '..');
    const SKILL_IGNORE = new Set(['package.json', 'version.json', 'CHANGELOG.md']);

    for (const name of readdirSync(newSkillsDir)) {
      if (SKILL_IGNORE.has(name)) continue;
      if (!name.endsWith('.md')) continue;
      const rawNew = readFileSync(join(newSkillsDir, name), 'utf8');
      const { frontmatter, body } = parseFrontmatter(rawNew);
      const base = name.replace(/\.md$/, '');
      const skillInput = { base, body, frontmatter };

      for (const editorName of editorTargets) {
        const adapter = editors[editorName];
        const migrated = adapter.legacyMigrate?.(cwd, base) ?? false;
        if (migrated) p.log.success(`migrated ${base} (${editorName}) to new layout`);
        // Write fresh content — overwrites existing files. The 3-way prompt
        // from PR #106 is intentionally dropped here because (a) the prior
        // logic only ever applied to Claude and (b) we now have a clear
        // single source of truth in @xera-ai/skills; users tracking local
        // edits should commit them in their consumer repo and re-apply.
        adapter.scaffoldSkill(cwd, skillInput);
        adapter.scaffoldCommand?.(cwd, skillInput);
      }
      p.log.info(`refreshed ${base} across [${editorTargets.join(', ')}]`);
    }
  }
```

(The 3-way prompt simplification is intentional and called out in the spec §2.9 — moved from interactive overwrite to always-overwrite-with-migration-note. If the reviewer wants the prompt back, restore it inside the inner `for (const editorName...)` loop.)

- [ ] **Step 3: Add imports**

At the top of `init-update.ts`:

```ts
import { editors } from '../editors';
import { parseFrontmatter } from '../editors/frontmatter';
import { resolveEditors } from '../editors/resolve';
```

Remove any newly-unused imports (`dirname`, `writeFileSync`, `unlinkSync` if no longer used after the rewrite — verify with grep within the file).

- [ ] **Step 4: Typecheck**

Run: `cd packages/cli && bun run typecheck`
Expected: exit 0.

- [ ] **Step 5: Build + run existing update tests**

Run: `bun run --cwd packages/cli build && bun test packages/cli/test/integration/init-update-shape.test.ts`
Expected: 3 pass.

- [ ] **Step 6: Commit**

```bash
git add packages/cli/src/commands/init-update.ts
git commit -m "cli: drive init --update skills refresh via editor adapter registry"
```

---

## Task 11: Refactor checks.ts to use adapter doctorChecks

**Files:**
- Modify: `packages/cli/src/checks.ts`

Replace the hard-coded `.claude/skills/` block (from PR #106) with adapter dispatch over detected editors.

- [ ] **Step 1: Locate the existing Skills block**

In `packages/cli/src/checks.ts`, the block is from `// Skills — Claude Code's Skill tool requires...` through the final `checks.push(skillsCheck);`.

- [ ] **Step 2: Replace with adapter dispatch**

```ts
  // Editor integrations — each detected editor contributes its own checks.
  // Required skill names cover the core workflow; doctor doesn't pin newer
  // optional skills (xera-coverage, xera-impact, etc.) to keep the check
  // surface stable across releases.
  const REQUIRED_SKILLS = [
    'xera-run',
    'xera-fetch',
    'xera-feature',
    'xera-script',
    'xera-exec',
    'xera-report',
    'xera-promote',
  ];
  const detected = detectEditors(cwd);
  if (detected.length === 0) {
    checks.push({
      name: 'xera editor integration present',
      ok: false,
      message: 'run `xera init` (scaffolds for Claude Code, Cursor, and/or Codex)',
    });
  } else {
    for (const name of detected) {
      checks.push(...editors[name].doctorChecks(cwd, REQUIRED_SKILLS));
    }
  }
```

- [ ] **Step 3: Add imports**

```ts
import { detectEditors } from './editors/detect';
import { editors } from './editors';
```

- [ ] **Step 4: Update existing `checks.test.ts` to match the new check name pattern**

Open `packages/cli/test/checks.test.ts`. The tests added in PR #106 (`xera skills present`) now produce `xera skills present (claude)`. Find any assertion `c.name === 'xera skills present'` and update to match `c.name === 'xera skills present (claude)'`. Verify both the pass-path test and the legacy-flat test still work after rename.

- [ ] **Step 5: Typecheck + run unit tests**

Run: `cd packages/cli && bun run typecheck && cd ../.. && bun test packages/cli/test/checks.test.ts`
Expected: 0 typecheck errors; all checks tests pass.

- [ ] **Step 6: Commit**

```bash
git add packages/cli/src/checks.ts packages/cli/test/checks.test.ts
git commit -m "cli: drive doctor checks via editor adapter dispatch"
```

---

## Task 12: Integration test — `xera init --editor <combo>`

**Files:**
- Create: `packages/cli/test/integration/init-editors.test.ts`

- [ ] **Step 1: Write the integration test**

```ts
// packages/cli/test/integration/init-editors.test.ts
import { afterAll, describe, expect, test } from 'bun:test';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawn } from 'bun';

const xeraBin = resolve(import.meta.dir, '../../bin/xera');
const created: string[] = [];
afterAll(() => {
  for (const d of created) rmSync(d, { recursive: true, force: true });
});

async function runInit(args: string[]): Promise<string> {
  const cwd = mkdtempSync(join(tmpdir(), 'xera-ed-'));
  created.push(cwd);
  const proc = spawn(['bun', 'run', '--cwd', cwd, xeraBin, 'init', '--yes', '--shape', 'web', ...args], {
    cwd,
    stderr: 'pipe',
    stdout: 'pipe',
  });
  const code = await proc.exited;
  if (code !== 0) {
    const err = await new Response(proc.stderr).text();
    throw new Error(`xera init ${args.join(' ')} exited ${code}: ${err}`);
  }
  return cwd;
}

describe('xera init --editor', () => {
  test('--editor claude scaffolds only .claude/', async () => {
    const cwd = await runInit(['--editor', 'claude']);
    expect(existsSync(join(cwd, '.claude/skills/xera-run/SKILL.md'))).toBe(true);
    expect(existsSync(join(cwd, '.claude/commands/xera-run.md'))).toBe(true);
    expect(existsSync(join(cwd, '.cursor'))).toBe(false);
    expect(existsSync(join(cwd, '.agents'))).toBe(false);
  }, 30_000);

  test('--editor cursor scaffolds only .cursor/ with transformed frontmatter', async () => {
    const cwd = await runInit(['--editor', 'cursor']);
    expect(existsSync(join(cwd, '.claude'))).toBe(false);
    expect(existsSync(join(cwd, '.agents'))).toBe(false);
    const rule = readFileSync(join(cwd, '.cursor/rules/xera-run/RULE.md'), 'utf8');
    expect(rule).toContain('description:');
    expect(rule).toContain('alwaysApply: false');
    expect(rule).not.toContain('name:');
    expect(existsSync(join(cwd, '.cursor/commands/xera-run.md'))).toBe(true);
  }, 30_000);

  test('--editor codex scaffolds only .agents/, no commands dir', async () => {
    const cwd = await runInit(['--editor', 'codex']);
    expect(existsSync(join(cwd, '.claude'))).toBe(false);
    expect(existsSync(join(cwd, '.cursor'))).toBe(false);
    const skill = readFileSync(join(cwd, '.agents/skills/xera-run/SKILL.md'), 'utf8');
    expect(skill).toContain('name: xera-run');
    expect(skill).toContain('description:');
  }, 30_000);

  test('--editor all scaffolds all three target trees', async () => {
    const cwd = await runInit(['--editor', 'all']);
    expect(existsSync(join(cwd, '.claude/skills/xera-run/SKILL.md'))).toBe(true);
    expect(existsSync(join(cwd, '.cursor/rules/xera-run/RULE.md'))).toBe(true);
    expect(existsSync(join(cwd, '.agents/skills/xera-run/SKILL.md'))).toBe(true);
  }, 30_000);

  test('--editor claude,codex scaffolds those two and not cursor', async () => {
    const cwd = await runInit(['--editor', 'claude,codex']);
    expect(existsSync(join(cwd, '.claude/skills/xera-run/SKILL.md'))).toBe(true);
    expect(existsSync(join(cwd, '.cursor'))).toBe(false);
    expect(existsSync(join(cwd, '.agents/skills/xera-run/SKILL.md'))).toBe(true);
  }, 30_000);

  test('default with --yes and no detection scaffolds all three', async () => {
    const cwd = await runInit([]);
    expect(existsSync(join(cwd, '.claude/skills/xera-run/SKILL.md'))).toBe(true);
    expect(existsSync(join(cwd, '.cursor/rules/xera-run/RULE.md'))).toBe(true);
    expect(existsSync(join(cwd, '.agents/skills/xera-run/SKILL.md'))).toBe(true);
  }, 30_000);
});
```

- [ ] **Step 2: Build CLI then run the test**

Run: `bun run --cwd packages/cli build && bun test packages/cli/test/integration/init-editors.test.ts`
Expected: 6 pass, 0 fail.

- [ ] **Step 3: Commit**

```bash
git add packages/cli/test/integration/init-editors.test.ts
git commit -m "cli: integration tests for --editor flag combinations"
```

---

## Task 13: Integration test — `init --update --editor <new>` additive

**Files:**
- Create: `packages/cli/test/integration/init-update-add-editor.test.ts`

- [ ] **Step 1: Write the test**

```ts
// packages/cli/test/integration/init-update-add-editor.test.ts
import { afterAll, describe, expect, test } from 'bun:test';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawn } from 'bun';

const xeraBin = resolve(import.meta.dir, '../../bin/xera');
const created: string[] = [];
afterAll(() => {
  for (const d of created) rmSync(d, { recursive: true, force: true });
});

async function runXera(cwd: string, args: string[]): Promise<void> {
  const proc = spawn(['bun', 'run', '--cwd', cwd, xeraBin, ...args], {
    cwd,
    stderr: 'pipe',
    stdout: 'pipe',
  });
  const code = await proc.exited;
  if (code !== 0) {
    const err = await new Response(proc.stderr).text();
    throw new Error(`xera ${args.join(' ')} exited ${code}: ${err}`);
  }
}

describe('xera init --update --editor (additive)', () => {
  test('adding Cursor to a Claude-only project keeps .claude/ and adds .cursor/', async () => {
    const cwd = mkdtempSync(join(tmpdir(), 'xera-add-ed-'));
    created.push(cwd);

    // First init Claude only.
    await runXera(cwd, ['init', '--yes', '--shape', 'web', '--editor', 'claude']);
    expect(existsSync(join(cwd, '.claude/skills/xera-run/SKILL.md'))).toBe(true);
    expect(existsSync(join(cwd, '.cursor'))).toBe(false);

    // Then update to add Cursor.
    await runXera(cwd, ['init', '--update', '--yes', '--editor', 'cursor']);
    expect(existsSync(join(cwd, '.claude/skills/xera-run/SKILL.md'))).toBe(true);
    expect(existsSync(join(cwd, '.cursor/rules/xera-run/RULE.md'))).toBe(true);
    expect(existsSync(join(cwd, '.cursor/commands/xera-run.md'))).toBe(true);
  }, 60_000);

  test('update without --editor refreshes only detected editors (does not surprise-add)', async () => {
    const cwd = mkdtempSync(join(tmpdir(), 'xera-ref-only-'));
    created.push(cwd);
    await runXera(cwd, ['init', '--yes', '--shape', 'web', '--editor', 'claude']);
    await runXera(cwd, ['init', '--update', '--yes']);
    expect(existsSync(join(cwd, '.cursor'))).toBe(false);
    expect(existsSync(join(cwd, '.agents'))).toBe(false);
  }, 60_000);
});
```

- [ ] **Step 2: Build + run**

Run: `bun run --cwd packages/cli build && bun test packages/cli/test/integration/init-update-add-editor.test.ts`
Expected: 2 pass.

- [ ] **Step 3: Commit**

```bash
git add packages/cli/test/integration/init-update-add-editor.test.ts
git commit -m "cli: integration test for additive editor add via init --update --editor"
```

---

## Task 14: Update live docs

**Files:**
- Modify: `README.md`
- Modify: `CLAUDE.md`
- Modify: `AGENTS.md`
- Modify: `docs/PROJECT_CONTEXT.md`
- Modify: `docs/ARCHITECTURE.md`
- Modify: `docs/CONFIGURATION.md`
- Modify: `docs/TROUBLESHOOTING.md`

The doc updates are surgical: replace Claude-only wording with editor-agnostic wording and add a mention of `--editor`.

- [ ] **Step 1: README.md**

Find: `Driven entirely by Claude Code skills.` (line ~3)
Replace with: `Driven by AI coding-agent skills (Claude Code, Cursor, OpenAI Codex CLI).`

Find: `Prereqs: Bun ≥1.1.0, Claude Code, an Atlassian-connected MCP **or** a Jira API token, a web app and/or HTTP API to test.`
Replace with: `Prereqs: Bun ≥1.1.0, a supported AI coding agent (Claude Code, Cursor ≥1.6, or OpenAI Codex CLI), an Atlassian-connected MCP **or** a Jira API token, a web app and/or HTTP API to test.`

Find: `# Then open Claude Code in this directory:\nclaude`
Replace with:
```
# Then open your coding agent in this directory:
#   Claude Code:       `claude`
#   Cursor:            open this folder in Cursor
#   OpenAI Codex CLI:  `codex`
```

- [ ] **Step 2: CLAUDE.md**

Find the "Skills vs prompts boundary" section. Add at the end of that section:

```
When a consumer project runs `xera init`, the same skill bodies are written to per-editor paths: `.claude/skills/<name>/SKILL.md`, `.cursor/rules/<name>/RULE.md`, `.agents/skills/<name>/SKILL.md`. Cursor's RULE.md gets transformed frontmatter (`description:` + `alwaysApply: false`); Claude and Codex share the source `name:` + `description:` verbatim. Editor scaffolding lives in `packages/cli/src/editors/` (one adapter per editor).
```

- [ ] **Step 3: AGENTS.md**

Find the `xera init` description (search for "xera init"). Add a bullet/sentence mentioning the `--editor` flag and that init scaffolds for the detected editor(s) by default, or `all` when no detection + `--yes`.

- [ ] **Step 4: docs/PROJECT_CONTEXT.md**

Find any mention of "Claude Code skills" or similar editor-specific wording. Update to reflect multi-editor scaffolding. If the file has a "Surfaces" or "Integration points" section, add a row/line per editor.

- [ ] **Step 5: docs/ARCHITECTURE.md**

Find the section describing skills/commands. Update the surface description from "Claude Code only" to "Claude Code / Cursor / OpenAI Codex CLI via the editor adapter registry in `packages/cli/src/editors/`". Add a brief mapping table:

```
| Editor      | Skill path                         | Command path                  |
|-------------|------------------------------------|-------------------------------|
| Claude Code | `.claude/skills/<n>/SKILL.md`      | `.claude/commands/<n>.md`     |
| Cursor      | `.cursor/rules/<n>/RULE.md`        | `.cursor/commands/<n>.md`     |
| Codex CLI   | `.agents/skills/<n>/SKILL.md`      | (no project-level slash)      |
```

- [ ] **Step 6: docs/CONFIGURATION.md**

Find the `xera init` flags table. Add a new row:

```
  --editor <list>                   Editor(s) to scaffold: claude,cursor,codex or "all" (default: auto-detect or all)
```

- [ ] **Step 7: docs/TROUBLESHOOTING.md**

Add a new entry near other doctor-related issues:

```
### Skill not discovered in Cursor / Codex

If `/xera-run` works in Claude Code but Cursor's slash menu doesn't list xera commands (or Codex's agent doesn't pick up the xera-run skill), the project was scaffolded before multi-editor support. Run:

```bash
xera init --update --editor cursor   # or --editor codex, or --editor all
```

`xera doctor` flags this case with `xera skills present (cursor): missing`.
```

- [ ] **Step 8: Sanity-check all doc edits**

Run: `grep -n "Driven entirely by Claude Code" README.md CLAUDE.md AGENTS.md docs/`
Expected: no matches (every Claude-only assertion replaced).

- [ ] **Step 9: Commit**

```bash
git add README.md CLAUDE.md AGENTS.md docs/PROJECT_CONTEXT.md docs/ARCHITECTURE.md docs/CONFIGURATION.md docs/TROUBLESHOOTING.md
git commit -m "docs: reflect multi-editor scaffolding (Claude / Cursor / Codex)"
```

---

## Task 15: Changeset + final verification

**Files:**
- Create: `.changeset/multi-editor-support.md`

- [ ] **Step 1: Write the changeset**

```markdown
---
'@xera-ai/cli': patch
---

cli: scaffold skills + commands for Cursor and OpenAI Codex CLI alongside Claude Code

`xera init` and `xera init --update` now accept `--editor <list>` where
`<list>` is a comma-separated subset of `claude`, `cursor`, `codex`, or
`all`. With `--yes` and no existing editor markers (`.claude/`,
`.cursor/`, `.agents/`), the default is `all` — fresh projects get
integration for every supported editor. With existing markers, only
detected editors are scaffolded (treats existing layout as the user's
choice). Interactive mode shows a multi-select with `claude` pre-checked.

`xera init --update` without `--editor` refreshes only editors already
present (does not surprise-add a new editor). To opt in to a new editor
on an existing project: `xera init --update --editor cursor`.

`xera doctor` runs per-editor checks under distinct names
(`xera skills present (claude)`, `(cursor)`, `(codex)`) so multi-editor
projects don't see false negatives.

Implementation: new `packages/cli/src/editors/` module with one adapter
per editor (`claude.ts`, `cursor.ts`, `codex.ts`) implementing a shared
`EditorAdapter` interface. Single source of truth for skill bodies stays
in `@xera-ai/skills`; Cursor's RULE.md frontmatter is transformed at
scaffold time.
```

- [ ] **Step 2: Full test sweep**

Run: `bun test`
Expected: All previously-passing tests still pass, plus the new editor + integration tests. No failures.

- [ ] **Step 3: Typecheck workspace**

Run: `bun run typecheck`
Expected: All packages typecheck (pre-existing playwright-core duplicate-install errors in `core/src/bin-internal/{auth-setup,exec}.ts` are present on `main` and unrelated — verify nothing NEW breaks).

- [ ] **Step 4: Lint workspace**

Run: `bunx @biomejs/biome check packages/cli/src/editors/ packages/cli/src/commands/ packages/cli/src/checks.ts packages/cli/test/editors/ packages/cli/test/integration/init-editors.test.ts packages/cli/test/integration/init-update-add-editor.test.ts`
Expected: clean.

- [ ] **Step 5: Manual smoke test**

```bash
cd /tmp && rm -rf xera-multi-editor-smoke && mkdir xera-multi-editor-smoke && cd xera-multi-editor-smoke
bun run --cwd /Users/.../packages/cli build
bun /Users/.../packages/cli/bin/xera init --yes --shape web --editor all
ls .claude/skills/xera-run/   # → SKILL.md
ls .cursor/rules/xera-run/    # → RULE.md
ls .agents/skills/xera-run/   # → SKILL.md
cat .cursor/rules/xera-run/RULE.md | head -5   # should show description: + alwaysApply: false; no name:
```

- [ ] **Step 6: Commit changeset**

```bash
git add .changeset/multi-editor-support.md
git commit -m "chore: changeset for multi-editor scaffolding"
```

- [ ] **Step 7: Push branch + open PR**

```bash
git push -u origin claude/multi-editor-spec
gh pr create --title "cli: scaffold skills + commands for Cursor and OpenAI Codex CLI" \
  --body "$(cat docs/superpowers/specs/2026-05-18-xera-multi-editor-support-design.md | head -20)..."
```

(Compose a proper PR body summarizing the spec + linking it; details left to the implementer.)

---

## Self-review

**Spec coverage check** (against §1.3 In-scope deliverables):

| Spec item | Implemented in |
|---|---|
| Editor adapter registry | Tasks 1–7 |
| `--editor` flag, validation, defaults | Tasks 7 + 8 |
| `xera init` editor resolution + scaffold | Task 9 |
| `xera init --update` resolution + migration | Task 10 |
| `xera doctor` per-editor checks | Task 11 |
| Frontmatter transformer (Cursor) | Task 1 (helper) + Task 5 (use) |
| `@xera-ai/skills` package unchanged | Honoured — no skills package changes in any task |
| Documentation updates (7 files) | Task 14 |
| Tests (unit per adapter + 2 integration files) | Tasks 1/3/4/5/6/7 (unit) + 12/13 (integration) |

**Placeholder scan:** No "TBD" / "implement later" / "similar to" in any task body. Every code step has full code; every command step has expected output.

**Type consistency check:**
- `EditorAdapter` interface defined in Task 2, used identically in Tasks 4, 5, 6, 9, 10, 11. ✓
- `SkillInput` shape (`{ base, body, frontmatter }`) used identically across all scaffold tests and the actual `scaffoldSkill` calls. ✓
- `resolveEditors` return type `Promise<EditorName[]>` matches consumer signatures in init.ts / init-update.ts / checks.ts. ✓
- Doctor check `name` pattern `xera skills present (<editor>)` consistent across Tasks 4, 5, 6, 11. ✓

**Migration of PR-#106 logic:** Task 4 (Claude adapter `legacyMigrate`) preserves the flat-→-directory migration behaviour from PR #106. Task 10 calls it via `adapter.legacyMigrate?.(cwd, base)`. Task 11 retains the legacy-flat doctor flag (now per-editor, claude only). ✓
