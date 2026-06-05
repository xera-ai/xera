import { describe, expect, test } from 'vitest';
import { cookieMatcher, globToRegex, pickOne, serializeMatch } from '../../src/auth-setup/match';

describe('globToRegex', () => {
  test('star matches any chars', () => {
    expect(globToRegex('*_at').test('session_at')).toBe(true);
    expect(globToRegex('*_at').test('session_rt')).toBe(false);
  });
  test('question mark matches one char', () => {
    expect(globToRegex('a?c').test('abc')).toBe(true);
    expect(globToRegex('a?c').test('abbc')).toBe(false);
  });
  test('escapes regex meta', () => {
    expect(globToRegex('a.b').test('a.b')).toBe(true);
    expect(globToRegex('a.b').test('aXb')).toBe(false);
  });
});

describe('cookieMatcher', () => {
  test('literal exact-matches name', () => {
    const m = cookieMatcher({ literal: 'session_at' });
    expect(m('session_at')).toBe(true);
    expect(m('session_at_x')).toBe(false);
  });
  test('glob matches with wildcards', () => {
    const m = cookieMatcher({ glob: '*_at' });
    expect(m('session_at')).toBe(true);
    expect(m('xx_at')).toBe(true);
    expect(m('at_')).toBe(false);
  });
  test('regex matches case-insensitively', () => {
    const m = cookieMatcher({ regex: '_AT$' });
    expect(m('session_at')).toBe(true);
    expect(m('session_AT')).toBe(true);
  });
});

describe('pickOne', () => {
  const cookies = [
    { name: 'session_at', value: 'a', domain: '.x.com', path: '/' },
    { name: 'session_rt', value: 'r', domain: '.x.com', path: '/' },
    { name: '_ga',        value: 'g', domain: '.x.com', path: '/' },
  ];
  test('returns first match', () => {
    expect(pickOne(cookies, { regex: '_at$' })?.name).toBe('session_at');
  });
  test('returns undefined when no match', () => {
    expect(pickOne(cookies, { literal: 'csrf' })).toBeUndefined();
  });
});

describe('serializeMatch', () => {
  test('round-trips each variant', () => {
    expect(serializeMatch({ literal: 'x' })).toEqual({ literal: 'x' });
    expect(serializeMatch({ glob: '*_at' })).toEqual({ glob: '*_at' });
    expect(serializeMatch({ regex: '_at$' })).toEqual({ regex: '_at$' });
  });
});
