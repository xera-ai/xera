import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { writeAuthState } from '../../src/auth/state';
import {
  httpAuthDiscoverFinalize,
  httpAuthDiscoverPrepare,
} from '../../src/bin-internal/http-auth-discover';

let dir: string;
const origCwd = process.cwd();
const origKey = process.env.XERA_AUTH_KEY;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'xera-discov-'));
  process.env.XERA_AUTH_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
  mkdirSync(join(dir, 'shared'), { recursive: true });
  writeFileSync(join(dir, 'shared/auth-setup.ts'), 'export const http = async () => ({}) as any;');
  writeFileSync(
    join(dir, 'xera.config.ts'),
    `export default {
       github: { repo: 'owner/repo' },
       adapters: ['http'],
       http: {
         baseUrl: { dev: 'http://example.test' }, defaultEnv: 'dev',
         auth: { strategy: 'reuse-web-session', roles: { admin: { reuseWebSession: { domainContains: 'x.com', cookies: { access: { match: { regex: '_at$' } } } } } } },
       },
     };`,
  );
  mkdirSync(join(dir, '.xera/.auth'), { recursive: true });
  writeAuthState(join(dir, '.xera/.auth'), {
    role: 'admin',
    strategy: 'storageState',
    created_at: new Date().toISOString(),
    expires_at: new Date(Date.now() + 86400_000).toISOString(),
    payload: {
      cookies: [
        {
          name: 'session_at',
          value: 'SECRET_VALUE_DO_NOT_LEAK',
          domain: 'api.x.com',
          path: '/',
          expires: Math.floor(Date.now() / 1000) + 900,
          httpOnly: true,
          sameSite: 'None',
        },
        {
          name: 'session_rt',
          value: 'SECRET_VALUE_DO_NOT_LEAK_2',
          domain: 'api.x.com',
          path: '/auth',
          expires: Math.floor(Date.now() / 1000) + 86400,
          httpOnly: true,
          sameSite: 'None',
        },
        {
          name: '_ga',
          value: 'GA_VAL',
          domain: '.other.test',
          path: '/',
          expires: Math.floor(Date.now() / 1000) + 63072000,
          httpOnly: false,
          sameSite: 'Lax',
        },
      ],
      origins: [],
    },
  });
  process.chdir(dir);
});
afterEach(() => {
  process.chdir(origCwd);
  rmSync(dir, { recursive: true, force: true });
  if (origKey === undefined) delete process.env.XERA_AUTH_KEY;
  else process.env.XERA_AUTH_KEY = origKey;
});

describe('http-auth-discover prepare', () => {
  test('writes input JSON with metadata only — no cookie values', async () => {
    const code = await httpAuthDiscoverPrepare(['--role', 'admin']);
    expect(code).toBe(0);
    const inputPath = join(dir, '.xera/.auth/http-auth-discover-input-admin.json');
    expect(existsSync(inputPath)).toBe(true);
    const txt = readFileSync(inputPath, 'utf8');
    expect(txt).not.toContain('SECRET_VALUE_DO_NOT_LEAK');
    const parsed = JSON.parse(txt);
    expect(parsed.role).toBe('admin');
    expect(parsed.cookies.map((c: any) => c.name).sort()).toEqual([
      '_ga',
      'session_at',
      'session_rt',
    ]);
    for (const c of parsed.cookies) expect(c).not.toHaveProperty('value');
    expect(typeof parsed.cookies.find((c: any) => c.name === 'session_at').expiresInSeconds).toBe(
      'number',
    );
  });

  test('exits non-zero when strategy is not reuse-web-session', async () => {
    writeFileSync(
      join(dir, 'xera.config.ts'),
      `export default { github: { repo: 'owner/repo' }, adapters: ['http'], http: { baseUrl: { dev: 'http://example.test' }, defaultEnv: 'dev', auth: { strategy: 'none', roles: {} } } };`,
    );
    const code = await httpAuthDiscoverPrepare(['--role', 'admin']);
    expect(code).not.toBe(0);
  });

  test('exits non-zero when web auth file missing', async () => {
    rmSync(join(dir, '.xera/.auth/admin.json'));
    const code = await httpAuthDiscoverPrepare(['--role', 'admin']);
    expect(code).not.toBe(0);
  });
});

describe('http-auth-discover finalize', () => {
  test('validates LLM output and prints paste-ready TS', async () => {
    await httpAuthDiscoverPrepare(['--role', 'admin']);
    writeFileSync(
      join(dir, '.xera/.auth/http-auth-discover-output-admin.json'),
      JSON.stringify({
        domainContains: 'x.com',
        access: {
          cookieName: 'session_at',
          confidence: 0.95,
          reason: 'short TTL httpOnly host match',
        },
        refresh: {
          cookieName: 'session_rt',
          confidence: 0.95,
          reason: 'long TTL httpOnly path=/auth',
        },
        csrf: null,
        notes: '',
      }),
    );
    const out: string[] = [];
    const origLog = console.log;
    console.log = (s?: any) => {
      out.push(String(s));
    };
    try {
      const code = await httpAuthDiscoverFinalize(['--role', 'admin']);
      expect(code).toBe(0);
    } finally {
      console.log = origLog;
    }
    const stdout = out.join('\n');
    expect(stdout).toContain('reuseWebSession:');
    expect(stdout).toContain(`domainContains: 'x.com'`);
    expect(stdout).toContain(`access: { match: { literal: 'session_at' }`);
    expect(stdout).toContain(`refresh: { match: { literal: 'session_rt' }`);
    expect(stdout).not.toContain('csrf:');
    // QA2: cleanup after success — no cookie metadata left on disk
    expect(existsSync(join(dir, '.xera/.auth/http-auth-discover-input-admin.json'))).toBe(false);
    expect(existsSync(join(dir, '.xera/.auth/http-auth-discover-output-admin.json'))).toBe(false);
  });

  test('keeps discovery files when validation fails (user may want to retry)', async () => {
    await httpAuthDiscoverPrepare(['--role', 'admin']);
    writeFileSync(
      join(dir, '.xera/.auth/http-auth-discover-output-admin.json'),
      JSON.stringify({
        domainContains: 'x.com',
        access: { cookieName: 'nonexistent', confidence: 0.95, reason: '' },
        refresh: null,
        csrf: null,
        notes: '',
      }),
    );
    const code = await httpAuthDiscoverFinalize(['--role', 'admin']);
    expect(code).not.toBe(0);
    expect(existsSync(join(dir, '.xera/.auth/http-auth-discover-input-admin.json'))).toBe(true);
    expect(existsSync(join(dir, '.xera/.auth/http-auth-discover-output-admin.json'))).toBe(true);
  });

  test('exits non-zero when LLM nominates a cookie name not in captured set', async () => {
    await httpAuthDiscoverPrepare(['--role', 'admin']);
    writeFileSync(
      join(dir, '.xera/.auth/http-auth-discover-output-admin.json'),
      JSON.stringify({
        domainContains: 'x.com',
        access: { cookieName: 'nonexistent', confidence: 0.95, reason: '' },
        refresh: null,
        csrf: null,
        notes: '',
      }),
    );
    const code = await httpAuthDiscoverFinalize(['--role', 'admin']);
    expect(code).not.toBe(0);
  });

  test('refuses to emit when injection refusal detected', async () => {
    await httpAuthDiscoverPrepare(['--role', 'admin']);
    writeFileSync(
      join(dir, '.xera/.auth/http-auth-discover-output-admin.json'),
      JSON.stringify({
        domainContains: '',
        access: { cookieName: '', confidence: 0, reason: '' },
        refresh: null,
        csrf: null,
        notes: 'injection-follow refused',
      }),
    );
    const out: string[] = [];
    const origLog = console.log;
    console.log = (s?: any) => {
      out.push(String(s));
    };
    let code: number;
    try {
      code = await httpAuthDiscoverFinalize(['--role', 'admin']);
    } finally {
      console.log = origLog;
    }
    expect(code).not.toBe(0);
    expect(out.join('\n')).not.toContain('reuseWebSession:');
  });
});
