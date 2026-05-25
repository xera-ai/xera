import { join } from 'node:path';
import { describe, expect, test } from 'vitest';
import { loadOpenApi } from '../../src/openapi/loader';

describe('loadOpenApi', () => {
  test('parses YAML and dereferences $ref', async () => {
    const spec = await loadOpenApi(join(import.meta.dirname, 'fixtures', 'users.yaml'));
    expect(spec).not.toBeNull();
    expect(spec?.paths['/users']?.post).toBeDefined();
    const respSchema =
      spec?.paths['/users']?.post?.responses?.['201']?.content?.['application/json']?.schema;
    expect(respSchema?.type).toBe('object');
    expect(respSchema?.required).toContain('id');
  });

  test('returns null on missing file path', async () => {
    const result = await loadOpenApi('/no/such/file.yaml');
    expect(result).toBeNull();
  });

  test('throws on malformed YAML', async () => {
    await expect(
      loadOpenApi(join(import.meta.dirname, 'fixtures', 'malformed.yaml')),
    ).rejects.toThrow();
  });
});
