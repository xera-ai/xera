import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadConfig } from '@xera/core';

export interface Check {
  name: string;
  ok: boolean;
  message?: string;
}

export async function runChecks(cwd: string): Promise<Check[]> {
  const checks: Check[] = [];

  // Bun
  checks.push({
    name: `bun ${process.versions.bun ?? 'unknown'}`,
    ok: !!process.versions.bun,
  });

  // xera.config.ts present and valid
  try {
    const cfg = await loadConfig(cwd);
    checks.push({ name: 'xera.config.ts found and valid', ok: true });

    // baseUrl reachable
    const url = cfg.web.baseUrl[cfg.web.defaultEnv]!;
    try {
      const r = await fetch(url, { redirect: 'manual' });
      checks.push({
        name: `web baseUrl '${cfg.web.defaultEnv}' reachable`,
        ok: r.status < 500,
        message: `${url} → ${r.status}`,
      });
    } catch (e) {
      checks.push({
        name: `web baseUrl '${cfg.web.defaultEnv}' reachable`,
        ok: false,
        message: String(e),
      });
    }
  } catch (e) {
    checks.push({
      name: 'xera.config.ts found and valid',
      ok: false,
      message: String((e as Error).message),
    });
  }

  // .env vars
  const envPath = join(cwd, '.env');
  if (!existsSync(envPath)) {
    checks.push({ name: '.env present', ok: false, message: 'copy from .env.example' });
  } else {
    const env = readFileSync(envPath, 'utf8');
    checks.push({ name: 'XERA_AUTH_KEY set', ok: /XERA_AUTH_KEY=[0-9a-fA-F]{64}/.test(env) });
  }

  // Playwright
  try {
    await import('@playwright/test' as string);
    checks.push({ name: '@playwright/test installed', ok: true });
  } catch {
    checks.push({
      name: '@playwright/test installed',
      ok: false,
      message: 'run: bun add -D @playwright/test',
    });
  }

  // Skills
  const skillsDir = join(cwd, '.claude/skills');
  if (!existsSync(skillsDir)) {
    checks.push({ name: 'xera skills present', ok: false, message: 'run `xera init`' });
  } else {
    const required = [
      'xera-run.md',
      'xera-fetch.md',
      'xera-feature.md',
      'xera-script.md',
      'xera-exec.md',
      'xera-report.md',
      'xera-promote.md',
    ];
    const missing = required.filter((n) => !existsSync(join(skillsDir, n)));
    const skillsCheck: Check = {
      name: 'xera skills present',
      ok: missing.length === 0,
    };
    if (missing.length) skillsCheck.message = `missing: ${missing.join(', ')}`;
    checks.push(skillsCheck);
  }

  return checks;
}
