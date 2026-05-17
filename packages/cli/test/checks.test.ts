import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { writeAuthState } from '@xera-ai/core';
import { runChecks } from '../src/checks';

// Helper: create a minimal web project with optional coverage config (plain object export)
function makeWebProject(coverageConfig?: string): string {
  const d = mkdtempSync(join(tmpdir(), 'xera-checks-'));
  mkdirSync(join(d, '.xera'), { recursive: true });
  const coverageBlock = coverageConfig ? `, coverage: ${coverageConfig}` : '';
  writeFileSync(
    join(d, 'xera.config.ts'),
    `export default {\n` +
      `  adapters: ['web'],\n` +
      `  jira: { baseUrl: 'https://example.atlassian.net', projectKeys: ['PROJ'], fields: { story: 'description' } },\n` +
      `  web: { baseUrl: { local: 'http://localhost:3000' }, defaultEnv: 'local' }${coverageBlock}\n` +
      `};\n`,
  );
  return d;
}

let dir: string;
const ORIG_KEY = process.env.XERA_AUTH_KEY;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'doctor-'));
  process.env.XERA_AUTH_KEY = 'a'.repeat(64);
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
  if (ORIG_KEY === undefined) delete process.env.XERA_AUTH_KEY;
  else process.env.XERA_AUTH_KEY = ORIG_KEY;
});

function writeMinHttpConfig(dir: string, withSpec = false) {
  // Use plain object default export (avoids @xera-ai/core resolution in tmp dir).
  writeFileSync(
    join(dir, 'xera.config.ts'),
    `export default {
  adapters: ['http'],
  jira: { baseUrl: 'https://x.atlassian.net', projectKeys: ['PROJ'], fields: { story: 'description' } },
  http: { baseUrl: { dev: 'http://localhost:65535' }, defaultEnv: 'dev', ${withSpec ? "spec: './openapi.yaml'," : ''} auth: { strategy: 'bearer', roles: { user: { tokenEnv: 'USER_TOKEN' } } } },
};`,
  );
  writeFileSync(join(dir, '.env'), `XERA_AUTH_KEY=${'a'.repeat(64)}\n`);
  mkdirSync(join(dir, '.claude', 'skills'), { recursive: true });
}

describe('doctor http checks', () => {
  test('reports ✗ when auth file missing', async () => {
    writeMinHttpConfig(dir);
    const checks = await runChecks(dir);
    const missing = checks.find((c) => c.name === 'http auth file present: user');
    expect(missing?.ok).toBe(false);
    expect(missing?.message).toContain('xera:auth-setup --role user');
  });

  test('reports ✓ when auth file present and fresh', async () => {
    writeMinHttpConfig(dir);
    mkdirSync(join(dir, '.xera', '.auth', 'http'), { recursive: true });
    writeAuthState(join(dir, '.xera', '.auth', 'http'), {
      role: 'user',
      strategy: 'apiToken',
      created_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + 3600_000).toISOString(),
      payload: { token: 't', type: 'bearer', header: 'Authorization', scheme: 'Bearer' },
    });
    const checks = await runChecks(dir);
    const fresh = checks.find((c) => c.name === 'http auth file present: user');
    expect(fresh?.ok).toBe(true);
    expect(fresh?.message).toMatch(/expires in/);
  });

  test('reports ✗ when auth file expired', async () => {
    writeMinHttpConfig(dir);
    mkdirSync(join(dir, '.xera', '.auth', 'http'), { recursive: true });
    writeAuthState(join(dir, '.xera', '.auth', 'http'), {
      role: 'user',
      strategy: 'apiToken',
      created_at: new Date(Date.now() - 1e7).toISOString(),
      expires_at: new Date(Date.now() - 1e6).toISOString(),
      payload: { token: 't', type: 'bearer', header: 'Authorization', scheme: 'Bearer' },
    });
    const checks = await runChecks(dir);
    const stale = checks.find((c) => c.name === 'http auth file fresh: user');
    expect(stale?.ok).toBe(false);
    expect(stale?.message).toContain('expired');
  });

  test('reports OpenAPI not configured (soft ok) when http.spec absent', async () => {
    writeMinHttpConfig(dir, false);
    const checks = await runChecks(dir);
    const oa = checks.find((c) => c.name === 'OpenAPI spec configured');
    expect(oa?.ok).toBe(true);
    expect(oa?.message).toContain('CONTRACT_DRIFT detection disabled');
  });
});

describe('runChecks coverage warnings', () => {
  test('warns when coverage.staleAfterDays > 90', async () => {
    const d = makeWebProject('{ staleAfterDays: 120 }');
    try {
      const checks = await runChecks(d);
      const warning = checks.find((c) => c.name.includes('coverage.staleAfterDays'));
      expect(warning).toBeDefined();
      expect(warning!.ok).toBe(false);
      expect(warning!.message ?? '').toContain('large window');
    } finally {
      rmSync(d, { recursive: true, force: true });
    }
  });

  test('no warning when staleAfterDays <= 90', async () => {
    const d = makeWebProject('{ staleAfterDays: 60 }');
    try {
      const checks = await runChecks(d);
      const warning = checks.find((c) => c.name.includes('coverage.staleAfterDays'));
      expect(warning).toBeUndefined();
    } finally {
      rmSync(d, { recursive: true, force: true });
    }
  });

  test('warns when criticalAreas contains a slug missing from snapshot', async () => {
    const d = makeWebProject(`{ criticalAreas: ['typo-area'] }`);
    mkdirSync(join(d, '.xera/graph'), { recursive: true });
    writeFileSync(
      join(d, '.xera/graph/snapshot.json'),
      JSON.stringify({
        schema_version: 1,
        generated_at: '2026-05-17T10:00:00.000Z',
        event_count: 0,
        events_hash: 'sha256:',
        tickets: {},
        scenarios: {},
        poms: {},
        areas: { checkout: { id: 'checkout' } },
        edges: [],
        latest_failures: {},
        acNodes: {},
        classifications: [],
      }),
    );
    try {
      const checks = await runChecks(d);
      const w = checks.find((c) => c.name.includes('typo-area'));
      expect(w).toBeDefined();
      expect(w!.ok).toBe(false);
    } finally {
      rmSync(d, { recursive: true, force: true });
    }
  });

  test('no warning when all criticalAreas exist in snapshot', async () => {
    const d = makeWebProject(`{ criticalAreas: ['checkout'] }`);
    mkdirSync(join(d, '.xera/graph'), { recursive: true });
    writeFileSync(
      join(d, '.xera/graph/snapshot.json'),
      JSON.stringify({
        schema_version: 1,
        generated_at: '2026-05-17T10:00:00.000Z',
        event_count: 0,
        events_hash: 'sha256:',
        tickets: {},
        scenarios: {},
        poms: {},
        areas: { checkout: { id: 'checkout' } },
        edges: [],
        latest_failures: {},
        acNodes: {},
        classifications: [],
      }),
    );
    try {
      const checks = await runChecks(d);
      const w = checks.find((c) => c.name.toLowerCase().includes('critical'));
      expect(w).toBeUndefined();
    } finally {
      rmSync(d, { recursive: true, force: true });
    }
  });

  test('warns when ticket has acs but no ACNode (snapshot stale)', async () => {
    const d = makeWebProject();
    mkdirSync(join(d, '.xera/graph'), { recursive: true });
    writeFileSync(
      join(d, '.xera/graph/snapshot.json'),
      JSON.stringify({
        schema_version: 1,
        generated_at: '2026-05-17T10:00:00.000Z',
        event_count: 0,
        events_hash: 'sha256:',
        tickets: {
          'PROJ-1': {
            id: 'PROJ-1',
            summary: 's',
            ac: ['x'],
            storyHash: 'h',
            modifiesAreas: [],
            fetchedAt: '2026-05-01T10:00:00.000Z',
          },
        },
        scenarios: {},
        poms: {},
        areas: {},
        edges: [],
        latest_failures: {},
        acNodes: {},
        classifications: [],
      }),
    );
    try {
      const checks = await runChecks(d);
      const w = checks.find(
        (c) => c.name.includes('PROJ-1') && c.name.toLowerCase().includes('ac'),
      );
      expect(w).toBeDefined();
      expect(w!.ok).toBe(false);
    } finally {
      rmSync(d, { recursive: true, force: true });
    }
  });
});
