import { describe, expect, test } from 'bun:test';
import type { OpenAPIDocument } from '@xera-ai/core';
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
});
