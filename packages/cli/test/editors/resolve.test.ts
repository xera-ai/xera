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

  test('empty flag value throws (does not silently scaffold zero editors)', async () => {
    await expect(
      resolveEditors({ flag: '', cwd: dir, isUpdate: false, isYes: true }),
    ).rejects.toThrow(/empty value/);
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
