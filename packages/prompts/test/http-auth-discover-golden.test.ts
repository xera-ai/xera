import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';

const ROOT = join(__dirname, '..', '..', '..', 'fixtures/http-auth-discover');

describe('http-auth-discover golden fixtures shape', () => {
  const names = readdirSync(ROOT);
  test('5 fixtures present', () => {
    expect(names.sort()).toEqual([
      'ambiguous',
      'analytics-noise',
      'injection',
      'no-csrf',
      'simple-3-cookies',
    ]);
  });
  for (const name of names) {
    test(`${name} has input.json + expected.md`, () => {
      const input = JSON.parse(readFileSync(join(ROOT, name, 'input.json'), 'utf8'));
      expect(input).toHaveProperty('role');
      expect(input).toHaveProperty('cookies');
      expect(Array.isArray(input.cookies)).toBe(true);
      const md = readFileSync(join(ROOT, name, 'expected.md'), 'utf8');
      expect(md.length).toBeGreaterThan(0);
    });
  }
});
