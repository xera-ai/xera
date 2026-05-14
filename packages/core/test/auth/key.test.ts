import { describe, expect, test } from 'bun:test';
import { AUTH_KEY_ENV, resolveAuthKey } from '../../src/auth/key';

describe('resolveAuthKey', () => {
  test('reads XERA_AUTH_KEY from env', () => {
    process.env[AUTH_KEY_ENV] = 'a'.repeat(64);
    expect(resolveAuthKey()).toBe('a'.repeat(64));
    delete process.env[AUTH_KEY_ENV];
  });

  test('throws when missing', () => {
    delete process.env[AUTH_KEY_ENV];
    expect(() => resolveAuthKey()).toThrow(/XERA_AUTH_KEY/);
  });

  test('throws when wrong length', () => {
    process.env[AUTH_KEY_ENV] = 'short';
    expect(() => resolveAuthKey()).toThrow();
    delete process.env[AUTH_KEY_ENV];
  });
});
