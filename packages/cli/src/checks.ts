import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadConfig, readAuthState } from '@xera-ai/core';

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

    // baseUrl reachable (web adapter only)
    if (cfg.web) {
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
    }
    // http baseUrl reachable + http auth files + OpenAPI
    if (cfg.http) {
      const url = cfg.http.baseUrl[cfg.http.defaultEnv];
      if (!url) {
        checks.push({
          name: `http baseUrl '${cfg.http.defaultEnv}' configured`,
          ok: false,
          message: 'defaultEnv not present in http.baseUrl map',
        });
      } else {
        try {
          const r = await fetch(url, { redirect: 'manual' });
          checks.push({
            name: `http baseUrl '${cfg.http.defaultEnv}' reachable`,
            ok: r.status < 500,
            message: `${url} → ${r.status}`,
          });
        } catch (e) {
          checks.push({
            name: `http baseUrl '${cfg.http.defaultEnv}' reachable`,
            ok: false,
            message: String(e),
          });
        }
      }

      // http auth files
      const httpAuthDir = join(cwd, '.xera', '.auth', 'http');
      for (const role of Object.keys(cfg.http.auth.roles)) {
        const filePath = join(httpAuthDir, `${role}.json`);
        if (!existsSync(filePath)) {
          checks.push({
            name: `http auth file present: ${role}`,
            ok: false,
            message: `run: bun run xera:auth-setup --role ${role}`,
          });
          continue;
        }
        try {
          const entry = readAuthState(httpAuthDir, role);
          if (!entry) {
            checks.push({
              name: `http auth file readable: ${role}`,
              ok: false,
              message: 'auth file unreadable; re-run xera:auth-setup',
            });
            continue;
          }
          const expiresInMs = new Date(entry.expires_at).getTime() - Date.now();
          if (expiresInMs <= 0) {
            checks.push({
              name: `http auth file fresh: ${role}`,
              ok: false,
              message: `expired; run: bun run xera:auth-setup --role ${role}`,
            });
          } else {
            const minutes = Math.round(expiresInMs / 60_000);
            checks.push({
              name: `http auth file present: ${role}`,
              ok: true,
              message: `expires in ${minutes}m`,
            });
          }
        } catch (e) {
          checks.push({
            name: `http auth file readable: ${role}`,
            ok: false,
            message: String((e as Error).message),
          });
        }
      }

      // OpenAPI reachability
      if (cfg.http.spec) {
        const spec = cfg.http.spec;
        if (spec.startsWith('http://') || spec.startsWith('https://')) {
          try {
            const r = await fetch(spec);
            checks.push({
              name: 'OpenAPI spec reachable',
              ok: r.ok,
              message: r.ok ? `${spec} → ${r.status}` : `unreachable (${r.status})`,
            });
          } catch (e) {
            checks.push({
              name: 'OpenAPI spec reachable',
              ok: false,
              message: String((e as Error).message),
            });
          }
        } else {
          const open = existsSync(join(cwd, spec));
          const openCheck: Check = open
            ? { name: 'OpenAPI spec file present', ok: true }
            : { name: 'OpenAPI spec file present', ok: false, message: `not found at ${spec}` };
          checks.push(openCheck);
        }
      } else {
        checks.push({
          name: 'OpenAPI spec configured',
          ok: true,
          message: 'not set; CONTRACT_DRIFT detection disabled (optional)',
        });
      }
    }
    // Coverage checks
    if (cfg.coverage.staleAfterDays > 90) {
      checks.push({
        name: 'coverage.staleAfterDays sanity',
        ok: false,
        message: `${cfg.coverage.staleAfterDays}d is a very large window — coverage will be slow to react to drift`,
      });
    }

    const snapPath = join(cwd, '.xera/graph/snapshot.json');
    if (existsSync(snapPath) && cfg.coverage.criticalAreas.length > 0) {
      try {
        const snap = JSON.parse(readFileSync(snapPath, 'utf8')) as {
          areas?: Record<string, unknown>;
        };
        const known = new Set(Object.keys(snap.areas ?? {}));
        for (const slug of cfg.coverage.criticalAreas) {
          if (!known.has(slug)) {
            checks.push({
              name: `criticalArea "${slug}" exists`,
              ok: false,
              message: 'marked critical but no ticket modifies this area; check spelling',
            });
          }
        }
      } catch {
        /* malformed snapshot — separate check covers this */
      }
    }

    if (existsSync(snapPath)) {
      try {
        const snap = JSON.parse(readFileSync(snapPath, 'utf8')) as {
          tickets?: Record<string, { id: string; ac?: string[] }>;
          acNodes?: Record<string, { ticketId: string }>;
        };
        const acByTicket: Record<string, number> = {};
        for (const node of Object.values(snap.acNodes ?? {})) {
          acByTicket[node.ticketId] = (acByTicket[node.ticketId] ?? 0) + 1;
        }
        for (const ticket of Object.values(snap.tickets ?? {})) {
          const acCount = ticket.ac?.length ?? 0;
          if (acCount > 0 && (acByTicket[ticket.id] ?? 0) === 0) {
            checks.push({
              name: `${ticket.id}: ACNodes materialized`,
              ok: false,
              message:
                'ticket has acceptance criteria but no ACNode in snapshot — rebuild via xera:graph-backfill',
            });
          }
        }
      } catch {
        /* malformed snapshot */
      }
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
