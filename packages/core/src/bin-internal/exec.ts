import { resolveArtifactPaths, generateRunId } from '../artifact/paths';
import { acquireLock, releaseLock, isLockStale, readLock, forceUnlock } from '../lock/file-lock';
import { NdjsonLogger } from '../logging/ndjson-logger';
import { loadConfig } from '../config/load';
import { readAuthState } from '../auth/state';
import { needsRefresh } from '../auth/refresh';
import { stagePlaywrightState, runAuthSetup, runPlaywright } from '@xera/web';
import { chromium } from '@playwright/test';
import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

export async function execCmd(argv: string[]): Promise<number> {
  const ticket = argv[0];
  if (!ticket) { console.error('[xera:exec] usage: exec <TICKET>'); return 1; }
  const cwd = process.cwd();
  const config = await loadConfig(cwd);
  const paths = resolveArtifactPaths(cwd, ticket);
  const runId = generateRunId();
  const log = new NdjsonLogger(paths.logPath);

  // Acquire lock
  if (!acquireLock(paths.lockPath, runId)) {
    if (isLockStale(paths.lockPath)) {
      console.error(`[xera:exec] stale lock detected; force unlocking. Run \`xera-internal unlock ${ticket}\` to clear manually.`);
      forceUnlock(paths.lockPath);
      acquireLock(paths.lockPath, runId);
    } else {
      const existing = readLock(paths.lockPath);
      console.error(`[xera:exec] another run in progress (PID ${existing?.pid} on ${existing?.hostname}, started ${existing?.started_at}). Wait or run \`xera-internal unlock ${ticket}\`.`);
      return 1;
    }
  }

  const t0 = Date.now();
  try {
    // Auth refresh per role declared in xera.config.ts
    if (config.web.auth.strategy === 'storageState' && config.web.auth.setupScript) {
      const browser = await chromium.launch();
      try {
        for (const [roleName, roleCreds] of Object.entries(config.web.auth.roles)) {
          const entry = readAuthState(paths.authDir, roleName);
          if (needsRefresh(entry, { ttl: config.web.auth.ttl, refreshBuffer: config.web.auth.refreshBuffer })) {
            const email = process.env[roleCreds.envEmail];
            const password = process.env[roleCreds.envPassword];
            if (!email || !password) {
              console.error(`[xera:exec] missing env ${roleCreds.envEmail} or ${roleCreds.envPassword} for role "${roleName}"`);
              return 1;
            }
            await runAuthSetup({
              role: roleName,
              creds: { email, password },
              setupScriptPath: join(cwd, config.web.auth.setupScript),
              authDir: paths.authDir,
              browser,
            });
            log.log({ step: 'auth-refresh', role: roleName });
          }
        }
      } finally {
        await browser.close();
      }
    }

    // Stage Playwright storageState files for declared roles
    const stagedRoles: Record<string, string> = {};
    if (config.web.auth.strategy === 'storageState') {
      for (const roleName of Object.keys(config.web.auth.roles)) {
        if (readAuthState(paths.authDir, roleName)) {
          stagedRoles[roleName] = stagePlaywrightState(paths.authDir, roleName);
        }
      }
    }

    // Generate per-run playwright.config.ts if not present at ticketDir
    const cfgPath = join(paths.ticketDir, 'playwright.config.ts');
    if (!existsSync(cfgPath)) {
      writeFileSync(cfgPath, renderPlaywrightConfig({
        baseUrl: config.web.baseUrl[config.web.defaultEnv]!,
        storageStatePathPerRole: stagedRoles,
      }));
    }

    const runDir = paths.runPath(runId).runDir;
    mkdirSync(runDir, { recursive: true });

    log.log({ step: 'exec.start', runId });
    const r = await runPlaywright({ specPath: paths.specPath, configPath: cfgPath, outputDir: runDir });
    log.log({ step: 'exec.done', runId, exit: r.exitCode, ms: Date.now() - t0 });

    console.log(`[xera:exec] runId=${runId} outcome=${r.outcome}`);
    // Exit 3 means "test failed" (expected vs infra error)
    return r.outcome === 'PASS' ? 0 : 3;
  } finally {
    releaseLock(paths.lockPath);
  }
}

function renderPlaywrightConfig(opts: { baseUrl: string; storageStatePathPerRole: Record<string, string> }): string {
  const projects = Object.entries(opts.storageStatePathPerRole).map(
    ([role, path]) => `    { name: '${role}', use: { ...devices['Desktop Chromium'], storageState: '${path}' } }`,
  );
  if (projects.length === 0) projects.push(`    { name: 'default', use: { ...devices['Desktop Chromium'] } }`);
  return `import { defineConfig, devices } from '@playwright/test';
export default defineConfig({
  use: { baseURL: '${opts.baseUrl}', trace: 'on' },
  projects: [
${projects.join(',\n')}
  ],
});
`;
}
