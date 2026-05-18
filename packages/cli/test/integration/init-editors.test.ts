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
