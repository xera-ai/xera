import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadConfig, readAuthState } from '@xera-ai/core';
import { config as loadDotenv } from 'dotenv';
import { parse as parseYaml } from 'yaml';
import { editors } from './editors';
import { detectEditors } from './editors/detect';

export interface Check {
  name: string;
  ok: boolean;
  message?: string;
}

export interface RunChecksOptions {
  ticket?: string;
}

function pushTicketChecks(
  checks: Check[],
  cwd: string,
  ticket: string,
  acFieldConfigured: boolean,
): void {
  const ticketDir = join(cwd, '.xera', ticket);
  if (!existsSync(ticketDir)) {
    checks.push({
      name: `${ticket}: artifact directory present`,
      ok: false,
      message: `.xera/${ticket}/ not found — run \`/xera-fetch ${ticket}\` first`,
    });
    return;
  }

  // graph-input.json presence + parse
  const giPath = join(ticketDir, 'graph-input.json');
  if (!existsSync(giPath)) {
    checks.push({
      name: `${ticket}: graph-input.json present`,
      ok: false,
      message: `missing — modifiesAreas will be []; run step 5 of /xera-fetch (extract-areas prompt)`,
    });
  } else {
    try {
      const data = JSON.parse(readFileSync(giPath, 'utf8')) as { modifiesAreas?: unknown };
      if (!Array.isArray(data.modifiesAreas)) {
        checks.push({
          name: `${ticket}: graph-input.json present`,
          ok: false,
          message: `parsed but modifiesAreas is not an array — re-run step 5 of /xera-fetch`,
        });
      } else {
        checks.push({
          name: `${ticket}: graph-input.json present`,
          ok: true,
          message: `${data.modifiesAreas.length} area(s)`,
        });
      }
    } catch (e) {
      checks.push({
        name: `${ticket}: graph-input.json present`,
        ok: false,
        message: `invalid JSON (${(e as Error).message}) — re-run step 5 of /xera-fetch`,
      });
    }
  }

  // story.md acceptanceCriteria presence
  const storyPath = join(ticketDir, 'story.md');
  if (!existsSync(storyPath)) {
    checks.push({
      name: `${ticket}: story.md acceptanceCriteria`,
      ok: false,
      message: `story.md missing — re-run /xera-fetch ${ticket}`,
    });
    return;
  }
  const raw = readFileSync(storyPath, 'utf8');
  const m = raw.match(/^---\n([\s\S]*?)\n---/);
  if (!m) {
    checks.push({
      name: `${ticket}: story.md acceptanceCriteria`,
      ok: false,
      message: `frontmatter missing — re-run /xera-fetch ${ticket}`,
    });
    return;
  }
  let fm: { acceptanceCriteria?: unknown; acceptanceCriteriaSource?: unknown };
  try {
    fm = parseYaml(m[1]!) as {
      acceptanceCriteria?: unknown;
      acceptanceCriteriaSource?: unknown;
    };
  } catch (e) {
    checks.push({
      name: `${ticket}: story.md acceptanceCriteria`,
      ok: false,
      message: `frontmatter unparseable (${(e as Error).message})`,
    });
    return;
  }
  const ac = Array.isArray(fm.acceptanceCriteria) ? fm.acceptanceCriteria : [];
  const source =
    fm.acceptanceCriteriaSource === 'jira-field' ||
    fm.acceptanceCriteriaSource === 'body-extraction' ||
    fm.acceptanceCriteriaSource === 'none'
      ? fm.acceptanceCriteriaSource
      : undefined;
  if (ac.length > 0) {
    const suffix = source ? ` from ${source}` : '';
    checks.push({
      name: `${ticket}: story.md acceptanceCriteria`,
      ok: true,
      message: `${ac.length} AC item(s)${suffix}`,
    });
    return;
  }
  // ac.length === 0 — pick the most informative hint based on provenance.
  let hint: string;
  if (source === 'none') {
    // /xera-fetch step 4 (cognitive AC body-extraction) found nothing either.
    // Real root cause: the Jira ticket itself has no AC anywhere.
    hint = acFieldConfigured
      ? `jira.fields.acceptanceCriteria is configured but Jira returned no AC for this ticket, and /xera-fetch step 4 found no AC section in the body — add AC to the Jira ticket`
      : `AC not in Jira (no custom field configured) and /xera-fetch step 4 found no AC section in the description body — add AC/DoD to the Jira ticket, or edit story.md frontmatter manually`;
  } else if (source === 'body-extraction') {
    // Skill ran extraction but somehow wrote empty array. Should not happen
    // (step 4 only writes when ≥ 1 item) but cover defensively.
    hint = `acceptanceCriteriaSource: body-extraction but acceptanceCriteria is empty — re-run /xera-fetch ${ticket}`;
  } else {
    // Legacy story.md without acceptanceCriteriaSource field (pre-#114). Keep
    // the older actionable hints.
    hint = acFieldConfigured
      ? `jira.fields.acceptanceCriteria is configured but Jira returned no AC for this ticket — check the ticket in Jira`
      : `no AC in frontmatter; AC-level coverage will be empty. Re-run /xera-fetch ${ticket} so step 4 can extract AC from the body (set jira.fields.acceptanceCriteria in xera.config.ts if your project uses a dedicated Jira field)`;
  }
  checks.push({
    name: `${ticket}: story.md acceptanceCriteria`,
    ok: false,
    message: hint,
  });
}

export async function runChecks(cwd: string, opts: RunChecksOptions = {}): Promise<Check[]> {
  const checks: Check[] = [];

  // Load the project's .env so checks that resolve encrypted state (e.g. the
  // http auth-file readability check via readAuthState → resolveAuthKey) see
  // the same XERA_AUTH_KEY the `.env`-content check reads. Without this the CLI
  // ran with only the parent shell's env, producing contradictory results on a
  // clean shell. override:false keeps any caller-exported values winning. (#202)
  loadDotenv({ path: join(cwd, '.env'), override: false });

  // Node
  const nodeMajor = Number(process.versions.node.split('.')[0]);
  const nodeCheck: Check = { name: `node ${process.versions.node}`, ok: nodeMajor >= 20 };
  if (nodeMajor < 20) nodeCheck.message = 'xera requires Node 20 or newer';
  checks.push(nodeCheck);

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

      // http auth files — only required when the strategy actually produces
      // per-role state. With strategy: 'none' the HTTP adapter applies no
      // auth, so demanding a file would hard-fail doctor for projects that
      // intentionally opt out (#218). With strategy: 'reuse-web-session' the
      // doctor must verify BOTH the web auth file (the input) and the http
      // auth file (the lifted output), plus the persisted cookies array is
      // non-empty.
      switch (cfg.http.auth.strategy) {
        case 'none':
          checks.push({
            name: 'http auth files',
            ok: true,
            message: "strategy 'none' — no per-role auth state required",
          });
          break;
        case 'reuse-web-session': {
          const webAuthDir = join(cwd, '.xera', '.auth');
          const httpAuthDir = join(cwd, '.xera', '.auth', 'http');
          for (const role of Object.keys(cfg.http.auth.roles)) {
            const webPath = join(webAuthDir, `${role}.json`);
            if (!existsSync(webPath)) {
              checks.push({
                name: `reuse-web-session: web auth file present for role '${role}'`,
                ok: false,
                message: `Missing ${webPath}. Run: npx xera-internal auth-setup --role ${role} --shape web`,
              });
              continue;
            }
            checks.push({
              name: `reuse-web-session: web auth file present for role '${role}'`,
              ok: true,
            });
            const httpPath = join(httpAuthDir, `${role}.json`);
            if (!existsSync(httpPath)) {
              checks.push({
                name: `http auth file present: ${role}`,
                ok: false,
                message: `Missing ${httpPath}. Run: npx xera-internal auth-setup --role ${role} --shape http`,
              });
              continue;
            }
            try {
              const entry = readAuthState(httpAuthDir, role);
              if (!entry) {
                checks.push({
                  name: `http auth file readable: ${role}`,
                  ok: false,
                  message: 'auth file unreadable; re-run xera-internal auth-setup',
                });
                continue;
              }
              const expiresInMs = new Date(entry.expires_at).getTime() - Date.now();
              if (expiresInMs <= 0) {
                checks.push({
                  name: `http auth file fresh: ${role}`,
                  ok: false,
                  message: `expired; run: npx xera-internal auth-setup --role ${role} --shape http`,
                });
              } else {
                const minutes = Math.round(expiresInMs / 60_000);
                checks.push({
                  name: `http auth file present: ${role}`,
                  ok: true,
                  message: `expires in ${minutes}m`,
                });
              }
              const cookies = Array.isArray(
                (entry.payload as { cookies?: unknown[] }).cookies,
              )
                ? ((entry.payload as { cookies?: unknown[] }).cookies as unknown[])
                : [];
              const cookieCheck: Check = {
                name: `reuse-web-session: cookies persisted for role '${role}'`,
                ok: cookies.length > 0,
              };
              if (cookies.length === 0) {
                cookieCheck.message =
                  'no cookies — preset may not have matched any; re-run auth-setup --shape http';
              }
              checks.push(cookieCheck);
            } catch (e) {
              checks.push({
                name: `http auth file readable: ${role}`,
                ok: false,
                message: String((e as Error).message),
              });
            }
          }
          break;
        }
        default: {
          const httpAuthDir = join(cwd, '.xera', '.auth', 'http');
          for (const role of Object.keys(cfg.http.auth.roles)) {
            const filePath = join(httpAuthDir, `${role}.json`);
            if (!existsSync(filePath)) {
              checks.push({
                name: `http auth file present: ${role}`,
                ok: false,
                message: `run: npx xera-internal auth-setup --role ${role}`,
              });
              continue;
            }
            try {
              const entry = readAuthState(httpAuthDir, role);
              if (!entry) {
                checks.push({
                  name: `http auth file readable: ${role}`,
                  ok: false,
                  message: 'auth file unreadable; re-run xera-internal auth-setup',
                });
                continue;
              }
              const expiresInMs = new Date(entry.expires_at).getTime() - Date.now();
              if (expiresInMs <= 0) {
                checks.push({
                  name: `http auth file fresh: ${role}`,
                  ok: false,
                  message: `expired; run: npx xera-internal auth-setup --role ${role}`,
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
          break;
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
                'ticket has acceptance criteria but no ACNode in snapshot — rebuild via xera-internal graph-backfill',
            });
          }
        }
      } catch {
        /* malformed snapshot */
      }
    }

    // Issue-tracker reachability. Jira reachability is exercised indirectly via
    // `xera:fetch`, but for github we can check upfront that the gh CLI is on
    // PATH and authenticated — surfacing the fix before the user hits a runtime
    // error mid-pipeline. We never call `gh` if the github MCP env hint is set,
    // because in that mode the CLI isn't used at all.
    if (cfg.github && process.env.XERA_MCP_GITHUB !== '1') {
      const which = spawnSync('gh', ['--version'], { encoding: 'utf8' });
      if (which.status !== 0) {
        checks.push({
          name: 'github tracker: `gh` CLI on PATH',
          ok: false,
          message: 'install GitHub CLI from https://cli.github.com/ or connect the GitHub MCP',
        });
      } else {
        const auth = spawnSync('gh', ['auth', 'status'], { encoding: 'utf8' });
        checks.push({
          name: 'github tracker: `gh auth status` authenticated',
          ok: auth.status === 0,
          message:
            auth.status === 0
              ? `repo: ${cfg.github.repo}`
              : 'run: gh auth login (or connect the GitHub MCP)',
        });
      }
    }

    // Ticket-specific checks (xera doctor --strict <TICKET>): graph-input.json
    // presence and AC presence in story.md. These gate /xera-run Step 0 so that
    // silently-degraded graph state surfaces before the pipeline runs.
    if (opts.ticket) {
      const acFieldConfigured = Boolean(cfg.jira?.fields?.acceptanceCriteria);
      pushTicketChecks(checks, cwd, opts.ticket, acFieldConfigured);
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
      message: 'run: npm install -D @playwright/test',
    });
  }

  // AGENTS.md — orientation file all three editors read. Informational only.
  const hasAgents = existsSync(join(cwd, 'AGENTS.md'));
  const agentsCheck: Check = { name: 'AGENTS.md present', ok: hasAgents };
  if (!hasAgents) {
    agentsCheck.message =
      'no AGENTS.md — run `xera init` to scaffold one (orients Cursor / Codex / Claude)';
  }
  checks.push(agentsCheck);

  // Editor integrations — each detected editor contributes its own checks.
  // Required skill names cover the core workflow; doctor doesn't pin newer
  // optional skills (xera-coverage, xera-impact, etc.) to keep the check
  // surface stable across releases.
  const REQUIRED_SKILLS = [
    'xera-run',
    'xera-fetch',
    'xera-feature',
    'xera-script',
    'xera-exec',
    'xera-report',
    'xera-promote',
  ];
  const detected = detectEditors(cwd);
  if (detected.length === 0) {
    checks.push({
      name: 'xera editor integration present',
      ok: false,
      message: 'run `xera init` (scaffolds for Claude Code, Cursor, and/or Codex)',
    });
  } else {
    for (const name of detected) {
      checks.push(...editors[name].doctorChecks(cwd, REQUIRED_SKILLS));
    }
  }

  return checks;
}
