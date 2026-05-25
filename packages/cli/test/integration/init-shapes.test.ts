/**
 * Integration tests for `xera init --shape <web|api|mixed>`.
 *
 * Scaffold-only — verifies the right files land in the right shape; does NOT
 * run a full end-to-end test against a live backend. Doctor + auth-setup +
 * runner have their own unit tests covering deeper behavior.
 */

import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, describe, expect, test } from 'vitest';
import { run } from './helpers';

const xeraBin = resolve(import.meta.dirname, '../../bin/xera');

const createdDirs: string[] = [];
afterAll(() => {
  for (const d of createdDirs) rmSync(d, { recursive: true, force: true });
});

async function runInit(shape: 'web' | 'api' | 'mixed'): Promise<string> {
  const cwd = mkdtempSync(join(tmpdir(), `xera-init-${shape}-`));
  createdDirs.push(cwd);
  const proc = run(['node', xeraBin, 'init', '--yes', '--shape', shape], { cwd, pipe: true });
  const exitCode = await proc.exited;
  if (exitCode !== 0) {
    const err = await proc.stderr;
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

    // The feature-from-spec script is http-only
    const pkg = JSON.parse(readFileSync(join(cwd, 'package.json'), 'utf8')) as {
      scripts: Record<string, string>;
    };
    expect(pkg.scripts['xera:feature-spec-prepare']).toBeUndefined();

    // AGENTS.md scaffolded, web-flavored
    expect(existsSync(join(cwd, 'AGENTS.md'))).toBe(true);
    const agents = readFileSync(join(cwd, 'AGENTS.md'), 'utf8');
    expect(agents).toContain('Web UI tests');
    expect(agents).not.toContain('HTTP API tests');

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

    // http projects get the feature-from-spec script
    const pkg = JSON.parse(readFileSync(join(cwd, 'package.json'), 'utf8')) as {
      scripts: Record<string, string>;
    };
    expect(pkg.scripts['xera:feature-spec-prepare']).toBe('xera-internal feature-spec-prepare');

    // AGENTS.md scaffolded, API-flavored
    expect(existsSync(join(cwd, 'AGENTS.md'))).toBe(true);
    const agents = readFileSync(join(cwd, 'AGENTS.md'), 'utf8');
    expect(agents).toContain('HTTP API tests');
    expect(agents).not.toContain('Web UI tests');
  }, 30_000);
});

describe('AGENTS.md scaffolding (never clobber)', () => {
  test('xera init leaves an existing AGENTS.md untouched', async () => {
    const cwd = mkdtempSync(join(tmpdir(), 'xera-init-agents-'));
    createdDirs.push(cwd);
    const sentinel = '# My own AGENTS.md\n\nHand-curated — do not touch.\n';
    writeFileSync(join(cwd, 'AGENTS.md'), sentinel);

    const proc = spawn(['bun', 'run', '--cwd', cwd, xeraBin, 'init', '--yes', '--shape', 'web'], {
      cwd,
      stderr: 'pipe',
      stdout: 'pipe',
    });
    const exitCode = await proc.exited;
    if (exitCode !== 0) {
      const err = await new Response(proc.stderr).text();
      throw new Error(`init exited ${exitCode}: ${err}`);
    }

    expect(readFileSync(join(cwd, 'AGENTS.md'), 'utf8')).toBe(sentinel);
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

describe('Claude Code skill discovery layout', () => {
  test('skills land at .claude/skills/<name>/SKILL.md (NOT flat .md)', async () => {
    // Issue: Claude Code's Skill tool only discovers skills at
    // .claude/skills/<name>/SKILL.md (directory + SKILL.md). Earlier
    // versions scaffolded flat .claude/skills/<name>.md, which the slash
    // command discovery picks up but the Skill tool ignores — leaving
    // consumer projects unable to invoke /xera-fetch etc. as skills.
    const cwd = await runInit('web');

    for (const base of ['xera-run', 'xera-fetch', 'xera-feature', 'xera-script', 'xera-exec']) {
      expect(existsSync(join(cwd, '.claude/skills', base, 'SKILL.md'))).toBe(true);
      // The legacy flat layout must not be created alongside.
      expect(existsSync(join(cwd, '.claude/skills', `${base}.md`))).toBe(false);
      // Slash command discovery still wants the flat .md.
      expect(existsSync(join(cwd, '.claude/commands', `${base}.md`))).toBe(true);
    }

    // Package metadata files must not leak into either target.
    for (const meta of ['package.json', 'version.json', 'CHANGELOG.md']) {
      expect(existsSync(join(cwd, '.claude/skills', meta))).toBe(false);
      expect(existsSync(join(cwd, '.claude/commands', meta))).toBe(false);
    }

    // The skill content (frontmatter `name:` line) must be preserved verbatim
    // so Claude Code reads it back correctly.
    const skill = readFileSync(join(cwd, '.claude/skills/xera-run/SKILL.md'), 'utf8');
    expect(skill).toMatch(/^---\s*\nname: xera-run/);
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
