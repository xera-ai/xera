import type { APIRequestContext } from '@playwright/test';
import { type AuthStateEntry, writeAuthState } from '@xera-ai/core';
import type { AuthFilePayload } from './index';
import { type ParsedCookie, parseSetCookie } from './parse-set-cookie';

/**
 * Cookie matcher payload — identical shape to `auth-setup/match.ts` but inlined
 * here to avoid a runtime->auth-setup cross-package import. Task R11 will fold
 * these fields into `AuthFilePayload` proper; for now we narrow via intersection
 * at the call sites.
 */
export type AccessMatch = { literal: string } | { glob: string } | { regex: string };

/**
 * Local view of the payload that includes the refresh-related fields that R2
 * (preset) writes into `meta` but that the published `AuthFilePayload` type
 * does not yet expose. Task R11 hoists these onto `AuthFilePayload` itself.
 */
export type RefreshAwarePayload = AuthFilePayload & {
  accessMatch?: AccessMatch;
  refreshable?: { match: AccessMatch; path?: string };
  refresh?: { endpoint: string; method: 'GET' | 'POST'; csrfHeader?: string };
};

export class RefreshFailedError extends Error {
  public readonly role: string;
  public readonly status: number;
  public readonly detail: string;

  constructor(role: string, status: number, detail: string) {
    super(`Refresh failed for role '${role}' (${status}): ${detail}`);
    this.name = 'RefreshFailedError';
    this.role = role;
    this.status = status;
    this.detail = detail;
  }
}

export interface RefreshOpts {
  payload: RefreshAwarePayload;
  authDir: string;
  role: string;
  refreshBufferMs: number;
  ttlMs: number;
  ctx: APIRequestContext;
}

// Module-level mutex: dedupes concurrent refreshes for the same (authDir, role).
const refreshMutex = new Map<string, Promise<void>>();

/**
 * Inspect the payload's access cookie expiry; if within `refreshBufferMs` of
 * now (or already past), trigger `doRefresh`. Concurrent callers for the same
 * (authDir, role) share one in-flight refresh via `refreshMutex`.
 *
 * No-ops when:
 *   - payload.refresh is not configured (rotation disabled), or
 *   - the access cookie cannot be located (caller will fall through to a 401
 *     and re-prompt for auth-setup).
 */
export async function ensureFreshAccess(opts: RefreshOpts): Promise<void> {
  if (!opts.payload.refresh) return;
  const accessCookie = findAccessCookie(opts.payload);
  if (!accessCookie) return;
  const expiresMs = (accessCookie.expires ?? 0) * 1000;
  if (expiresMs - Date.now() > opts.refreshBufferMs) return;

  const key = `${opts.authDir}::${opts.role}`;
  const inFlight = refreshMutex.get(key);
  if (inFlight) return inFlight;

  const p = doRefresh(opts).finally(() => {
    refreshMutex.delete(key);
  });
  refreshMutex.set(key, p);
  return p;
}

/**
 * POST (or GET) the refresh endpoint, parse Set-Cookie, mutate the payload's
 * cookies, and persist the encrypted entry back to disk. Throws
 * `RefreshFailedError` on non-2xx or when no Set-Cookie matches `accessMatch`.
 */
export async function doRefresh(opts: RefreshOpts): Promise<void> {
  const r = opts.payload.refresh;
  if (!r) {
    throw new RefreshFailedError(opts.role, 0, 'payload.refresh is not configured');
  }
  const accessMatch = opts.payload.accessMatch;
  if (!accessMatch) {
    throw new RefreshFailedError(opts.role, 0, 'payload.accessMatch is not configured');
  }

  // Build request headers: lift current CSRF cookie value into the configured
  // refresh CSRF header if present. csrfHeader is optional (R2 wrote it
  // conditionally) — only attach when both header name and cookie value exist.
  const headers: Record<string, string> = {};
  if (r.csrfHeader && opts.payload.csrf) {
    const csrfCfg = opts.payload.csrf;
    const csrfCookie = (opts.payload.cookies ?? []).find((c) => c.name === csrfCfg.cookieName);
    if (csrfCookie) headers[r.csrfHeader] = csrfCookie.value;
  }

  const reqOpts = { headers };
  const response =
    r.method === 'GET'
      ? await opts.ctx.get(r.endpoint, reqOpts)
      : await opts.ctx.post(r.endpoint, reqOpts);

  const status = response.status();
  if (status < 200 || status >= 300) {
    const statusText = typeof response.statusText === 'function' ? response.statusText() : 'error';
    throw new RefreshFailedError(
      opts.role,
      status,
      `endpoint ${r.endpoint} returned ${statusText}`,
    );
  }

  // Parse all Set-Cookie headers from the response.
  const setCookies = response.headersArray().filter((h) => h.name.toLowerCase() === 'set-cookie');
  const parsed: ParsedCookie[] = [];
  for (const h of setCookies) {
    const c = parseSetCookie(h.value);
    if (c) parsed.push(c);
  }

  // Find the new access cookie among the parsed Set-Cookies.
  const matcher = cookieMatcherFromMatch(accessMatch);
  const newAccess = parsed.find((c) => matcher(c.name));
  if (!newAccess) {
    throw new RefreshFailedError(
      opts.role,
      status,
      `response had no Set-Cookie matching access pattern. Got: ${parsed
        .map((c) => c.name)
        .join(', ')}`,
    );
  }

  // Mutate payload.cookies — replace existing by name, append new.
  if (!opts.payload.cookies) opts.payload.cookies = [];
  const cookies = opts.payload.cookies;
  for (const p of parsed) {
    const idx = cookies.findIndex((c) => c.name === p.name);
    const existing = idx >= 0 ? cookies[idx] : undefined;
    const updated: { name: string; value: string; domain: string; path: string; expires?: number } =
      {
        name: p.name,
        value: p.value,
        domain: p.domain ?? existing?.domain ?? '',
        path: p.path ?? existing?.path ?? '/',
      };
    if (p.expires !== undefined) updated.expires = p.expires;
    else if (existing?.expires !== undefined) updated.expires = existing.expires;
    if (idx >= 0) cookies[idx] = updated;
    else cookies.push(updated);
  }

  // Persist encrypted state. Expiry tracks the new access cookie when present;
  // otherwise fall back to `now + ttlMs`.
  const expiresAt = newAccess.expires ? newAccess.expires * 1000 : Date.now() + opts.ttlMs;
  const entry: AuthStateEntry = {
    role: opts.role,
    strategy: 'apiToken',
    created_at: new Date().toISOString(),
    expires_at: new Date(expiresAt).toISOString(),
    payload: opts.payload as unknown as Record<string, unknown>,
  };
  writeAuthState(opts.authDir, entry);
}

/**
 * Look up the access cookie inside the payload, identified by `accessMatch`.
 * Returns undefined when no `accessMatch` is configured or no cookie matches.
 */
export function findAccessCookie(
  payload: RefreshAwarePayload,
): { name: string; value: string; domain: string; path: string; expires?: number } | undefined {
  const am = payload.accessMatch;
  if (!am) return undefined;
  const matcher = cookieMatcherFromMatch(am);
  return (payload.cookies ?? []).find((c) => matcher(c.name));
}

/**
 * Build a cookie-name predicate from one of the three match shapes. Mirrors
 * `auth-setup/match.ts`; intentionally inlined to avoid cross-package import
 * from runtime → auth-setup. Tests in
 * `packages/http/test/auth-setup/match.test.ts` already cover the matcher
 * semantics; this module's tests cover the integration with doRefresh.
 */
export function cookieMatcherFromMatch(m: AccessMatch): (name: string) => boolean {
  if ('literal' in m) {
    const lit = m.literal;
    return (n) => n === lit;
  }
  if ('glob' in m) {
    const escaped = m.glob
      .replace(/[.+^${}()|[\]\\]/g, '\\$&')
      .replace(/\*/g, '.*')
      .replace(/\?/g, '.');
    const re = new RegExp(`^${escaped}$`);
    return (n) => re.test(n);
  }
  const re = new RegExp(m.regex, 'i');
  return (n) => re.test(n);
}
