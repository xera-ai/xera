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
