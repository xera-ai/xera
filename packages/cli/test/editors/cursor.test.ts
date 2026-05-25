import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
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
