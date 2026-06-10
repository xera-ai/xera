# xera — Auth Refresh (Pre-flight + Mid-Suite) Design

**Status:** Draft for review
**Date:** 2026-06-08
**Author:** thanh@trinity-technology.com
**Closes:** [#221](https://github.com/xera-ai/xera/issues/221) — "refresh (or auto re-seed) for cookie-type http auth so short-lived SSO sessions don't expire mid-suite"

**Scope (one sentence):** Add two refresh mechanisms for `reuse-web-session` HTTP auth — (A) pre-flight refresh at `/xera-run` Step 0 that auto-re-derives the http auth file from the still-valid web file when it's near expiry, and (B) mid-suite refresh runtime that uses the persisted `refreshable.match` to call a user-configured refresh endpoint, mutates the persisted payload in place, and re-lifts the CSRF header per request.

**Depends on:** v0.22 reuse-web-session strategy + `payload.refreshable.match` + `payload.accessMatch` + `payload.csrf` surface (#235), the `newAuthedContext` runtime, the encrypted auth-state layer.

**Resolved design decisions:**

1. **Two-stage refresh, not one.** Pre-flight (A) is cheap (~50 LOC, no IDP calls — just re-runs the existing preset) and solves 80% of pain (single-ticket runs < 15 min). Mid-suite (B) is the IDP-aware proxy with `POST /auth/refresh`. Ship both because (A) is the safety net when (B) fails or the user hasn't configured the refresh endpoint.
2. **Pre-flight is built into `exec`** at Step 0, NOT a separate command. Reasons: zero user effort (no new command to remember), already in the critical path, fails fast with the same actionable doctor message if web is also expired.
3. **Mid-suite refresh is opt-in.** New `reuseWebSession.refresh: { endpoint, method, csrfHeader? }` config. If absent → pre-flight only. Default = absent (backwards-compat).
4. **Refresh endpoint contract is IDP-agnostic.** Generic shape: POST/GET to a URL with current cookies; server returns `Set-Cookie` headers with the new access (+ optionally new refresh, new csrf). Runtime parses `Set-Cookie` via Playwright's response → updates `payload.cookies` array in place → updates `payload.expires_at` from new access cookie. NO IDP-specific parsing (no Entra, Okta, Auth0 branching).
5. **Per-request CSRF re-lift.** When `refresh.endpoint` is configured, `newAuthedContext` returns a proxy that intercepts `fetch`/`get`/`post`/`put`/`patch`/`delete`/`head` calls, checks if access cookie is within `refreshBuffer` of expiry, refreshes if needed (single concurrent refresh via a mutex), and re-lifts CSRF header from the LIVE cookies array (which may have been mutated by the refresh). Without `refresh.endpoint`, `newAuthedContext` returns the existing context unchanged (no proxy overhead).
6. **Refresh runs are persisted.** Each successful refresh writes the updated auth state encrypted to disk (`writeAuthState`). Subsequent test workers (Playwright workers run in separate processes) read the fresh state. Concurrent refresh from multiple workers protected by `acquireLock` (same lock infrastructure as `auth-setup`).
7. **Pre-flight check threshold = `refreshBuffer` from existing `http.auth.refreshBuffer` config** (default `30m`). If `expires_at - now < refreshBuffer` AND web file is still fresh → re-derive.
8. **Failure mode is explicit.** If refresh endpoint returns non-2xx, OR `Set-Cookie` doesn't include the access cookie name, the runtime throws a typed `RefreshFailed` error with the response status + actionable message. Test continues to use the existing cookies (will likely fail with 401 on next request, but that surfaces clearly).
9. **Doctor reports refresh config status.** New check: if `refreshable.match` is in payload AND `reuseWebSession.refresh.endpoint` is configured → check `reuseWebSession.refresh.endpoint` returns reachable URL (HEAD request, optional, behind `--strict`). Soft check.
10. **No new prompts / no AI.** Refresh is deterministic.

**Out of scope (deferred):**
- IDP-specific helpers (`presetEntraRefresh`, `presetOktaRefresh`). User configures the generic endpoint; we document common IDP examples in docs.
- Refresh retry with exponential backoff (one attempt only; failure → throw).
- Refresh of WEB auth state (web SSO sessions require headed re-login; out of scope).
- Refresh telemetry events to the graph layer (potential v2 — track refresh count per role per day for cost monitoring).
- Refresh during `xera show-report` or `xera dashboard` (these are read-only and don't hit the API).
- `--no-refresh` opt-out at exec time (user can simply omit `refresh.endpoint` from config).

---

## 1. Goals & Scope

### 1.1 Goal

**Eliminate the "auth expired mid-suite" failure mode** for `reuse-web-session` projects so a QA running a 60-minute Playwright suite against an SSO-protected API doesn't have to plan around the 15-minute Microsoft Entra `orch_at` TTL.

Two complementary mechanisms:
- **Pre-flight refresh (A)**: at `/xera-run` Step 0 (`exec`'s pre-check), if the http auth file is within `refreshBuffer` of expiry AND the web auth file is still fresh, auto-re-run `presetHttpAuth` to derive a fresh http auth file. Zero user effort, no new command, no IDP awareness needed.
- **Mid-suite refresh (B)**: when `reuseWebSession.refresh: { endpoint }` is configured, `newAuthedContext` returns a proxy that auto-refreshes before sending any request that would arrive after expiry. Updates cookies in place + re-lifts CSRF header.

### 1.2 In-scope deliverables

**Config schema** (`packages/core/src/config/schema.ts`)
1. `ReuseWebSessionSchema.refresh: { endpoint, method, csrfHeader? } | undefined`

**Pre-flight refresh** (Phase A)
2. `packages/core/src/auth/refresh.ts` (already exists with web logic) gains `needsHttpRefresh(entry, refreshBufferMs)` + `refreshHttpFromWeb(...)` helpers (pure functions, reusable).
3. `packages/core/src/bin-internal/exec.ts` Step 0: if `cfg.http.auth.strategy === 'reuse-web-session'` AND auth file fresh-check fails AND web file exists/fresh → call `refreshHttpFromWeb`. Log `[xera:exec] http auth pre-flight refreshed for role 'X'`. If web also fresh-fails → fall through to existing "expired" error.
4. Same hook added to `packages/core/src/bin-internal/stage-auth.ts` (already does conditional refresh — extend to handle reuse-web-session case).

**Mid-suite refresh runtime** (Phase B)
5. `packages/http/src/runtime/refresh-context.ts` — new module:
   - `attachRefreshProxy(ctx, payload, opts)` returns a proxy `APIRequestContext` that wraps `fetch`/`get`/`post`/`put`/`patch`/`delete`/`head`.
   - Before each request: `await ensureFreshAccess(payload, opts)`. If access cookie is within `refreshBuffer`, acquire mutex, double-check, POST to `refresh.endpoint` with current cookies + CSRF header, parse `Set-Cookie` from response, mutate `payload.cookies` in place, persist via `writeAuthState`, release mutex.
   - Re-lift CSRF header from live cookies before each request (handles backend cookie rotation).
6. `packages/http/src/runtime/index.ts` — `newAuthedContext` returns `attachRefreshProxy(ctx, payload, refreshOpts)` when `payload.refreshable` AND user config has `refresh.endpoint`. Otherwise returns the existing context unchanged.

**Lock** (`packages/core/src/lock/`)
7. Refresh acquires the existing file-lock via `acquireLock` on the auth file. Single concurrent refresh per role across Playwright workers.

**Doctor**
8. `packages/cli/src/checks.ts` — new soft check: if config has `reuseWebSession.refresh.endpoint` AND payload has `refreshable.match` → check `endpoint` is a well-formed URL pointing at the same domain as `baseUrl`.

**Tests**
9. Unit: `refresh-context.test.ts` (proxy behavior with mock ctx + mock IDP).
10. Unit: pre-flight refresh in `exec.test.ts` (golden fixture: http file expired, web fresh → exec re-derives → test continues).
11. Integration: scaffolded mock-IDP fixture under `fixtures/auth-refresh/` (node:http server that accepts POST and returns Set-Cookie).
12. Mutex correctness: concurrent `attachRefreshProxy` calls trigger ONE refresh, not N.

**CLI**
- No new CLI command (refresh is automatic). Pre-flight is in `exec`. Mid-suite is in runtime.

**Skills / prompts**
- None. Pure deterministic.

**Docs**
13. `docs/CONFIGURATION.md` — extend `reuse-web-session` section with `refresh: { endpoint, method, csrfHeader }` block + common IDP recipes (Microsoft Entra, Okta, Auth0).
14. `docs/guides/reuse-web-session.md` — refresh lifecycle section.
15. `docs/TROUBLESHOOTING.md` — "Refresh failed mid-suite" entry.

**Templates**
16. `packages/cli/templates/{http,mixed}-xera.config.ts.tmpl` — when `isReuseWebSession`, scaffold a commented `refresh: { endpoint: '...', method: 'POST' }` block under the role.

**AGENTS.md.tmpl**
17. New section "Auth refresh (reuse-web-session)" explaining pre-flight (automatic) + mid-suite (opt-in).

### 1.3 Out of scope (see header)

### 1.4 Success criteria

- `npx xera-internal exec TICKET-001` against a fixture where `.xera/.auth/http/admin.json` has `expires_at` 5 min ago AND `.xera/.auth/admin.json` is fresh → exec re-derives http file silently AND test runs to completion.
- `npx xera-internal exec TICKET-001` where BOTH http and web are expired → exec fails with the existing "expired" message PLUS a hint "run `auth-setup --shape web` (and complete SSO)".
- Config with `refresh: { endpoint: '/auth/refresh', method: 'POST' }` AND web cookies that are about to expire: a 60-minute Playwright suite hits 200s consistently, with refresh triggered every ~15 min (per mock IDP TTL). Verified via mock IDP fixture.
- Concurrent workers (Playwright 4-worker config) trigger ONE refresh per access-cookie-expiry, not 4. Verified via mutex test.
- Refresh failure (mock IDP returns 502) → typed error with response status + role name. Test continues with stale cookies (will 401 next request, surfaced clearly).
- Doctor reports `refresh: configured, endpoint reachable` when `--strict` and IDP returns 2xx on HEAD.
- Backwards compat: project without `refresh` config behaves exactly like v0.23.0 (no proxy overhead, no refresh attempts).

---

## 2. Architecture — Pre-flight Refresh (Phase A)

### 2.1 Flow

```
exec <TICKET> Step 0
  │
  ├─ readHttpAuthFile(role)
  │   ├─ exists? no → fall through to existing "auth file missing" error
  │   └─ exists? yes
  │       │
  │       ├─ expires_at - now > refreshBuffer? YES → DONE (use as-is)
  │       └─ NO (within refreshBuffer or already expired)
  │           │
  │           ├─ strategy === 'reuse-web-session'? NO → existing "expired" error
  │           └─ YES
  │               │
  │               ├─ readWebAuthFile(role)
  │               │   ├─ exists + fresh? NO → "both expired, re-login" error
  │               │   └─ YES
  │               │       │
  │               │       ├─ acquireLock on http auth file
  │               │       ├─ refreshHttpFromWeb(cwd, role, config)
  │               │       │   = runHttpAuthSetup({ setupFn: presetHttpAuth({...webAuthDir}) })
  │               │       ├─ releaseLock
  │               │       └─ log "[xera:exec] http auth pre-flight refreshed for role 'X'"
```

### 2.2 New helpers

`packages/core/src/auth/refresh.ts` already exists for web. Add:

```ts
export async function refreshHttpFromWeb(
  cwd: string,
  roleName: string,
  httpConfig: NonNullable<XeraConfig['http']>,
): Promise<void> {
  const { runHttpAuthSetup, presetHttpAuth } = await import('@xera-ai/http');
  const webAuthDir = join(cwd, '.xera', '.auth');
  await runHttpAuthSetup({
    authDir: webAuthDir,
    role: roleName,
    config: httpConfig,
    setupFn: async (request, role) =>
      presetHttpAuth({ request, role, config: httpConfig, webAuthDir }),
    creds: { email: '', password: '' },
  });
}

export function needsRefresh(
  entry: AuthStateEntry | null,
  opts: { ttl: string; refreshBuffer: string },
): boolean {
  if (!entry) return false; // missing — different code path
  const buf = parseDuration(opts.refreshBuffer);
  return new Date(entry.expires_at).getTime() - Date.now() < buf;
}
```

(`needsRefresh` already exists for web — verify the existing signature works for both; if not, the implementer should refactor.)

### 2.3 exec.ts changes

`packages/core/src/bin-internal/exec.ts` — locate the existing auth-refresh code block (search for `runAuthSetup` calls within exec). Extend it:

```ts
// Existing: web auth refresh
// New: reuse-web-session http pre-flight refresh
if (cfg.http?.auth.strategy === 'reuse-web-session') {
  for (const roleName of Object.keys(cfg.http.auth.roles)) {
    const httpAuth = readAuthState(join(cwd, '.xera', '.auth', 'http'), roleName);
    if (needsRefresh(httpAuth, cfg.http.auth)) {
      const webAuth = readAuthState(join(cwd, '.xera', '.auth'), roleName);
      if (!needsRefresh(webAuth, cfg.web!.auth)) {
        log(`[xera:exec] http auth pre-flight refreshed for role '${roleName}' (was within refreshBuffer)`);
        await refreshHttpFromWeb(cwd, roleName, cfg.http);
      } else {
        // Both expired — fall through; existing handler surfaces "expired" error
        // with the actionable web re-login message.
      }
    }
  }
}
```

### 2.4 Where else to wire pre-flight

`stage-auth.ts` already has conditional refresh logic for web. Extend the same way: when staging http auth for reuse-web-session, run pre-flight refresh.

---

## 3. Architecture — Mid-Suite Refresh (Phase B)

### 3.1 New config field

`packages/core/src/config/schema.ts` — extend `ReuseWebSessionSchema`:

```ts
const ReuseWebSessionSchema = z.object({
  domainContains: z.string().min(1),
  cookies: z.object({ ... existing ... }),
  refresh: z
    .object({
      endpoint: z.string().min(1),                       // URL path or absolute URL
      method: z.enum(['GET', 'POST', 'PUT']).default('POST'),
      // CSRF header name — defaults to whatever cookies.csrf.header is, but can be overridden
      // (some IDPs use a different header for the refresh endpoint than for normal API calls)
      csrfHeader: z.string().optional(),
    })
    .optional(),
});
```

### 3.2 Persisted payload changes

`runHttpAuthSetup` already persists `refreshable.match` + `csrf` from preset. Add `refresh` block as well so the runtime knows how to refresh without re-reading config:

```ts
if (rws.refresh) {
  meta.refresh = {
    endpoint: rws.refresh.endpoint,
    method: rws.refresh.method,
    csrfHeader: rws.refresh.csrfHeader ?? rws.cookies.csrf?.header,
  };
}
```

### 3.3 Runtime proxy

`packages/http/src/runtime/refresh-context.ts`:

```ts
import type { APIRequestContext, APIResponse } from '@playwright/test';
import { writeAuthState } from '@xera-ai/core';
import { pickOne } from '../auth-setup/match';

interface RefreshOpts {
  payload: AuthFilePayload;
  authDir: string;
  role: string;
  refreshBufferMs: number;
  ttlMs: number;
}

// Mutex per role — multiple proxy methods sharing the same payload await the
// same refresh promise. Across processes, the file-lock (acquireLock) prevents
// concurrent refreshes.
const refreshMutex = new Map<string, Promise<void>>();

async function ensureFreshAccess(opts: RefreshOpts): Promise<void> {
  if (!opts.payload.refreshable || !opts.payload.refresh) return;
  const accessCookie = (opts.payload.cookies ?? []).find((c) => /* match accessMatch */);
  if (!accessCookie) return;
  const expiresMs = (accessCookie.expires ?? 0) * 1000;
  if (expiresMs - Date.now() > opts.refreshBufferMs) return; // still fresh

  const mutexKey = `${opts.authDir}::${opts.role}`;
  const inFlight = refreshMutex.get(mutexKey);
  if (inFlight) return inFlight;

  const promise = doRefresh(opts).finally(() => refreshMutex.delete(mutexKey));
  refreshMutex.set(mutexKey, promise);
  return promise;
}

async function doRefresh(opts: RefreshOpts): Promise<void> {
  // 1. Acquire file lock (cross-process)
  // 2. Re-read payload from disk (another worker may have just refreshed)
  // 3. Check expiry again post-lock; if fresh, release + return
  // 4. POST/GET to refresh.endpoint with cookies + csrf header
  // 5. Parse Set-Cookie from response, update payload.cookies
  // 6. writeAuthState to persist
  // 7. Release lock
}

export function attachRefreshProxy(
  ctx: APIRequestContext,
  payload: AuthFilePayload,
  opts: RefreshOpts,
): APIRequestContext {
  if (!opts.payload.refresh) return ctx; // no refresh configured
  return new Proxy(ctx, {
    get(target, prop, receiver) {
      const orig = Reflect.get(target, prop, receiver);
      if (typeof orig !== 'function') return orig;
      if (!['fetch', 'get', 'post', 'put', 'patch', 'delete', 'head'].includes(prop as string)) {
        return orig;
      }
      return async (...args: unknown[]) => {
        await ensureFreshAccess(opts);
        // Re-lift CSRF header from current cookies (in case backend rotated it)
        // by mutating the second arg (options) to include the freshest header.
        const newArgs = injectFreshCsrfHeader(args, opts.payload);
        return Reflect.apply(orig, target, newArgs);
      };
    },
  });
}
```

### 3.4 Refresh endpoint contract

Generic IDP-agnostic. The user's `refresh.endpoint` is a URL that:
- Accepts the current cookies (xera sends them automatically via the existing context)
- Returns one or more `Set-Cookie` response headers with a NEW value for at least the access cookie (and optionally new refresh, new CSRF)
- Returns 2xx on success

The runtime parses every `Set-Cookie` from `response.headersArray()` (Playwright surfaces these as `{ name: 'set-cookie', value: '...' }`), parses each via a tiny cookie parser (~30 LOC, handles `name=value; Domain=...; Path=...; Expires=...; HttpOnly; Secure`), matches against `accessMatch` / `refreshable.match` / `csrf.cookieName`, and mutates `payload.cookies` accordingly.

If response is non-2xx OR no `Set-Cookie` matches the access cookie name → throw:

```ts
throw new RefreshFailedError(
  `Refresh failed for role '${role}': ${response.status()} ${response.statusText()}. ` +
  `Configured endpoint: ${endpoint}. The access cookie was not rotated. ` +
  `Re-run XERA_HEADED=1 npx xera-internal auth-setup --role ${role} --shape web to recover.`
);
```

### 3.5 Per-request CSRF re-lift

Without refresh: CSRF is lifted once at context creation. If backend rotates `xs_csrf` cookie, the lifted header goes stale → 403.

With refresh (proxy enabled): before each request, re-lift from `payload.cookies` (which may have been mutated by a refresh). Implementation:

```ts
function injectFreshCsrfHeader(args: unknown[], payload: AuthFilePayload): unknown[] {
  if (!payload.csrf) return args;
  const cookie = (payload.cookies ?? []).find((c) => c.name === payload.csrf!.cookieName);
  if (!cookie) return args;
  // args is [url, options?] for most methods, or [request] for fetch
  // Merge cookie.value into args[1].headers[payload.csrf.header]
  // ...
}
```

### 3.6 Cookie parser

Minimal parser at `packages/http/src/runtime/parse-set-cookie.ts`:

```ts
export interface ParsedCookie {
  name: string;
  value: string;
  domain?: string;
  path?: string;
  expires?: number; // unix seconds
  httpOnly?: boolean;
  secure?: boolean;
  sameSite?: string;
}

export function parseSetCookie(line: string): ParsedCookie | null { ... }
```

~50 LOC. Tested directly.

---

## 4. Failure Modes & Error Handling

| Scenario | Detection | Recovery |
|---|---|---|
| Pre-flight: http expired, web fresh | exec Step 0 | Auto re-derive, log info, continue |
| Pre-flight: http expired, web expired | exec Step 0 | Existing "expired" error + hint to run `--shape web` |
| Pre-flight: web file missing | readAuthState → null | Existing "web file missing" error from preset |
| Mid-suite: refresh endpoint 4xx/5xx | response.status() | Throw `RefreshFailed`, surface response status |
| Mid-suite: refresh response has no Set-Cookie | parseSetCookie returns no access match | Throw `RefreshFailed` with diagnostic |
| Mid-suite: CSRF cookie missing post-refresh | injectFreshCsrfHeader skip | Warn once via console.warn; test continues without CSRF header (POST will likely 403, surfaced clearly) |
| Mid-suite: refresh attempted by 4 concurrent workers | Mutex + file-lock | One refresh, others await result |
| Mid-suite: refresh succeeds but storage write fails | writeAuthState throws | Throw `RefreshFailed` with disk-write context |
| Mid-suite: refresh.endpoint not configured but cookie expires | ensureFreshAccess no-op | Test 401s on next request, surfaced clearly |

### 4.1 `RefreshFailedError`

Typed error in `packages/http/src/runtime/refresh-context.ts`:

```ts
export class RefreshFailedError extends Error {
  constructor(public role: string, public status: number, public detail: string) {
    super(`Refresh failed for role '${role}' (${status}): ${detail}`);
  }
}
```

Runtime never auto-retries. Caller (Playwright test) sees the error as a test failure, classifier marks it via the standard rationale path.

---

## 5. Security

1. **Refresh endpoint URL is user-configured.** Must NOT be auto-extracted from cookie domain to prevent SSRF in any future "auto-detect" feature.
2. **Cookies sent to refresh endpoint are the real session cookies.** This is identical to how the API normally receives them — no new exfiltration vector. But scrub the response body before logging (existing scrub rules cover `Set-Cookie`, `Authorization`, `X-CSRF-Token`).
3. **Mutex prevents concurrent refresh races** — without it, two workers could each POST `/auth/refresh` and the second response would clobber the first cookies (some IDPs rotate refresh tokens on every refresh, breaking the first).
4. **File-lock prevents cross-process clobber** of `.xera/.auth/http/<role>.json`. The existing `acquireLock` API is reused.
5. **No new env vars, no new secrets, no new on-disk artifacts.** Refresh writes back to the same encrypted file.

---

## 6. Config Examples

### Microsoft Entra ID (orch_at = 15 min)

```ts
http: {
  auth: {
    strategy: 'reuse-web-session',
    refreshBuffer: '2m',                    // refresh when < 2m to expiry
    roles: {
      'ops-member': {
        reuseWebSession: {
          domainContains: 'one.shared.test',
          cookies: {
            access:  { match: { regex: '_at$' } },
            refresh: { match: { regex: '_rt$' }, path: '/auth' },
            csrf:    { match: { literal: 'orch_csrf' }, header: 'X-CSRF-Token' },
          },
          refresh: {
            endpoint: 'https://api.one.shared.test/auth/refresh',
            method: 'POST',
            // csrfHeader: 'X-CSRF-Token',  // defaults to cookies.csrf.header
          },
        },
      },
    },
  },
},
```

### Okta (`okta-session` rolling refresh)

```ts
refresh: {
  endpoint: 'https://your-org.okta.com/api/v1/sessions/me/lifecycle/refresh',
  method: 'POST',
}
```

### Auth0 silent auth

```ts
refresh: {
  endpoint: 'https://your-tenant.auth0.com/oauth/token',
  method: 'POST',
  // Auth0 returns new access_token via body, not Set-Cookie — out of scope v1
  // For v1, only Set-Cookie-based refresh is supported. Auth0 users fall back
  // to pre-flight only (or wrap in a custom defineHttpAuthSetup).
}
```

---

## 7. Tests

**Unit**

- `parse-set-cookie.test.ts` — common shapes, edge cases (no Domain, with Expires, Max-Age, sameSite variants).
- `refresh-context.test.ts` — mock APIRequestContext, mock IDP that returns Set-Cookie; assert payload mutated + writeAuthState called + CSRF re-lifted.
- `mutex.test.ts` — 10 concurrent `attachRefreshProxy` calls → 1 refresh.
- `exec.test.ts` pre-flight golden fixture — http expired, web fresh → exec re-derives → exit 0.

**Integration**

- `fixtures/auth-refresh/mock-idp/` — node:http server scaffold + golden test:
  - Worker A makes 3 requests over 20 min (with mocked clock or accelerated TTL of 1 minute)
  - Refresh triggers after request 1 (5s before TTL)
  - Worker B in parallel — single refresh observed, not two

**Adversarial**

- Refresh endpoint returns 502 → typed error, test surfaced clearly
- Refresh response has no `Set-Cookie` → typed error with diagnostic
- Refresh response has `Set-Cookie` but no access-matching cookie → typed error

---

## 8. Documentation Updates

- `docs/CONFIGURATION.md` — refresh section with 3 IDP recipes
- `docs/guides/reuse-web-session.md` — refresh lifecycle subsection
- `docs/TROUBLESHOOTING.md` — 2 new entries: "Refresh failed: 401" / "Refresh succeeded but next request 401" (= refresh endpoint not actually rotating)
- `AGENTS.md.tmpl` — refresh mention under reuse-web-session lifecycle section
- `packages/cli/templates/http-xera.config.ts.tmpl` + `mixed-xera.config.ts.tmpl` — commented `refresh: {}` block under role

---

## 9. Versioning

Minor bump: v0.24.0. Auto-changeset infers from `feat:` PR title.

Backwards-compat: existing reuse-web-session projects without `refresh` config behave exactly as v0.23.0.

---

## 10. Open Questions

1. **Cookie parser dependency**: ship in-house ~50 LOC or take `set-cookie-parser` dep? Recommendation: in-house. The package adds 4kb + a transitive dep tree; xera already has a tradition of small in-house parsers (globToRegex, etc.).
2. **Refresh attempt logging**: log every refresh to stdout, OR to `.xera/<TICKET>/runs/<run-id>/xera.log`? Recommendation: NDJSON to xera.log (already exists). Stdout only on first refresh per role per exec.
3. **`refresh.method` enum scope**: support `'GET' | 'POST' | 'PUT'` or add `'PATCH'`/`'DELETE'`? Recommendation: GET + POST only for v1 (the IDP refresh contract universally uses one of these).
4. **CSRF header for refresh request**: always send the lifted header? Some IDP refresh endpoints DON'T validate CSRF (because the request itself has the cookies → equivalent). Recommendation: send by default if `csrfHeader` resolves; user can opt out via `refresh.csrfHeader: false` (additional union member). Simpler v1: always send if available.
5. **Refresh telemetry**: emit a `graph` event `'auth.refreshed'` for trend tracking? Recommendation: defer to v2 — the noise/value tradeoff isn't clear yet.

These five answers go into the plan; none is load-bearing for the schema or runtime shape.

---

## 11. References

- Issue [#221](https://github.com/xera-ai/xera/issues/221) — the original ask
- Spec v0.22 `2026-06-06-xera-reuse-web-session-design.md` — the surface this builds on
- `packages/core/src/auth/refresh.ts` — existing web refresh pattern to extend
- `packages/core/src/lock/file-lock.ts` — mutex infrastructure
