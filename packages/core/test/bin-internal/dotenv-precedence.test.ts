/**
 * Regression test for issue #92 — `.env.local` must NOT silently override `.env`.
 *
 * xera-internal canonicalizes on `.env`, so `loadEnv()` must force `.env`'s
 * values to win for any key present in both files — otherwise a stale
 * `.env.local` masks the canonical `.env` value silently (the original bug).
 */

import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadEnv } from '../../src/bin-internal/load-env';

const KEY = 'XERA_TEST_FOO';

describe('issue #92 — .env precedence over .env.local', () => {
  const origCwd = process.cwd();
  let dir: string;
  let errSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'xera-dotenv-'));
    process.chdir(dir);
    delete process.env[KEY];
    errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    process.chdir(origCwd);
    rmSync(dir, { recursive: true, force: true });
    delete process.env[KEY];
    errSpy.mockRestore();
  });

  it('when both files set the same key, .env wins (warning fires)', () => {
    writeFileSync(join(dir, '.env'), `${KEY}=from-env\n`);
    writeFileSync(join(dir, '.env.local'), `${KEY}=from-local-stale\n`);
    loadEnv();
    expect(process.env[KEY]).toBe('from-env');
    expect(errSpy.mock.calls.flat().join(' ')).toContain('.env.local detected');
  });

  it('warning does NOT fire when only .env exists', () => {
    writeFileSync(join(dir, '.env'), `${KEY}=from-env\n`);
    loadEnv();
    expect(errSpy.mock.calls.flat().join(' ')).not.toContain('.env.local detected');
    expect(process.env[KEY]).toBe('from-env');
  });

  it('warning fires when only .env.local exists (legacy users)', () => {
    writeFileSync(join(dir, '.env.local'), `${KEY}=legacy\n`);
    loadEnv();
    expect(errSpy.mock.calls.flat().join(' ')).toContain('.env.local detected');
  });
});
