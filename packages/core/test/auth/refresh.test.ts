import { describe, expect, test } from 'vitest';
import { type AuthStateEntry, needsRefresh, parseDuration } from '../../src/auth/refresh';

describe('parseDuration', () => {
  test('parses h/m/s', () => {
    expect(parseDuration('8h')).toBe(8 * 3600 * 1000);
    expect(parseDuration('30m')).toBe(30 * 60 * 1000);
    expect(parseDuration('45s')).toBe(45 * 1000);
  });
  test('rejects bad input', () => {
    expect(() => parseDuration('forever')).toThrow();
  });
});

describe('needsRefresh', () => {
  const now = new Date('2026-05-14T12:00:00Z');
  const baseEntry: AuthStateEntry = {
    role: 'admin',
    strategy: 'storageState',
    created_at: '2026-05-14T04:00:00.000Z',
    expires_at: '2026-05-14T18:00:00.000Z',
    payload: {},
  };

  test('missing entry needs refresh', () => {
    expect(needsRefresh(null, { ttl: '8h', refreshBuffer: '30m' }, now)).toBe(true);
  });
  test('entry within ttl and not expiring soon: no refresh', () => {
    expect(needsRefresh(baseEntry, { ttl: '24h', refreshBuffer: '30m' }, now)).toBe(false);
  });
  test('entry older than ttl: refresh', () => {
    expect(needsRefresh(baseEntry, { ttl: '4h', refreshBuffer: '30m' }, now)).toBe(true);
  });
  test('expires within refreshBuffer: refresh', () => {
    expect(needsRefresh(baseEntry, { ttl: '24h', refreshBuffer: '7h' }, now)).toBe(true);
  });
});
