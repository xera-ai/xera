import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { classifyDriftCmd } from '../../src/bin-internal/classify-drift';

let root: string;
let prevCwd: string;
beforeEach(() => {
  prevCwd = process.cwd();
  root = mkdtempSync(join(tmpdir(), 'xera-cd-'));
  process.chdir(root);
});
afterEach(() => {
  process.chdir(prevCwd);
  rmSync(root, { recursive: true, force: true });
});

function writeHttpProject() {
  writeFileSync(
    join(root, 'xera.config.ts'),
    `export default { jira: { baseUrl: 'https://x.atlassian.net', projectKeys: ['PROJ'], fields: { story: 'description' } }, http: { baseUrl: { dev: 'http://localhost:3000' }, defaultEnv: 'dev', spec: './openapi.yaml', auth: { strategy: 'none', roles: {} } }, adapters: ['http'] };`,
  );
  writeFileSync(
    join(root, 'openapi.yaml'),
    `openapi: 3.0.0
info: { title: T, version: 1.0.0 }
paths:
  /login:
    post:
      responses:
        '200': { content: { application/json: { schema: { type: object } } } }
`,
  );
}

function writeMeta(ticket: string, adapter: 'http' | 'web') {
  const dir = join(root, '.xera', ticket);
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, 'meta.json'),
    JSON.stringify({ ticket, adapter, xera_version: '0', prompts_version: '0' }),
  );
}

function writeNormalized(
  ticket: string,
  runId: string,
  calls: Array<{ method: string; url: string; status: number; respBody?: unknown }>,
  scenarios: Array<{ name: string; outcome: string }>,
) {
  const runDir = join(root, '.xera', ticket, 'runs', runId);
  mkdirSync(runDir, { recursive: true });
  writeFileSync(
    join(runDir, 'normalized.json'),
    JSON.stringify({ runId, outcome: 'FAIL', scenarios, http: { calls } }),
  );
}

function readResult(ticket: string, runId: string) {
  return JSON.parse(
    readFileSync(join(root, '.xera', ticket, 'runs', runId, 'contract-drift.json'), 'utf8'),
  );
}

describe('classifyDriftCmd (#195)', () => {
  test('stamps CONTRACT_DRIFT + FAIL scenario names when a call drifts from the spec', async () => {
    writeHttpProject();
    writeMeta('API-1', 'http');
    // 201 is not enumerated for POST /login (only 200) → contract drift.
    writeNormalized(
      'API-1',
      'r1',
      [{ method: 'POST', url: '/login', status: 201, respBody: {} }],
      [
        { name: 'Login returns 201', outcome: 'FAIL' },
        { name: 'A passing check', outcome: 'PASS' },
      ],
    );
    expect(await classifyDriftCmd(['API-1', '--run=r1'])).toBe(0);
    const out = readResult('API-1', 'r1');
    expect(out.class).toBe('CONTRACT_DRIFT');
    expect(out.scenarios).toEqual(['Login returns 201']); // FAIL only
  });

  test('class null when the calls match the spec', async () => {
    writeHttpProject();
    writeMeta('API-2', 'http');
    writeNormalized(
      'API-2',
      'r1',
      [{ method: 'POST', url: '/login', status: 200, respBody: {} }],
      [{ name: 'Login returns 200', outcome: 'PASS' }],
    );
    expect(await classifyDriftCmd(['API-2', '--run=r1'])).toBe(0);
    const out = readResult('API-2', 'r1');
    expect(out.class).toBeNull();
    expect(out.scenarios).toEqual([]);
  });

  test('non-http adapter → class null (the heal sub-flow is http-only)', async () => {
    writeMeta('WEB-1', 'web');
    writeNormalized('WEB-1', 'r1', [], [{ name: 'x', outcome: 'FAIL' }]);
    expect(await classifyDriftCmd(['WEB-1', '--run=r1'])).toBe(0);
    expect(readResult('WEB-1', 'r1').class).toBeNull();
  });
});
