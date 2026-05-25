import { describe, expect, test } from 'vitest';
import { resolvePomArea, routeToAreaSlug } from '../../src/graph/route-area';

describe('routeToAreaSlug', () => {
  test('first path segment, slugified', () => {
    expect(routeToAreaSlug('/login')).toBe('login');
    expect(routeToAreaSlug('/settings/profile')).toBe('settings');
    expect(routeToAreaSlug('/')).toBe('root');
    expect(routeToAreaSlug('')).toBe('root');
    expect(routeToAreaSlug(undefined)).toBe('root');
  });
});

describe('resolvePomArea', () => {
  test('falls back to the route slug when no mapping is given', () => {
    expect(resolvePomArea('/', undefined)).toBe('root');
    expect(resolvePomArea('/settings/api-keys', undefined)).toBe('settings');
  });

  test('exact route match wins', () => {
    const map = { '/': 'dashboard', '/login': 'login' };
    expect(resolvePomArea('/', map)).toBe('dashboard');
    expect(resolvePomArea('/login', map)).toBe('login');
  });

  test('longest-prefix match for nested routes', () => {
    const map = { '/settings': 'settings', '/settings/profile': 'profile' };
    expect(resolvePomArea('/settings/profile', map)).toBe('profile');
    expect(resolvePomArea('/settings/api-keys', map)).toBe('settings');
  });

  test('unmapped route falls back to the slug even when a map exists', () => {
    expect(resolvePomArea('/tasks', { '/': 'dashboard' })).toBe('tasks');
  });

  test('the bare "/" key does not prefix-match every route', () => {
    // '/' as a prefix would otherwise swallow all routes; only an exact match
    // or a real path-segment prefix should resolve.
    expect(resolvePomArea('/tasks', { '/': 'dashboard' })).toBe('tasks');
  });
});
