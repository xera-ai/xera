import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { writeAuthState } from '../../src/auth/state';
import { verifyHttpAuthCmd } from '../../src/bin-internal/verify-http-auth';

let dir: string;
const origCwd = process.cwd();
const origKey = process.env.XERA_AUTH_KEY;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'xera-verify-http-'));
  process.env.XERA_AUTH_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
  mkdirSync(join(dir, 'shared'), { recursive: true });
  writeFileSync(join(dir, 'shared/auth-setup.ts'), 'export const http = async () => ({}) as any;');
  writeFileSync(
    join(dir, 'xera.config.ts'),
    `export default {
       github: { repo: 'owner/repo' },
       adapters: ['http'],
       http: {
         baseUrl: { dev: 'http://api.test.local' },
         defaultEnv: 'dev',
         auth: { strategy: 'bearer', roles: { admin: { tokenEnv: 'ADMIN_BEARER_TOKEN' } } },
       },
     };`,
  );
  // Seed a valid http auth file
  mkdirSync(join(dir, '.xera/.auth/http'), { recursive: true });
  writeAuthState(join(dir, '.xera/.auth/http'), {
    role: 'admin',
    strategy: 'apiToken',
    created_at: new Date().toISOString(),
    expires_at: new Date(Date.now() + 900_000).toISOString(),
    payload: { type: 'bearer', token: 'tok', header: 'Authorization', scheme: 'Bearer' },
  });
  process.chdir(dir);
});

afterEach(() => {
  process.chdir(origCwd);
  rmSync(dir, { recursive: true, force: true });
  if (origKey === undefined) delete process.env.XERA_AUTH_KEY;
  else process.env.XERA_AUTH_KEY = origKey;
  vi.restoreAllMocks();
});

describe('verify-http-auth', () => {
  test('exits 1 with usage when --role or --path missing', async () => {
    const code = await verifyHttpAuthCmd(['--role', 'admin']);
    expect(code).toBe(1);
  });

  test('exits 1 when http block missing in config', async () => {
    writeFileSync(
      join(dir, 'xera.config.ts'),
      `export default { github: { repo: 'owner/repo' }, web: { baseUrl: { dev: 'http://example.test' }, defaultEnv: 'dev', auth: {} } };`,
    );
    const code = await verifyHttpAuthCmd(['--role', 'admin', '--path', '/api/health']);
    expect(code).toBe(1);
  });

  test('exits 1 with hint when auth file is expired', async () => {
    writeAuthState(join(dir, '.xera/.auth/http'), {
      role: 'admin',
      strategy: 'apiToken',
      created_at: new Date(Date.now() - 86400_000).toISOString(),
      expires_at: new Date(Date.now() - 1000).toISOString(),
      payload: { type: 'bearer', token: 'tok', header: 'Authorization', scheme: 'Bearer' },
    });
    const errs: string[] = [];
    const origErr = console.error;
    console.error = (...a: unknown[]) => {
      errs.push(a.join(' '));
    };
    try {
      const code = await verifyHttpAuthCmd(['--role', 'admin', '--path', '/api/health']);
      expect(code).toBe(1);
    } finally {
      console.error = origErr;
    }
    expect(errs.join('\n')).toMatch(/expired/i);
  });
});
