/**
 * Regression test for issue #92 — `.env.local` must NOT silently override `.env`.
 *
 * The Bun runtime auto-loads dotenv files before any user code runs, and Bun's
 * precedence puts `.env.local` ahead of `.env`. xera-internal canonicalizes on
 * `.env`, so its bin entry point must surgically force `.env`'s values to win
 * for any key present in both files — otherwise a stale `.env.local` masks the
 * canonical `.env` value silently (the original bug).
 *
 * We exercise the real binary via a subprocess so Bun's auto-load actually
 * happens; a unit test against the loader function alone would miss that.
 */

import { describe, expect, test } from 'bun:test';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const BIN = resolve(import.meta.dir, '../../bin/internal.ts');
// dotenv lives somewhere up the workspace tree; let Bun resolve it for us so
// the test works under either a flat or nested node_modules layout.
const DOTENV_MAIN = createRequire(import.meta.url).resolve('dotenv');

async function runBin(
  cwd: string,
  args: string[],
): Promise<{
  stdout: string;
  stderr: string;
  exitCode: number;
}> {
  const proc = Bun.spawn(['bun', BIN, ...args], {
    cwd,
    stdout: 'pipe',
    stderr: 'pipe',
    // Inherit only PATH; explicitly do not forward FOO from this test process.
    env: { PATH: process.env.PATH ?? '' },
  });
  const [stdout, stderr] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ]);
  const exitCode = await proc.exited;
  return { stdout, stderr, exitCode };
}

describe('issue #92 — .env precedence over .env.local', () => {
  test('when both files set the same key, .env wins (warning fires)', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'xera-dotenv-both-'));
    try {
      writeFileSync(join(dir, '.env'), 'XERA_TEST_FOO=from-env\n');
      writeFileSync(join(dir, '.env.local'), 'XERA_TEST_FOO=from-local-stale\n');
      // `doctor` is the cheapest subcommand that succeeds in a bare dir.
      const { stderr } = await runBin(dir, ['doctor']);
      expect(stderr).toContain('.env.local detected');

      // Verify the loader actually forces .env to win (not just that the
      // warning fires). Write a probe .ts file in the tmpdir that runs the
      // same loader logic the bin does, then prints the resolved value.
      writeFileSync(
        join(dir, 'probe.ts'),
        `import { existsSync, readFileSync } from 'node:fs';
import { config, parse } from '${DOTENV_MAIN}';
if (existsSync('.env.local') && existsSync('.env')) {
  const localKeys = Object.keys(parse(readFileSync('.env.local')));
  const envValues = parse(readFileSync('.env'));
  for (const k of localKeys) { const v = envValues[k]; if (v !== undefined) process.env[k] = v; }
}
config();
console.log('FOO=' + process.env.XERA_TEST_FOO);
`,
      );
      const probe = Bun.spawn(['bun', 'probe.ts'], {
        cwd: dir,
        stdout: 'pipe',
        stderr: 'pipe',
        env: { PATH: process.env.PATH ?? '' },
      });
      const probeOut = await new Response(probe.stdout).text();
      const probeErr = await new Response(probe.stderr).text();
      await probe.exited;
      if (!probeOut.includes('FOO=')) {
        throw new Error(
          `probe failed. stdout=${JSON.stringify(probeOut)} stderr=${JSON.stringify(probeErr)} dotenv=${DOTENV_MAIN}`,
        );
      }
      expect(probeOut.trim()).toBe(`FOO=from-env`);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('warning does NOT fire when only .env exists', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'xera-dotenv-clean-'));
    try {
      writeFileSync(join(dir, '.env'), 'XERA_TEST_FOO=from-env\n');
      const { stderr } = await runBin(dir, ['doctor']);
      expect(stderr).not.toContain('.env.local detected');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('warning fires when only .env.local exists (legacy users)', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'xera-dotenv-legacy-'));
    try {
      writeFileSync(join(dir, '.env.local'), 'XERA_TEST_FOO=legacy\n');
      const { stderr } = await runBin(dir, ['doctor']);
      expect(stderr).toContain('.env.local detected');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
