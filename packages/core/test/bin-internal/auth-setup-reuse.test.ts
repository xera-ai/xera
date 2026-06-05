import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { writeAuthState } from '../../src/auth/state';
import { authSetupCmd } from '../../src/bin-internal/auth-setup';

let dir: string;
const origCwd = process.cwd();
const origKey = process.env.XERA_AUTH_KEY;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'xera-binreuse-'));
  process.env.XERA_AUTH_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
  process.chdir(dir);
});

afterEach(() => {
  process.chdir(origCwd);
  rmSync(dir, { recursive: true, force: true });
  if (origKey === undefined) delete process.env.XERA_AUTH_KEY;
  else process.env.XERA_AUTH_KEY = origKey;
});

function scaffoldProject() {
  mkdirSync(join(dir, 'shared'), { recursive: true });
  // Sentinel: user's http function should NOT be called for this strategy
  writeFileSync(
    join(dir, 'shared/auth-setup.ts'),
    `export const http = async () => { throw new Error('USER_HTTP_FN_SHOULD_NOT_BE_CALLED'); };`,
  );
  writeFileSync(
    join(dir, 'xera.config.ts'),
    `export default {
      github: { repo: 'owner/repo' },
      adapters: ['http'],
      http: {
        baseUrl: { dev: 'http://example.test' },
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
  mkdirSync(join(dir, '.xera/.auth'), { recursive: true });
  writeAuthState(join(dir, '.xera/.auth'), {
    role: 'admin', strategy: 'storageState',
    created_at: new Date().toISOString(),
    expires_at: new Date(Date.now() + 86400_000).toISOString(),
    payload: { cookies: [
      { name: 'session_at', value: 'A', domain: 'api.x.com', path: '/', expires: Math.floor(Date.now()/1000) + 900 },
    ], origins: [] },
  });
}

describe('auth-setup binary reuse-web-session', () => {
  test('produces http auth file without calling user http function', async () => {
    scaffoldProject();
    const code = await authSetupCmd(['--role', 'admin', '--shape', 'http']);
    expect(code).toBe(0);
    expect(existsSync(join(dir, '.xera/.auth/http/admin.json'))).toBe(true);
  });
});
