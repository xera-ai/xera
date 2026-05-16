import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { writeAuthState } from '@xera-ai/core';
import { runChecks } from '../src/checks';

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
