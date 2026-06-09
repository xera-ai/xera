import { join } from 'node:path';
import { needsRefresh, refreshHttpFromWeb } from '../auth/refresh';
import { readAuthState } from '../auth/state';
import type { XeraConfig } from '../config/schema';

export interface PreflightLogger {
  log: (s: string) => void;
  warn: (s: string) => void;
}

/**
 * Pre-flight refresh for the `reuse-web-session` HTTP auth strategy.
 *
 * Called at `exec` Step 0 (and `stage-auth`). For each role whose http auth
 * file is within `refreshBuffer` of expiring, re-derives the http file from
 * the still-valid web file (no browser needed). If the web file is also
 * expired/missing, we fall through silently so the runtime's
 * "auth file expired" error can fire with the actionable web-relogin hint.
 *
 * Failure to refresh a single role is non-fatal: we warn and continue, so a
 * transient preset failure doesn't abort the whole exec.
 */
export async function preflightRefreshReuseWebSession(
  config: XeraConfig,
  cwd: string,
  logger?: PreflightLogger,
): Promise<void> {
  const httpCfg = config.http;
  if (!httpCfg || httpCfg.auth.strategy !== 'reuse-web-session') return;
  if (!httpCfg.auth.roles) return;

  const httpAuthDir = join(cwd, '.xera', '.auth', 'http');
  const webAuthDir = join(cwd, '.xera', '.auth');

  const webOpts = config.web
    ? { ttl: config.web.auth.ttl, refreshBuffer: config.web.auth.refreshBuffer }
    : { ttl: '8h', refreshBuffer: '30m' };

  for (const roleName of Object.keys(httpCfg.auth.roles)) {
    const httpEntry = readAuthState(httpAuthDir, roleName);
    if (
      !needsRefresh(httpEntry, {
        ttl: httpCfg.auth.ttl,
        refreshBuffer: httpCfg.auth.refreshBuffer,
      })
    ) {
      continue;
    }
    const webEntry = readAuthState(webAuthDir, roleName);
    if (!webEntry || needsRefresh(webEntry, webOpts)) {
      // Both expired (or web missing) — let runtime surface the actionable
      // "web re-login" error at point of use.
      continue;
    }
    try {
      await refreshHttpFromWeb(cwd, roleName, httpCfg);
      logger?.log(
        `[xera:exec] http auth pre-flight refreshed for role '${roleName}' (was within refreshBuffer)`,
      );
    } catch (e) {
      logger?.warn(
        `[xera:exec] http pre-flight refresh failed for '${roleName}': ${(e as Error).message}`,
      );
    }
  }
}
