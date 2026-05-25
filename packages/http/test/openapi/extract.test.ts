import { describe, expect, test } from 'bun:test';
import { join } from 'node:path';
import { type ExtractedOperation, extractInfo, extractOperations } from '../../src/openapi/extract';
import { loadOpenApi } from '../../src/openapi/loader';

const MOCK_SPEC = join(import.meta.dir, '../../../../fixtures/mock-api/openapi.yaml');

async function loadMock() {
  const doc = await loadOpenApi(MOCK_SPEC);
  if (!doc) throw new Error(`could not load ${MOCK_SPEC}`);
  return doc;
}

// Inline doc with tags + operationId (mock-api has neither).
const tagged = {
  info: { title: 'Tagged', version: '2.0.0' },
  paths: {
    '/pets': {
      get: { operationId: 'listPets', tags: ['pets', 'public'], responses: { '200': {} } },
      post: { operationId: 'createPet', tags: ['pets'], responses: { '201': {} } },
    },
    '/health': {
      get: { operationId: 'health', tags: ['ops'], responses: { '200': {} } },
    },
  },
};

describe('extractOperations', () => {
  test('flattens the mock-api spec into its operations in stable order', async () => {
    const ops = extractOperations(await loadMock());
    expect(ops.map((o) => `${o.method} ${o.path}`)).toEqual([
      'POST /orders',
      'POST /users',
      'GET /users/{id}',
    ]);
  });

  test('is deterministic across calls', async () => {
    const doc = await loadMock();
    expect(JSON.stringify(extractOperations(doc))).toBe(JSON.stringify(extractOperations(doc)));
  });

  test('extracts path parameters as required', async () => {
    const ops = extractOperations(await loadMock());
    const getById = ops.find((o) => o.path === '/users/{id}');
    expect(getById?.parameters).toEqual([
      { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
    ]);
  });

  test('extracts request body schema', async () => {
    const ops = extractOperations(await loadMock());
    const createUser = ops.find((o) => o.method === 'POST' && o.path === '/users');
    expect((createUser?.requestBodySchema as { required?: string[] })?.required).toEqual([
      'name',
      'email',
    ]);
  });

  test('sorts responses by status', async () => {
    const ops = extractOperations(await loadMock());
    const createUser = ops.find((o) => o.method === 'POST' && o.path === '/users');
    expect(createUser?.responses.map((r) => r.status)).toEqual(['201', '401', '422']);
  });

  test('omits optional fields rather than setting undefined', async () => {
    const ops = extractOperations(await loadMock());
    const createOrder = ops.find((o) => o.path === '/orders');
    expect(createOrder).toBeDefined();
    expect('operationId' in (createOrder as ExtractedOperation)).toBe(false);
    expect('summary' in (createOrder as ExtractedOperation)).toBe(false);
    expect('requestBodySchema' in (createOrder as ExtractedOperation)).toBe(false);
    expect(createOrder?.tags).toEqual([]);
    expect(createOrder?.parameters).toEqual([]);
  });

  test('filters by tag', () => {
    const ops = extractOperations(tagged, { tags: ['ops'] });
    expect(ops.map((o) => o.operationId)).toEqual(['health']);
  });

  test('filters by operationId', () => {
    const ops = extractOperations(tagged, { operationIds: ['createPet'] });
    expect(ops.map((o) => o.operationId)).toEqual(['createPet']);
  });

  test('filters by path', () => {
    const ops = extractOperations(tagged, { paths: ['/pets'] });
    expect(ops.map((o) => o.operationId)).toEqual(['listPets', 'createPet']);
  });

  test('unions across filter dimensions', () => {
    const ops = extractOperations(tagged, { tags: ['ops'], operationIds: ['createPet'] });
    expect(ops.map((o) => o.operationId).sort()).toEqual(['createPet', 'health']);
  });

  test('empty filter includes everything', () => {
    expect(extractOperations(tagged, {}).length).toBe(3);
  });
});

describe('extractInfo', () => {
  test('reads title and version', async () => {
    expect(extractInfo(await loadMock())).toEqual({ title: 'Mock API', version: '1.0.0' });
  });

  test('defaults when info missing', () => {
    expect(extractInfo({ paths: {} })).toEqual({ title: 'API', version: '0.0.0' });
  });
});
