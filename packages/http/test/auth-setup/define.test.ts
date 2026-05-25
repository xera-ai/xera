import { describe, expect, test } from 'vitest';
import { defineHttpAuthSetup } from '../../src/auth-setup/define';

describe('defineHttpAuthSetup', () => {
  test('returns the function as-is (type-narrow helper)', () => {
    const fn = async () => ({ type: 'bearer' as const, token: 'x' });
    expect(defineHttpAuthSetup(fn)).toBe(fn);
  });
});
