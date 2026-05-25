# xera v0.7 — Plan 05: Fixtures, Integration Tests, Release

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the `mock-api` fixture, five `golden-tickets-http` fixtures, the `sample-app-http` integration scaffold, the bundled mock script for `SAMPLE-HTTP-001`, integration tests for `init --shape api|mixed`, docs updates, the nightly E2E branch, and final version bumps.

**Architecture:** `mock-api` is a small node:http target with an `openapi.yaml`, parallel to the existing `mock-jira`. Golden tickets are minimal `.xera/<TICKET>/` directories with `expected-classification.json` for classifier unit tests. The bundled `sample-mock.ts` is auto-started by `playwright.config.ts.webServer` in scaffolded projects.

**Prereqs:** Plans 01–04 complete.

---

## Phase 15 — `fixtures/mock-api/`

### Task 15.1: Mock API server

**Files:**
- Create: `fixtures/mock-api/package.json`
- Create: `fixtures/mock-api/server.ts`
- Create: `fixtures/mock-api/openapi.yaml`

- [ ] **Step 1: `fixtures/mock-api/package.json`**

```json
{
  "name": "@xera-ai/mock-api",
  "private": true,
  "version": "0.0.0",
  "type": "module",
  "scripts": {
    "start": "npm run server.ts"
  }
}
```

- [ ] **Step 2: `fixtures/mock-api/server.ts`**

```ts
const TOKENS = new Map<string, string>([
  ['Bearer test-token-001', 'user'],
  ['Bearer test-token-admin', 'admin'],
]);

const PORT = Number(process.env.MOCK_API_PORT ?? 4100);

function unauthorized() {
  return Response.json({ error: 'Unauthorized' }, { status: 401 });
}

function validateEmail(email: unknown): { ok: true } | { ok: false; reason: string } {
  if (typeof email !== 'string' || email === '') return { ok: false, reason: 'email is required' };
  if (!email.includes('@')) return { ok: false, reason: 'email must be valid' };
  return { ok: true };
}

// NOTE: current fixtures use node:http (createServer) — see fixtures/mock-*/server.ts
Bun.serve({
  port: PORT,
  async fetch(req) {
    const url = new URL(req.url);
    const auth = req.headers.get('authorization') ?? '';
    const role = TOKENS.get(auth);

    // Rate-limit toggle.
    if (url.searchParams.get('simulate') === 'rate-limited') {
      return Response.json({ error: 'Too Many Requests' }, { status: 429 });
    }

    if (url.pathname === '/users' && req.method === 'POST') {
      if (!role) return unauthorized();
      const body = await req.json() as { name?: string; email?: string };
      const check = validateEmail(body.email);
      if (!check.ok) return Response.json({ errors: [check.reason] }, { status: 422 });
      return Response.json({ id: `usr-${Date.now()}`, email: body.email, name: body.name }, { status: 201 });
    }

    if (url.pathname.startsWith('/users/') && req.method === 'GET') {
      if (!role) return unauthorized();
      const id = url.pathname.split('/')[2];
      if (!id || id === 'missing') return Response.json({ error: 'Not Found' }, { status: 404 });
      return Response.json({ id, email: 'demo@example.com', name: 'Demo' }, { status: 200 });
    }

    if (url.pathname === '/orders' && req.method === 'POST') {
      if (role !== 'admin') return Response.json({ error: 'Forbidden' }, { status: 403 });
      const body = await req.json() as { product?: string };
      return Response.json({ id: `ord-${Date.now()}`, product: body.product, status: 'pending' }, { status: 201 });
    }

    return Response.json({ error: 'Not Found' }, { status: 404 });
  },
});

console.log(`mock-api listening on http://localhost:${PORT}`);
```

- [ ] **Step 3: `fixtures/mock-api/openapi.yaml`**

```yaml
openapi: 3.0.0
info: { title: Mock API, version: 1.0.0 }
servers: [{ url: http://localhost:4100 }]
paths:
  /users:
    post:
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              required: [name, email]
              properties:
                name: { type: string }
                email: { type: string, format: email }
      responses:
        '201':
          content:
            application/json:
              schema:
                type: object
                required: [id, email]
                properties:
                  id: { type: string }
                  email: { type: string }
                  name: { type: string }
        '422':
          content:
            application/json:
              schema:
                type: object
                required: [errors]
                properties:
                  errors: { type: array, items: { type: string } }
  /users/{id}:
    get:
      parameters:
        - in: path
          name: id
          required: true
          schema: { type: string }
      responses:
        '200':
          content:
            application/json:
              schema:
                type: object
                required: [id, email]
                properties:
                  id: { type: string }
                  email: { type: string }
                  name: { type: string }
        '404':
          content:
            application/json:
              schema: { type: object, properties: { error: { type: string } } }
  /orders:
    post:
      responses:
        '201':
          content:
            application/json:
              schema:
                type: object
                required: [id, product, status]
                properties:
                  id: { type: string }
                  product: { type: string }
                  status: { type: string, enum: [pending, completed, cancelled] }
        '403':
          content:
            application/json:
              schema: { type: object, properties: { error: { type: string } } }
```

- [ ] **Step 4: Test the mock starts and responds**

```bash
npm run --cwd fixtures/mock-api server.ts &
sleep 1
curl -s -X POST http://localhost:4100/users -H 'Authorization: Bearer test-token-001' -H 'Content-Type: application/json' -d '{"name":"A","email":"bad"}'
# expect: {"errors":["email must be valid"]}
kill %1
```

- [ ] **Step 5: Commit**

```bash
git add fixtures/mock-api/
git commit -m "fixtures: mock-api server + openapi"
```

---

## Phase 16 — Golden HTTP tickets

### Task 16.1: Create 5 golden tickets

**Files:**
- Create: `fixtures/golden-tickets-http/GOLD-HTTP-001-validation-pass/meta.json`
- Create: `fixtures/golden-tickets-http/GOLD-HTTP-001-validation-pass/normalized.json`
- Create: `fixtures/golden-tickets-http/GOLD-HTTP-001-validation-pass/expected-classification.json`
- (Repeat for 002 / 003 / 004 / 005)

Each ticket dir has:
- `meta.json` — `{ "ticket": "GOLD-HTTP-001", "adapter": "http" }`
- `normalized.json` — synthetic normalized run output matching what the http normalizer would emit
- `expected-classification.json` — `{ "class": "PASS|REAL_BUG|...", "rationale": "<substring>" }`

- [ ] **Step 1: GOLD-HTTP-001-validation-pass** — POST /users with bad email, 422 response with `errors`, schema matches → PASS.

```json
// meta.json
{ "ticket": "GOLD-HTTP-001", "adapter": "http" }
```

```json
// normalized.json
{
  "runId": "gold-001",
  "outcome": "PASS",
  "scenarios": [{ "name": "reject bad email", "outcome": "PASS" }],
  "http": { "calls": [{ "method": "POST", "url": "/users", "status": 422, "respBody": { "errors": ["email must be valid"] } }] }
}
```

```json
// expected-classification.json
{ "class": "PASS", "rationale": "all scenarios passed" }
```

- [ ] **Step 2: GOLD-HTTP-002-real-bug** — POST /users → expected 422 but got 500.

```json
// normalized.json
{
  "runId": "gold-002",
  "outcome": "FAIL",
  "scenarios": [{ "name": "reject bad email", "outcome": "FAIL", "failure": { "errorMessage": "expected 422, got 500" } }],
  "http": { "calls": [{ "method": "POST", "url": "/users", "status": 500, "respBody": { "error": "Internal server error" } }] }
}
```

```json
{ "class": "REAL_BUG", "rationale": "endpoint returned 500" }
```

- [ ] **Step 3: GOLD-HTTP-003-contract-drift** — 422 response missing required `errors` field (renamed to `validation_errors`).

```json
{
  "runId": "gold-003",
  "outcome": "FAIL",
  "scenarios": [{ "name": "reject bad email", "outcome": "FAIL" }],
  "http": { "calls": [{ "method": "POST", "url": "/users", "status": 422, "respBody": { "validation_errors": ["email must be valid"] } }] }
}
```

```json
{ "class": "CONTRACT_DRIFT", "rationale": "Response body" }
```

- [ ] **Step 4: GOLD-HTTP-004-rate-limited** — captured 429.

```json
{
  "runId": "gold-004", "outcome": "FAIL",
  "scenarios": [{ "name": "x", "outcome": "FAIL" }],
  "http": { "calls": [{ "method": "POST", "url": "/users", "status": 429, "respBody": {} }] }
}
```

```json
{ "class": "RATE_LIMITED", "rationale": "429" }
```

- [ ] **Step 5: GOLD-HTTP-005-auth-expired** — 401 + expired JWT auth file. The classifier test needs to load both `normalized.json` AND a synthetic `auth-files.json` describing the auth state at run time.

```json
// normalized.json
{
  "runId": "gold-005", "outcome": "FAIL",
  "scenarios": [{ "name": "x", "outcome": "FAIL" }],
  "http": { "calls": [{ "method": "GET", "url": "/users/1", "status": 401, "respBody": { "error": "Unauthorized" } }] }
}
```

```json
// auth-files.json (consumed by classifier test fixture loader)
{ "user": { "token": "<expired-jwt-base64>", "type": "bearer", "expires_at": "2020-01-01T00:00:00.000Z" } }
```

```json
// expected-classification.json
{ "class": "AUTH_EXPIRED", "rationale": "auth file" }
```

- [ ] **Step 6: Write a classifier test that walks the directory**

```ts
// packages/core/test/classifier/golden-http.test.ts
import { test, expect } from 'vitest';
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { classify } from '../../src/classifier';

const ROOT = join(import.meta.dir, '..', '..', '..', '..', 'fixtures', 'golden-tickets-http');

for (const ticket of readdirSync(ROOT)) {
  test(`golden ${ticket}`, () => {
    const dir = join(ROOT, ticket);
    const normalized = JSON.parse(readFileSync(join(dir, 'normalized.json'), 'utf8'));
    const expected = JSON.parse(readFileSync(join(dir, 'expected-classification.json'), 'utf8'));
    const authFiles = existsSync(join(dir, 'auth-files.json'))
      ? JSON.parse(readFileSync(join(dir, 'auth-files.json'), 'utf8'))
      : {};
    const result = classify({
      adapter: 'http',
      run: { outcome: normalized.outcome, scenarios: normalized.scenarios },
      history: [],
      storyHashChanged: false,
      specHashChanged: false,
      httpCalls: normalized.http.calls,
      authFiles,
      openapi: null, // CONTRACT_DRIFT cases load openapi separately — see GOLD-HTTP-003 below
    });
    expect(result.class).toBe(expected.class);
    expect(result.rationale).toContain(expected.rationale);
  });
}
```

For GOLD-HTTP-003 specifically (CONTRACT_DRIFT), load the openapi via a small wrapper:

```ts
// In the test, if expected.class === 'CONTRACT_DRIFT' and a `openapi.json` exists in the ticket dir, load it.
if (expected.class === 'CONTRACT_DRIFT' && existsSync(join(dir, 'openapi.json'))) {
  // pass to classify()
}
```

And add `fixtures/golden-tickets-http/GOLD-HTTP-003-contract-drift/openapi.json` — a minimal dereferenced spec matching the mock-api spec, including `/users` POST with the 422 schema requiring `errors`.

- [ ] **Step 7: Run**

Run: `cd packages/core && npx vitest run test/classifier/golden-http.test.ts`
Expected: 5 green.

- [ ] **Step 8: Commit**

```bash
git add fixtures/golden-tickets-http/ packages/core/test/classifier/golden-http.test.ts
git commit -m "fixtures: 5 golden http tickets + classifier test"
```

---

## Phase 17 — `sample-app-http` + sample mock script

### Task 17.1: Sample mock script (bundled with CLI scaffold)

**Files:**
- Create: `packages/cli/scripts/sample-mock.ts`

- [ ] **Step 1: Write a minimal mock copy**

`packages/cli/scripts/sample-mock.ts` — a trimmed copy of `fixtures/mock-api/server.ts` (just enough for `SAMPLE-HTTP-001`: POST /users with email validation).

```ts
const PORT = Number(process.env.MOCK_PORT ?? 4111);
const TOKEN = 'Bearer test-token-001';

// NOTE: current fixtures use node:http (createServer) — see fixtures/mock-*/server.ts
Bun.serve({
  port: PORT,
  async fetch(req) {
    const url = new URL(req.url);
    if (req.headers.get('authorization') !== TOKEN) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (url.pathname === '/users' && req.method === 'POST') {
      const body = await req.json() as { email?: string };
      if (!body.email || !body.email.includes('@')) {
        return Response.json({ errors: ['email must be valid'] }, { status: 422 });
      }
      return Response.json({ id: 'usr-1', email: body.email }, { status: 201 });
    }
    return new Response('not found', { status: 404 });
  },
});
console.log(`sample-mock listening on http://localhost:${PORT}`);
```

- [ ] **Step 2: Make sure scaffold copies this script into the user's project**

In `packages/cli/src/scaffold.ts`, when shape is `api` or `mixed`, copy `scripts/sample-mock.ts` to user's project root as `scripts/sample-mock.ts`. Add to playwright config's `webServer`:

```ts
webServer: {
  command: 'npm run scripts/sample-mock.ts',
  port: 4111,
  reuseExistingServer: true,
},
```

(Edit `packages/cli/templates/http-playwright.config.ts.tmpl` to include this.)

- [ ] **Step 3: Commit**

```bash
git add packages/cli/scripts/sample-mock.ts packages/cli/src/scaffold.ts packages/cli/templates/http-playwright.config.ts.tmpl
git commit -m "cli: bundle sample-mock script + webServer wiring"
```

---

### Task 17.2: `SAMPLE-HTTP-001` seed ticket

**Files:**
- Create: `packages/cli/templates/sample/SAMPLE-HTTP-001/meta.json`
- Create: `packages/cli/templates/sample/SAMPLE-HTTP-001/story.md`
- Create: `packages/cli/templates/sample/SAMPLE-HTTP-001/feature.md`
- Create: `packages/cli/templates/sample/SAMPLE-HTTP-001/spec.ts`

- [ ] **Step 1: meta.json**

```json
{
  "ticket": "SAMPLE-HTTP-001",
  "adapter": "http",
  "title": "Sample HTTP ticket — POST /users validation"
}
```

- [ ] **Step 2: story.md**

```markdown
# SAMPLE-HTTP-001 — POST /users validation

As a developer integrating the registration API,
I want POST /users to reject invalid emails with 422,
so that clients receive structured validation feedback.

## Acceptance Criteria

- POST /users with empty email returns 422 with `errors` containing "email is required" or similar.
- POST /users with malformed email (no @) returns 422 with a message containing "email must be valid".
- POST /users with a valid email returns 201 with `{ id, email }`.
```

- [ ] **Step 3: feature.md**

```gherkin
Feature: POST /users validation

  Scenario: Reject malformed email
    When the user POSTs /users with body { "email": "not-an-email" }
    Then the response status is 422
    And the response body contains an "errors" array

  Scenario: Accept valid email
    When the user POSTs /users with body { "email": "alice@example.com" }
    Then the response status is 201
    And the response body has fields "id" and "email"
```

- [ ] **Step 4: spec.ts**

```ts
import { test, expect, type APIRequestContext } from '@playwright/test';
import { newAuthedContext } from '@xera-ai/http/runtime';

test.describe('POST /users validation', () => {
  let api: APIRequestContext;
  test.beforeAll(async ({ playwright }) => {
    api = await newAuthedContext(playwright, 'user');
  });
  test.afterAll(async () => { await api.dispose(); });

  test('Reject malformed email', async () => {
    const res = await api.post('/users', { data: { email: 'not-an-email' } });
    expect(res.status()).toBe(422);
    const body = await res.json();
    expect(body.errors).toBeInstanceOf(Array);
  });

  test('Accept valid email', async () => {
    const res = await api.post('/users', { data: { email: `alice-${process.env.XERA_RUN_ID}@example.com` } });
    expect(res.status()).toBe(201);
    const body = await res.json();
    expect(body).toHaveProperty('id');
    expect(body).toHaveProperty('email');
  });
});
```

- [ ] **Step 5: Commit**

```bash
git add packages/cli/templates/sample/SAMPLE-HTTP-001/
git commit -m "cli: SAMPLE-HTTP-001 seed ticket"
```

---

## Phase 18 — Integration tests

### Task 18.1: `init --shape api` end-to-end

**Files:**
- Create: `packages/cli/test/integration/init-api.test.ts`

- [ ] **Step 1: Write the test**

```ts
import { test, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execSync } from 'node:child_process';

let dir: string;
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'init-api-')); });
afterEach(() => rmSync(dir, { recursive: true, force: true }));

test('init --shape api scaffolds an api-only project', () => {
  execSync(`node ${join(import.meta.dirname, '..', '..', 'bin', 'xera')} init --yes --shape api`, {
    cwd: dir,
    env: { ...process.env, XERA_TEST_ANSWERS: JSON.stringify({
      jiraBaseUrl: 'https://x.atlassian.net', jiraProjectKey: 'PROJ',
      apiBaseUrlDev: 'http://localhost:4111', authStrategy: 'bearer',
    }) },
  });
  expect(existsSync(join(dir, 'xera.config.ts'))).toBe(true);
  expect(readFileSync(join(dir, 'xera.config.ts'), 'utf8')).toContain("adapters: ['http']");
  expect(existsSync(join(dir, 'openapi.yaml'))).toBe(true);
  expect(existsSync(join(dir, 'auth-setup.ts'))).toBe(true);
  expect(existsSync(join(dir, 'playwright.config.ts'))).toBe(true);
  // No browser/storageState scaffolding
  expect(readFileSync(join(dir, 'playwright.config.ts'), 'utf8')).not.toContain('browserName');
});
```

(`XERA_TEST_ANSWERS` is a test-mode env the CLI reads to bypass interactive prompts. Implement in `prompts.ts` if not already.)

- [ ] **Step 2: Run, verify pass**

Run: `cd packages/cli && npx vitest run test/integration/init-api.test.ts`
Expected: green.

- [ ] **Step 3: Commit**

```bash
git add packages/cli/test/integration/init-api.test.ts packages/cli/src/prompts.ts
git commit -m "cli: integration test for init --shape api"
```

---

### Task 18.2: `init --shape mixed` end-to-end

**Files:**
- Create: `packages/cli/test/integration/init-mixed.test.ts`

- [ ] **Step 1: Write**

Similar to 18.1 but `--shape mixed`. Assert:
- `xera.config.ts` has both `web:` and `http:` blocks.
- `adapters: ['web', 'http']`.
- `openapi.yaml` exists.
- `auth-setup.ts` exports both `web` and `http`.

- [ ] **Step 2: Run, verify pass**

- [ ] **Step 3: Commit**

```bash
git add packages/cli/test/integration/init-mixed.test.ts
git commit -m "cli: integration test for init --shape mixed"
```

---

### Task 18.3: Doctor warnings (no OpenAPI configured)

**Files:**
- Create: `packages/cli/test/integration/doctor-warnings.test.ts`

- [ ] **Step 1: Write**

```ts
import { test, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runDoctor } from '../../src/commands/doctor';

let dir: string;
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'doctor-')); process.env.XERA_AUTH_KEY = 'a'.repeat(64); });
afterEach(() => rmSync(dir, { recursive: true, force: true }));

test('doctor emits ⚠ when http configured but no spec', async () => {
  // Write a minimal xera.config.ts pointing http.spec to a missing file path
  writeFileSync(join(dir, 'xera.config.ts'), `
    import { defineConfig } from '@xera-ai/core';
    export default defineConfig({
      adapters: ['http'],
      jira: { baseUrl: 'https://x.atlassian.net', projectKeys: ['PROJ'], fields: { story: 'description' } },
      http: { baseUrl: { dev: 'http://localhost' }, defaultEnv: 'dev', auth: { strategy: 'none' } },
    });
  `);
  const report = await runDoctor({ cwd: dir, silent: true });
  expect(report.warnings.some((w) => w.includes('OpenAPI'))).toBe(true);
  expect(report.exitCode).toBe(0); // warnings do not fail
});
```

- [ ] **Step 2: Run, verify pass**

- [ ] **Step 3: Commit**

```bash
git add packages/cli/test/integration/doctor-warnings.test.ts
git commit -m "cli: integration test for doctor warnings"
```

---

## Phase 19 — Version bumps, docs, release prep

### Task 19.1: Bump remaining package versions

**Files:**
- Modify: `packages/core/package.json` → 0.5.0
- Modify: `packages/web/package.json` → 0.3.0, dep on `@xera-ai/core: ^0.5.0`
- Modify: `packages/http/package.json` → already 0.1.0 (no change)
- Modify: `packages/skills/package.json` → already 0.5.0 (done in plan 03)
- Modify: `packages/prompts/package.json` → 2.4.0 (done in plan 03)
- Modify: `packages/cli/package.json` → already 0.3.0 (done in plan 04)
- Modify: ALL sibling `package.json` files referencing `@xera-ai/core` to bump caret to `^0.5.0`.

- [ ] **Step 1: Inventory caret refs**

Run: `grep -rn '"@xera-ai/core":' packages/*/package.json fixtures/*/package.json`

- [ ] **Step 2: Bump all to `^0.5.0`**

Edit each file. Same for any `@xera-ai/web` references that need bumping to `^0.3.0`.

- [ ] **Step 3: Reinstall**

Run: `npm install`
Expected: lockfile regenerated, no errors.

- [ ] **Step 4: Run full suite**

Run: `npx vitest run && npm run typecheck && npm run lint && npx xera-internal verify-prompts`
Expected: all green.

- [ ] **Step 5: Commit**

```bash
git add packages/*/package.json package-lock.json
git commit -m "release: bump versions for v0.7.0"
```

---

### Task 19.2: CHANGELOG

**Files:**
- Modify: `CHANGELOG.md` (root)

- [ ] **Step 1: Add v0.7.0 entry**

```markdown
## v0.7.0 — 2026-05-XX

### Added
- `@xera-ai/http` adapter (sibling of `@xera-ai/web`) for HTTP API testing without launching a browser.
- Pre-authentication pattern via `defineHttpAuthSetup`. Per-role tokens stored encrypted at `.xera/.auth/http/<role>.json`.
- Classifier buckets: `CONTRACT_DRIFT` (http adapter when OpenAPI configured), `RATE_LIMITED` (HTTP 429), `AUTH_EXPIRED` (cross-adapter on 401 + expired token / cookie).
- `npx @xera-ai/cli init` shape question: `web`, `api`, `mixed`.
- Runtime helper `newAuthedContext` for generated `spec.ts` files (no token leakage into env).
- Doctor checks for auth file presence + expiry, OpenAPI reachability.
- Prompt `script-from-feature-http.md` (v1.0.0).

### Changed
- `script-from-feature.md` → `script-from-feature-web.md` (rename + optional API-verification section).
- `xera.config.ts`: `web` block is now optional. At least one of `web`/`http` is required.
- `scrub-rules` moved from `@xera-ai/web` to `@xera-ai/core` (re-exported from web for back-compat consumers).
- Auth state files: `.xera/.auth/<role>.json` → `.xera/.auth/web/<role>.json`. Reader falls back to legacy path for one release. `init --upgrade` migrates automatically.

### Breaking
- Config schema: `web` required → optional. Existing projects unaffected (their `web` block is still valid).
- Prompt file `script-from-feature.md` renamed.
- Auth file path moved (with one-release fallback).
```

- [ ] **Step 2: Commit**

```bash
git add CHANGELOG.md
git commit -m "docs: CHANGELOG for v0.7.0"
```

---

### Task 19.3: ARCHITECTURE.md update

**Files:**
- Modify: `docs/ARCHITECTURE.md`

- [ ] **Step 1: Add an "HTTP adapter (v0.7)" subsection**

After the web adapter section, add:

```markdown
### HTTP adapter (`@xera-ai/http`)

Sibling of the web adapter. Same `TestAdapter` contract, different runtime:

- Executes `@playwright/test` with `APIRequestContext` only — no browser.
- Pre-auth runs via `npx xera-internal auth-setup` and writes encrypted per-role JSON to `.xera/.auth/http/<role>.json`.
- Generated `spec.ts` uses `newAuthedContext(playwright, role)` to attach the right header.
- Optional OpenAPI spec drives schema-derived edge cases and `CONTRACT_DRIFT` detection.
- `RATE_LIMITED` (HTTP 429) and `AUTH_EXPIRED` (401 + expired token) are deterministic classifier outputs.

Web tickets can still call API endpoints via Playwright's `page.request` — the http adapter is for pure-API tickets only.
```

- [ ] **Step 2: Commit**

```bash
git add docs/ARCHITECTURE.md
git commit -m "docs: ARCHITECTURE notes for http adapter"
```

---

### Task 19.4: CONFIGURATION.md update

**Files:**
- Modify: `docs/CONFIGURATION.md`

- [ ] **Step 1: Add `http` block reference**

Add a section documenting every field under `http`: `baseUrl`, `defaultEnv`, `spec`, `auth.strategy`, `auth.ttl`, `auth.refreshBuffer`, `auth.roles.<name>.{tokenEnv, userEnv, passEnv, tokenUrl, clientIdEnv, clientSecretEnv, scope}`. Note which fields each strategy uses.

- [ ] **Step 2: Commit**

```bash
git add docs/CONFIGURATION.md
git commit -m "docs: CONFIGURATION http block reference"
```

---

### Task 19.5: TROUBLESHOOTING.md update

**Files:**
- Modify: `docs/TROUBLESHOOTING.md`

- [ ] **Step 1: Add common-issue entries**

```markdown
### "Auth file not found for role 'X'"
You need to run pre-authentication for that role:
```
npx xera-internal auth-setup --role X
```

### "Auth file expired for role 'X'"
Token has aged past `http.auth.ttl`. Re-run:
```
npx xera-internal auth-setup --role X
```
This is normal; xera does not auto-refresh at run time to avoid surprises.

### CONTRACT_DRIFT shows up but the backend hasn't changed
Check whether your `openapi.yaml` is out of sync with the live backend (backend dev updated the API but not the spec). Either update the spec or treat as a real bug.
```

- [ ] **Step 2: Commit**

```bash
git add docs/TROUBLESHOOTING.md
git commit -m "docs: TROUBLESHOOTING entries for http adapter"
```

---

### Task 19.6: README + ARCHITECTURE quick mention

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Add a quick blurb in the features section**

Add to the bullet list: "✨ v0.7: HTTP API testing — same workflow for REST/GraphQL endpoints, no browser needed. See [HTTP adapter docs](docs/ARCHITECTURE.md#http-adapter-xera-aihttp)."

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "docs: README mentions http adapter"
```

---

## Phase 20 — Nightly E2E

### Task 20.1: Add http branch to nightly workflow

**Files:**
- Modify: `.github/workflows/nightly-e2e.yml`

- [ ] **Step 1: Inspect existing workflow**

Read `.github/workflows/nightly-e2e.yml`. Identify how it scaffolds and runs the web ticket today.

- [ ] **Step 2: Add a parallel job for http shape**

```yaml
  e2e-http:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
      - run: npm install
      - name: Scaffold api-only project
        run: |
          mkdir -p /tmp/xera-http-e2e
          cd /tmp/xera-http-e2e
          npx @xera-ai/cli init --yes --shape api
      - name: Set env vars
        run: |
          echo "USER_BEARER_TOKEN=test-token-001" >> /tmp/xera-http-e2e/.env.local
      - name: Run pre-auth
        run: cd /tmp/xera-http-e2e && npx xera-internal auth-setup
      - name: Run SAMPLE-HTTP-001
        run: cd /tmp/xera-http-e2e && npm run --npx xera-internal run SAMPLE-HTTP-001
      - name: Assert PASS classification
        run: |
          cd /tmp/xera-http-e2e
          jq -e '.class == "PASS"' .xera/SAMPLE-HTTP-001/runs/*/classifier-output.json
```

(Adjust the exact `xera-internal` invocation to match what plan 03's `xera:exec` produced.)

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/nightly-e2e.yml
git commit -m "ci: nightly E2E covers http shape"
```

---

### Task 20.2: Run all tests one final time

- [ ] **Step 1: Full suite**

Run: `npm install && npx vitest run && npm run typecheck && npm run lint && npx xera-internal verify-prompts`
Expected: all green.

- [ ] **Step 2: Smoke test the maintainer flow from index §Definition of Done**

Run the 7 success criteria from `2026-05-16-xera-v07-00-index.md` Definition of Done. Each must pass.

- [ ] **Step 3: Tag final commit**

```bash
git commit --allow-empty -m "release: v0.7.0"
git tag v0.7.0
```

- [ ] **Step 4: Push**

```bash
git push -u origin HEAD
git push --tags
```

---

## Done with Plan 05 — v0.7.0 ready to release

Run `npm run --filter '@xera-ai/*' build` and `npm publish` (in dep order: core → web → http → prompts → skills → cli) when ready. The publish flow is documented in `AGENTS.md § Publish flow`.
