import type { OpenAPIDocument } from '@xera-ai/core';
import { describe, expect, test } from 'vitest';
import { findOperation } from '../../src/openapi/find-operation';

const spec: OpenAPIDocument = {
  paths: {
    '/users': { post: { responses: { '201': {} } } },
    '/users/{id}': { get: { responses: { '200': {} } } },
  },
};

describe('findOperation', () => {
  test('finds exact path match', () => {
    const op = findOperation(spec, 'POST', '/users');
    expect(op?.template).toBe('/users');
  });

  test('matches path-parameter template', () => {
    const op = findOperation(spec, 'GET', '/users/123');
    expect(op?.template).toBe('/users/{id}');
  });

  test('returns null for unknown path', () => {
    expect(findOperation(spec, 'GET', '/orders')).toBeNull();
  });

  test('returns null for unknown method on known path', () => {
    expect(findOperation(spec, 'DELETE', '/users/123')).toBeNull();
  });

  test('ignores query string', () => {
    expect(findOperation(spec, 'GET', '/users/42?foo=bar')?.template).toBe('/users/{id}');
  });

  // Issue #193 — Playwright APIRequestContext records absolute URLs in the
  // trace, so the path that flows through normalize → report → contract-heal
  // looks like `http://host:port/users/123`. The lookup must treat absolute
  // and bare-path forms equivalently or CONTRACT_DRIFT silently never fires.
  describe('absolute URLs (issue #193)', () => {
    test('matches http://host/path', () => {
      expect(findOperation(spec, 'POST', 'http://localhost:3100/users')?.template).toBe('/users');
    });

    test('matches https://host/path', () => {
      expect(findOperation(spec, 'GET', 'https://api.example.com/users/42')?.template).toBe(
        '/users/{id}',
      );
    });

    test('strips query from absolute URL too', () => {
      expect(findOperation(spec, 'GET', 'http://localhost:3100/users/42?foo=bar')?.template).toBe(
        '/users/{id}',
      );
    });

    test('absolute URL with unknown path still returns null', () => {
      expect(findOperation(spec, 'GET', 'http://localhost:3100/orders')).toBeNull();
    });
  });
});
