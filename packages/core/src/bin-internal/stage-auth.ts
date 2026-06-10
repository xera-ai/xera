import { join } from 'node:path';
import { chromium } from '@playwright/test';
import { runAuthSetup, stagePlaywrightState } from '@xera-ai/web';
import { needsRefresh } from '../auth/refresh';
import { readAuthState } from '../auth/state';
import { loadConfig } from '../config/load';

/**
 * Decrypts + writes plaintext storageState to .xera/.auth/.cache/<role>.json
 * so a user can run `npx playwright test` directly (e.g. for the HTML report,
 * --ui mode, IDE test explorer). #225.
 *
 * Usage:
 *   xera-internal stage-auth                # all web roles
 *   xera-internal stage-auth --role admin   # specific role
 *   xera-internal stage-auth --ticket FOO-1 # use a ticket's authDir + run a
 *                                           # refresh if entries are stale
 *
 * Exit codes mirror the rest of xera-internal: 0 success, 1 user error
 * (missing config / creds), 4 unexpected.
 */
export async function stageAuthCmd(argv: string[]): Promise<number> {
  let role: string | undefined;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = argv[i + 1];
    if (a === '--role' && next) {
      role = next;
      i++;
    }
  }

  const cwd = process.cwd();
  const config = await loadConfig(cwd);

  if (!config.web) {
    console.error('[xera:stage-auth] no web adapter configured — nothing to stage.');
    return 1;
  }
  const webConfig = config.web;
  if (webConfig.auth.strategy !== 'storageState') {
    console.error(
      `[xera:stage-auth] web.auth.strategy is '${webConfig.auth.strategy}' — staging only applies to storageState.`,
    );
    return 1;
  }

  // authDir is shared across tickets at .xera/.auth/ — no ticket needed.
  const authDir = join(cwd, '.xera', '.auth');

  const rolesToStage = role ? [role] : Object.keys(webConfig.auth.roles);
  if (role && !webConfig.auth.roles[role]) {
    console.error(
      `[xera:stage-auth] unknown role '${role}'. Configured: ${Object.keys(webConfig.auth.roles).join(', ')}`,
    );
    return 1;
  }

  // Refresh expired roles when possible (creds present). Mirrors `exec`'s
  // implicit refresh, including XERA_HEADED + baseURL honoring.
  const envName = process.env.XERA_ENV ?? webConfig.defaultEnv;
  const baseURL =
    process.env.XERA_BASE_URL ??
    webConfig.baseUrl[envName] ??
    webConfig.baseUrl[webConfig.defaultEnv];

  const needRefresh: string[] = [];
  for (const r of rolesToStage) {
    const entry = readAuthState(authDir, r);
    if (
      needsRefresh(entry, {
        ttl: webConfig.auth.ttl,
        refreshBuffer: webConfig.auth.refreshBuffer,
      })
    ) {
      needRefresh.push(r);
    }
  }

  if (needRefresh.length > 0 && webConfig.auth.setupScript) {
    const headed = process.env.XERA_HEADED === '1';
    const browser = await chromium.launch({ headless: !headed });
    try {
      for (const roleName of needRefresh) {
        const roleCreds = webConfig.auth.roles[roleName]!;
        const email = process.env[roleCreds.envEmail];
        const password = process.env[roleCreds.envPassword];
        if (!email || !password) {
          console.warn(
            `[xera:stage-auth] skipping refresh for role "${roleName}": ${roleCreds.envEmail} or ${roleCreds.envPassword} not set`,
          );
          continue;
        }
        await runAuthSetup({
          role: roleName,
          creds: { email, password },
          setupScriptPath: join(cwd, webConfig.auth.setupScript),
          authDir,
          browser,
          ...(baseURL ? { baseURL } : {}),
        });
        console.log(`[xera:stage-auth] refreshed ${roleName}`);
      }
    } finally {
      await browser.close();
    }
  }

  // Pre-flight refresh of http auth file when reuse-web-session is configured
  // and the web file is fresh — keeps `npx playwright test` (direct, not via
  // xera-internal exec) working without manually re-running auth-setup.
  if (config.http?.auth.strategy === 'reuse-web-session') {
    const { preflightRefreshReuseWebSession } = await import('./preflight-refresh');
    await preflightRefreshReuseWebSession(config, cwd, {
      log: (s: string) => console.log(s),
      warn: (s: string) => console.warn(s),
    });
  }

  // Stage every role that has a (now-fresh) auth file.
  let staged = 0;
  let exit = 0;
  for (const roleName of rolesToStage) {
    if (!readAuthState(authDir, roleName)) {
      console.error(
        `[xera:stage-auth] no auth state for role "${roleName}". Run: npx xera-internal auth-setup --role ${roleName}`,
      );
      exit = 1;
      continue;
    }
    const stagedPath = stagePlaywrightState(authDir, roleName);
    console.log(`[xera:stage-auth] ✓ ${stagedPath}`);
    staged++;
  }

  if (staged === 0 && exit === 0) {
    console.error('[xera:stage-auth] nothing staged (no roles configured).');
    return 1;
  }
  return exit;
}
