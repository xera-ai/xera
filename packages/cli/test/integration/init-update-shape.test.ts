/**
 * Integration tests for `xera init --update --shape <shape>`.
 *
 * Verifies the fix for issue #91 — when shape upgrade is requested but the
 * existing config doesn't have the matching adapters, `--update` does NOT
 * silently succeed. It prints a clear warning with copy-paste instructions
 * (and never mutates xera.config.ts or shared/auth-setup.ts — the
 * non-destructive guarantee is preserved).
 */

import { afterAll, describe, expect, test } from 'bun:test';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawn } from 'bun';

const xeraBin = resolve(import.meta.dir, '../../bin/xera');

const createdDirs: string[] = [];
afterAll(() => {
  for (const d of createdDirs) rmSync(d, { recursive: true, force: true });
});

async function runXera(
  cwd: string,
  args: string[],
): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  const proc = spawn(['bun', 'run', '--cwd', cwd, xeraBin, ...args], {
    cwd,
    stderr: 'pipe',
    stdout: 'pipe',
  });
  const exitCode = await proc.exited;
  const stdout = await new Response(proc.stdout).text();
  const stderr = await new Response(proc.stderr).text();
  return { exitCode, stdout, stderr };
}

describe('xera init --update --shape mixed (issue #91)', () => {
  test('warns when shape upgrade adds adapters and does NOT mutate config', async () => {
    const cwd = mkdtempSync(join(tmpdir(), 'xera-update-shape-'));
    createdDirs.push(cwd);

    // 1. Start with --shape web
    const init = await runXera(cwd, ['init', '--yes', '--shape', 'web']);
    expect(init.exitCode).toBe(0);

    const cfgBefore = readFileSync(join(cwd, 'xera.config.ts'), 'utf8');
    const authBefore = readFileSync(join(cwd, 'shared/auth-setup.ts'), 'utf8');
    expect(cfgBefore).toContain("adapters: ['web']");
    expect(cfgBefore).not.toContain('http: {');

    // 2. Try to upgrade with --update --shape mixed
    const update = await runXera(cwd, [
      'init',
      '--update',
      '--yes',
      '--shape',
      'mixed',
      '--au',
      'https://api.example.com',
      '--as',
      'bearer',
      '--hr',
      'admin',
    ]);
    expect(update.exitCode).toBe(0);

    // 3. The output (clack writes to stdout) must include the warning + the
    //    rendered http config snippet using user-supplied flags.
    const out = update.stdout + update.stderr;
    expect(out).toContain('Missing adapter(s): http');
    expect(out).toContain('non-destructive');
    expect(out).toContain('https://api.example.com');
    expect(out).toContain('http:');
    expect(out).toContain('defineHttpAuthSetup');
    expect(out).toContain('ADMIN_BEARER_TOKEN');

    // 4. xera.config.ts and shared/auth-setup.ts must be UNCHANGED.
    const cfgAfter = readFileSync(join(cwd, 'xera.config.ts'), 'utf8');
    const authAfter = readFileSync(join(cwd, 'shared/auth-setup.ts'), 'utf8');
    expect(cfgAfter).toBe(cfgBefore);
    expect(authAfter).toBe(authBefore);
  }, 30_000);

  test('no warning when shape matches existing config', async () => {
    const cwd = mkdtempSync(join(tmpdir(), 'xera-update-noop-'));
    createdDirs.push(cwd);

    const init = await runXera(cwd, ['init', '--yes', '--shape', 'web']);
    expect(init.exitCode).toBe(0);

    const update = await runXera(cwd, ['init', '--update', '--yes', '--shape', 'web']);
    expect(update.exitCode).toBe(0);

    const out = update.stdout + update.stderr;
    expect(out).not.toContain('Missing adapter(s)');
    expect(out).toContain("shape 'web' already matches");
  }, 30_000);

  test('warns when shape-related flags passed without --shape', async () => {
    const cwd = mkdtempSync(join(tmpdir(), 'xera-update-orphan-'));
    createdDirs.push(cwd);

    const init = await runXera(cwd, ['init', '--yes', '--shape', 'web']);
    expect(init.exitCode).toBe(0);

    // Pass --au without --shape — the flag would otherwise be silently dropped.
    const update = await runXera(cwd, [
      'init',
      '--update',
      '--yes',
      '--au',
      'https://api.example.com',
    ]);
    expect(update.exitCode).toBe(0);

    const out = update.stdout + update.stderr;
    expect(out).toContain('ignored by init --update without --shape');
  }, 30_000);
});
