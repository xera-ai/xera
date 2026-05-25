import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import {
  contractHealPrepare,
  contractHealPrepareCmd,
} from '../../src/bin-internal/contract-heal-prepare';

let root: string;
let prevCwd: string;
beforeEach(() => {
  prevCwd = process.cwd();
  root = mkdtempSync(join(tmpdir(), 'xera-cheal-'));
  process.chdir(root);
});
afterEach(() => {
  process.chdir(prevCwd);
  rmSync(root, { recursive: true, force: true });
});

function writeConfig(opts: { adapter: 'http' | 'web'; spec?: boolean }) {
  const httpBlock =
    "http: { baseUrl: { dev: 'http://localhost:4000' }, defaultEnv: 'dev'" +
    (opts.spec ? ", spec: './openapi.yaml'" : '') +
    ", auth: { strategy: 'none', roles: {} } }";
  const webBlock =
    "web: { baseUrl: { local: 'http://localhost:3000' }, defaultEnv: 'local'" +
    (opts.spec ? ", spec: './openapi.yaml'" : '') +
    ' }';
  const block = opts.adapter === 'http' ? httpBlock : webBlock;
  writeFileSync(
    join(root, 'xera.config.ts'),
    `export default { jira: { baseUrl: 'https://x.atlassian.net', projectKeys: ['PROJ'], fields: { story: 'description' } }, ${block}, adapters: ['${opts.adapter}'] };`,
  );
  if (opts.spec) {
    writeFileSync(
      join(root, 'openapi.yaml'),
      `openapi: 3.0.0
info: { title: T, version: 1.0.0 }
paths:
  /users:
    post:
      responses:
        '201': { content: { application/json: { schema: { type: object, required: [id, email], properties: { id: { type: string } } } } } }
`,
    );
  }
}

function seedTicket(
  ticket: string,
  opts: { adapter: 'http' | 'web'; calls?: unknown[]; spec?: string },
) {
  const dir = join(root, '.xera', ticket);
  mkdirSync(join(dir, 'runs', 'r1'), { recursive: true });
  writeFileSync(
    join(dir, 'meta.json'),
    JSON.stringify({ ticket, adapter: opts.adapter, xera_version: '0', prompts_version: '0' }),
  );
  writeFileSync(
    join(dir, 'runs', 'r1', 'normalized.json'),
    JSON.stringify({ runId: 'r1', http: { calls: opts.calls ?? [] } }),
  );
  if (opts.spec !== undefined) writeFileSync(join(dir, 'spec.ts'), opts.spec);
  writeFileSync(
    join(dir, 'test.feature'),
    'Feature: f\n  Scenario: s\n    When I create a user\n    Then it works\n',
  );
}

describe('contractHealPrepare', () => {
  test('http: assembles drift, contract expectation, and the spec.ts status assertion', async () => {
    writeConfig({ adapter: 'http', spec: true });
    seedTicket('GH-1', {
      adapter: 'http',
      calls: [{ method: 'POST', url: '/users', status: 500, respBody: {} }],
      spec: '  const res = await request.post("/users");\n  expect(res.status()).toBe(201);\n',
    });
    const out = await contractHealPrepare(root, 'GH-1', 'r1', 'create user');
    expect(out.refusable).toBeNull();
    expect(out.drift).toEqual({ method: 'POST', url: '/users', status: 500, respBody: {} });
    expect(out.expected?.documentedStatuses).toEqual(['201']);
    expect(out.expected?.requiredFields).toEqual(['id', 'email']);
    expect(out.assertion?.specLineContent).toContain('toBe(201)');
    expect(out.assertion?.specLine).toBe(2);
  });

  test('web adapter refuses with web-no-assertion', async () => {
    writeConfig({ adapter: 'web', spec: true });
    seedTicket('GH-2', { adapter: 'web', spec: 'whatever' });
    const out = await contractHealPrepare(root, 'GH-2', 'r1', 's');
    expect(out.refusable).toBe('web-no-assertion');
  });

  test('no spec configured refuses with no-spec', async () => {
    writeConfig({ adapter: 'http', spec: false });
    seedTicket('GH-3', {
      adapter: 'http',
      calls: [{ method: 'POST', url: '/users', status: 500 }],
    });
    const out = await contractHealPrepare(root, 'GH-3', 'r1', 's');
    expect(out.refusable).toBe('no-spec');
  });

  test('no locatable status assertion refuses with unsupported-edit', async () => {
    writeConfig({ adapter: 'http', spec: true });
    seedTicket('GH-4', {
      adapter: 'http',
      calls: [{ method: 'POST', url: '/users', status: 500 }],
      spec: '  const res = await request.post("/users");\n  // no status assertion here\n',
    });
    const out = await contractHealPrepare(root, 'GH-4', 'r1', 's');
    expect(out.refusable).toBe('unsupported-edit');
  });

  test('cmd rejects an invalid ticket key', async () => {
    await expect(contractHealPrepareCmd(['bad key', 'r1', 's'])).rejects.toThrow();
  });
});
