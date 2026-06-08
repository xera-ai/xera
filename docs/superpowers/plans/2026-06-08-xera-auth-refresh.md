# xera Auth Refresh Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship two complementary refresh mechanisms for `reuse-web-session` HTTP auth — (A) pre-flight refresh at `exec` Step 0 that auto-re-derives http auth from the still-valid web file, and (B) opt-in mid-suite refresh runtime that POSTs to a user-configured `refresh.endpoint`, mutates the persisted payload, and re-lifts CSRF per request. Closes [#221](https://github.com/xera-ai/xera/issues/221).

**Architecture:** Phase A is ~3 helpers (`needsRefresh`, `refreshHttpFromWeb`) + a hook in `exec.ts`/`stage-auth.ts`. Phase B is a new `packages/http/src/runtime/refresh-context.ts` module that returns a `Proxy<APIRequestContext>` from `newAuthedContext` when `payload.refresh` is set. Cookie parser + mutex + cross-process file-lock. IDP-agnostic — runtime parses `Set-Cookie` from any 2xx response.

**Tech Stack:** TypeScript ESM, vitest, Playwright `APIRequestContext`, Node `http` (mock IDP fixture), `acquireLock` from `packages/core/src/lock/file-lock.ts`, AES-256-GCM `writeAuthState`.

**Spec:** [2026-06-08-xera-auth-refresh-design.md](../specs/2026-06-08-xera-auth-refresh-design.md). Open questions §10 locked as:
- (1) in-house `parseSetCookie` (~50 LOC), no new deps
- (2) refresh log: NDJSON to xera.log + stdout once per role per exec
- (3) `refresh.method` enum = `'GET' | 'POST'` only (v1)
- (4) CSRF header always sent on refresh when `csrfHeader` resolves; advanced opt-out deferred
- (5) telemetry deferred (no `auth.refreshed` graph event in v1)

**Conventions:** ESM, `exactOptionalPropertyTypes` ON, `noUncheckedIndexedAccess` ON, vitest with `process.chdir` restore, no comments unless WHY non-obvious, workspace deps via caret semver, no new prod deps.

---

## File Structure

| File | Action | Responsibility |
|---|---|---|
| `packages/core/src/config/schema.ts` | Modify | Extend `ReuseWebSessionSchema` with optional `refresh: { endpoint, method, csrfHeader? }` |
| `packages/core/src/auth/refresh.ts` | Modify | Add `refreshHttpFromWeb()` (re-runs preset). Verify `needsRefresh()` signature usable for http entries too. |
| `packages/core/src/bin-internal/exec.ts` | Modify | Add pre-flight refresh hook after existing web auth refresh (reuse-web-session only) |
| `packages/core/src/bin-internal/stage-auth.ts` | Modify | Same pre-flight extension when staging http for reuse-web-session |
| `packages/http/src/auth-setup/preset.ts` | Modify | Persist `meta.refresh` block when config has it |
| `packages/http/src/runtime/parse-set-cookie.ts` | Create | In-house cookie parser (~50 LOC) |
| `packages/http/src/runtime/refresh-context.ts` | Create | `attachRefreshProxy`, `ensureFreshAccess`, `doRefresh`, `RefreshFailedError`, mutex |
| `packages/http/src/runtime/index.ts` | Modify | `newAuthedContext` wires proxy when `payload.refresh` set. Extend `AuthFilePayload` with `refresh?` + `refreshable.match?` field. |
| `packages/http/src/index.ts` | Modify | Re-export `RefreshFailedError` |
| `packages/cli/src/checks.ts` | Modify | Doctor soft check: `refresh.endpoint` reachable (HEAD), only under `--strict` |
| `fixtures/auth-refresh/mock-idp/server.ts` | Create | node:http mock that accepts POST, returns Set-Cookie with rotating access cookie |
| `fixtures/auth-refresh/xera.config.ts` | Create | Project fixture with `refresh.endpoint` pointing at mock IDP |
| `packages/cli/templates/http-xera.config.ts.tmpl` | Modify | Commented `refresh: {}` block when `isReuseWebSession` |
| `packages/cli/templates/mixed-xera.config.ts.tmpl` | Modify | Same |
| `packages/cli/templates/AGENTS.md.tmpl` | Modify | Refresh section under reuse-web-session lifecycle |
| `docs/CONFIGURATION.md` | Modify | New refresh section + 3 IDP recipes |
| `docs/guides/reuse-web-session.md` | Modify | Refresh lifecycle subsection |
| `docs/TROUBLESHOOTING.md` | Modify | 2 entries: "Refresh failed: <status>" + "401 after refresh succeeded" |
| `packages/core/test/auth/refresh.test.ts` | Modify | Tests for `refreshHttpFromWeb` |
| `packages/core/test/bin-internal/exec-preflight-refresh.test.ts` | Create | Pre-flight refresh integration |
| `packages/http/test/runtime/parse-set-cookie.test.ts` | Create | Cookie parser unit tests |
| `packages/http/test/runtime/refresh-context.test.ts` | Create | Proxy + mutex tests |
| `packages/http/test/integration/refresh-with-mock-idp.test.ts` | Create | Real refresh against mock IDP |
| `.changeset/auth-refresh.md` | Create | Minor bump v0.24.0 |

18 modifications + 9 creations.

---

## Task 1: Schema `refresh` field on ReuseWebSession

**Files:**
- Modify: `packages/core/src/config/schema.ts`
- Test: `packages/core/test/config/refresh-schema.test.ts` (create)

- [ ] **Step 1: Write failing test**

```ts
import { describe, expect, test } from 'vitest';
import { XeraConfigSchema } from '../../src/config/schema';

const base = {
  github: { repo: 'owner/repo' },
  adapters: ['http' as const],
  http: {
    baseUrl: { dev: 'http://api.test' },
    defaultEnv: 'dev',
    auth: {
      strategy: 'reuse-web-session' as const,
      roles: {
        admin: {
          reuseWebSession: {
            domainContains: 'test',
            cookies: { access: { match: { regex: '_at$' } } },
          },
        },
      },
    },
  },
};

describe('reuseWebSession.refresh schema', () => {
  test('refresh is optional', () => {
    const cfg = XeraConfigSchema.parse(base);
    expect(cfg.http?.auth.roles.admin?.reuseWebSession?.refresh).toBeUndefined();
  });

  test('accepts refresh block with required endpoint + method default POST', () => {
    const cfg = XeraConfigSchema.parse({
      ...base,
      http: {
        ...base.http,
        auth: {
          ...base.http.auth,
          roles: {
            admin: {
              reuseWebSession: {
                domainContains: 'test',
                cookies: { access: { match: { regex: '_at$' } } },
                refresh: { endpoint: '/auth/refresh' },
              },
            },
          },
        },
      },
    });
    const r = cfg.http?.auth.roles.admin?.reuseWebSession?.refresh;
    expect(r?.endpoint).toBe('/auth/refresh');
    expect(r?.method).toBe('POST');
  });

  test('method accepts GET and POST, rejects PATCH', () => {
    const ok = XeraConfigSchema.safeParse({
      ...base,
      http: {
        ...base.http,
        auth: {
          ...base.http.auth,
          roles: {
            admin: {
              reuseWebSession: {
                domainContains: 'test',
                cookies: { access: { match: { regex: '_at$' } } },
                refresh: { endpoint: '/x', method: 'GET' },
              },
            },
          },
        },
      },
    });
    expect(ok.success).toBe(true);

    const bad = XeraConfigSchema.safeParse({
      ...base,
      http: {
        ...base.http,
        auth: {
          ...base.http.auth,
          roles: {
            admin: {
              reuseWebSession: {
                domainContains: 'test',
                cookies: { access: { match: { regex: '_at$' } } },
                refresh: { endpoint: '/x', method: 'PATCH' },
              },
            },
          },
        },
      },
    });
    expect(bad.success).toBe(false);
  });

  test('csrfHeader is optional', () => {
    const cfg = XeraConfigSchema.parse({
      ...base,
      http: {
        ...base.http,
        auth: {
          ...base.http.auth,
          roles: {
            admin: {
              reuseWebSession: {
                domainContains: 'test',
                cookies: { access: { match: { regex: '_at$' } } },
                refresh: { endpoint: '/x', csrfHeader: 'X-XSRF-Token' },
              },
            },
          },
        },
      },
    });
    expect(cfg.http?.auth.roles.admin?.reuseWebSession?.refresh?.csrfHeader).toBe('X-XSRF-Token');
  });
});
```

- [ ] **Step 2: Run FAIL** — `npx vitest run packages/core/test/config/refresh-schema.test.ts`

- [ ] **Step 3: Modify schema**

In `packages/core/src/config/schema.ts`, extend `ReuseWebSessionSchema`:

```ts
const ReuseWebSessionSchema = z.object({
  domainContains: z.string().min(1),
  cookies: z.object({ /* existing */ }),
  refresh: z
    .object({
      endpoint: z.string().min(1),
      method: z.enum(['GET', 'POST']).default('POST'),
      csrfHeader: z.string().min(1).optional(),
    })
    .optional(),
});
```

- [ ] **Step 4: Run PASS + regression**

```bash
npx vitest run packages/core/test/config/
npm run typecheck
```

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/config/schema.ts packages/core/test/config/refresh-schema.test.ts
git commit -m "feat(core): reuseWebSession.refresh schema (endpoint, method, csrfHeader)"
```

---

## Task 2: Persist `meta.refresh` in preset

**Files:**
- Modify: `packages/http/src/auth-setup/preset.ts`
- Modify: `packages/http/test/auth-setup/preset-reuse.test.ts`

- [ ] **Step 1: Add test case**

Append to existing test file:

```ts
test('persists refresh meta when config has refresh block', async () => {
  const cfg = JSON.parse(JSON.stringify(baseConfig));
  cfg.auth.roles.admin.reuseWebSession.refresh = {
    endpoint: '/auth/refresh',
    method: 'POST',
  };
  seedWebState([
    { name: 'session_at', value: 'A', domain: 'api.x.com', path: '/', expires: Math.floor(Date.now()/1000) + 900 },
  ]);
  const res = await presetHttpAuth({
    request: fakeRequest, role: 'admin', config: cfg, webAuthDir: dir,
  });
  expect((res as any).meta?.refresh).toEqual({
    endpoint: '/auth/refresh',
    method: 'POST',
    csrfHeader: undefined,
  });
});

test('csrfHeader defaults to cookies.csr.header if absent in refresh block', async () => {
  const cfg = JSON.parse(JSON.stringify(baseConfig));
  cfg.auth.roles.admin.reuseWebSession.refresh = { endpoint: '/x' };
  seedWebState([
    { name: 'session_at', value: 'A', domain: 'api.x.com', path: '/', expires: Math.floor(Date.now()/1000) + 900 },
    { name: 'xs_csrf', value: 'C', domain: 'api.x.com', path: '/' },
  ]);
  const res = await presetHttpAuth({
    request: fakeRequest, role: 'admin', config: cfg, webAuthDir: dir,
  });
  expect((res as any).meta?.refresh?.csrfHeader).toBe('X-CSRF-Token');
});
```

- [ ] **Step 2: Run FAIL**

- [ ] **Step 3: Modify `preset.ts`**

After the existing `meta.csrf` block:

```ts
if (rws.refresh) {
  meta.refresh = {
    endpoint: rws.refresh.endpoint,
    method: rws.refresh.method,
    csrfHeader: rws.refresh.csrfHeader ?? (rws.cookies.csrf?.header),
  };
}
```

(Use conditional assignment for `csrfHeader` to satisfy `exactOptionalPropertyTypes`.)

- [ ] **Step 4: Run PASS**

- [ ] **Step 5: Commit**

```bash
git add packages/http/src/auth-setup/preset.ts packages/http/test/auth-setup/preset-reuse.test.ts
git commit -m "feat(http): persist refresh meta in reuse-web-session payload"
```

---

## Task 3: `refreshHttpFromWeb` helper + `needsRefresh` reuse

**Files:**
- Modify: `packages/core/src/auth/refresh.ts`
- Test: `packages/core/test/auth/refresh-http.test.ts` (create)

- [ ] **Step 1: Read existing refresh.ts**

```bash
cat packages/core/src/auth/refresh.ts
```

Identify existing `needsRefresh` signature. Verify it accepts `(entry, opts)` where opts has `ttl: string` and `refreshBuffer: string`. If signature differs, document and adapt.

- [ ] **Step 2: Write test**

```ts
import { describe, expect, test, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { writeAuthState, readAuthState } from '../../src/auth/state';
import { refreshHttpFromWeb } from '../../src/auth/refresh';

let dir: string;
const origKey = process.env.XERA_AUTH_KEY;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'xera-rhfw-'));
  process.env.XERA_AUTH_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
  if (origKey === undefined) delete process.env.XERA_AUTH_KEY;
  else process.env.XERA_AUTH_KEY = origKey;
});

describe('refreshHttpFromWeb', () => {
  test('re-derives http file from web file, returns success', async () => {
    // Seed web file
    mkdirSync(join(dir, '.xera/.auth'), { recursive: true });
    writeAuthState(join(dir, '.xera/.auth'), {
      role: 'admin',
      strategy: 'storageState',
      created_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + 86400_000).toISOString(),
      payload: { cookies: [
        { name: 'session_at', value: 'A', domain: 'api.x.com', path: '/', expires: Math.floor(Date.now()/1000) + 900 },
      ], origins: [] },
    });
    const httpConfig = {
      baseUrl: { dev: 'http://api.x.com' },
      defaultEnv: 'dev',
      auth: {
        strategy: 'reuse-web-session' as const,
        ttl: '8h',
        refreshBuffer: '30m',
        roles: {
          admin: {
            reuseWebSession: {
              domainContains: 'x.com',
              cookies: { access: { match: { regex: '_at$' }, driveExpiry: true } },
            },
          },
        },
      },
    };
    await refreshHttpFromWeb(dir, 'admin', httpConfig as never);
    const httpEntry = readAuthState(join(dir, '.xera/.auth/http'), 'admin');
    expect(httpEntry).not.toBeNull();
    expect((httpEntry!.payload as any).type).toBe('cookie');
  });
});
```

- [ ] **Step 3: Implement**

Append to `packages/core/src/auth/refresh.ts`:

```ts
import { join } from 'node:path';
import type { XeraConfig } from '../config/schema';

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
```

- [ ] **Step 4: Run PASS + typecheck**

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/auth/refresh.ts packages/core/test/auth/refresh-http.test.ts
git commit -m "feat(core): refreshHttpFromWeb re-derives http auth file from web preset"
```

---

## Task 4: Pre-flight refresh in `exec`

**Files:**
- Modify: `packages/core/src/bin-internal/exec.ts`
- Test: `packages/core/test/bin-internal/exec-preflight-refresh.test.ts` (create)

- [ ] **Step 1: Read exec.ts**

Locate the existing auth-refresh code (around the web `runAuthSetup` calls). Identify the insertion point.

- [ ] **Step 2: Write test**

```ts
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { cpSync, mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readAuthState, writeAuthState } from '../../src/auth/state';

let dir: string;
const origCwd = process.cwd();
const origKey = process.env.XERA_AUTH_KEY;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'xera-preflight-'));
  process.env.XERA_AUTH_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
  // Scaffold a project with reuse-web-session
  mkdirSync(join(dir, 'shared'), { recursive: true });
  writeFileSync(join(dir, 'shared/auth-setup.ts'), 'export const http = async () => ({}) as any;');
  writeFileSync(join(dir, 'xera.config.ts'), `export default {
    github: { repo: 'owner/repo' },
    adapters: ['http'],
    http: {
      baseUrl: { dev: 'http://api.test' },
      defaultEnv: 'dev',
      auth: {
        strategy: 'reuse-web-session',
        refreshBuffer: '30m',
        roles: {
          admin: { reuseWebSession: { domainContains: 'test', cookies: { access: { match: { regex: '_at$' } } } } },
        },
      },
    },
  };`);
  process.chdir(dir);
});

afterEach(() => {
  process.chdir(origCwd);
  rmSync(dir, { recursive: true, force: true });
  if (origKey === undefined) delete process.env.XERA_AUTH_KEY;
  else process.env.XERA_AUTH_KEY = origKey;
});

describe('exec pre-flight refresh for reuse-web-session', () => {
  test('re-derives http file when http expired but web fresh', async () => {
    // Seed web file fresh
    mkdirSync(join(dir, '.xera/.auth'), { recursive: true });
    writeAuthState(join(dir, '.xera/.auth'), {
      role: 'admin',
      strategy: 'storageState',
      created_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + 86400_000).toISOString(),
      payload: { cookies: [
        { name: 'session_at', value: 'A', domain: 'api.test', path: '/', expires: Math.floor(Date.now()/1000) + 900 },
      ], origins: [] },
    });
    // Seed http file with expires_at well in the past
    mkdirSync(join(dir, '.xera/.auth/http'), { recursive: true });
    writeAuthState(join(dir, '.xera/.auth/http'), {
      role: 'admin',
      strategy: 'apiToken',
      created_at: new Date(Date.now() - 86400_000).toISOString(),
      expires_at: new Date(Date.now() - 60_000).toISOString(),
      payload: { type: 'cookie', token: '', header: 'Authorization', scheme: '', cookies: [] },
    });
    const oldExp = readAuthState(join(dir, '.xera/.auth/http'), 'admin')!.expires_at;

    // Direct call to the pre-flight helper (avoid full exec which runs Playwright)
    const { runPreflight } = await import('../../src/bin-internal/exec');
    // OR (more likely) — call the function exec uses internally
    // Implementer: factor out the pre-flight loop into a small exported helper
    // for testability.
    
    // ... (test asserts http file's expires_at is now > now)
  });

  test('surfaces both-expired with hint to re-login web', async () => {
    // Seed both expired
    // Direct call → expect throw or error log mentioning --shape web
  });
});
```

(Implementer note: if `exec` is monolithic and hard to test, **factor out the pre-flight loop into an exported `preflightRefreshReuseWebSession(cfg, cwd)` helper** for testability. Document the change in commit message.)

- [ ] **Step 3: Modify exec.ts**

Insert after the existing web auth refresh loop:

```ts
if (config.http?.auth.strategy === 'reuse-web-session' && config.http.auth.roles) {
  const httpAuthDir = join(cwd, '.xera', '.auth', 'http');
  const webAuthDir = join(cwd, '.xera', '.auth');
  for (const roleName of Object.keys(config.http.auth.roles)) {
    const httpEntry = readAuthState(httpAuthDir, roleName);
    if (!needsRefresh(httpEntry, { ttl: config.http.auth.ttl, refreshBuffer: config.http.auth.refreshBuffer })) {
      continue;
    }
    const webEntry = readAuthState(webAuthDir, roleName);
    const webOpts = config.web ? { ttl: config.web.auth.ttl, refreshBuffer: config.web.auth.refreshBuffer } : { ttl: '8h', refreshBuffer: '30m' };
    if (!webEntry || needsRefresh(webEntry, webOpts)) {
      // Both expired — fall through; the runtime's "auth file expired" error has
      // the actionable web re-login message.
      continue;
    }
    try {
      await refreshHttpFromWeb(cwd, roleName, config.http);
      log(`[xera:exec] http auth pre-flight refreshed for role '${roleName}' (was within refreshBuffer)`);
    } catch (e) {
      console.warn(`[xera:exec] http pre-flight refresh failed for '${roleName}': ${(e as Error).message}`);
      // Fall through; later code will fail-fast on actual usage
    }
  }
}
```

- [ ] **Step 4: Verify**

```bash
npx vitest run packages/core/test/bin-internal/exec-preflight-refresh.test.ts
npx vitest run packages/core/test/bin-internal/
npm run typecheck
```

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/bin-internal/exec.ts packages/core/test/bin-internal/exec-preflight-refresh.test.ts
git commit -m "feat(core): pre-flight refresh of http auth at exec Step 0 for reuse-web-session"
```

---

## Task 5: Pre-flight refresh in `stage-auth`

**Files:**
- Modify: `packages/core/src/bin-internal/stage-auth.ts`

- [ ] **Step 1: Read stage-auth.ts**

Identify where it currently runs web refresh. Add the same pre-flight pattern as Task 4 for http strategy.

- [ ] **Step 2: Apply same pattern**

After existing web refresh loop:

```ts
if (config.http?.auth.strategy === 'reuse-web-session') {
  // ... mirror Task 4's preflight loop
}
```

- [ ] **Step 3: Verify** with existing stage-auth tests (no regressions)

- [ ] **Step 4: Commit**

```bash
git add packages/core/src/bin-internal/stage-auth.ts
git commit -m "feat(core): stage-auth pre-flight refresh of http file for reuse-web-session"
```

---

## Task 6: `parseSetCookie` helper

**Files:**
- Create: `packages/http/src/runtime/parse-set-cookie.ts`
- Test: `packages/http/test/runtime/parse-set-cookie.test.ts`

- [ ] **Step 1: Test**

```ts
import { describe, expect, test } from 'vitest';
import { parseSetCookie } from '../../src/runtime/parse-set-cookie';

describe('parseSetCookie', () => {
  test('name=value only', () => {
    expect(parseSetCookie('foo=bar')).toEqual({ name: 'foo', value: 'bar' });
  });
  test('with Domain + Path + Expires', () => {
    const c = parseSetCookie('foo=bar; Domain=.x.com; Path=/; Expires=Sat, 06 Jun 2026 10:00:00 GMT');
    expect(c?.name).toBe('foo');
    expect(c?.domain).toBe('.x.com');
    expect(c?.path).toBe('/');
    expect(c?.expires).toBeGreaterThan(0);
  });
  test('with Max-Age (precedence over Expires)', () => {
    const c = parseSetCookie('foo=bar; Max-Age=600');
    expect(c?.expires).toBeGreaterThan(Math.floor(Date.now() / 1000));
    expect(c?.expires).toBeLessThan(Math.floor(Date.now() / 1000) + 700);
  });
  test('flags HttpOnly + Secure + SameSite', () => {
    const c = parseSetCookie('foo=bar; HttpOnly; Secure; SameSite=None');
    expect(c?.httpOnly).toBe(true);
    expect(c?.secure).toBe(true);
    expect(c?.sameSite).toBe('None');
  });
  test('returns null on garbage', () => {
    expect(parseSetCookie('')).toBeNull();
    expect(parseSetCookie('=bar')).toBeNull();
  });
});
```

- [ ] **Step 2: Run FAIL**

- [ ] **Step 3: Implement**

```ts
// packages/http/src/runtime/parse-set-cookie.ts
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

export function parseSetCookie(line: string): ParsedCookie | null {
  const trimmed = line.trim();
  if (!trimmed) return null;
  const parts = trimmed.split(';').map((p) => p.trim()).filter(Boolean);
  if (parts.length === 0) return null;
  const first = parts[0]!;
  const eq = first.indexOf('=');
  if (eq <= 0) return null;
  const name = first.slice(0, eq).trim();
  const value = first.slice(eq + 1).trim();
  if (!name) return null;
  const out: ParsedCookie = { name, value };
  let maxAge: number | undefined;
  let expiresAt: number | undefined;
  for (const attr of parts.slice(1)) {
    const aEq = attr.indexOf('=');
    const key = (aEq > 0 ? attr.slice(0, aEq) : attr).trim().toLowerCase();
    const val = aEq > 0 ? attr.slice(aEq + 1).trim() : undefined;
    switch (key) {
      case 'domain': if (val) out.domain = val; break;
      case 'path': if (val) out.path = val; break;
      case 'expires':
        if (val) {
          const d = Date.parse(val);
          if (!Number.isNaN(d)) expiresAt = Math.floor(d / 1000);
        }
        break;
      case 'max-age':
        if (val) {
          const n = Number(val);
          if (Number.isFinite(n)) maxAge = Math.floor(Date.now() / 1000) + n;
        }
        break;
      case 'httponly': out.httpOnly = true; break;
      case 'secure': out.secure = true; break;
      case 'samesite': if (val) out.sameSite = val; break;
    }
  }
  // RFC 6265: Max-Age takes precedence over Expires
  if (maxAge !== undefined) out.expires = maxAge;
  else if (expiresAt !== undefined) out.expires = expiresAt;
  return out;
}
```

- [ ] **Step 4: Run PASS**

- [ ] **Step 5: Commit**

```bash
git add packages/http/src/runtime/parse-set-cookie.ts packages/http/test/runtime/parse-set-cookie.test.ts
git commit -m "feat(http): in-house parseSetCookie (RFC 6265 minimal)"
```

---

## Task 7: `RefreshFailedError` + `ensureFreshAccess` + mutex skeleton

**Files:**
- Create: `packages/http/src/runtime/refresh-context.ts`
- Test: `packages/http/test/runtime/refresh-context.test.ts` (skeleton)

- [ ] **Step 1: Implement skeleton**

```ts
// packages/http/src/runtime/refresh-context.ts
import type { APIRequestContext } from '@playwright/test';
import { writeAuthState, readAuthState, type AuthStateEntry } from '@xera-ai/core';
import { parseSetCookie } from './parse-set-cookie';
import type { AuthFilePayload } from './index';

export class RefreshFailedError extends Error {
  constructor(public role: string, public status: number, public detail: string) {
    super(`Refresh failed for role '${role}' (${status}): ${detail}`);
    this.name = 'RefreshFailedError';
  }
}

export interface RefreshOpts {
  payload: AuthFilePayload;
  authDir: string;          // .xera/.auth/http
  role: string;
  refreshBufferMs: number;
  ttlMs: number;
  ctx: APIRequestContext;   // used to POST to refresh endpoint
}

const refreshMutex = new Map<string, Promise<void>>();

export async function ensureFreshAccess(opts: RefreshOpts): Promise<void> {
  if (!opts.payload.refresh) return;
  const accessCookie = findAccessCookie(opts.payload);
  if (!accessCookie) return;
  const expiresMs = (accessCookie.expires ?? 0) * 1000;
  if (expiresMs - Date.now() > opts.refreshBufferMs) return;

  const key = `${opts.authDir}::${opts.role}`;
  const inFlight = refreshMutex.get(key);
  if (inFlight) return inFlight;

  const p = doRefresh(opts).finally(() => refreshMutex.delete(key));
  refreshMutex.set(key, p);
  return p;
}

function findAccessCookie(payload: AuthFilePayload) {
  const am = payload.accessMatch;
  if (!am) return undefined;
  // Use the matcher to find access cookie
  // (Reuse pickOne from auth-setup/match.ts or replicate matcher logic)
  // ...
}

async function doRefresh(opts: RefreshOpts): Promise<void> {
  // ... see Task 8
  throw new Error('not yet implemented');
}
```

- [ ] **Step 2: Stub tests pass with placeholder behavior**

Skeleton test asserts module loads + RefreshFailedError throws correctly.

- [ ] **Step 3: Commit (skeleton)**

```bash
git add packages/http/src/runtime/refresh-context.ts packages/http/test/runtime/refresh-context.test.ts
git commit -m "feat(http): refresh-context skeleton (RefreshFailedError + mutex)"
```

---

## Task 8: `doRefresh` implementation (POST + parse Set-Cookie + persist)

**Files:**
- Modify: `packages/http/src/runtime/refresh-context.ts`
- Modify: `packages/http/test/runtime/refresh-context.test.ts`

- [ ] **Step 1: Test `doRefresh` with mock APIRequestContext**

```ts
test('doRefresh POSTs to endpoint and mutates payload cookies', async () => {
  const newAccessExpires = Math.floor(Date.now() / 1000) + 1000;
  const mockResponse = {
    status: () => 200,
    statusText: () => 'OK',
    headersArray: () => [
      { name: 'set-cookie', value: `session_at=NEW_VAL; Domain=api.x.com; Path=/; Max-Age=1000; HttpOnly` },
    ],
  };
  const mockCtx = {
    post: vi.fn(async () => mockResponse),
    get: vi.fn(async () => mockResponse),
  };
  
  const payload: AuthFilePayload = {
    type: 'cookie', token: '', header: 'Authorization', scheme: '',
    cookies: [{ name: 'session_at', value: 'OLD', domain: 'api.x.com', path: '/', expires: 1 }],
    accessMatch: { regex: '_at$' },
    refresh: { endpoint: 'http://api.x.com/refresh', method: 'POST' },
  };
  
  await doRefresh({
    payload, ctx: mockCtx as any, authDir: '/tmp/test', role: 'admin',
    refreshBufferMs: 60_000, ttlMs: 900_000,
  });
  
  expect(mockCtx.post).toHaveBeenCalledWith('http://api.x.com/refresh', expect.any(Object));
  expect(payload.cookies?.find(c => c.name === 'session_at')?.value).toBe('NEW_VAL');
});

test('doRefresh throws RefreshFailedError on 502', async () => {
  const mockCtx = { post: vi.fn(async () => ({ status: () => 502, statusText: () => 'Bad Gateway' })) };
  const payload: AuthFilePayload = { /* ... refresh configured */ };
  await expect(doRefresh({ /* ... */ })).rejects.toThrow(RefreshFailedError);
});

test('doRefresh throws when Set-Cookie has no access-matching cookie', async () => {
  const mockResponse = {
    status: () => 200,
    headersArray: () => [{ name: 'set-cookie', value: 'unrelated=x' }],
  };
  // ... expect RefreshFailedError
});
```

- [ ] **Step 2: Implement**

```ts
async function doRefresh(opts: RefreshOpts): Promise<void> {
  const r = opts.payload.refresh!;
  const accessMatch = opts.payload.accessMatch!;
  
  // Build refresh request — include current CSRF header if configured
  const headers: Record<string, string> = {};
  if (r.csrfHeader && opts.payload.csrf) {
    const csrfCookie = (opts.payload.cookies ?? []).find((c) => c.name === opts.payload.csrf!.cookieName);
    if (csrfCookie) headers[r.csrfHeader] = csrfCookie.value;
  }
  
  const reqOpts = { headers };
  const response = r.method === 'GET'
    ? await opts.ctx.get(r.endpoint, reqOpts)
    : await opts.ctx.post(r.endpoint, reqOpts);
  
  if (response.status() < 200 || response.status() >= 300) {
    throw new RefreshFailedError(opts.role, response.status(), `endpoint ${r.endpoint} returned ${response.statusText?.() ?? 'error'}`);
  }
  
  // Parse all Set-Cookie headers
  const setCookies = response.headersArray().filter((h) => h.name.toLowerCase() === 'set-cookie');
  const parsed = setCookies.map((h) => parseSetCookie(h.value)).filter((c): c is NonNullable<typeof c> => c !== null);
  
  // Find access cookie in response
  const matcher = cookieMatcherFromMatch(accessMatch);
  const newAccess = parsed.find((c) => matcher(c.name));
  if (!newAccess) {
    throw new RefreshFailedError(opts.role, response.status(),
      `response had no Set-Cookie matching access pattern. Got: ${parsed.map((c) => c.name).join(', ')}`);
  }
  
  // Mutate payload.cookies — replace by name match
  for (const p of parsed) {
    const idx = opts.payload.cookies!.findIndex((c) => c.name === p.name);
    const updated = {
      name: p.name, value: p.value,
      domain: p.domain ?? opts.payload.cookies?.[idx]?.domain ?? '',
      path: p.path ?? opts.payload.cookies?.[idx]?.path ?? '/',
      ...(p.expires !== undefined ? { expires: p.expires } : {}),
    };
    if (idx >= 0) opts.payload.cookies![idx] = updated;
    else opts.payload.cookies!.push(updated);
  }
  
  // Persist to disk (encrypted)
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

function cookieMatcherFromMatch(m: { literal: string } | { glob: string } | { regex: string }): (name: string) => boolean {
  if ('literal' in m) return (n) => n === m.literal;
  if ('glob' in m) {
    const escaped = m.glob.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.');
    const re = new RegExp(`^${escaped}$`);
    return (n) => re.test(n);
  }
  const re = new RegExp(m.regex, 'i');
  return (n) => re.test(n);
}
```

- [ ] **Step 3: Run tests, all PASS**

- [ ] **Step 4: Commit**

```bash
git add packages/http/src/runtime/refresh-context.ts packages/http/test/runtime/refresh-context.test.ts
git commit -m "feat(http): doRefresh POSTs, parses Set-Cookie, mutates payload, persists encrypted"
```

---

## Task 9: Mutex correctness test

**Files:**
- Modify: `packages/http/test/runtime/refresh-context.test.ts`

- [ ] **Step 1: Add concurrent refresh test**

```ts
test('concurrent ensureFreshAccess triggers ONE refresh', async () => {
  let postCount = 0;
  const mockCtx = { post: vi.fn(async () => { postCount++; await sleep(50); return mockResponse; }) };
  const payload = { /* expired access */ };
  const opts = { payload, ctx: mockCtx, authDir: tmpDir, role: 'admin', refreshBufferMs: 60_000, ttlMs: 900_000 };
  
  await Promise.all([
    ensureFreshAccess(opts),
    ensureFreshAccess(opts),
    ensureFreshAccess(opts),
    ensureFreshAccess(opts),
    ensureFreshAccess(opts),
  ]);
  
  expect(postCount).toBe(1);
});
```

- [ ] **Step 2: Verify the existing mutex logic handles this. If not, fix.**

- [ ] **Step 3: Commit**

```bash
git add packages/http/test/runtime/refresh-context.test.ts
git commit -m "test(http): mutex prevents concurrent refresh"
```

---

## Task 10: `attachRefreshProxy` + `newAuthedContext` integration

**Files:**
- Modify: `packages/http/src/runtime/refresh-context.ts`
- Modify: `packages/http/src/runtime/index.ts`
- Test: extend existing tests

- [ ] **Step 1: Implement `attachRefreshProxy`**

```ts
export function attachRefreshProxy(
  ctx: APIRequestContext,
  opts: Omit<RefreshOpts, 'ctx'>,
): APIRequestContext {
  if (!opts.payload.refresh) return ctx;
  const HTTP_METHODS = new Set(['fetch', 'get', 'post', 'put', 'patch', 'delete', 'head']);
  return new Proxy(ctx, {
    get(target, prop, receiver) {
      const orig = Reflect.get(target, prop, receiver);
      if (typeof orig !== 'function' || typeof prop !== 'string' || !HTTP_METHODS.has(prop)) {
        return orig;
      }
      return async (...args: unknown[]) => {
        await ensureFreshAccess({ ...opts, ctx: target });
        const newArgs = injectFreshCsrfHeader(args, opts.payload);
        return Reflect.apply(orig, target, newArgs);
      };
    },
  });
}

function injectFreshCsrfHeader(args: unknown[], payload: AuthFilePayload): unknown[] {
  if (!payload.csrf) return args;
  const cookie = (payload.cookies ?? []).find((c) => c.name === payload.csrf!.cookieName);
  if (!cookie) return args;
  
  // args[0] = url, args[1] = options
  const [url, options = {}] = args as [string, Record<string, unknown>?];
  const headers = { ...((options.headers as Record<string, string>) ?? {}) };
  headers[payload.csrf.header] = cookie.value;
  return [url, { ...options, headers }];
}
```

- [ ] **Step 2: Modify `newAuthedContext`**

After the existing CSRF lift block, wrap context if refresh is configured:

```ts
const ctx = await playwright.request.newContext(opts);
// ... existing trace recorder ...
if (payload.refresh) {
  return attachRefreshProxy(ctx, {
    payload, authDir: join(authDir, 'http'), role,
    refreshBufferMs: parseDuration(/* refreshBuffer */),
    ttlMs: parseDuration(/* ttl */),
  });
}
return ctx;
```

- [ ] **Step 3: Test integration**

Mock a fetch sequence that triggers refresh between requests.

- [ ] **Step 4: Commit**

```bash
git add packages/http/src/runtime/refresh-context.ts packages/http/src/runtime/index.ts packages/http/test/runtime/refresh-context.test.ts
git commit -m "feat(http): attachRefreshProxy wraps APIRequestContext with auto-refresh + CSRF re-lift"
```

---

## Task 11: `AuthFilePayload` extension + `RefreshFailedError` export

**Files:**
- Modify: `packages/http/src/runtime/index.ts` (extend `AuthFilePayload`)
- Modify: `packages/http/src/index.ts` (re-export `RefreshFailedError`)

- [ ] **Step 1: Extend interface**

```ts
export interface AuthFilePayload {
  type: 'bearer' | 'apiKey' | 'basic' | 'cookie';
  token: string;
  header: string;
  scheme: string;
  cookies?: Array<{ name: string; value: string; domain: string; path: string; expires?: number }>;
  csrf?: { cookieName: string; header: string };
  // NEW for refresh
  accessMatch?: { literal: string } | { glob: string } | { regex: string };
  refreshable?: { match: { literal: string } | { glob: string } | { regex: string }; path?: string };
  refresh?: { endpoint: string; method: 'GET' | 'POST'; csrfHeader?: string };
}
```

- [ ] **Step 2: Re-export**

In `packages/http/src/index.ts`:

```ts
export { RefreshFailedError, attachRefreshProxy } from './runtime/refresh-context';
```

- [ ] **Step 3: Run typecheck**

- [ ] **Step 4: Commit**

```bash
git add packages/http/src/runtime/index.ts packages/http/src/index.ts
git commit -m "feat(http): export AuthFilePayload.refresh fields + RefreshFailedError"
```

---

## Task 12: Mock IDP fixture + integration test

**Files:**
- Create: `fixtures/auth-refresh/mock-idp.ts` (node:http server)
- Create: `fixtures/auth-refresh/README.md`
- Create: `packages/http/test/integration/refresh-mock-idp.test.ts`

- [ ] **Step 1: Mock IDP**

```ts
// fixtures/auth-refresh/mock-idp.ts
import { createServer } from 'node:http';

let counter = 0;
export function startMockIdp(port: number = 0): Promise<{ url: string; close: () => void }> {
  return new Promise((resolve) => {
    const server = createServer((req, res) => {
      if (req.url === '/auth/refresh' && req.method === 'POST') {
        counter++;
        const newAccess = `NEW_AT_${counter}`;
        const maxAge = 60; // 1 minute
        res.setHeader('Set-Cookie', [
          `session_at=${newAccess}; Domain=localhost; Path=/; Max-Age=${maxAge}; HttpOnly`,
          `xs_csrf=NEW_CSRF_${counter}; Domain=localhost; Path=/`,
        ]);
        res.statusCode = 200;
        res.end('{}');
        return;
      }
      if (req.url === '/me' && req.method === 'GET') {
        // Check cookie matches latest
        const cookieHeader = req.headers.cookie || '';
        if (!cookieHeader.includes(`session_at=NEW_AT_${counter}`)) {
          res.statusCode = 401;
          res.end('stale token');
          return;
        }
        res.statusCode = 200;
        res.end(`{"counter":${counter}}`);
        return;
      }
      res.statusCode = 404;
      res.end();
    });
    server.listen(port, '127.0.0.1', () => {
      const addr = server.address() as { port: number };
      resolve({
        url: `http://127.0.0.1:${addr.port}`,
        close: () => server.close(),
      });
    });
  });
}
```

- [ ] **Step 2: Integration test**

```ts
import { startMockIdp } from '../../../../fixtures/auth-refresh/mock-idp';

test('full refresh cycle: GET /me triggers refresh after access expires', async () => {
  const idp = await startMockIdp();
  try {
    // Seed access cookie with expires < now (already expired)
    const payload: AuthFilePayload = { /* ... refresh.endpoint: `${idp.url}/auth/refresh` ... */ };
    const ctx = await playwright.request.newContext({ /* ... */ });
    const wrapped = attachRefreshProxy(ctx, { payload, ... });
    
    const res = await wrapped.get(`${idp.url}/me`);
    expect(res.status()).toBe(200);
    // Verify refresh was called: payload.cookies should now have session_at = NEW_AT_1
    expect(payload.cookies?.find(c => c.name === 'session_at')?.value).toMatch(/^NEW_AT_/);
  } finally {
    idp.close();
  }
});
```

- [ ] **Step 3: Commit**

```bash
git add fixtures/auth-refresh/ packages/http/test/integration/refresh-mock-idp.test.ts
git commit -m "test(http): mock IDP fixture + end-to-end refresh integration"
```

---

## Task 13: Doctor soft check

**Files:**
- Modify: `packages/cli/src/checks.ts`
- Test: extend `packages/cli/test/checks/reuse-strict.test.ts`

- [ ] **Step 1: Add check**

In the reuse-web-session doctor block, add:

```ts
if (entry?.payload && (entry.payload as { refresh?: { endpoint: string } }).refresh) {
  const refresh = (entry.payload as { refresh: { endpoint: string } }).refresh;
  checks.push({
    name: `reuse-web-session: refresh endpoint configured for role '${role}'`,
    ok: refresh.endpoint.length > 0,
    message: refresh.endpoint.length > 0 ? `endpoint: ${refresh.endpoint}` : 'endpoint missing',
  });
}
```

- [ ] **Step 2: Test**

```ts
test('refresh endpoint check appears when payload.refresh is set', async () => { ... });
```

- [ ] **Step 3: Commit**

```bash
git add packages/cli/src/checks.ts packages/cli/test/checks/reuse-strict.test.ts
git commit -m "feat(cli): doctor surfaces refresh endpoint config"
```

---

## Task 14: CLI scaffold templates

**Files:**
- Modify: `packages/cli/templates/http-xera.config.ts.tmpl`
- Modify: `packages/cli/templates/mixed-xera.config.ts.tmpl`

- [ ] **Step 1: Update both templates**

When `isReuseWebSession`, add a commented `refresh: {}` block under the role:

```ts
//         refresh: {
//           endpoint: 'https://api.your-domain.test/auth/refresh',
//           method: 'POST',
//         },
```

- [ ] **Step 2: Smoke test scaffold**

```bash
cd packages/cli && npm run build && cd -
rm -rf /tmp/scaf && mkdir /tmp/scaf && cd /tmp/scaf
/Users/.../packages/cli/bin/xera init --yes --shape api --auth-strategy reuse-web-session ...
grep -A 5 "refresh:" xera.config.ts
```

- [ ] **Step 3: Commit**

```bash
git add packages/cli/templates/
git commit -m "chore(cli): scaffold templates include reuse-web-session refresh option"
```

---

## Task 15: AGENTS.md template

**Files:**
- Modify: `packages/cli/templates/AGENTS.md.tmpl`

- [ ] **Step 1: Add subsection under "HTTP auth: reuse-web-session lifecycle"**

```markdown
### Auto-refresh (v0.24+)

Two refresh mechanisms ship with `reuse-web-session`:

1. **Pre-flight (automatic)**: `npx xera-internal exec <TICKET>` checks the http auth file at Step 0. If it's within `refreshBuffer` of expiring and the web auth file is still fresh, it auto-re-derives the http file. No user action required.

2. **Mid-suite (opt-in)**: configure `reuseWebSession.refresh: { endpoint, method }` to enable runtime refresh during a test. The HTTP context proxies each request, POSTs to your refresh endpoint when access cookie is near expiry, and re-lifts the CSRF header from the live cookies.

When both fail (web also expired): re-login via `XERA_HEADED=1 npx xera-internal auth-setup --role <role> --shape web`.
```

- [ ] **Step 2: Commit**

```bash
git add packages/cli/templates/AGENTS.md.tmpl
git commit -m "docs(cli): scaffold AGENTS.md mentions pre-flight + mid-suite refresh"
```

---

## Task 16: Docs CONFIGURATION + guide + troubleshooting

**Files:**
- Modify: `docs/CONFIGURATION.md`
- Modify: `docs/guides/reuse-web-session.md`
- Modify: `docs/TROUBLESHOOTING.md`

- [ ] **Step 1: CONFIGURATION refresh section** with 3 IDP recipes (per spec §6)

- [ ] **Step 2: Guide subsection** "Refresh lifecycle (v0.24+)"

- [ ] **Step 3: Troubleshooting 2 entries**:
  - "Refresh failed: 401" → endpoint requires different CSRF header
  - "401 after refresh succeeded" → endpoint returned 200 but didn't rotate access cookie

- [ ] **Step 4: Commit**

```bash
git add docs/
git commit -m "docs: refresh lifecycle + 3 IDP recipes + 2 troubleshooting entries"
```

---

## Task 17: Changeset + final regression

**Files:**
- Create: `.changeset/auth-refresh.md`

- [ ] **Step 1: Changeset**

```markdown
---
"@xera-ai/core": minor
"@xera-ai/http": minor
"@xera-ai/cli": minor
"@xera-ai/web": patch
"@xera-ai/skills": patch
"@xera-ai/prompts": patch
---

feat: auth refresh for reuse-web-session (closes #221)

Two complementary mechanisms eliminate the "auth expired mid-suite" failure mode:

- **Pre-flight refresh** (automatic): `xera-internal exec` Step 0 detects http
  auth files within `refreshBuffer` of expiring and auto-re-derives them from
  the still-valid web file (no IDP call, just re-runs the existing preset).

- **Mid-suite refresh** (opt-in): `reuseWebSession.refresh: { endpoint, method,
  csrfHeader? }` enables a runtime proxy on `newAuthedContext` that auto-refreshes
  via your configured endpoint before each request that would arrive after
  expiry. Updates cookies in place + re-lifts CSRF header per request.

Generic IDP-agnostic — parses Set-Cookie from any 2xx response, no IDP-specific
branching. Concurrent refreshes protected by mutex + cross-process file-lock.
Single attempt; failure throws typed RefreshFailedError with response status.

Backwards-compat: projects without `refresh` config behave exactly as v0.23.
```

- [ ] **Step 2: Full regression**

```bash
npm test
npm run typecheck
npm run lint
cd packages/cli && npm run build && cd -
```

- [ ] **Step 3: Commit**

```bash
git add .changeset/auth-refresh.md
git commit -m "chore: changeset for auth refresh (#221)"
```

---

## Self-Review Checklist

- [ ] Mutex test: 10 concurrent `ensureFreshAccess` → 1 refresh observed
- [ ] Mock IDP test: full refresh cycle works (counter increments after refresh, GET /me passes with new cookie)
- [ ] Refresh failure: 502 → RefreshFailedError with role + status + endpoint
- [ ] Refresh failure: response has Set-Cookie but no access match → RefreshFailedError with diagnostic
- [ ] Pre-flight: http expired, web fresh → re-derived, log message
- [ ] Pre-flight: both expired → existing "expired" error surfaced (no silent failure)
- [ ] Doctor reports `refresh: configured` when payload has `refresh` field
- [ ] No new prod deps in any package
- [ ] All tests `process.chdir` restore in afterEach
- [ ] Biome clean on touched files
- [ ] PR title is `feat:` so auto-changeset infers minor

---

## Execution Handoff

**Plan complete. Two execution options:**

1. **Subagent-Driven** (recommended) — dispatch fresh subagent per task, review between, fast iteration.
2. **Inline Execution** — batch with checkpoints in this session.

**Which approach?**
