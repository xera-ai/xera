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
