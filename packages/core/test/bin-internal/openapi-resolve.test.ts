import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { openapiResolveCmd } from '../../src/bin-internal/openapi-resolve';

const DEFINE_PATH = resolve(__dirname, '../../src/config/define.ts');

const JIRA_BLOCK = `jira: { baseUrl: 'https://example.atlassian.net', projectKeys: ['SAMPLE'], fields: { story: 'description' } },`;

function writeConfigWithHttp(dir: string, specRelOrUrl: string | null): void {
  const specLine = specRelOrUrl ? `      spec: '${specRelOrUrl}',\n` : '';
  writeFileSync(
    join(dir, 'xera.config.ts'),
    `import { defineConfig } from '${DEFINE_PATH}';\n` +
      `export default defineConfig({\n` +
      `  ${JIRA_BLOCK}\n` +
      `  http: {\n` +
      `    baseUrl: { local: 'http://localhost:4100' },\n` +
      `    defaultEnv: 'local',\n` +
      specLine +
      `    auth: { strategy: 'bearer', roles: { user: { tokenEnv: 'USER_TOKEN' } } },\n` +
      `  },\n` +
      `  adapters: ['http'],\n` +
      `});\n`,
  );
}

function makeProject(): string {
  return mkdtempSync(join(tmpdir(), 'xera-openapi-resolve-'));
}

const SAMPLE_OPENAPI_YAML = `openapi: 3.0.0
info: { title: T, version: 1.0.0 }
paths:
  /users:
    post:
      responses:
        '201':
          content:
            application/json:
              schema: { $ref: '#/components/schemas/User' }
components:
  schemas:
    User:
      type: object
      required: [id]
      properties:
        id: { type: string }
`;

describe('openapi-resolve subcommand', () => {
  let dir: string;
  const origCwd = process.cwd();

  beforeEach(() => {
    dir = makeProject();
    process.chdir(dir);
  });

  afterEach(() => {
    process.chdir(origCwd);
    rmSync(dir, { recursive: true, force: true });
  });

  test('writes openapi: null when http.spec is not configured', async () => {
    writeConfigWithHttp(dir, null);
    const code = await openapiResolveCmd(['SAMPLE-001']);
    expect(code).toBe(0);
    const out = JSON.parse(readFileSync(join(dir, '.xera/SAMPLE-001/openapi-input.json'), 'utf8'));
    expect(out.openapi).toBeNull();
    expect(out.reason).toContain('not configured');
  });

  test('loads + dereferences a relative spec path', async () => {
    writeFileSync(join(dir, 'openapi.yaml'), SAMPLE_OPENAPI_YAML);
    writeConfigWithHttp(dir, './openapi.yaml');
    const code = await openapiResolveCmd(['SAMPLE-001']);
    expect(code).toBe(0);
    const out = JSON.parse(readFileSync(join(dir, '.xera/SAMPLE-001/openapi-input.json'), 'utf8'));
    expect(out.openapi).not.toBeNull();
    const schema =
      out.openapi.paths['/users'].post.responses['201'].content['application/json'].schema;
    expect(schema.type).toBe('object');
    expect(schema.required).toContain('id');
  });

  test('writes openapi: null when spec file is missing', async () => {
    writeConfigWithHttp(dir, './does-not-exist.yaml');
    const code = await openapiResolveCmd(['SAMPLE-001']);
    expect(code).toBe(0);
    const out = JSON.parse(readFileSync(join(dir, '.xera/SAMPLE-001/openapi-input.json'), 'utf8'));
    expect(out.openapi).toBeNull();
    expect(out.reason).toMatch(/unreachable|not found/i);
  });

  test('creates the ticket dir when it does not yet exist', async () => {
    writeConfigWithHttp(dir, null);
    const code = await openapiResolveCmd(['SAMPLE-002']);
    expect(code).toBe(0);
    expect(
      readFileSync(join(dir, '.xera/SAMPLE-002/openapi-input.json'), 'utf8').length,
    ).toBeGreaterThan(0);
  });

  test('rejects missing ticket arg with non-zero exit', async () => {
    const code = await openapiResolveCmd([]);
    expect(code).toBe(1);
  });

  test('writes openapi: null when xera.config.ts is missing', async () => {
    mkdirSync(join(dir, '.xera/SAMPLE-001'), { recursive: true });
    const code = await openapiResolveCmd(['SAMPLE-001']);
    expect(code).toBe(0);
    const out = JSON.parse(readFileSync(join(dir, '.xera/SAMPLE-001/openapi-input.json'), 'utf8'));
    expect(out.openapi).toBeNull();
    expect(out.reason).toMatch(/loadConfig failed/);
  });
});
