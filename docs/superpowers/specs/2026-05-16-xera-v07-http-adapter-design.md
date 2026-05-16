# xera v0.7 — HTTP Adapter Design

**Status:** Draft for review
**Date:** 2026-05-16
**Author:** thanh@trinity-technology.com
**Scope:** v0.7.0 — new `@xera-ai/http` adapter package (sibling of `@xera-ai/web`); init wizard expands to web / api / mixed; classifier gains `CONTRACT_DRIFT`, `RATE_LIMITED`, `AUTH_EXPIRED` buckets; web prompt updated to mention `page.request`; OpenAPI is optional context, not required.
**Depends on:** v0.6 (knowledge graph — uses existing `meta.json.adapter` field and classifier hook), v0.3 (prompt-injection defense — OpenAPI is untrusted input from disk).
**Out of scope (deferred to later v0.x):** `xera-feature --from-spec openapi.yaml` (v0.8), auto-detect adapter from story (v0.8), self-heal auto-PR for `CONTRACT_DRIFT` (v0.9), web-trace network-call ↔ OpenAPI matching (v0.9), cross-adapter graph linkage (v1.0), messaging / WebSocket / gRPC adapters (v1.x — separate packages, separate specs).

---

## 1. Goals & Scope

### 1.1 Goal

QA teams whose product is API-only (microservices, backend tickets) or mixed (UI + backend) get the same xera value loop they get for web today: AI-generated Gherkin from Jira story, classifier-explained failures, structured Jira posts, knowledge-graph areas — but for HTTP endpoints, without launching a browser.

A project picks **one of three shapes** at `bunx @xera-ai/cli init`:

| Shape | `xera.config.ts.adapters` | What runs |
|---|---|---|
| Web-only | `['web']` | Playwright full (browser + `page.request` available). API verifications inside a UI test are natural — they're already Playwright. |
| API-only | `['http']` | Playwright `APIRequestContext` standalone, no browser launched. |
| Mixed | `['web', 'http']` | Each ticket picks one in `meta.json.adapter`. Hybrid "UI test that also verifies via API" stays under `web` (uses `page.request`). Pure API tickets go under `http`. |

There is no "hybrid adapter." A web ticket that calls `page.request` is still a web ticket; xera doesn't invent new orchestration on top of what Playwright already gives you. This is the design's single most important simplification — it cuts an entire class of runtime work.

### 1.2 In-scope deliverables

- New package `@xera-ai/http` (`packages/http/`):
  - `TestAdapter` implementation (`generate`, `execute`, `classify`, `doctor`).
  - Executor built on `@playwright/test`'s `request.newContext()` — no browser.
  - Auth preset strategies: `bearer`, `apiKey`, `basic`, `oauth-cc`, `custom`, `none`.
  - `defineHttpAuthSetup` helper + `presetHttpAuth` built-in (parallels web's `defineAuthSetup`).
  - Runtime helper `newAuthedContext(playwright, role)` consumed by generated `spec.ts`.
  - HTTP trace normalizer (request/response pairs JSON, scrubbed via shared `scrub-rules.ts`).
  - OpenAPI loader (path or URL, optional).
- Config schema additions in `@xera-ai/core`:
  - New top-level `http` block (optional).
  - `web` block becomes optional (was required).
  - At least one of `web` / `http` must be present (refine).
- Classifier additions in `@xera-ai/core`:
  - `CONTRACT_DRIFT` — http adapter only in v0.7.
  - `RATE_LIMITED` — http adapter; web adapter unchanged (web trace network → schema matching is deferred to v0.9).
  - `AUTH_EXPIRED` — cross-adapter (both web and http).
- New prompt `packages/prompts/script-from-feature-http.md` (v1.0.0).
- Update prompt `packages/prompts/script-from-feature.md` (current web prompt; rename to `script-from-feature-web.md` for symmetry) — add an "Optional API verification" section so the LLM knows it can use `request.<method>` inside a Playwright test when AC mentions backend state.
- Skills updated to dispatch by `meta.json.adapter`:
  - `xera-script.md` reads `meta.json.adapter`, points at the right prompt.
  - `xera-exec.md` invokes the right runner (Playwright full vs `request`-only).
  - Other skills (`xera-fetch`, `xera-feature`, `xera-report`, `xera-impact`, `xera-promote`) are adapter-agnostic and need no changes.
- CLI `init` wizard branches on shape, scaffolds `xera.config.ts` and (if applicable) `openapi.yaml` reminder, env file template.
- CLI `doctor` adds http-specific checks (token presence, OpenAPI reachable if configured) with gentle warnings, never hard fails.
- `xera-internal` subcommand: `http-trace-normalize` (parallel to web's normalizer).
- `bun run xera:auth-setup` extended to iterate http roles (existing command, code change in the runner).
- Filesystem migration: existing `.xera/.auth/<role>.json` → `.xera/.auth/web/<role>.json`. Handled by `init --upgrade` and gracefully by the auth runner (reads either path during transition, writes only to the new location).
- Test fixtures:
  - `fixtures/mock-api/` — Bun.serve-based deterministic HTTP target (parallels `fixtures/mock-jira/`).
  - `fixtures/golden-tickets-http/` — golden tickets for HTTP classifier paths.
  - `fixtures/sample-app-http/` — minimal API surface (POST /users, GET /users/:id, with OpenAPI spec) for integration tests.
- Version bumps:
  - `@xera-ai/core` 0.4.4 → 0.5.0 (config schema breaking — `web` becomes optional; classifier export shape extended).
  - `@xera-ai/web` 0.2.1 → 0.3.0 (caret bump on core dep).
  - `@xera-ai/http` 0.0.0 → 0.1.0 (new package, semver-0 since brand new).
  - `@xera-ai/skills` 0.4.4 → 0.5.0 (skill text updated to mention http adapter and `page.request`).
  - `@xera-ai/prompts` 2.3.0 → 2.4.0 (new template + web template edit).
  - `@xera-ai/cli` 0.2.5 → 0.3.0 (init wizard breaking — generates different `xera.config.ts` shapes).

### 1.3 Out-of-scope (deferred — each gets its own spec)

- **`xera-feature --from-spec openapi.yaml`** — generate feature files directly from an OpenAPI spec, without a Jira story. v0.8. The full "spec is also an input source" wow.
- **Auto-detect adapter from story.** Today QA sets `meta.json.adapter` explicitly (or uses the project default when only one adapter is configured). Heuristic auto-detection ("this story has the word 'endpoint', use http") needs eval data before it's safe. v0.8.
- **`CONTRACT_DRIFT` on web trace.** Matching captured network calls in a Playwright trace to OpenAPI definitions requires a path-template matcher, content-negotiation handling, partial-response matching, oneOf/anyOf logic. This is a non-trivial subsystem. v0.9.
- **Self-heal auto-PR for `CONTRACT_DRIFT`.** Once we can detect, the heal prompt rewrites assertions and request bodies. Parallel to v0.5's selector heal. v0.9.
- **Cross-adapter graph linkage.** Endpoint as a first-class graph node; web tickets that call endpoint X link to api tickets that test endpoint X. v1.0.
- **Messaging adapters** (`@xera-ai/kafka`, `@xera-ai/amqp`, `@xera-ai/websocket`, …) — each is its own package and spec. v1.x+.
- **GraphQL / gRPC** — same pattern. v1.x+.

### 1.4 Why not just extend `@xera-ai/web`?

Two reasons.

1. **Browser install cost.** API-only teams shouldn't be forced to download Chromium (~200MB) and accept a 30s install step. A separate package keeps the dependency surface clean.
2. **Cleaner adapter contract per `TestAdapter` interface.** The interface already exists at `packages/core/src/adapter/types.ts`. Adding a second implementation validates the abstraction and sets the template for v1.x messaging adapters. If we cram HTTP into web, the abstraction stays untested.

The package boundary also means `@xera-ai/web`'s `doctor()` doesn't fail when OpenAPI isn't configured (it shouldn't — that's an http concern), and vice versa.

### 1.5 Success criteria

A maintainer can, from a clean checkout:

1. `bun install`
2. `bun run xera:doctor` — reports ok (validator checks new `script-from-feature-http.md` prompt + classifier additions).
3. `bun run xera:verify-prompts` — reports ok with 8 in-scope prompts (was 7).
4. `bun test` — all green, including new `packages/http/test/` and updated classifier tests.
5. `cd /tmp && rm -rf api-tryout && mkdir api-tryout && cd api-tryout && bunx @xera-ai/cli init --yes --shape api` — scaffolds api-only project. No `playwright install chromium` triggered.
6. Set bearer env var: `echo 'USER_BEARER_TOKEN=test-token-001' >> .env.local`. Run `bun run xera:auth-setup --role user`. Confirm `.xera/.auth/http/user.json` exists, is encrypted (`file` reports binary-ish), and `xera doctor` reports it ✓ with expiry hint.
7. Open Claude Code in that directory. Edit a seeded `PROJ-HTTP-001/meta.json` with a story that maps to `POST /users`. Run `/xera-run PROJ-HTTP-001`. Skill generates feature.md → spec.ts using `newAuthedContext`, runs it against the bundled mock-api server (which validates the Authorization header against the seeded token), posts result to mock-jira.
8. As a second smoke: `bunx @xera-ai/cli init --yes --shape mixed`. Run a web ticket whose AC includes "verify the order is created in backend." Confirm the generated script uses both `page.click` and `request.get`.
9. As a third smoke: in an http-only project with no OpenAPI configured, `bun run xera:doctor` emits the gentle warning ("OpenAPI not configured — CONTRACT_DRIFT detection disabled, schema-derived edge cases disabled") and exits ok.
10. As a fourth smoke (auth lifecycle): seed an expired JWT into `.xera/.auth/http/user.json`. Run `/xera-run PROJ-HTTP-001`. Run reports `AUTH_EXPIRED` with the suggested fix (`bun run xera:auth-setup --role user`).

If any of those breaks, v0.7.0 is not ready.

---

## 2. Architecture

### 2.1 Package layout

```
packages/
  http/                                       NEW
    package.json                              @xera-ai/http v0.1.0
    src/
      adapter.ts                              TestAdapter impl
      executor/
        index.ts                              runHttpScenarios entry
        playwright-config.ts                  generates http-only playwright config
      auth-setup/
        define.ts                             defineHttpAuthSetup + result types
        preset.ts                             presetHttpAuth (bearer/apiKey/basic/oauth-cc impls)
        runner.ts                             runHttpAuthSetup — invoked by xera:auth-setup
      runtime/
        index.ts                              newAuthedContext(playwright, role) — used by spec.ts
      openapi/
        loader.ts                             parse YAML/JSON, dereference $refs
        index.ts                              public lookup helpers
      trace-normalizer/
        normalize.ts                          raw runner log → normalized.json
        scrub.ts                              wraps shared scrub-rules.ts
      index.ts                                exports HttpAdapter
    test/
      adapter.test.ts
      auth/*.test.ts
      openapi/*.test.ts
      trace-normalizer/*.test.ts
    tsconfig.json
```

### 2.2 Adapter implementation outline

```ts
// packages/http/src/adapter.ts
import type { TestAdapter, ExecuteInput, RunResult, ... } from '@xera-ai/core/adapter';
import { runHttpScenarios } from './executor';
import { normalizeHttpRun } from './trace-normalizer/normalize';

export const HttpAdapter: TestAdapter = {
  id: 'http',

  async generate(_input) {
    // Generation is LLM-driven via skills + prompts (same pattern as web).
    return { artifacts: [], warnings: [] };
  },

  async execute(input: ExecuteInput): Promise<RunResult> {
    const runDir = join(input.ticketDir, 'runs', input.runId);
    const specPath = join(input.ticketDir, 'spec.ts');
    const raw = await runHttpScenarios({ specPath, runDir, config: input.config, env: input.env });
    const normalized = await normalizeHttpRun({ runId: input.runId, runDir });
    return { runId: input.runId, outcome: normalized.outcome, scenarios: ..., artifactsDir: runDir, rawReportPath: raw.rawReportPath, normalizedReportPath: join(runDir, 'normalized.json') };
  },

  async doctor() {
    const checks: DoctorReport['checks'] = [];
    try { await import('@playwright/test'); checks.push({ name: '@playwright/test installed', ok: true }); }
    catch { checks.push({ name: '@playwright/test installed', ok: false, message: 'Run `bun add -D @playwright/test`.' }); }
    // OpenAPI gentle warning is emitted from xera:doctor in core, not here, because it depends on config (which adapter.doctor() doesn't receive).
    return { ok: checks.every(c => c.ok), checks };
  },
};
```

`classify?` is not implemented in the adapter itself for v0.7 — classifier rules live in `@xera-ai/core/src/classifier/` so they can be applied uniformly across runs from any adapter. See §5.

### 2.3 Executor: how a script runs

`spec.ts` for an http ticket is a Playwright test file that uses `request` instead of `page`:

```ts
// .xera/PROJ-HTTP-001/spec.ts
import { test, expect, request, type APIRequestContext } from '@playwright/test';

test.describe('User registration validation', () => {
  let api: APIRequestContext;
  test.beforeAll(async () => {
    api = await request.newContext({
      baseURL: process.env.XERA_BASE_URL!,
      extraHTTPHeaders: { Authorization: `Bearer ${process.env.XERA_TOKEN_USER}` },
    });
  });
  test.afterAll(() => api.dispose());

  test('Reject empty email', async () => { ... });
  test('Reject malformed email', async () => { ... });
});
```

The runner is `@playwright/test` invoked with `--reporter=json` and a generated `playwright.config.ts` that has `projects: [{ name: 'http', use: { } }]` and no `browserName`. No browser launches. Run time per scenario is ~100ms instead of web's ~2-30s.

The runner records request/response pairs by attaching a `request` event hook (`request.newContext({...})` exposes `on('request')` / `on('response')`) and writing them to `runs/<RUN_ID>/http-trace.jsonl`. The trace normalizer consumes this in `xera-report` afterwards.

### 2.4 Trace normalizer

Web trace is large and binary-ish (Playwright `.zip` with screenshots, DOM dumps, network). HTTP trace is small structured JSONL — one line per call:

```jsonl
{"ts":"2026-05-16T10:23:01.123Z","scenario":"Reject malformed email","method":"POST","url":"/users","reqHeaders":{...},"reqBody":{"name":"alice","email":"not-an-email"},"status":500,"respHeaders":{...},"respBody":{"error":"Internal server error"},"durationMs":142}
```

Normalizer:
1. Reads `http-trace.jsonl`.
2. Scrubs request/response headers and bodies through the shared `packages/web/src/trace-normalizer/scrub-rules.ts` (the rules module is portable; we may relocate it to `@xera-ai/core` in this PR if that's cleaner — TBD during implementation, not a design decision here).
3. Generates a reproducible `curl` per call (with scrubbed Authorization).
4. Emits `normalized.json` matching the existing schema where applicable (per-scenario outcome, failure attached to scenario), plus an `http.calls` array carrying the per-call detail used by classifier + Jira post.

Scrubbing is non-negotiable — same posture as web. Adding rules is fine; removing is not (per CLAUDE.md reflex).

### 2.5 Auth — pre-authentication, per-role encrypted file

**Mirror of web's `auth-setup.ts` → `.xera/.auth/<role>.json` pattern.** A QA team runs pre-authentication ONCE per role; the resulting token (and any session cookies) lands in an encrypted file. Test runs read the file at startup. No raw tokens in env vars at run time.

The core auth state module already supports this — `packages/core/src/auth/state.ts` exports `AuthStateEntry` with `strategy: z.enum(['storageState', 'apiToken'])`. The `apiToken` branch was anticipated by the original architecture; v0.7 activates it.

#### 2.5.1 Storage layout

```
.xera/.auth/
  web/<role>.json         encrypted storageState (cookies/localStorage)
  http/<role>.json        encrypted { token, type, cookies?, expires_at }
```

Web's existing path `.xera/.auth/<role>.json` is migrated to `.xera/.auth/web/<role>.json` (migration handled by `init --upgrade`; existing roles auto-moved). This avoids name collision when a mixed project has the same role under both adapters.

File payload schema for http:

```ts
{
  role: 'admin',
  strategy: 'apiToken',
  created_at: '2026-05-16T10:00:00.000Z',
  expires_at: '2026-05-16T18:00:00.000Z',
  payload: {
    type: 'bearer',                     // 'bearer' | 'apiKey' | 'basic' | 'cookie'
    token: '<jwt-or-opaque>',
    header: 'Authorization',            // header name to attach; default 'Authorization' for bearer
    scheme: 'Bearer',                   // header value prefix; default 'Bearer ' for bearer
    cookies?: [{ name, value, domain, path, expires? }],   // optional session cookies
  },
}
```

Same AES-256-GCM encryption as web (`packages/core/src/auth/encrypt.ts`, key from `packages/core/src/auth/key.ts`). File is gitignored by `init`.

#### 2.5.2 Pre-auth script: `defineHttpAuthSetup`

Mirror of web's `defineAuthSetup`. New helper exported from `@xera-ai/http`:

```ts
// packages/http/src/auth-setup/define.ts
import type { APIRequestContext } from '@playwright/test';

export interface HttpAuthRoleCreds { email: string; password: string; }
export interface HttpAuthSetupResult {
  type: 'bearer' | 'apiKey' | 'basic' | 'cookie';
  token: string;
  header?: string;
  scheme?: string;
  cookies?: Array<{ name: string; value: string; domain: string; path: string; expires?: number }>;
  expiresAt?: number;
}
export type HttpAuthSetupFn = (
  request: APIRequestContext,
  role: string,
  creds: HttpAuthRoleCreds,
) => Promise<HttpAuthSetupResult>;

export function defineHttpAuthSetup(fn: HttpAuthSetupFn): HttpAuthSetupFn { return fn; }
```

User's `auth-setup.ts` (mixed project example):

```ts
import { defineAuthSetup } from '@xera-ai/web';
import { defineHttpAuthSetup } from '@xera-ai/http';

// Web roles — opens browser, logs in via UI, captures storageState.
export const web = defineAuthSetup(async (page, _role, creds) => {
  await page.goto('/login');
  await page.getByLabel('Email').fill(creds.email);
  await page.getByLabel('Password').fill(creds.password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL(/.*\/dashboard/);
  return { expiresAt: Date.now() + 8 * 3600 * 1000 };
});

// HTTP roles — POSTs /auth/login, captures bearer token (and any session cookies).
export const http = defineHttpAuthSetup(async (request, _role, creds) => {
  const res = await request.post('/auth/login', { data: creds });
  if (res.status() !== 200) throw new Error(`Login failed: ${res.status()}`);
  const body = await res.json();
  const cookies = await request.storageState().then(s => s.cookies);
  return {
    type: 'bearer',
    token: body.access_token,
    expiresAt: Date.now() + body.expires_in * 1000,
    cookies: cookies.length > 0 ? cookies : undefined,
  };
});
```

Web-only and api-only projects only export the relevant function.

#### 2.5.3 Preset strategies (when no custom login flow needed)

90% of teams won't need to write `defineHttpAuthSetup` by hand. For these cases, `init` scaffolds an `auth-setup.ts` that uses a preset strategy from config:

```ts
// xera.config.ts
http: {
  auth: {
    strategy: 'bearer',          // 'bearer' | 'apiKey' | 'basic' | 'oauth-cc' | 'custom' | 'none'
    roles: {
      admin: { tokenEnv: 'ADMIN_BEARER_TOKEN' },
      user:  { tokenEnv: 'USER_BEARER_TOKEN' },
    },
  },
},
```

Scaffolded `auth-setup.ts`:

```ts
import { defineHttpAuthSetup, presetHttpAuth } from '@xera-ai/http';
export const http = defineHttpAuthSetup(presetHttpAuth);  // reads config.http.auth.strategy
```

`presetHttpAuth` is the built-in implementation:
- `bearer` / `apiKey`: read `process.env[role.tokenEnv]` → wrap as result.
- `basic`: base64(`process.env[userEnv]:process.env[passEnv]`) → result.
- `oauth-cc`: POST `tokenUrl` with `grant_type=client_credentials`, return `access_token` + `expires_in`.
- `none`: throw — should not call pre-auth for `none`.

Users escape to a custom function by replacing the export body. The `strategy: 'custom'` value tells doctor not to validate preset-specific fields (`tokenEnv`, `tokenUrl`, etc.).

#### 2.5.4 Runner: `bun run xera:auth-setup`

Existing command (web's). Extended to also iterate http roles:

1. Read `xera.config.ts`. For each adapter configured:
   - Each role in `web.auth.roles` → run `web` export with credentials from env (`auth.roles.<role>.envEmail/envPassword`).
   - Each role in `http.auth.roles` → run `http` export with credentials (for preset `bearer`/`apiKey`/`basic`: feed `tokenEnv`/`userEnv`/`passEnv` env values; for preset `oauth-cc`: feed `clientIdEnv`/`clientSecretEnv`; for `custom`: feed `envEmail`/`envPassword` for whatever the user's function needs).
2. Each successful function returns a result.
3. Runner writes encrypted `.xera/.auth/{web|http}/<role>.json` via `writeAuthState`.
4. Failures print clear errors per role; partial success allowed (one bad role doesn't block others).

CI invocation: `bun run xera:auth-setup --role admin` (single role) or no arg (all roles).

#### 2.5.5 Run-time: how `spec.ts` uses the token

Generated `spec.ts` for http tickets uses a new runtime helper from `@xera-ai/http`:

```ts
import { test, expect } from '@playwright/test';
import { newAuthedContext } from '@xera-ai/http/runtime';

test.describe('User registration validation', () => {
  let api: APIRequestContext;
  test.beforeAll(async ({ playwright }) => {
    api = await newAuthedContext(playwright, 'user');     // reads .xera/.auth/http/user.json
  });
  test.afterAll(() => api.dispose());

  test('Reject empty email', async () => {
    const res = await api.post('/users', { data: { name: 'alice', email: '' } });
    expect(res.status()).toBe(422);
  });
});
```

`newAuthedContext(playwright, role)`:
1. Calls `readAuthState('http', role)` → decrypted entry.
2. If file missing → throws with message `"Auth file not found for role '<role>'. Run: bun run xera:auth-setup --role <role>"`.
3. If `expires_at` past → emits classifier hint `AUTH_EXPIRED` for the run and throws same message (single source of truth: missing OR expired both require re-running auth-setup).
4. Builds `APIRequestContext` with `baseURL`, the auth header from payload (`payload.header: payload.scheme + ' ' + payload.token`), and any cookies attached.

The prompt `script-from-feature-http.md` teaches the LLM this pattern verbatim.

#### 2.5.6 Doctor check

Replaces the env-var presence checks from earlier draft:

```
$ xera doctor

✓ HTTP adapter configured
✓ Auth file present:  .xera/.auth/http/admin.json (expires in 7h 23m)
✓ Auth file present:  .xera/.auth/http/user.json  (expires in 7h 23m)
⚠ Auth file expired:  .xera/.auth/http/readonly.json (expired 2h ago)
    → Run: bun run xera:auth-setup --role readonly
✗ Auth file missing:  .xera/.auth/http/guest.json
    → Run: bun run xera:auth-setup --role guest
```

Hard fail only when running a ticket whose roles have missing/expired auth files; doctor reports it as ✗ but xera CLI itself doesn't refuse to start.

#### 2.5.7 Refresh policy

Existing `packages/core/src/auth/refresh.ts` already handles "ttl ± refreshBuffer" detection. v0.7 reuses it as-is — the same module reads `expires_at` from either web or http entries and tells the runner whether to refresh now or wait. No new refresh code.

**Multi-role** is in scope: each role gets its own file. The generated `spec.ts` picks the role from the Gherkin step ("When admin POSTs /users …" → `newAuthedContext(playwright, 'admin')`).

### 2.6 OpenAPI loader

OpenAPI is **optional context** — the doctor warns but never blocks when missing. Most teams don't maintain OpenAPI; making it required would kill adoption.

When configured (`http.spec: './openapi.yaml'` or URL):
- Loader parses YAML/JSON, dereferences `$ref` (we vendor `@apidevtools/json-schema-ref-parser` or equivalent — final dep choice during implementation).
- Public API: `findOperation(method, pathTemplate)` → returns operation object with parameters, requestBody schema, responses schema.
- Used by:
  - **Skill `xera-script`** when reading the prompt context — the skill passes the relevant operation schema into the prompt JSON for `script-from-feature-http.md`.
  - **Classifier** to compare actual response shape vs `responses.<status>.content.<media>.schema`.

When not configured, the skill passes `openapi: null` in the prompt context; LLM falls back to AC text alone (degraded but functional).

### 2.7 What about `page.request` in web tickets?

Web tickets continue to use the web adapter. The `script-from-feature-web.md` prompt gets a new section that tells the LLM:

> ### Optional: API verification inside a UI test
>
> Your test fixture exposes `request` alongside `page` — both come from `@playwright/test`. When the Acceptance Criteria says state should change on the server (e.g. "the order is saved", "a record is created", "the API returns …"), you MAY include a `request.<method>(url)` assertion after the UI action. Do this only when explicitly asked by the AC; do NOT use API calls as a substitute for the UI flow under test.
>
> When `xera.config.ts.http.spec` is configured, schema details for endpoints used by this project are available — but you are not required to add API assertions.

No new adapter, no new runner, no new artifact. The capability has been there since Playwright shipped; v0.7 just unlocks it for the LLM. **CONTRACT_DRIFT does not flag these network calls in v0.7** — that's a v0.9 problem (web trace ↔ OpenAPI matching).

---

## 3. Config schema additions

### 3.1 New `http` block

```ts
// packages/core/src/config/schema.ts
const HttpAuthRoleSchema = z.object({
  // bearer / apiKey:
  tokenEnv: z.string().optional(),
  // basic:
  userEnv: z.string().optional(),
  passEnv: z.string().optional(),
  // oauth-cc:
  tokenUrl: z.string().url().optional(),
  clientIdEnv: z.string().optional(),
  clientSecretEnv: z.string().optional(),
  scope: z.string().optional(),
});

const HttpAuthSchema = z.object({
  strategy: z.enum(['bearer', 'apiKey', 'basic', 'oauth-cc', 'custom', 'none']).default('none'),
  ttl: z.string().default('8h'),
  refreshBuffer: z.string().default('30m'),
  roles: z.record(z.string(), HttpAuthRoleSchema).default({}),
});

const HttpSchema = z.object({
  baseUrl: z.record(z.string(), z.string().url())
    .refine(m => Object.keys(m).length > 0, { message: 'baseUrl must have at least one environment' }),
  defaultEnv: z.string(),
  spec: z.string().optional(),                  // path or URL to OpenAPI; optional
  auth: HttpAuthSchema.prefault({}),
})
  .refine(h => h.baseUrl[h.defaultEnv] !== undefined, {
    message: 'defaultEnv must exist in baseUrl map',
    path: ['defaultEnv'],
  });
```

### 3.2 `web` becomes optional + top-level refine

```ts
export const XeraConfigSchema = z.object({
  jira: JiraSchema,
  web: WebSchema.optional(),                    // was required
  http: HttpSchema.optional(),                  // new
  ai: AISchema,
  reporting: ReportingSchema,
  run: RunSchema.prefault({}),
  adapters: z.array(z.enum(['web', 'http'])).min(1).default(['web']),
})
  .refine(c => c.web !== undefined || c.http !== undefined, {
    message: 'At least one of `web` or `http` must be configured',
  })
  .refine(c => c.adapters.every(a => (a === 'web' ? c.web : c.http) !== undefined), {
    message: 'Every adapter in `adapters` must have a corresponding config block',
    path: ['adapters'],
  });
```

`adapters` enum is now typed (was `z.string()`); future adapters extend the enum.

### 3.3 Breaking-change note

Existing projects scaffold-generated by v0.6 or earlier have a top-level `web` block — they continue to validate without change. New projects scaffolded with `--shape api` get `http` only, no `web` block. Bump `@xera-ai/core` minor (0.4.x → 0.5.0) — `web` going from required to optional is a relaxation, not a tightening, so it's compatible at the value level even though the schema type changed.

---

## 4. CLI changes

### 4.1 `bunx @xera-ai/cli init` wizard

New first question (interactive mode):

```
What kind of testing does this project do?
  1) Web UI only           (Playwright browser tests)
  2) HTTP API only         (REST/GraphQL endpoint tests, no browser)
  3) Both                  (some UI tickets, some API tickets, in one repo)
> _
```

Non-interactive: `bunx @xera-ai/cli init --yes --shape web|api|mixed` (default `web` for backward compat).

Based on shape, the wizard branches:

| Shape | Asks for | Skips |
|---|---|---|
| `web` | (existing questions) | http questions |
| `api` | baseUrl per env, OpenAPI path (optional), auth strategy + roles | web/Playwright browser questions, storageState |
| `mixed` | both sets | nothing |

Scaffolds:

| File | `web` | `api` | `mixed` |
|---|---|---|---|
| `xera.config.ts` | with `web` block | with `http` block | with both |
| `playwright.config.ts` | full | http-only (no `browserName`) | full |
| `.xera/.auth/web/` (gitignored) | yes | no | yes |
| `.xera/.auth/http/` (gitignored) | no | yes | yes |
| `auth-setup.ts` | exports `web` | exports `http` (preset by default) | exports both |
| `openapi.yaml` reminder | no | yes (TODO comment in scaffold) | yes |
| `.env.example` | jira + base url + auth creds | jira + auth env vars per preset | both |
| `sample/SAMPLE-001` | UI sample | HTTP sample (POST /users validation) | UI sample |

Sample HTTP ticket (`sample/SAMPLE-HTTP-001/`): seed story + feature + spec that runs against a stubbed local mock (or against the user's configured baseUrl if reachable). Demonstrates `newAuthedContext`, multi-role auth, OpenAPI-aware assertions.

After `init` finishes, the wizard prints a clear next-step:

```
✓ xera scaffolded successfully.

Next:
  1) Set your auth credentials in .env.local:
       USER_BEARER_TOKEN=...
       ADMIN_BEARER_TOKEN=...
  2) Run pre-authentication:
       bun run xera:auth-setup
  3) Try the sample:
       Open Claude Code in this directory and run: /xera-run SAMPLE-HTTP-001
```

### 4.2 `bunx @xera-ai/cli doctor`

Checks for the pre-auth files, never their contents (no token leakage in logs):

- ⚠ `OpenAPI spec not configured (http.spec)` — *if* `http` is configured and `spec` is absent. Mentions degraded features.
- ⚠ `OpenAPI spec unreachable` — path or URL doesn't resolve. Suggests fixes.
- ✓ `Auth file present: .xera/.auth/http/<role>.json (expires in 7h 23m)` — per role.
- ⚠ `Auth file expired: .xera/.auth/http/<role>.json` — suggests `bun run xera:auth-setup --role <role>`.
- ✗ `Auth file missing: .xera/.auth/http/<role>.json` — hard error only when a ticket needs that role; doctor itself shows ✗ but doesn't refuse to start.
- ⚠ `Web tests configured but no OpenAPI` — gentle reminder for mixed projects; v0.7 doesn't do `CONTRACT_DRIFT` on web traces (v0.9 roadmap).

---

## 5. Classifier additions

Three new buckets in `packages/core/src/classifier/`:

### 5.1 `CONTRACT_DRIFT` (http only in v0.7)

**Trigger:** for an http adapter run with OpenAPI configured, the assertion failed AND the captured response from `http-trace.jsonl` does not match the OpenAPI response schema for that operation. Specifically, one of:

- Operation by `(method, pathTemplate)` not found in OpenAPI → endpoint renamed/removed.
- Response status not enumerated in `operation.responses` → status code changed.
- Response body fails schema validation (missing required field, type mismatch, enum violation) → shape drift.

The matcher takes the captured request URL, normalizes it against OpenAPI path templates (a minimal `/users/{id}` matcher — full conformant matcher is deferred; v0.7 handles `{param}` placeholders only, no `*` / regex / matrix params).

Deterministic — no LLM in the classifier loop. Heal prompt is v0.9.

**Web adapter:** does **not** emit `CONTRACT_DRIFT` in v0.7. Network calls captured in Playwright traces aren't matched against OpenAPI yet — that's the v0.9 work. This avoids "surprise" classifications for UI-only QA teams who happen to have OpenAPI configured.

### 5.2 `RATE_LIMITED`

**Trigger:** any captured response with HTTP `429`. Applies wherever a 429 is captured; in v0.7 that's effectively http adapter only (web doesn't surface network responses to the classifier yet).

Rationale: 429 is not a real bug, not test flake, not selector drift — it's a different operational signal QA should react to differently (back off, request quota bump, gate test schedule). Folding it into `FLAKY` loses that signal.

Doesn't auto-retry. v0.7 just classifies; retry/backoff policy is a future config.

### 5.3 `AUTH_EXPIRED` (cross-adapter)

**Trigger:**
- http: response `401` AND one of:
  - token used had an exp claim that decodes as past (JWT), OR
  - auth strategy is `oauth-cc` and the cached token is past its refresh window.
- http with plain opaque bearer (no JWT exp, no oauth-cc cache): cannot distinguish "credentials invalid" from "credentials expired" — falls through to `FAIL` with a rationale note suggesting JWT or oauth-cc to enable this signal.
- web: storageState cookie at last refresh + configured `auth.ttl` < now AND a 401 surfaced during the run (already plumbed in v0.6's auth detection — we promote that signal from internal warning to classifier bucket).

Rationale: same as `RATE_LIMITED` — credentials expired isn't a bug, it's an env problem.

### 5.4 Classifier output shape

Existing buckets unchanged (`PASS`, `FAIL`, `REAL_BUG`, `TEST_BUG`, `SELECTOR_DRIFT`, `FLAKY`, `TEST_OUTDATED`). New ones extend `Classification` enum in `packages/core/src/artifact/status.ts`. All consumers (`xera:status`, graph snapshot, Jira post) treat unknown enum values as `FAIL` for back-compat during version skew.

---

## 6. Skills + prompts

### 6.1 Skill dispatch

```
xera-run / xera-script / xera-exec read .xera/<TICKET>/meta.json:
  { "ticket": "PROJ-HTTP-001", "adapter": "http", ... }
```

Each skill that needs adapter-specific behavior checks `meta.json.adapter`:

- `xera-script.md` — if `adapter == 'http'`, read `script-from-feature-http.md`; else read `script-from-feature-web.md`. Pass `openapi` context only when the http config has a spec.
- `xera-exec.md` — invokes `bun run xera:exec <TICKET>` which now dispatches to the right runner. The subcommand reads `meta.json.adapter` and calls either `@xera-ai/web`'s executor or `@xera-ai/http`'s.

Other skills (`xera-fetch`, `xera-feature`, `xera-report`, `xera-impact`, `xera-promote`, `xera-eval`) are adapter-agnostic.

### 6.2 `script-from-feature-http.md` (NEW, v1.0.0)

Same frontmatter shape as the existing web prompt. Body covers:

- Output shape: `@playwright/test` style with `newAuthedContext(playwright, role)` from `@xera-ai/http/runtime`. One `test.describe` per Gherkin Feature, one `test()` per Scenario. Each `describe` opens an authed `APIRequestContext` in `beforeAll` and disposes in `afterAll`.
- Auth: pick the role from Gherkin step language (`admin POSTs ...` → `'admin'`; `user GETs ...` → `'user'`). Default role is the first one in `http.auth.roles` (deterministic).
- Token files are NOT read directly — `newAuthedContext` handles decrypt + header attach. The LLM MUST NOT emit code that reads `process.env.XERA_TOKEN_*` or decrypts files itself. This keeps adversarial prompt-injection in OpenAPI fields from leaking tokens.
- Request body construction: if OpenAPI schema present in context, build a body that satisfies the schema (use `faker`-style realistic data — first/last name, valid email pattern); if not present, use the values literally implied by the scenario.
- Unique-data-per-run: for endpoints that POST creating resources, use `process.env.XERA_RUN_ID` as a suffix in identifying fields (e.g. `email: alice-${XERA_RUN_ID}@example.com`). Avoids cross-run collisions.
- Assertion shape: status code (always); response body shape (against OpenAPI schema if present, else against literal AC examples); response time if AC mentions latency.
- Error handling: do not catch + swallow; let Playwright `expect` raise.

Plus the v0.3 `## Handling untrusted input` preamble — OpenAPI YAML is read from disk and is untrusted (could contain prompt-injection in `description` fields).

### 6.3 `script-from-feature-web.md` (rename + edit)

Current file: `packages/prompts/script-from-feature.md`. Rename to `script-from-feature-web.md` for symmetry with the new file. Update body to add:

> #### Optional: API verification inside a UI test
>
> Your test fixtures expose both `page` and `request` from `@playwright/test`. When Acceptance Criteria explicitly mention server-side state change ("the order is saved", "a record is created", "the backend returns ..."), you MAY add a `request.<method>(url)` assertion after the UI action.
>
> Constraints:
> - Use this only when AC explicitly asks. Do NOT use API calls as a substitute for the UI flow under test.
> - Apply the same Authorization header that the UI session uses (Playwright's `request` inherits cookies from the browser context when launched via `page.request`; if you use the top-level `request` fixture, you must attach the token explicitly).
> - When `xera.config.ts.http.spec` is configured, schema details for endpoints used by this project may be available in your prompt context — but you are not required to use them.

Bump prompt version `1.x.x` → `1.(x+1).0` (additive). All version-line + verify-prompts machinery already handles this.

### 6.4 Updates to in-scope prompts list

`packages/core/src/bin-internal/verify-prompts.ts` `IN_SCOPE_PROMPTS` array gains `script-from-feature-http.md` and the renamed `script-from-feature-web.md`. The old name `script-from-feature.md` is removed entirely (renaming is breaking for anyone reading prompts by old name — acceptable inside our own monorepo, and end users don't directly reference these names).

---

## 7. Artifact layout

Same as today, with a different `spec.ts` shape and an `http-trace.jsonl` in run dirs:

```
.xera/
  .auth/
    web/<role>.json          encrypted storageState (was .xera/.auth/<role>.json in v0.6)
    http/<role>.json         encrypted { token, type, cookies?, expires_at }
  <TICKET>/
    meta.json                { "adapter": "http", ... }
    story.md
    feature.md               (Gherkin — adapter-agnostic shape)
    spec.ts                  (adapter-specific; http uses newAuthedContext + api.request)
    pom/                     (web only; not present for http tickets)
    runs/<RUN_ID>/
      raw-report.json        Playwright JSON reporter output
      http-trace.jsonl       http only — per-request log
      normalized.json        shared schema, with optional http.calls extension
      classifier-output.json { class: ..., rationale: ..., evidence: ... }
      post-input.json        payload for xera-report
```

Hash-based drift (story_hash / feature_hash / script_hash) works unchanged. `events_hash` for graph events likewise.

---

## 8. Mock targets & golden fixtures

### 8.1 `fixtures/mock-api/`

Bun.serve-based deterministic HTTP target, parallels `fixtures/mock-jira/`:

- POST /users — validates email, returns 201 with `{ id, email, name }` or 422 with `{ errors: [...] }`.
- GET /users/:id — returns user or 404.
- POST /orders — requires admin role, returns 201 + body.
- 429 toggle via `?simulate=rate-limited`.
- 401 toggle via missing/invalid Authorization.

Comes with `openapi.yaml` next to the mock so integration tests can drive an OpenAPI-aware flow. Used by integration tests in `packages/http/test/integration/`.

### 8.2 `fixtures/golden-tickets-http/`

Mirror of `fixtures/golden-tickets/`. Each golden ticket has:
- `meta.json` with `adapter: 'http'`
- A `runs/expected-classification.json` driving classifier tests.

Initial golden set:
- `GOLD-HTTP-001-validation-pass` — POST /users with bad email → 422 → PASS.
- `GOLD-HTTP-002-real-bug` — POST /users with bad email → 500 → REAL_BUG.
- `GOLD-HTTP-003-contract-drift` — response body has `errors` renamed to `validation_errors` → CONTRACT_DRIFT.
- `GOLD-HTTP-004-rate-limited` — 429 captured → RATE_LIMITED.
- `GOLD-HTTP-005-auth-expired` — 401 + expired JWT → AUTH_EXPIRED.

### 8.3 `fixtures/sample-app-http/`

Minimal scaffold mimicking what a real user's project might look like — used by integration tests for `xera init --shape api` flow. Generates one ticket, runs end-to-end against mock-api, asserts the Jira post matches expectations.

---

## 9. Test plan

### 9.1 Unit tests (`packages/http/test/`)

- `adapter.test.ts` — id, generate is noop, execute happy path against mock.
- `auth-setup/preset.test.ts` — each preset strategy returns correct result shape: bearer reads env, basic base64-encodes, oauth-cc fetches from token endpoint (against mock-api).
- `auth-setup/runner.test.ts` — happy path writes `.xera/.auth/http/<role>.json`; missing env → clear error; partial role failure doesn't break other roles.
- `runtime/newAuthedContext.test.ts` — reads file, attaches header, missing file throws helpful message, expired file emits AUTH_EXPIRED hint.
- `openapi/loader.test.ts` — YAML + JSON + URL + $ref resolution + malformed spec error.
- `openapi/findOperation.test.ts` — path template matching including `{param}` placeholders.
- `trace-normalizer/normalize.test.ts` — JSONL → normalized.json, scenarios mapped, durations preserved.
- `trace-normalizer/scrub.test.ts` — Authorization headers masked, password fields masked, credit card patterns masked.

### 9.2 Classifier tests (`packages/core/test/classifier/`)

- New cases for `CONTRACT_DRIFT`, `RATE_LIMITED`, `AUTH_EXPIRED`.
- Existing cases untouched — back-compat critical.

### 9.3 Integration tests

`packages/http/test/integration/`:

- `init-api-shape.test.ts` — scaffold api-only project in tmp dir, run sample ticket, assert classifier output + Jira post payload.
- `init-mixed-shape.test.ts` — scaffold mixed project, run web ticket that uses `page.request`, assert nothing flakes.
- `doctor-warnings.test.ts` — assert each warning fires under the right config + doesn't hard-fail.

### 9.4 E2E / nightly

Extend `.github/workflows/nightly-e2e.yml` with an http-shape branch that:
- Scaffolds `bunx @xera-ai/cli init --yes --shape api`.
- Boots `fixtures/mock-api/` Bun.serve target.
- Runs `/xera-run SAMPLE-HTTP-001` through the actual skill flow.
- Asserts the run produces a PASS classification end-to-end.

---

## 10. Migration & back-compat

- Existing v0.6 projects: no action required. Their `xera.config.ts` has `web` block; `http` is optional; `adapters: ['web']` works.
- A project that wants to add http: `bunx @xera-ai/cli init --upgrade --add-shape api` (extends `init-update` from v0.5 era).
- `meta.json.adapter` field already exists from v0.6; just accepts `'http'` as a value now.
- Prompt rename `script-from-feature.md` → `script-from-feature-web.md` is internal-only — end users don't import prompts by name. Skills reference the new name.
- Classifier enum gains values — consumers ignoring unknown values are fine; consumers exhaustively switching break loudly (we fix at the call sites in this PR).
- Auth file relocation: `.xera/.auth/<role>.json` → `.xera/.auth/web/<role>.json`. Handled in two layers:
  - `init --upgrade` moves files for existing projects, leaves a `.xera/.auth/.migrated` marker.
  - The auth state reader checks `.xera/.auth/web/<role>.json` first, falls back to `.xera/.auth/<role>.json` for one release. v0.8 removes the fallback. This means QA teams on v0.7 can still run without re-auth.

No runtime feature flag; v0.7.0 is a clean minor bump on top of v0.6.4.

---

## 11. Security posture

- OpenAPI YAML parsed from disk → treated as **untrusted** per v0.3. The prompt template embeds `## Handling untrusted input` preamble; LLM never executes content from `description` / `example` fields.
- HTTP request/response bodies scrubbed via shared `scrub-rules.ts` before classifier, before Jira post, before disk write. Adversarial unit tests cover Authorization headers, password fields, credit-card patterns, and known token formats (JWT, API-key prefixes).
- Per-role auth files (`.xera/.auth/http/<role>.json`) AES-256-GCM encrypted; same key derivation as web's storageState (`packages/core/src/auth/key.ts`); `.xera/.auth/` already in `.gitignore` from web.
- Tokens never appear in env at run time — `newAuthedContext` decrypts in-process and attaches the header to the `APIRequestContext`. Spec.ts code generated by the LLM does NOT see the raw token (prompt explicitly forbids reading env vars or files for auth).
- Doctor reports auth file presence + expiry only; never prints token contents or even token prefixes.
- `curl` reproducer in failure posts: Authorization values replaced with `***`. Body fields scrubbed identically to the rest of the trace.
- Auth-setup script (`auth-setup.ts`) is user-owned code — if a user writes a custom `defineHttpAuthSetup` that, say, sends creds to a third-party logger, that's a user-introduced risk we cannot prevent. v0.7 ships only the safe `presetHttpAuth` defaults.

---

## 12. Risks & mitigations

| Risk | Mitigation |
|---|---|
| OpenAPI matcher misclassifies a real bug as `CONTRACT_DRIFT` because a $ref didn't resolve. | Classifier emits `CONTRACT_DRIFT` only when matcher returns confident match-fail; ambiguous cases fall through to `FAIL` (existing behavior). Logged in classifier rationale. |
| Path-template matcher too simplistic (no matrix, no regex). | Document v0.7 limits in `docs/CONFIGURATION.md`. Full matcher = v0.9 deliverable. |
| Per-role auth file writes collide when `xera:auth-setup` runs all roles in parallel. | Use the existing file-locking module (`packages/core/src/lock/`) per role path. Reads are lock-free. |
| QA forgets to run `xera:auth-setup` and gets confused by "auth file missing" errors at test time. | Doctor surfaces missing files prominently with the exact command to run; sample HTTP ticket's first run does an inline auth check and prints the same hint instead of failing deep in Playwright. |
| Custom `defineHttpAuthSetup` function written by user has a bug (e.g. parses token from wrong response field). | Auth-setup runner validates the returned `HttpAuthSetupResult` against a Zod schema before writing; clear error pinpoints which field is wrong. |
| `request.newContext` differences between Playwright versions. | Pin `@playwright/test` minor in `@xera-ai/http`'s peerDependencies (same as `@xera-ai/web`). |
| Auth strategy `oauth-cc` adds external HTTP call to a token endpoint at run start. | Cache aggressively; gentle warning if cache invalid; never block doctor on token-endpoint reachability (treated as "warn", reachable at exec time only). |
| QA running a web ticket on a mixed project gets surprised by API verifications appearing in their script. | Web prompt update explicitly says "only when AC asks for it." Plus QA reviews feature.md / spec.ts before approving. |
| Breaking config schema change confuses existing users. | Loud migration note in `CHANGELOG.md` + v0.7 release notes; `init --upgrade` path handles auto-migration. |

---

## 13. Open questions

These do NOT block writing the spec but should be resolved during plan-write or implementation:

1. **Does `scrub-rules.ts` move to `@xera-ai/core` so both adapters import it from one place, or stay in `@xera-ai/web` and have `@xera-ai/http` depend on web?** Recommendation: move to core during this PR; the rules module is genuinely shared infrastructure.
2. **OpenAPI dependency choice.** `@apidevtools/json-schema-ref-parser` vs `swagger-parser` vs hand-rolled $ref resolver. Recommendation: `@apidevtools/json-schema-ref-parser` (well-maintained, smaller surface than swagger-parser, focuses just on the parse-and-deref problem).
3. **Should the unique-data-per-run pattern be enforced or just suggested in the prompt?** Recommendation: suggested (the prompt is instruction, not validation). If users see real-world collisions we can add a lint rule in v0.7.1.
4. **`adapters: ['web', 'http']` ordering.** Does the array order matter for default-adapter pick when `meta.json.adapter` is absent? Recommendation: first element wins.
5. **Sample HTTP ticket: against what?** A bundled mock running on localhost (smooth init experience, but extra process to start) or against the user's `baseUrl` (real, but might require auth that doesn't exist yet)? Recommendation: bundled local mock for the init smoke test, then `init --upgrade --remove-samples` once user is ready.

---

## 14. Roadmap context

| Version | Feature | Spec |
|---|---|---|
| **v0.7 (this spec)** | `@xera-ai/http` sibling adapter; init shapes; classifier `CONTRACT_DRIFT`/`RATE_LIMITED`/`AUTH_EXPIRED`; web prompt knows `page.request`. | — |
| v0.8 | `xera-feature --from-spec openapi.yaml` — generate tickets from OpenAPI without a Jira story. Auto-detect adapter from story (heuristic + eval). | Future spec. |
| v0.9 | `CONTRACT_DRIFT` on web traces (network-call ↔ OpenAPI matching). Self-heal auto-PR for `CONTRACT_DRIFT` (parallel to v0.5 selector heal). | Future spec. |
| v1.0 | Cross-adapter graph linkage: endpoint as first-class graph node; `xera-impact` recommends web tickets when an endpoint schema changes. | Future spec. |
| v1.x | Messaging adapters (`@xera-ai/kafka`, `@xera-ai/amqp`, `@xera-ai/websocket`), GraphQL (`@xera-ai/graphql`), gRPC (`@xera-ai/grpc`). Each its own package, each its own spec. | — |

The "wow" demoed across v0.7 → v1.0 is: **a single Jira story (or OpenAPI spec) produces an e2e test that orchestrates browser + HTTP, classifier explains failures across both, self-heals across both, and the knowledge graph tells QA which tickets to re-run when any contract drifts.** v0.7 is the foundation under that.
