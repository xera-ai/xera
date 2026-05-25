import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { apiPath } from '../../src/runtime';

const ORIG_BASE = process.env.XERA_BASE_URL;
beforeEach(() => {
  delete process.env.XERA_BASE_URL;
});
afterEach(() => {
  if (ORIG_BASE === undefined) delete process.env.XERA_BASE_URL;
  else process.env.XERA_BASE_URL = ORIG_BASE;
});

// Issue #194 — Playwright's `request.newContext({ baseURL })` resolves paths
// via `new URL(path, baseURL)`. A leading-/ path collapses any path component
// in baseURL: `new URL('/auth/login', 'http://host/api/v1').href` →
// `'http://host/auth/login'`. So tests written as `api.post('/auth/login',…)`
// against `baseURL: 'http://host/api/v1'` hit 404. `apiPath()` builds the
// correct absolute URL by string-concatenating XERA_BASE_URL + path.
describe('apiPath (issue #194)', () => {
  test('joins path under baseURL that has a path component', () => {
    process.env.XERA_BASE_URL = 'http://localhost:3100/api/v1';
    expect(apiPath('/auth/login')).toBe('http://localhost:3100/api/v1/auth/login');
  });

  test('handles trailing slash on baseURL', () => {
    process.env.XERA_BASE_URL = 'http://localhost:3100/api/v1/';
    expect(apiPath('/auth/login')).toBe('http://localhost:3100/api/v1/auth/login');
  });

  test('handles missing leading slash on path', () => {
    process.env.XERA_BASE_URL = 'http://localhost:3100/api/v1';
    expect(apiPath('auth/login')).toBe('http://localhost:3100/api/v1/auth/login');
  });

  test('works with origin-only baseURL', () => {
    process.env.XERA_BASE_URL = 'https://api.example.com';
    expect(apiPath('/users/42')).toBe('https://api.example.com/users/42');
  });

  test('preserves query strings', () => {
    process.env.XERA_BASE_URL = 'http://localhost:3100/api/v1';
    expect(apiPath('/users?limit=10')).toBe('http://localhost:3100/api/v1/users?limit=10');
  });

  test('throws when XERA_BASE_URL is not set', () => {
    expect(() => apiPath('/users')).toThrow(/XERA_BASE_URL/);
  });
});
