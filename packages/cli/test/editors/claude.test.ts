import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
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

  test('scaffoldCommand is undefined — slash commands resolve through the Skill tool now (#231)', () => {
    expect(claudeAdapter.scaffoldCommand).toBeUndefined();
  });

  test('legacyCleanup removes retired .claude/commands/<base>.md', () => {
    mkdirSync(join(dir, '.claude/commands'), { recursive: true });
    writeFileSync(join(dir, '.claude/commands/xera-run.md'), SRC);
    const cleaned = claudeAdapter.legacyCleanup!(dir, 'xera-run');
    expect(cleaned).toBe(true);
    expect(existsSync(join(dir, '.claude/commands/xera-run.md'))).toBe(false);
  });

  test('legacyCleanup is a no-op when no retired file exists', () => {
    expect(claudeAdapter.legacyCleanup!(dir, 'xera-run')).toBe(false);
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
