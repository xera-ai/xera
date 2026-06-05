import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { loadConfig } from '../config/load';

interface AuthSetupOpts {
  role?: string;
  shape: 'web' | 'http' | 'all';
}

function parseOpts(argv: string[]): AuthSetupOpts {
  const opts: AuthSetupOpts = { shape: 'all' };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = argv[i + 1];
    if (a === '--role' && next) {
      opts.role = next;
      i++;
    } else if (a === '--shape' && next) {
      if (next === 'web' || next === 'http' || next === 'all') opts.shape = next;
      i++;
    }
  }
  return opts;
}

export async function authSetupCmd(argv: string[]): Promise<number> {
  const opts = parseOpts(argv);
  const cwd = process.cwd();
  const config = await loadConfig(cwd);

  const authSetupScript = join(cwd, 'shared', 'auth-setup.ts');
  if (!existsSync(authSetupScript)) {
    console.error(
      `[xera:auth-setup] auth-setup.ts not found at ${authSetupScript}. Run 'npx @xera-ai/cli init' first.`,
    );
    return 1;
  }

  const mod = (await import(pathToFileURL(authSetupScript).href)) as {
    web?: unknown;
    http?: unknown;
  };

  let exitCode = 0;

  // Pre-flight: detect requested-but-impossible shapes before we silently no-op.
  // This is the issue #93 fix: previously `--shape http` against a project where
  // shared/auth-setup.ts only exports `web` would print nothing and exit 0,
  // leaving the user in an infinite "doctor says run auth-setup" loop.
  const shapeRequestsWeb = opts.shape === 'all' || opts.shape === 'web';
  const shapeRequestsHttp = opts.shape === 'all' || opts.shape === 'http';
  const explicit = opts.shape !== 'all';

  if (shapeRequestsWeb && config.web && typeof mod.web !== 'function') {
    console.error(
      `[xera:auth-setup] web adapter is configured in xera.config.ts but shared/auth-setup.ts is missing the \`web\` export.\n` +
        `                  Add: \`export const web = defineAuthSetup(async (page, role, creds) => { ... })\` — see docs/CONFIGURATION.md`,
    );
    exitCode = 1;
  }
  if (shapeRequestsHttp && config.http && typeof mod.http !== 'function') {
    console.error(
      `[xera:auth-setup] http adapter is configured in xera.config.ts but shared/auth-setup.ts is missing the \`http\` export.\n` +
        `                  Add: \`export const http = defineHttpAuthSetup(async (request, role, creds) => { ... })\` — see docs/CONFIGURATION.md`,
    );
    exitCode = 1;
  }
  if (explicit && opts.shape === 'web' && !config.web) {
    console.error(
      `[xera:auth-setup] --shape web requested, but xera.config.ts has no \`web\` block. Add a web: {...} block or use --shape http/all.`,
    );
    exitCode = 1;
  }
  if (explicit && opts.shape === 'http' && !config.http) {
    console.error(
      `[xera:auth-setup] --shape http requested, but xera.config.ts has no \`http\` block. Add an http: {...} block or use --shape web/all.`,
    );
    exitCode = 1;
  }
  if (!config.web && !config.http) {
    console.error(
      `[xera:auth-setup] no \`web\` or \`http\` block found in xera.config.ts — nothing to authenticate.`,
    );
    exitCode = 1;
  }

  // Unknown-role detection (#98): without this, a typoed --role silently
  // matches no iteration of the per-adapter loops and we exit 0 — leaving
  // the user wondering why `xera doctor` still reports the auth file missing.
  if (opts.role !== undefined) {
    const webRoles = shapeRequestsWeb && config.web ? Object.keys(config.web.auth.roles) : [];
    const httpRoles = shapeRequestsHttp && config.http ? Object.keys(config.http.auth.roles) : [];
    const allRoles = Array.from(new Set([...webRoles, ...httpRoles]));
    if (allRoles.length > 0 && !allRoles.includes(opts.role)) {
      const detail: string[] = [];
      if (webRoles.length > 0) detail.push(`web roles: ${webRoles.join(', ')}`);
      if (httpRoles.length > 0) detail.push(`http roles: ${httpRoles.join(', ')}`);
      console.error(
        `[xera:auth-setup] unknown role '${opts.role}' — configured roles: ${allRoles.join(', ')}\n` +
          `                  (${detail.join('; ')})`,
      );
      return 1;
    }
  }

  // Web roles
  if (
    (opts.shape === 'all' || opts.shape === 'web') &&
    config.web &&
    typeof mod.web === 'function'
  ) {
    const webConfig = config.web;
    const envName = process.env.XERA_ENV ?? webConfig.defaultEnv;
    const baseURL =
      process.env.XERA_BASE_URL ??
      webConfig.baseUrl[envName] ??
      webConfig.baseUrl[webConfig.defaultEnv];
    const { runAuthSetup } = await import('@xera-ai/web');
    const { chromium } = await import('@playwright/test');
    // XERA_HEADED=1 launches a visible browser so a human can complete
    // interactive flows (SSO/MFA) once before the encrypted session is cached
    // and subsequent runs work headless (#213).
    const headed = process.env.XERA_HEADED === '1';
    const browser = await chromium.launch({ headless: !headed });
    try {
      for (const [roleName, roleCreds] of Object.entries(webConfig.auth.roles)) {
        if (opts.role && roleName !== opts.role) continue;
        const email = process.env[roleCreds.envEmail];
        const password = process.env[roleCreds.envPassword];
        if (!email || !password) {
          console.error(
            `[xera:auth-setup] missing env vars ${roleCreds.envEmail} / ${roleCreds.envPassword} for role '${roleName}'`,
          );
          exitCode = 1;
          continue;
        }
        try {
          await runAuthSetup({
            role: roleName,
            creds: { email, password },
            setupScriptPath: authSetupScript,
            authDir: join(cwd, '.xera', '.auth'),
            browser,
            ...(baseURL ? { baseURL } : {}),
          });
          console.log(`[xera:auth-setup] ✓ ${roleName}.json (web)`);
        } catch (e) {
          console.error(`[xera:auth-setup] ✗ web/${roleName}: ${(e as Error).message}`);
          exitCode = 1;
        }
      }
    } finally {
      await browser.close();
    }
  }

  // Http roles
  if (
    (opts.shape === 'all' || opts.shape === 'http') &&
    config.http &&
    typeof mod.http === 'function'
  ) {
    // strategy: 'reuse-web-session' bypasses the user's http setupFn entirely
    // and lifts cookies/headers/tokens from the already-cached web storageState
    // via presetHttpAuth. This is what makes the strategy "deterministic" — the
    // user can't accidentally break it by editing shared/auth-setup.ts.
    if (config.http.auth.strategy === 'reuse-web-session') {
      const { runHttpAuthSetup, presetHttpAuth } = await import('@xera-ai/http');
      const webAuthDir = join(cwd, '.xera', '.auth');
      for (const roleName of Object.keys(config.http.auth.roles)) {
        if (opts.role && roleName !== opts.role) continue;
        try {
          await runHttpAuthSetup({
            authDir: webAuthDir,
            role: roleName,
            config: config.http,
            setupFn: async (request, role) =>
              presetHttpAuth({ request, role, config: config.http!, webAuthDir }),
            creds: { email: '', password: '' },
          });
          console.log(`[xera:auth-setup] ✓ http/${roleName}.json (reuse-web-session)`);
        } catch (e) {
          console.error(`[xera:auth-setup] ✗ http/${roleName}: ${(e as Error).message}`);
          exitCode = 1;
        }
      }
    } else if (config.http.auth.strategy === 'none') {
      // strategy: 'none' means the HTTP adapter applies no per-role auth, so
      // there's nothing to seed — but the scaffolded auth-setup.ts still calls
      // presetHttpAuth, which throws for 'none'. Skip the http roles entirely
      // instead of invoking the setupFn (#220).
      console.log(
        `[xera:auth-setup] http: skipped (strategy: 'none' — no per-role auth state required)`,
      );
    } else {
      // The auth-setup.ts template reads config via globalThis; set it for the user's function.
      (globalThis as Record<string, unknown>).__XERA_HTTP_CONFIG__ = config.http;

      const { runHttpAuthSetup } = await import('@xera-ai/http');
      for (const roleName of Object.keys(config.http.auth.roles)) {
        if (opts.role && roleName !== opts.role) continue;
        try {
          await runHttpAuthSetup({
            authDir: join(cwd, '.xera', '.auth'),
            role: roleName,
            config: config.http,
            setupFn: mod.http as Parameters<typeof runHttpAuthSetup>[0]['setupFn'],
            creds: { email: '', password: '' },
          });
          console.log(`[xera:auth-setup] ✓ http/${roleName}.json`);
        } catch (e) {
          console.error(`[xera:auth-setup] ✗ http/${roleName}: ${(e as Error).message}`);
          exitCode = 1;
        }
      }
    }
  }

  return exitCode;
}
