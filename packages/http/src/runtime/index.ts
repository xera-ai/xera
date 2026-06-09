import { join } from 'node:path';
import type { APIRequestContext, request as pwRequestNs } from '@playwright/test';
import { readAuthState } from '@xera-ai/core';
import { attachTraceRecorder } from '../executor/trace-recorder';

const DEFAULT_AUTH_DIR = '.xera/.auth';

// Build an absolute URL by joining XERA_BASE_URL with `path`. Use this
// instead of `api.post('/path', …)` so the request still resolves correctly
// when XERA_BASE_URL has a path component (e.g. `http://host/api/v1`) —
// Playwright's built-in baseURL resolver collapses path-absolute requests
// onto the origin and drops the prefix. See issue #194.
export function apiPath(path: string): string {
  const baseURL = process.env.XERA_BASE_URL;
  if (!baseURL) {
    throw new Error('XERA_BASE_URL is not set. Run xera through the regular skill flow.');
  }
  const base = baseURL.endsWith('/') ? baseURL.slice(0, -1) : baseURL;
  const p = path.startsWith('/') ? path : `/${path}`;
  return `${base}${p}`;
}

export interface AuthFilePayload {
  type: 'bearer' | 'apiKey' | 'basic' | 'cookie';
  token: string;
  header: string;
  scheme: string;
  cookies?: Array<{ name: string; value: string; domain: string; path: string; expires?: number }>;
  csrf?: { cookieName: string; header: string };
  // Refresh-related fields (v0.24+). Populated by the reuse-web-session preset
  // when `cfg.http.auth.reuseWebSession.refresh` is configured.
  accessMatch?: { literal: string } | { glob: string } | { regex: string };
  refreshable?: {
    match: { literal: string } | { glob: string } | { regex: string };
    path?: string;
  };
  refresh?: {
    endpoint: string;
    method: 'GET' | 'POST';
    csrfHeader?: string;
  };
}

interface PlaywrightLike {
  request: typeof pwRequestNs;
}

export async function newAuthedContext(
  playwright: PlaywrightLike,
  role: string,
): Promise<APIRequestContext> {
  const authDir = process.env.XERA_AUTH_DIR ?? DEFAULT_AUTH_DIR;
  const baseURL = process.env.XERA_BASE_URL;
  if (!baseURL) {
    throw new Error('XERA_BASE_URL is not set. Run xera through the regular skill flow.');
  }
  const entry = readAuthState(join(authDir, 'http'), role);
  if (!entry) {
    throw new Error(
      `Auth file not found for role '${role}'. Run: npx xera-internal auth-setup --role ${role}`,
    );
  }
  if (new Date(entry.expires_at).getTime() < Date.now()) {
    throw new Error(
      `Auth file expired for role '${role}'. Run: npx xera-internal auth-setup --role ${role}`,
    );
  }
  const payload = entry.payload as unknown as AuthFilePayload;
  const extraHTTPHeaders: Record<string, string> = {};
  if (payload.type !== 'cookie') {
    const headerName = payload.header || 'Authorization';
    const headerValue = payload.scheme ? `${payload.scheme} ${payload.token}` : payload.token;
    extraHTTPHeaders[headerName] = headerValue;
  }
  const opts: Parameters<typeof playwright.request.newContext>[0] = {
    baseURL,
    extraHTTPHeaders,
  };
  if (payload.cookies && payload.cookies.length > 0) {
    opts.storageState = {
      cookies: payload.cookies.map((c) => ({
        name: c.name,
        value: c.value,
        domain: c.domain,
        path: c.path,
        expires: c.expires ?? -1,
        httpOnly: false,
        secure: false,
        sameSite: 'Lax' as const,
      })),
      origins: [],
    };
  }
  if (payload.csrf) {
    const csrfCfg = payload.csrf;
    const csrfCookie = (payload.cookies ?? []).find((c) => c.name === csrfCfg.cookieName);
    if (csrfCookie) {
      extraHTTPHeaders[csrfCfg.header] = csrfCookie.value;
    } else {
      console.warn(
        `[xera:http] reuse-web-session: csrf cookie '${csrfCfg.cookieName}' not present in stored cookies. POST/PUT/PATCH/DELETE may 403. Re-run: npx xera-internal auth-setup --role ${role} --shape http`,
      );
    }
  }
  let ctx = await playwright.request.newContext(opts);
  const traceFile = process.env.XERA_HTTP_TRACE;
  if (traceFile) {
    ctx = attachTraceRecorder(ctx, {
      traceFile,
      scenario: process.env.XERA_CURRENT_SCENARIO ?? 'unknown',
    });
  }
  if (payload.refresh) {
    const { attachRefreshProxy } = await import('./refresh-context');
    // Runtime has no access to xera.config.ts. Refresh buffer + TTL are read
    // from env vars set by `exec` (or other callers); fall back to sensible
    // defaults so direct `npx playwright test` invocations still work.
    const refreshBufferMs = process.env.XERA_REFRESH_BUFFER_MS
      ? Number(process.env.XERA_REFRESH_BUFFER_MS)
      : 60_000;
    const ttlMs = process.env.XERA_REFRESH_TTL_MS
      ? Number(process.env.XERA_REFRESH_TTL_MS)
      : 15 * 60_000;
    return attachRefreshProxy(ctx, {
      payload,
      authDir: join(authDir, 'http'),
      role,
      refreshBufferMs,
      ttlMs,
    });
  }
  return ctx;
}
