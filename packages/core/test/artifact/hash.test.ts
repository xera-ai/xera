import { describe, expect, test } from 'bun:test';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { hashFile, hashFileIfExists, hashString } from '../../src/artifact/hash';

describe('hash utilities', () => {
  test('hashString produces stable sha256 hex prefixed with sha256:', () => {
    expect(hashString('hello')).toBe(
      'sha256:2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824',
    );
  });

  test('hashFile reads and hashes file contents', () => {
    const dir = mkdtempSync(join(tmpdir(), 'xera-hash-'));
    const f = join(dir, 'a.txt');
    writeFileSync(f, 'hello');
    expect(hashFile(f)).toBe(hashString('hello'));
    rmSync(dir, { recursive: true });
  });

  test('hashFileIfExists returns null when file missing', () => {
    expect(hashFileIfExists('/no/such/file.xyz')).toBeNull();
  });
});
