/**
 * Integration test for @xera-ai/http against the bundled fixtures/mock-api.
 *
 * Boots mock-api/server.ts on a random port, exercises:
 *  - presetHttpAuth + runHttpAuthSetup writing an encrypted role file
 *  - newAuthedContext reading + attaching the header
 *  - normalizeHttpRun consuming http-trace.jsonl + raw-report.json
 */

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { request as pwRequest } from '@playwright/test';
import { readAuthState } from '@xera-ai/core';
import { presetHttpAuth } from '../../src/auth-setup/preset';
import { runHttpAuthSetup } from '../../src/auth-setup/runner';
import { newAuthedContext } from '../../src/runtime';
import { normalizeHttpRun } from '../../src/trace-normalizer/normalize';

const PORT = 4123;
let serverProc: ReturnType<typeof Bun.spawn> | null = null;
let tmpDir: string;
const ORIG = {
  KEY: process.env.XERA_AUTH_KEY,
  DIR: process.env.XERA_AUTH_DIR,
  BASE: process.env.XERA_BASE_URL,
  TOKEN: process.env.MOCK_USER_TOKEN,
};

beforeAll(async () => {
  tmpDir = mkdtempSync(join(tmpdir(), 'http-int-'));
  process.env.XERA_AUTH_KEY = 'a'.repeat(64);
  process.env.XERA_AUTH_DIR = tmpDir;
  process.env.XERA_BASE_URL = `http://localhost:${PORT}`;
  process.env.MOCK_USER_TOKEN = 'test-token-001';

  // Boot mock-api on PORT
  serverProc = Bun.spawn(['bun', 'run', 'fixtures/mock-api/server.ts'], {
    cwd: join(import.meta.dir, '..', '..', '..', '..'),
    env: { ...process.env, MOCK_API_PORT: String(PORT) },
    stdout: 'pipe',
    stderr: 'pipe',
  });

  // Wait for ready (poll the port up to ~3s)
  const deadline = Date.now() + 3000;
  while (Date.now() < deadline) {
    try {
      const r = await fetch(`http://localhost:${PORT}/health`).catch(() => null);
      if (r) break;
      const probe = await fetch(`http://localhost:${PORT}/users/1`).catch(() => null);
      if (probe) break;
    } catch {}
    await new Promise((r) => setTimeout(r, 100));
  }
});

afterAll(() => {
  if (serverProc) serverProc.kill('SIGTERM');
  rmSync(tmpDir, { recursive: true, force: true });
  if (ORIG.KEY === undefined) delete process.env.XERA_AUTH_KEY;
  else process.env.XERA_AUTH_KEY = ORIG.KEY;
  if (ORIG.DIR === undefined) delete process.env.XERA_AUTH_DIR;
  else process.env.XERA_AUTH_DIR = ORIG.DIR;
  if (ORIG.BASE === undefined) delete process.env.XERA_BASE_URL;
  else process.env.XERA_BASE_URL = ORIG.BASE;
  if (ORIG.TOKEN === undefined) delete process.env.MOCK_USER_TOKEN;
  else process.env.MOCK_USER_TOKEN = ORIG.TOKEN;
});

describe('http adapter end-to-end against mock-api', () => {
  test('runHttpAuthSetup + newAuthedContext + request POST /users', async () => {
    const httpConfig = {
      baseUrl: { dev: `http://localhost:${PORT}` },
      defaultEnv: 'dev',
      auth: {
        strategy: 'bearer' as const,
        ttl: '8h',
        refreshBuffer: '30m',
        roles: { user: { tokenEnv: 'MOCK_USER_TOKEN' } },
      },
    };

    await runHttpAuthSetup({
      authDir: tmpDir,
      role: 'user',
      config: httpConfig,
      setupFn: (req, role, _creds) => presetHttpAuth({ request: req, role, config: httpConfig }),
      creds: { email: '', password: '' },
    });

    const entry = readAuthState(join(tmpDir, 'http'), 'user');
    expect(entry).not.toBeNull();
    expect((entry?.payload as { token: string }).token).toBe('test-token-001');

    // Run a request through newAuthedContext
    const api = await newAuthedContext({ request: pwRequest } as never, 'user');
    try {
      const res = await api.post('/users', { data: { name: 'Alice', email: 'a@b.com' } });
      expect(res.status()).toBe(201);
      const body = await res.json();
      expect(body.email).toBe('a@b.com');
    } finally {
      await api.dispose();
    }
  });

  test('normalizeHttpRun consumes trace + report files', async () => {
    const runDir = join(tmpDir, 'run-1');
    require('node:fs').mkdirSync(runDir, { recursive: true });

    writeFileSync(
      join(runDir, 'http-trace.jsonl'),
      JSON.stringify({
        ts: 't',
        scenario: 'reject bad email',
        method: 'POST',
        url: '/users',
        reqHeaders: { Authorization: '[REDACTED]' },
        reqBody: { email: 'bad' },
        status: 422,
        respHeaders: {},
        respBody: { errors: ['email must be valid'] },
        durationMs: 5,
      }),
    );
    writeFileSync(
      join(runDir, 'raw-report.json'),
      JSON.stringify({
        suites: [
          {
            specs: [
              {
                title: 'reject bad email',
                tests: [{ results: [{ status: 'passed' }] }],
              },
            ],
          },
        ],
      }),
    );

    const out = await normalizeHttpRun({ runId: 'RUN-1', runDir });
    expect(out.outcome).toBe('PASS');
    expect(out.http.calls).toHaveLength(1);
    expect(out.http.calls[0]?.curl).toContain('curl -X POST');
    expect(existsSync(join(runDir, 'normalized.json'))).toBe(true);
  });
});
