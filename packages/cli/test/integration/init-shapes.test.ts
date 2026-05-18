/**
 * Integration tests for `xera init --shape <web|api|mixed>`.
 *
 * Scaffold-only — verifies the right files land in the right shape; does NOT
 * run a full end-to-end test against a live backend. Doctor + auth-setup +
 * runner have their own unit tests covering deeper behavior.
 */

import { afterAll, describe, expect, test } from 'bun:test';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawn } from 'bun';

const xeraBin = resolve(import.meta.dir, '../../bin/xera');

const createdDirs: string[] = [];
afterAll(() => {
  for (const d of createdDirs) rmSync(d, { recursive: true, force: true });
});

async function runInit(shape: 'web' | 'api' | 'mixed'): Promise<string> {
  const cwd = mkdtempSync(join(tmpdir(), `xera-init-${shape}-`));
  createdDirs.push(cwd);
  const proc = spawn(['bun', 'run', '--cwd', cwd, xeraBin, 'init', '--yes', '--shape', shape], {
    cwd,
    stderr: 'pipe',
    stdout: 'pipe',
  });
  const exitCode = await proc.exited;
  if (exitCode !== 0) {
    const err = await new Response(proc.stderr).text();
    throw new Error(`init --shape ${shape} exited ${exitCode}: ${err}`);
  }
  return cwd;
}

describe('xera init --shape web', () => {
  test('scaffolds web-only project', async () => {
    const cwd = await runInit('web');

    expect(existsSync(join(cwd, 'xera.config.ts'))).toBe(true);
    expect(existsSync(join(cwd, 'playwright.config.ts'))).toBe(true);
    expect(existsSync(join(cwd, 'shared/auth-setup.ts'))).toBe(true);
    expect(existsSync(join(cwd, '.env.example'))).toBe(true);

    const cfg = readFileSync(join(cwd, 'xera.config.ts'), 'utf8');
    expect(cfg).toContain("adapters: ['web']");
    expect(cfg).not.toContain('http: {');

    // No openapi placeholder for web-only
    expect(existsSync(join(cwd, 'openapi.yaml'))).toBe(false);

    // auth-setup exports only web
    const authSetup = readFileSync(join(cwd, 'shared/auth-setup.ts'), 'utf8');
    expect(authSetup).toContain("from '@xera-ai/web'");
    expect(authSetup).toContain('export const web');
    expect(authSetup).not.toContain('export const http');
  }, 30_000);
});

describe('xera init --shape api', () => {
  test('scaffolds api-only project (no browser config, with openapi placeholder)', async () => {
    const cwd = await runInit('api');

    expect(existsSync(join(cwd, 'xera.config.ts'))).toBe(true);
    expect(existsSync(join(cwd, 'playwright.config.ts'))).toBe(true);
    expect(existsSync(join(cwd, 'shared/auth-setup.ts'))).toBe(true);
    expect(existsSync(join(cwd, 'openapi.yaml'))).toBe(true);

    const cfg = readFileSync(join(cwd, 'xera.config.ts'), 'utf8');
    expect(cfg).toContain("adapters: ['http']");
    expect(cfg).toContain('http: {');
    expect(cfg).not.toContain('web: {');

    // Playwright config is http-only (no browser project)
    const pw = readFileSync(join(cwd, 'playwright.config.ts'), 'utf8');
    expect(pw).not.toContain('browserName');
    expect(pw).toContain("projects: [{ name: 'http' }]");

    // auth-setup exports only http
    const authSetup = readFileSync(join(cwd, 'shared/auth-setup.ts'), 'utf8');
    expect(authSetup).toContain("from '@xera-ai/http'");
    expect(authSetup).toContain('export const http');
    expect(authSetup).not.toContain('export const web');
  }, 30_000);
});

describe('xera init --shape mixed', () => {
  test('scaffolds both web and http blocks', async () => {
    const cwd = await runInit('mixed');

    expect(existsSync(join(cwd, 'xera.config.ts'))).toBe(true);
    expect(existsSync(join(cwd, 'playwright.config.ts'))).toBe(true);
    expect(existsSync(join(cwd, 'shared/auth-setup.ts'))).toBe(true);
    expect(existsSync(join(cwd, 'openapi.yaml'))).toBe(true);

    const cfg = readFileSync(join(cwd, 'xera.config.ts'), 'utf8');
    expect(cfg).toContain("adapters: ['web', 'http']");
    expect(cfg).toContain('web: {');
    expect(cfg).toContain('http: {');

    // auth-setup exports BOTH web and http
    const authSetup = readFileSync(join(cwd, 'shared/auth-setup.ts'), 'utf8');
    expect(authSetup).toContain("from '@xera-ai/web'");
    expect(authSetup).toContain("from '@xera-ai/http'");
    expect(authSetup).toContain('export const web');
    expect(authSetup).toContain('export const http');
  }, 30_000);
});

describe('defaultEnv consistency across shapes (#97)', () => {
  test('all three shapes scaffold the same canonical defaultEnv', async () => {
    // Issue #97: web used `staging` while mixed/api used `dev`. Now all three
    // pick `staging` so users hopping between shapes have stable muscle memory.
    const [web, api, mixed] = await Promise.all([runInit('web'), runInit('api'), runInit('mixed')]);

    const readEnv = (cwd: string) =>
      readFileSync(join(cwd, 'xera.config.ts'), 'utf8')
        .match(/defaultEnv:\s*'([^']+)'/g)
        ?.map((m) => m.replace(/^defaultEnv:\s*'([^']+)'$/, '$1')) ?? [];

    const webEnvs = readEnv(web);
    const apiEnvs = readEnv(api);
    const mixedEnvs = readEnv(mixed);

    expect(webEnvs).toEqual(['staging']);
    expect(apiEnvs).toEqual(['staging']);
    expect(mixedEnvs).toEqual(['staging', 'staging']);

    // Likewise the baseUrl key used to scaffold the single environment.
    // Web uses a multi-line `baseUrl: {\n  staging: ...`; mixed/api inline it.
    for (const cwd of [web, api, mixed]) {
      const cfg = readFileSync(join(cwd, 'xera.config.ts'), 'utf8');
      expect(cfg).toMatch(/baseUrl:\s*\{\s*staging:/);
      expect(cfg).not.toMatch(/baseUrl:\s*\{\s*dev:/);
    }
  }, 60_000);
});
