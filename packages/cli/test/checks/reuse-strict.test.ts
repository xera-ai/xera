import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { writeAuthState } from '@xera-ai/core';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { runChecks } from '../../src/checks';

let dir: string;
const origCwd = process.cwd();
const origKey = process.env.XERA_AUTH_KEY;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'xera-strict-'));
  process.env.XERA_AUTH_KEY =
    '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
  writeFileSync(
    join(dir, 'xera.config.ts'),
    `export default {
       github: { repo: 'owner/repo' },
       adapters: ['http'],
       http: {
         baseUrl: { dev: 'http://localhost:65535' },
         defaultEnv: 'dev',
         auth: {
           strategy: 'reuse-web-session',
           roles: {
             admin: {
               reuseWebSession: {
                 domainContains: 'x.com',
                 cookies: { access: { match: { regex: '_at$' } } },
               },
             },
           },
         },
       },
     };`,
  );
  writeFileSync(join(dir, '.env'), `XERA_AUTH_KEY=${process.env.XERA_AUTH_KEY}\n`);
  mkdirSync(join(dir, '.claude', 'skills'), { recursive: true });
  process.chdir(dir);
});

afterEach(() => {
  process.chdir(origCwd);
  rmSync(dir, { recursive: true, force: true });
  if (origKey === undefined) delete process.env.XERA_AUTH_KEY;
  else process.env.XERA_AUTH_KEY = origKey;
});

function seedWeb(role: string): void {
  mkdirSync(join(dir, '.xera/.auth'), { recursive: true });
  writeAuthState(join(dir, '.xera/.auth'), {
    role,
    strategy: 'storageState',
    created_at: new Date().toISOString(),
    expires_at: new Date(Date.now() + 86400_000).toISOString(),
    payload: {
      cookies: [{ name: 'session_at', value: 'A', domain: 'api.x.com', path: '/' }],
      origins: [],
    },
  });
}

function seedHttp(
  role: string,
  cookies: Array<Record<string, unknown>> = [
    { name: 'session_at', value: 'A', domain: 'api.x.com', path: '/' },
  ],
): void {
  mkdirSync(join(dir, '.xera/.auth/http'), { recursive: true });
  writeAuthState(join(dir, '.xera/.auth/http'), {
    role,
    strategy: 'apiToken',
    created_at: new Date().toISOString(),
    expires_at: new Date(Date.now() + 900_000).toISOString(),
    payload: {
      type: 'cookie',
      token: '',
      header: 'Authorization',
      scheme: '',
      cookies,
    },
  });
}

describe('doctor strict for reuse-web-session', () => {
  test('fails when web auth file missing', async () => {
    const checks = await runChecks(dir);
    const failed = checks.find((c) => c.name.includes('web auth file present'));
    expect(failed?.ok).toBe(false);
    expect(failed?.message).toContain('--shape web');
  });

  test('passes web check and reports http missing when only web present', async () => {
    seedWeb('admin');
    const checks = await runChecks(dir);
    expect(checks.find((c) => c.name.includes('web auth file present'))?.ok).toBe(true);
    expect(checks.find((c) => c.name.includes('http auth file present'))?.ok).toBe(false);
  });

  test('both present + cookies non-empty → all relevant checks pass', async () => {
    seedWeb('admin');
    seedHttp('admin');
    const checks = await runChecks(dir);
    expect(
      checks.find((c) => c.name.includes('reuse-web-session: web auth file present'))?.ok,
    ).toBe(true);
    expect(checks.find((c) => c.name.includes('http auth file present'))?.ok).toBe(true);
    expect(checks.find((c) => c.name.includes('cookies persisted'))?.ok).toBe(true);
  });

  test('empty persisted cookies → cookies-persisted check fails', async () => {
    seedWeb('admin');
    seedHttp('admin', []);
    const checks = await runChecks(dir);
    expect(checks.find((c) => c.name.includes('cookies persisted'))?.ok).toBe(false);
  });
});
