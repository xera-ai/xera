import { describe, expect, test } from 'vitest';
import { parseSetCookie } from '../../src/runtime/parse-set-cookie';

describe('parseSetCookie', () => {
  test('name=value only', () => {
    expect(parseSetCookie('foo=bar')).toEqual({ name: 'foo', value: 'bar' });
  });
  test('with Domain + Path + Expires', () => {
    const c = parseSetCookie(
      'foo=bar; Domain=.x.com; Path=/; Expires=Sat, 06 Jun 2026 10:00:00 GMT',
    );
    expect(c?.name).toBe('foo');
    expect(c?.domain).toBe('.x.com');
    expect(c?.path).toBe('/');
    expect(c?.expires).toBeGreaterThan(0);
  });
  test('with Max-Age (precedence over Expires)', () => {
    const c = parseSetCookie('foo=bar; Max-Age=600');
    expect(c?.expires).toBeGreaterThan(Math.floor(Date.now() / 1000));
    expect(c?.expires).toBeLessThan(Math.floor(Date.now() / 1000) + 700);
  });
  test('flags HttpOnly + Secure + SameSite', () => {
    const c = parseSetCookie('foo=bar; HttpOnly; Secure; SameSite=None');
    expect(c?.httpOnly).toBe(true);
    expect(c?.secure).toBe(true);
    expect(c?.sameSite).toBe('None');
  });
  test('returns null on garbage', () => {
    expect(parseSetCookie('')).toBeNull();
    expect(parseSetCookie('=bar')).toBeNull();
  });
});
