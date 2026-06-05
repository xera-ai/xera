import { existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from '@playwright/test';
import { runAuthSetup, runPlaywright, stagePlaywrightState } from '@xera-ai/web';
import { readMeta } from '../artifact/meta';
import { generateRunId, resolveArtifactPaths } from '../artifact/paths';
import { needsRefresh } from '../auth/refresh';
import { readAuthState } from '../auth/state';
import { loadConfig } from '../config/load';
import { acquireLock, forceUnlock, isLockStale, readLock, releaseLock } from '../lock/file-lock';
import { NdjsonLogger } from '../logging/ndjson-logger';

export async function execCmd(argv: string[]): Promise<number> {
  const ticket = argv[0];
  if (!ticket) {
    console.error('[xera:exec] usage: exec <TICKET>');
    return 1;
  }
  const grepIdx = argv.indexOf('--grep');
  const grep = grepIdx > -1 ? argv[grepIdx + 1] : undefined;
  const cwd = process.cwd();
  const config = await loadConfig(cwd);
  const paths = resolveArtifactPaths(cwd, ticket);
  const runId = generateRunId();
  const log = new NdjsonLogger(paths.logPath);

  // Acquire lock
  if (!acquireLock(paths.lockPath, runId)) {
    if (isLockStale(paths.lockPath)) {
      console.error(
        `[xera:exec] stale lock detected; force unlocking. Run \`xera-internal unlock ${ticket}\` to clear manually.`,
      );
      forceUnlock(paths.lockPath);
      acquireLock(paths.lockPath, runId);
    } else {
      const existing = readLock(paths.lockPath);
      console.error(
        `[xera:exec] another run in progress (PID ${existing?.pid} on ${existing?.hostname}, started ${existing?.started_at}). Wait or run \`xera-internal unlock ${ticket}\`.`,
      );
      return 1;
    }
  }

  const t0 = Date.now();
  try {
    const meta = readMeta(paths.metaPath);
    const adapter = meta?.adapter ?? 'web';

    if (adapter === 'http') {
      if (!config.http) {
        throw new Error('http adapter requires http config block');
      }
      const env = process.env['XERA_ENV'] ?? config.http.defaultEnv;
      const { HttpAdapter } = await import('@xera-ai/http');
      const result = await HttpAdapter.execute({
        ticketDir: paths.ticketDir,
        config,
        runId,
        env,
      });
      log.log({
        step: 'exec.complete',
        runId,
        outcome: result.outcome,
        elapsedMs: Date.now() - t0,
      });
      console.log(`[xera:exec] runId=${runId} outcome=${result.outcome}`);
      // Exit 3 means "test failed" (expected vs infra error); lock released in finally
      return result.outcome === 'PASS' ? 0 : 3;
    }

    // adapter === 'web' — existing path below unchanged
    if (!config.web) {
      throw new Error('web adapter requires web config block');
    }
    const webConfig = config.web;

    // Resolve baseURL once for both the auth-refresh context and the
    // Playwright run. Precedence matches the standalone `auth-setup` command:
    // XERA_BASE_URL > web.baseUrl[env] > web.baseUrl[defaultEnv]. Without
    // this, a setupScript using a relative `page.goto('/login')` would fail
    // with "Cannot navigate to invalid URL" during implicit refresh (#209).
    const envName = process.env.XERA_ENV ?? webConfig.defaultEnv;
    const baseURL =
      process.env.XERA_BASE_URL ??
      webConfig.baseUrl[envName] ??
      webConfig.baseUrl[webConfig.defaultEnv]!;

    // Auth refresh per role declared in xera.config.ts
    if (webConfig.auth.strategy === 'storageState' && webConfig.auth.setupScript) {
      const browser = await chromium.launch();
      try {
        for (const [roleName, roleCreds] of Object.entries(webConfig.auth.roles)) {
          const entry = readAuthState(paths.authDir, roleName);
          if (
            needsRefresh(entry, {
              ttl: webConfig.auth.ttl,
              refreshBuffer: webConfig.auth.refreshBuffer,
            })
          ) {
            const email = process.env[roleCreds.envEmail];
            const password = process.env[roleCreds.envPassword];
            if (!email || !password) {
              console.error(
                `[xera:exec] missing env ${roleCreds.envEmail} or ${roleCreds.envPassword} for role "${roleName}"`,
              );
              return 1;
            }
            await runAuthSetup({
              role: roleName,
              creds: { email, password },
              setupScriptPath: join(cwd, webConfig.auth.setupScript),
              authDir: paths.authDir,
              browser,
              ...(baseURL ? { baseURL } : {}),
            });
            log.log({ step: 'auth-refresh', role: roleName });
          }
        }
      } finally {
        await browser.close();
      }
    }

    // Stage Playwright storageState files at predictable paths
    // (.xera/.auth/.cache/<role>.json) — generated spec.ts references these
    // via test.use({ storageState }) when an authenticated session is needed.
    if (webConfig.auth.strategy === 'storageState') {
      for (const roleName of Object.keys(webConfig.auth.roles)) {
        if (readAuthState(paths.authDir, roleName)) {
          stagePlaywrightState(paths.authDir, roleName);
        }
      }
    }

    // Use the root playwright.config.ts (generated by `xera init`). We never
    // emit a per-ticket config — that path duplicates the root and bit-rots.
    const cfgPath = join(cwd, 'playwright.config.ts');
    if (!existsSync(cfgPath)) {
      console.error(
        `[xera:exec] missing ${cfgPath}. Run \`xera init\` to scaffold it, then re-run.`,
      );
      return 1;
    }

    const runDir = paths.runPath(runId).runDir;
    mkdirSync(runDir, { recursive: true });

    const reportJsonPath = join(runDir, 'report.json');

    log.log({ step: 'exec.start', runId, env: envName, baseURL });
    const r = await runPlaywright({
      specPath: paths.specPath,
      configPath: cfgPath,
      outputDir: runDir,
      env: {
        XERA_BASE_URL: baseURL,
        XERA_ENV: envName,
        XERA_RUN_ID: runId,
        // Enables the opt-in xeraNetwork recorder to capture calls for web
        // CONTRACT_DRIFT detection. Recorder is a no-op unless attached.
        XERA_NETWORK_LOG: join(runDir, 'network.jsonl'),
        // Playwright's JSON reporter prints to stdout by default. Redirect it
        // to a file inside the run dir so xera:normalize has a deterministic
        // path to read.
        PLAYWRIGHT_JSON_OUTPUT_NAME: reportJsonPath,
      },
      ...(grep && { grep }),
    });
    log.log({ step: 'exec.done', runId, exit: r.exitCode, ms: Date.now() - t0 });

    console.log(`[xera:exec] runId=${runId} outcome=${r.outcome}`);
    // Exit 3 means "test failed" (expected vs infra error)
    return r.outcome === 'PASS' ? 0 : 3;
  } finally {
    releaseLock(paths.lockPath);
  }
}
