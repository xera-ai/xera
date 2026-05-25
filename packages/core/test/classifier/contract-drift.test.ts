import { describe, expect, test } from 'vitest';
import { classifyContractDrift, type OpenAPIDocument } from '../../src/classifier/contract-drift';

const spec: OpenAPIDocument = {
  paths: {
    '/users': {
      post: {
        responses: {
          '422': {
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['errors'],
                  properties: { errors: { type: 'array' } },
                },
              },
            },
          },
          '201': {
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['id'],
                  properties: { id: { type: 'string' } },
                },
              },
            },
          },
        },
      },
    },
    '/users/{id}': {
      get: {
        responses: {
          '200': {
            content: { 'application/json': { schema: { type: 'object', required: ['id'] } } },
          },
        },
      },
    },
  },
};

describe('classifyContractDrift', () => {
  test('CONTRACT_DRIFT when response missing required field', () => {
    const out = classifyContractDrift({
      calls: [
        {
          method: 'POST',
          url: '/users',
          status: 422,
          respBody: { validation_errors: ['x'] }, // renamed from 'errors'
        },
      ],
      openapi: spec,
    });
    expect(out?.class).toBe('CONTRACT_DRIFT');
  });

  test('CONTRACT_DRIFT when status not enumerated', () => {
    const out = classifyContractDrift({
      calls: [{ method: 'POST', url: '/users', status: 418, respBody: {} }],
      openapi: spec,
    });
    expect(out?.class).toBe('CONTRACT_DRIFT');
  });

  test('CONTRACT_DRIFT when operation method not in spec', () => {
    const out = classifyContractDrift({
      calls: [{ method: 'DELETE', url: '/users', status: 204, respBody: null }],
      openapi: spec,
    });
    expect(out?.class).toBe('CONTRACT_DRIFT');
  });

  test('CONTRACT_DRIFT when path template not in spec', () => {
    const out = classifyContractDrift({
      calls: [{ method: 'POST', url: '/orders', status: 201, respBody: {} }],
      openapi: spec,
    });
    expect(out?.class).toBe('CONTRACT_DRIFT');
  });

  test('matches path with {id} placeholder', () => {
    const out = classifyContractDrift({
      calls: [{ method: 'GET', url: '/users/42', status: 200, respBody: { id: '42' } }],
      openapi: spec,
    });
    expect(out).toBeNull();
  });

  test('returns null when no openapi configured', () => {
    expect(
      classifyContractDrift({
        calls: [{ method: 'POST', url: '/users', status: 422, respBody: { errors: ['x'] } }],
        openapi: null,
      }),
    ).toBeNull();
  });

  test('returns null when response matches schema', () => {
    expect(
      classifyContractDrift({
        calls: [
          {
            method: 'POST',
            url: '/users',
            status: 422,
            respBody: { errors: ['email is required'] },
          },
        ],
        openapi: spec,
      }),
    ).toBeNull();
  });

  test('ignores query string when matching path', () => {
    expect(
      classifyContractDrift({
        calls: [
          { method: 'GET', url: '/users/42?expand=org', status: 200, respBody: { id: '42' } },
        ],
        openapi: spec,
      }),
    ).toBeNull();
  });
});
