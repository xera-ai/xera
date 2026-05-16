# xera v0.7 — Plan 02: `@xera-ai/http` Package

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the new `@xera-ai/http` package: OpenAPI loader, pre-auth helpers (`defineHttpAuthSetup` + `presetHttpAuth` + runner), the run-time `newAuthedContext`, the executor that drives Playwright `APIRequestContext`, the HTTP trace normalizer, and the `HttpAdapter` wiring all of it together.

**Architecture:** Mirror `@xera-ai/web`'s shape. Each subsystem has its own folder under `src/`. Tests mirror src paths. Only `@playwright/test` (peer-style), `@apidevtools/json-schema-ref-parser`, `@xera-ai/core`, and zod are direct deps. The package exports two distinct entry points: a build-time API (`HttpAdapter` for the runner) and a run-time API (`newAuthedContext` for generated `spec.ts`).

**Prereqs:** Plan 01 complete. `bun test packages/core` green.

---

## Phase 3 — Package skeleton

### Task 3.1: Create the `@xera-ai/http` package

**Files:**
- Create: `packages/http/package.json`
- Create: `packages/http/tsconfig.json`
- Create: `packages/http/src/index.ts`
- Create: `packages/http/test/.gitkeep`

- [ ] **Step 1: Create `packages/http/package.json`**

```json
{
  "name": "@xera-ai/http",
  "version": "0.1.0",
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "bun": "./src/index.ts",
      "import": "./dist/index.js",
      "types": "./dist/index.d.ts"
    },
    "./runtime": {
      "bun": "./src/runtime/index.ts",
      "import": "./dist/runtime/index.js",
      "types": "./dist/runtime/index.d.ts"
    }
  },
  "files": ["dist", "src"],
  "scripts": {
    "build": "bun build ./src/index.ts --outdir ./dist --target bun --external @playwright/test --external @xera-ai/core --external @apidevtools/json-schema-ref-parser",
    "build:runtime": "bun build ./src/runtime/index.ts --outdir ./dist/runtime --target bun --external @playwright/test --external @xera-ai/core",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@apidevtools/json-schema-ref-parser": "11.7.0",
    "@playwright/test": "1.60.0",
    "@xera-ai/core": "^0.5.0",
    "yaml": "2.5.0",
    "zod": "3.23.8"
  }
}
```

(Pin the `yaml` and `zod` versions to whatever the rest of the workspace uses — run `grep -h '"yaml":\|"zod":' packages/*/package.json` and match.)

- [ ] **Step 2: Create `packages/http/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src",
    "composite": false,
    "types": ["bun-types"]
  },
  "include": ["src/**/*", "test/**/*"]
}
```

- [ ] **Step 3: Create `packages/http/src/index.ts` stub**

```ts
export { HttpAdapter } from './adapter';
export { defineHttpAuthSetup, presetHttpAuth } from './auth-setup';
```

(Adapter and helpers will be filled in by later tasks. For now this will fail to typecheck — that's expected; we'll fix as we add files.)

- [ ] **Step 4: Install deps**

Run: `bun install`
Expected: workspace resolves `@xera-ai/http`; lockfile updated.

- [ ] **Step 5: Commit**

```bash
git add packages/http/package.json packages/http/tsconfig.json packages/http/src/index.ts packages/http/test/ bun.lock
git commit -m "http: scaffold @xera-ai/http package"
```

---

## Phase 4 — OpenAPI loader

### Task 4.1: Implement `loader.ts`

**Files:**
- Create: `packages/http/src/openapi/loader.ts`
- Test: `packages/http/test/openapi/loader.test.ts`
- Create: `packages/http/test/openapi/fixtures/users.yaml`

- [ ] **Step 1: Write the failing test**

```ts
// packages/http/test/openapi/loader.test.ts
import { test, expect } from 'bun:test';
import { join } from 'node:path';
import { loadOpenApi } from '../../src/openapi/loader';

test('loadOpenApi parses YAML and dereferences $ref', async () => {
  const spec = await loadOpenApi(join(import.meta.dir, 'fixtures/users.yaml'));
  expect(spec.paths['/users']?.post).toBeDefined();
  // $ref to #/components/schemas/UserCreated should be inlined
  const respSchema = spec.paths['/users']!.post!.responses?.['201']?.content?.['application/json']?.schema;
  expect(respSchema?.type).toBe('object');
  expect(respSchema?.required).toContain('id');
});

test('loadOpenApi returns null on missing file', async () => {
  expect(await loadOpenApi('/no/such/file.yaml')).toBeNull();
});

test('loadOpenApi throws on malformed YAML', async () => {
  await expect(loadOpenApi(join(import.meta.dir, 'fixtures/malformed.yaml'))).rejects.toThrow();
});
```

- [ ] **Step 2: Create the fixture spec**

```yaml
# packages/http/test/openapi/fixtures/users.yaml
openapi: 3.0.0
info: { title: Users, version: 1.0.0 }
paths:
  /users:
    post:
      responses:
        '201':
          content:
            application/json:
              schema: { $ref: '#/components/schemas/UserCreated' }
        '422':
          content:
            application/json:
              schema: { $ref: '#/components/schemas/ValidationError' }
components:
  schemas:
    UserCreated:
      type: object
      required: [id, email]
      properties:
        id: { type: string }
        email: { type: string }
    ValidationError:
      type: object
      required: [errors]
      properties:
        errors: { type: array, items: { type: string } }
```

Create a malformed fixture too: `packages/http/test/openapi/fixtures/malformed.yaml` containing `not: valid: yaml: [unclosed`.

- [ ] **Step 3: Run, verify fail**

Run: `cd packages/http && bun test test/openapi/`
Expected: import error.

- [ ] **Step 4: Implement loader**

```ts
// packages/http/src/openapi/loader.ts
import { existsSync, readFileSync } from 'node:fs';
import RefParser from '@apidevtools/json-schema-ref-parser';
import { parse as parseYaml } from 'yaml';
import type { OpenAPIDocument } from '@xera-ai/core';

export async function loadOpenApi(pathOrUrl: string): Promise<OpenAPIDocument | null> {
  let raw: string;
  if (pathOrUrl.startsWith('http://') || pathOrUrl.startsWith('https://')) {
    const res = await fetch(pathOrUrl);
    if (!res.ok) return null;
    raw = await res.text();
  } else {
    if (!existsSync(pathOrUrl)) return null;
    raw = readFileSync(pathOrUrl, 'utf8');
  }
  const parsed = pathOrUrl.endsWith('.json') ? JSON.parse(raw) : parseYaml(raw);
  const deref = (await RefParser.dereference(parsed)) as unknown as OpenAPIDocument;
  return deref;
}
```

(Note: `OpenAPIDocument` type is exported from `@xera-ai/core` after plan 01's Task 2.4. If not yet exported, add it to `packages/core/src/index.ts` first.)

- [ ] **Step 5: Run, verify pass**

Run: `cd packages/http && bun test test/openapi/loader.test.ts`
Expected: 3 green.

- [ ] **Step 6: Commit**

```bash
git add packages/http/src/openapi/loader.ts packages/http/test/openapi/
git commit -m "http: openapi loader with $ref deref"
```

---

### Task 4.2: Implement `find-operation.ts`

**Files:**
- Create: `packages/http/src/openapi/find-operation.ts`
- Test: `packages/http/test/openapi/find-operation.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { test, expect } from 'bun:test';
import { findOperation } from '../../src/openapi/find-operation';
import type { OpenAPIDocument } from '@xera-ai/core';

const spec: OpenAPIDocument = {
  paths: {
    '/users': { post: { responses: { '201': {} } } },
    '/users/{id}': { get: { responses: { '200': {} } } },
  },
};

test('finds exact path match', () => {
  const op = findOperation(spec, 'POST', '/users');
  expect(op?.template).toBe('/users');
});

test('matches path-parameter template', () => {
  const op = findOperation(spec, 'GET', '/users/123');
  expect(op?.template).toBe('/users/{id}');
});

test('returns null for unknown path', () => {
  expect(findOperation(spec, 'GET', '/orders')).toBeNull();
});

test('returns null for unknown method', () => {
  expect(findOperation(spec, 'DELETE', '/users/123')).toBeNull();
});

test('ignores query string', () => {
  expect(findOperation(spec, 'GET', '/users/42?foo=bar')?.template).toBe('/users/{id}');
});
```

- [ ] **Step 2: Run, verify fail**

Run: `cd packages/http && bun test test/openapi/find-operation.test.ts`
Expected: import error.

- [ ] **Step 3: Implement**

```ts
// packages/http/src/openapi/find-operation.ts
import type { OpenAPIDocument } from '@xera-ai/core';

export interface FoundOperation {
  template: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  operation: any;
}

export function findOperation(spec: OpenAPIDocument, method: string, url: string): FoundOperation | null {
  const pathOnly = url.split('?')[0]!;
  const m = method.toLowerCase();
  for (const tmpl of Object.keys(spec.paths)) {
    const re = new RegExp('^' + tmpl.replace(/\{[^}]+\}/g, '[^/]+') + '$');
    if (!re.test(pathOnly)) continue;
    const op = (spec.paths[tmpl] as Record<string, unknown>)[m];
    if (op) return { template: tmpl, operation: op };
  }
  return null;
}
```

- [ ] **Step 4: Run, verify pass**

Run: `cd packages/http && bun test test/openapi/find-operation.test.ts`
Expected: 5 green.

- [ ] **Step 5: Commit**

```bash
git add packages/http/src/openapi/find-operation.ts packages/http/test/openapi/find-operation.test.ts
git commit -m "http: openapi find-operation matcher"
```

---

### Task 4.3: Public openapi exports

**Files:**
- Create: `packages/http/src/openapi/index.ts`

- [ ] **Step 1: Write**

```ts
export { loadOpenApi } from './loader';
export { findOperation, type FoundOperation } from './find-operation';
```

- [ ] **Step 2: Commit**

```bash
git add packages/http/src/openapi/index.ts
git commit -m "http: openapi public exports"
```

---

## Phase 5 — Auth setup

### Task 5.1: `defineHttpAuthSetup`

**Files:**
- Create: `packages/http/src/auth-setup/define.ts`
- Test: `packages/http/test/auth-setup/define.test.ts`

- [ ] **Step 1: Write failing test**

```ts
import { test, expect } from 'bun:test';
import { defineHttpAuthSetup } from '../../src/auth-setup/define';

test('defineHttpAuthSetup returns the function as-is', () => {
  const fn = async () => ({ type: 'bearer' as const, token: 'x' });
  expect(defineHttpAuthSetup(fn)).toBe(fn);
});
```

- [ ] **Step 2: Run, verify fail**

Run: `cd packages/http && bun test test/auth-setup/define.test.ts`
Expected: import error.

- [ ] **Step 3: Implement**

```ts
// packages/http/src/auth-setup/define.ts
import type { APIRequestContext } from '@playwright/test';

export interface HttpAuthRoleCreds {
  email: string;
  password: string;
}

export interface HttpAuthSetupResult {
  type: 'bearer' | 'apiKey' | 'basic' | 'cookie';
  token: string;
  header?: string;
  scheme?: string;
  cookies?: Array<{
    name: string;
    value: string;
    domain: string;
    path: string;
    expires?: number;
  }>;
  expiresAt?: number;
}

export type HttpAuthSetupFn = (
  request: APIRequestContext,
  role: string,
  creds: HttpAuthRoleCreds,
) => Promise<HttpAuthSetupResult>;

export function defineHttpAuthSetup(fn: HttpAuthSetupFn): HttpAuthSetupFn {
  return fn;
}
```

- [ ] **Step 4: Run, verify pass**

Run: `cd packages/http && bun test test/auth-setup/define.test.ts`
Expected: 1 green.

- [ ] **Step 5: Commit**

```bash
git add packages/http/src/auth-setup/define.ts packages/http/test/auth-setup/define.test.ts
git commit -m "http: defineHttpAuthSetup helper"
```

---

### Task 5.2: `presetHttpAuth` — bearer/apiKey/basic

**Files:**
- Create: `packages/http/src/auth-setup/preset.ts`
- Test: `packages/http/test/auth-setup/preset.test.ts`

- [ ] **Step 1: Write failing test**

```ts
import { test, expect, beforeEach } from 'bun:test';
import { presetHttpAuth } from '../../src/auth-setup/preset';
import type { XeraConfig } from '@xera-ai/core';

function makeRoleConfig(overrides: object): XeraConfig['http'] {
  return {
    baseUrl: { dev: 'https://api.x.com' },
    defaultEnv: 'dev',
    auth: { strategy: 'bearer', ttl: '8h', refreshBuffer: '30m', roles: {} },
    ...overrides,
  } as XeraConfig['http'];
}

const fakeRequest = {} as unknown as Parameters<typeof presetHttpAuth>[0]['request'];

beforeEach(() => {
  delete process.env.TEST_TOKEN_ENV;
  delete process.env.TEST_USER_ENV;
  delete process.env.TEST_PASS_ENV;
});

test('bearer reads tokenEnv', async () => {
  process.env.TEST_TOKEN_ENV = 'abc123';
  const result = await presetHttpAuth({
    request: fakeRequest,
    role: 'admin',
    config: makeRoleConfig({
      auth: { strategy: 'bearer', ttl: '8h', refreshBuffer: '30m', roles: { admin: { tokenEnv: 'TEST_TOKEN_ENV' } } },
    }),
  });
  expect(result.token).toBe('abc123');
  expect(result.type).toBe('bearer');
});

test('basic base64-encodes user:pass', async () => {
  process.env.TEST_USER_ENV = 'alice';
  process.env.TEST_PASS_ENV = 'wonderland';
  const result = await presetHttpAuth({
    request: fakeRequest,
    role: 'user',
    config: makeRoleConfig({
      auth: { strategy: 'basic', ttl: '8h', refreshBuffer: '30m', roles: { user: { userEnv: 'TEST_USER_ENV', passEnv: 'TEST_PASS_ENV' } } },
    }),
  });
  expect(result.type).toBe('basic');
  expect(Buffer.from(result.token, 'base64').toString()).toBe('alice:wonderland');
});

test('bearer throws when env var missing', async () => {
  await expect(presetHttpAuth({
    request: fakeRequest,
    role: 'admin',
    config: makeRoleConfig({
      auth: { strategy: 'bearer', ttl: '8h', refreshBuffer: '30m', roles: { admin: { tokenEnv: 'MISSING_ENV' } } },
    }),
  })).rejects.toThrow(/MISSING_ENV/);
});
```

- [ ] **Step 2: Run, verify fail**

Run: `cd packages/http && bun test test/auth-setup/preset.test.ts`
Expected: import error.

- [ ] **Step 3: Implement**

```ts
// packages/http/src/auth-setup/preset.ts
import type { APIRequestContext } from '@playwright/test';
import type { XeraConfig } from '@xera-ai/core';
import type { HttpAuthSetupResult } from './define';

export interface PresetHttpAuthInput {
  request: APIRequestContext;
  role: string;
  config: NonNullable<XeraConfig['http']>;
}

function readEnv(name: string): string {
  const v = process.env[name];
  if (v === undefined || v === '') {
    throw new Error(`Auth env var '${name}' is not set. Add it to .env.local.`);
  }
  return v;
}

function parseDuration(s: string): number {
  const m = s.match(/^(\d+)([smhd])$/);
  if (!m) return 8 * 3600 * 1000;
  const n = Number(m[1]);
  switch (m[2]) {
    case 's': return n * 1000;
    case 'm': return n * 60 * 1000;
    case 'h': return n * 3600 * 1000;
    case 'd': return n * 24 * 3600 * 1000;
    default: return 8 * 3600 * 1000;
  }
}

export async function presetHttpAuth(input: PresetHttpAuthInput): Promise<HttpAuthSetupResult> {
  const role = input.config.auth.roles[input.role];
  if (!role) throw new Error(`Auth role '${input.role}' not configured under http.auth.roles`);
  const ttlMs = parseDuration(input.config.auth.ttl);
  const expiresAt = Date.now() + ttlMs;

  switch (input.config.auth.strategy) {
    case 'bearer':
      return { type: 'bearer', token: readEnv(role.tokenEnv ?? ''), expiresAt };
    case 'apiKey':
      return { type: 'apiKey', token: readEnv(role.tokenEnv ?? ''), header: 'X-API-Key', scheme: '', expiresAt };
    case 'basic':
      return {
        type: 'basic',
        token: Buffer.from(`${readEnv(role.userEnv ?? '')}:${readEnv(role.passEnv ?? '')}`).toString('base64'),
        scheme: 'Basic',
        expiresAt,
      };
    case 'oauth-cc': {
      const tokenUrl = role.tokenUrl;
      if (!tokenUrl) throw new Error(`oauth-cc role '${input.role}' missing tokenUrl`);
      const form = new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: readEnv(role.clientIdEnv ?? ''),
        client_secret: readEnv(role.clientSecretEnv ?? ''),
        ...(role.scope ? { scope: role.scope } : {}),
      });
      const res = await input.request.post(tokenUrl, {
        form: Object.fromEntries(form) as Record<string, string>,
      });
      if (res.status() !== 200) throw new Error(`OAuth token endpoint returned ${res.status()}`);
      const body = (await res.json()) as { access_token: string; expires_in?: number };
      return {
        type: 'bearer',
        token: body.access_token,
        expiresAt: body.expires_in ? Date.now() + body.expires_in * 1000 : expiresAt,
      };
    }
    case 'custom':
      throw new Error(`Strategy 'custom' requires a user-defined defineHttpAuthSetup function, not presetHttpAuth.`);
    case 'none':
      throw new Error(`Strategy 'none' should not call presetHttpAuth.`);
  }
}
```

- [ ] **Step 4: Run, verify pass**

Run: `cd packages/http && bun test test/auth-setup/preset.test.ts`
Expected: 3 green.

- [ ] **Step 5: Commit**

```bash
git add packages/http/src/auth-setup/preset.ts packages/http/test/auth-setup/preset.test.ts
git commit -m "http: presetHttpAuth (bearer/apiKey/basic/oauth-cc)"
```

---

### Task 5.3: `runHttpAuthSetup` runner

**Files:**
- Create: `packages/http/src/auth-setup/runner.ts`
- Test: `packages/http/test/auth-setup/runner.test.ts`

- [ ] **Step 1: Write failing test**

```ts
import { test, expect, beforeEach, afterEach } from 'bun:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runHttpAuthSetup } from '../../src/auth-setup/runner';
import { readAuthState } from '@xera-ai/core';

let tmpDir: string;
beforeEach(() => { tmpDir = mkdtempSync(join(tmpdir(), 'xera-auth-')); process.env.XERA_AUTH_KEY = 'a'.repeat(64); process.env.PRESET_TOKEN = 'tok-123'; });
afterEach(() => { rmSync(tmpDir, { recursive: true, force: true }); });

const config = {
  baseUrl: { dev: 'http://localhost:0' },
  defaultEnv: 'dev',
  auth: {
    strategy: 'bearer' as const,
    ttl: '8h',
    refreshBuffer: '30m',
    roles: { user: { tokenEnv: 'PRESET_TOKEN' } },
  },
};

test('writes encrypted http auth file for role', async () => {
  await runHttpAuthSetup({
    authDir: tmpDir,
    role: 'user',
    config,
    setupFn: async (_request, _role, _creds) => ({ type: 'bearer', token: 'tok-123', expiresAt: Date.now() + 1000 }),
    creds: { email: '', password: '' },
  });
  const entry = readAuthState(join(tmpDir, 'http'), 'user');
  expect(entry?.strategy).toBe('apiToken');
  expect((entry?.payload as { token: string }).token).toBe('tok-123');
});
```

- [ ] **Step 2: Run, verify fail**

Run: `cd packages/http && bun test test/auth-setup/runner.test.ts`
Expected: import error.

- [ ] **Step 3: Implement**

```ts
// packages/http/src/auth-setup/runner.ts
import { join } from 'node:path';
import { request as pwRequest } from '@playwright/test';
import { writeAuthState, type XeraConfig } from '@xera-ai/core';
import type { HttpAuthSetupFn, HttpAuthRoleCreds } from './define';

export interface RunHttpAuthSetupInput {
  authDir: string;
  role: string;
  config: NonNullable<XeraConfig['http']>;
  setupFn: HttpAuthSetupFn;
  creds: HttpAuthRoleCreds;
  now?: Date;
}

export async function runHttpAuthSetup(input: RunHttpAuthSetupInput): Promise<void> {
  const baseURL = input.config.baseUrl[input.config.defaultEnv];
  const ctx = await pwRequest.newContext(baseURL ? { baseURL } : {});
  try {
    const result = await input.setupFn(ctx, input.role, input.creds);
    const now = input.now ?? new Date();
    const expiresAtMs = result.expiresAt ?? now.getTime() + 8 * 3600 * 1000;
    writeAuthState(join(input.authDir, 'http'), {
      role: input.role,
      strategy: 'apiToken',
      created_at: now.toISOString(),
      expires_at: new Date(expiresAtMs).toISOString(),
      payload: {
        type: result.type,
        token: result.token,
        header: result.header ?? (result.type === 'apiKey' ? 'X-API-Key' : 'Authorization'),
        scheme: result.scheme ?? (result.type === 'bearer' ? 'Bearer' : result.type === 'basic' ? 'Basic' : ''),
        ...(result.cookies && result.cookies.length > 0 ? { cookies: result.cookies } : {}),
      },
    });
  } finally {
    await ctx.dispose();
  }
}
```

- [ ] **Step 4: Run, verify pass**

Run: `cd packages/http && bun test test/auth-setup/runner.test.ts`
Expected: 1 green.

- [ ] **Step 5: Commit**

```bash
git add packages/http/src/auth-setup/runner.ts packages/http/test/auth-setup/runner.test.ts
git commit -m "http: runHttpAuthSetup writes encrypted role file"
```

---

### Task 5.4: Auth-setup public exports

**Files:**
- Create: `packages/http/src/auth-setup/index.ts`

- [ ] **Step 1: Write**

```ts
export { defineHttpAuthSetup, type HttpAuthSetupFn, type HttpAuthSetupResult, type HttpAuthRoleCreds } from './define';
export { presetHttpAuth, type PresetHttpAuthInput } from './preset';
export { runHttpAuthSetup, type RunHttpAuthSetupInput } from './runner';
```

- [ ] **Step 2: Commit**

```bash
git add packages/http/src/auth-setup/index.ts
git commit -m "http: auth-setup public exports"
```

---

## Phase 6 — Runtime helper

### Task 6.1: `newAuthedContext`

**Files:**
- Create: `packages/http/src/runtime/index.ts`
- Test: `packages/http/test/runtime/new-authed-context.test.ts`

- [ ] **Step 1: Write failing test**

```ts
import { test, expect, beforeEach, afterEach } from 'bun:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { writeAuthState } from '@xera-ai/core';
import { newAuthedContext } from '../../src/runtime';
import { request as pwRequest } from '@playwright/test';

let tmpDir: string;
beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'xera-rt-'));
  process.env.XERA_AUTH_KEY = 'a'.repeat(64);
  process.env.XERA_AUTH_DIR = tmpDir;
  process.env.XERA_BASE_URL = 'http://localhost:0';
});
afterEach(() => rmSync(tmpDir, { recursive: true, force: true }));

test('throws helpful error when file missing', async () => {
  await expect(newAuthedContext(pwRequest as never, 'user'))
    .rejects.toThrow(/xera:auth-setup --role user/);
});

test('throws AUTH_EXPIRED-style error when file past expiry', async () => {
  writeAuthState(join(tmpDir, 'http'), {
    role: 'user', strategy: 'apiToken',
    created_at: new Date(Date.now() - 1e7).toISOString(),
    expires_at: new Date(Date.now() - 1e6).toISOString(),
    payload: { token: 'x', type: 'bearer', header: 'Authorization', scheme: 'Bearer' },
  });
  await expect(newAuthedContext(pwRequest as never, 'user'))
    .rejects.toThrow(/expired/);
});
```

- [ ] **Step 2: Run, verify fail**

Run: `cd packages/http && bun test test/runtime/`
Expected: import error.

- [ ] **Step 3: Implement**

```ts
// packages/http/src/runtime/index.ts
import { join } from 'node:path';
import type { APIRequestContext, PlaywrightTestArgs } from '@playwright/test';
import { readAuthState } from '@xera-ai/core';

const DEFAULT_AUTH_DIR = '.xera/.auth';

export interface AuthFilePayload {
  type: 'bearer' | 'apiKey' | 'basic' | 'cookie';
  token: string;
  header: string;
  scheme: string;
  cookies?: Array<{ name: string; value: string; domain: string; path: string; expires?: number }>;
}

export async function newAuthedContext(
  playwright: PlaywrightTestArgs['playwright'],
  role: string,
): Promise<APIRequestContext> {
  const authDir = process.env.XERA_AUTH_DIR ?? DEFAULT_AUTH_DIR;
  const baseURL = process.env.XERA_BASE_URL;
  if (!baseURL) {
    throw new Error('XERA_BASE_URL is not set. Run xera through the regular skill flow.');
  }
  const entry = readAuthState(join(authDir, 'http'), role);
  if (!entry) {
    throw new Error(`Auth file not found for role '${role}'. Run: bun run xera:auth-setup --role ${role}`);
  }
  if (new Date(entry.expires_at).getTime() < Date.now()) {
    throw new Error(`Auth file expired for role '${role}'. Run: bun run xera:auth-setup --role ${role}`);
  }
  const payload = entry.payload as unknown as AuthFilePayload;
  const headers: Record<string, string> = {};
  if (payload.type !== 'cookie') {
    const headerName = payload.header || 'Authorization';
    const headerValue = payload.scheme ? `${payload.scheme} ${payload.token}` : payload.token;
    headers[headerName] = headerValue;
  }
  return playwright.request.newContext({
    baseURL,
    extraHTTPHeaders: headers,
    ...(payload.cookies && payload.cookies.length > 0 ? { storageState: { cookies: payload.cookies, origins: [] } } : {}),
  });
}
```

- [ ] **Step 4: Run, verify pass**

Run: `cd packages/http && bun test test/runtime/`
Expected: 2 green.

- [ ] **Step 5: Commit**

```bash
git add packages/http/src/runtime/index.ts packages/http/test/runtime/
git commit -m "http: newAuthedContext runtime helper"
```

---

## Phase 7 — Executor

### Task 7.1: Generate http-only Playwright config

**Files:**
- Create: `packages/http/src/executor/playwright-config.ts`
- Test: `packages/http/test/executor/playwright-config.test.ts`

- [ ] **Step 1: Write failing test**

```ts
import { test, expect } from 'bun:test';
import { generateHttpPlaywrightConfig } from '../../src/executor/playwright-config';

test('generates a config string with http project and no browser', () => {
  const cfg = generateHttpPlaywrightConfig({
    specPath: '/abs/path/spec.ts',
    outputDir: '/abs/path/runs/RUN-1',
    baseURL: 'https://api.x.com',
  });
  expect(cfg).toContain("testDir");
  expect(cfg).not.toContain('browserName');
  expect(cfg).toContain('reporter');
});
```

- [ ] **Step 2: Run, verify fail**

Run: `cd packages/http && bun test test/executor/`
Expected: import error.

- [ ] **Step 3: Implement**

```ts
// packages/http/src/executor/playwright-config.ts
import { dirname } from 'node:path';

export interface GenerateConfigInput {
  specPath: string;
  outputDir: string;
  baseURL: string;
}

export function generateHttpPlaywrightConfig(input: GenerateConfigInput): string {
  return `
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: ${JSON.stringify(dirname(input.specPath))},
  testMatch: ${JSON.stringify(input.specPath.split('/').pop())},
  outputDir: ${JSON.stringify(input.outputDir)},
  reporter: [['json', { outputFile: ${JSON.stringify(`${input.outputDir}/raw-report.json`)} }]],
  use: { baseURL: ${JSON.stringify(input.baseURL)} },
  projects: [{ name: 'http' }],
});
`.trimStart();
}
```

- [ ] **Step 4: Run, verify pass**

Run: `cd packages/http && bun test test/executor/playwright-config.test.ts`
Expected: 1 green.

- [ ] **Step 5: Commit**

```bash
git add packages/http/src/executor/playwright-config.ts packages/http/test/executor/playwright-config.test.ts
git commit -m "http: generate http-only playwright config"
```

---

### Task 7.2: Trace recorder — wraps `request.newContext` to log

**Files:**
- Create: `packages/http/src/executor/trace-recorder.ts`
- Test: `packages/http/test/executor/trace-recorder.test.ts`

The trace recorder hooks into the `APIRequestContext` returned by `newAuthedContext` to append `http-trace.jsonl` entries on each request/response.

- [ ] **Step 1: Write failing test (using a fake request context)**

```ts
import { test, expect, beforeEach, afterEach } from 'bun:test';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { attachTraceRecorder } from '../../src/executor/trace-recorder';
import { EventEmitter } from 'node:events';

class FakeCtx extends EventEmitter {
  get(_url: string) { return Promise.resolve(); }
}

let dir: string;
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'trace-')); });
afterEach(() => rmSync(dir, { recursive: true, force: true }));

test('writes a JSONL line on response', async () => {
  const traceFile = join(dir, 'http-trace.jsonl');
  const ctx = new FakeCtx();
  attachTraceRecorder(ctx as never, { traceFile, scenario: 'demo' });
  ctx.emit('request', { method: () => 'POST', url: () => '/users', headers: () => ({}), postData: () => '{}' });
  ctx.emit('response', { request: () => ({ method: () => 'POST', url: () => '/users' }), status: () => 422, headers: () => ({}), text: async () => '{"errors":[]}' });
  // The recorder is async-fire-and-forget; wait a tick.
  await new Promise((r) => setTimeout(r, 30));
  expect(existsSync(traceFile)).toBe(true);
  const line = readFileSync(traceFile, 'utf8').trim();
  const parsed = JSON.parse(line);
  expect(parsed.method).toBe('POST');
  expect(parsed.url).toBe('/users');
  expect(parsed.status).toBe(422);
});
```

- [ ] **Step 2: Run, verify fail**

Run: `cd packages/http && bun test test/executor/trace-recorder.test.ts`
Expected: import error.

- [ ] **Step 3: Implement**

```ts
// packages/http/src/executor/trace-recorder.ts
import { appendFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import type { APIRequestContext, APIResponse, Request as PWRequest } from '@playwright/test';
import { scrubBody, scrubHeaders } from '@xera-ai/core';

export interface AttachTraceRecorderInput {
  traceFile: string;
  scenario: string;
}

interface PendingReq {
  startedAt: number;
  reqBody: unknown;
}
const pending = new WeakMap<PWRequest, PendingReq>();

export function attachTraceRecorder(ctx: APIRequestContext, input: AttachTraceRecorderInput): void {
  mkdirSync(dirname(input.traceFile), { recursive: true });
  // Playwright's APIRequestContext is an EventEmitter at runtime; types are loose here.
  const emitter = ctx as unknown as { on: (evt: string, cb: (...args: unknown[]) => void) => void };
  emitter.on('request', (req: unknown) => {
    const r = req as PWRequest;
    let reqBody: unknown = undefined;
    try {
      const raw = r.postData();
      reqBody = raw ? JSON.parse(raw) : undefined;
    } catch {
      reqBody = r.postData();
    }
    pending.set(r, { startedAt: Date.now(), reqBody });
  });
  emitter.on('response', async (resp: unknown) => {
    const r = resp as APIResponse;
    const req = r.request();
    const start = pending.get(req as unknown as PWRequest);
    const startedAt = start?.startedAt ?? Date.now();
    let respBody: unknown;
    try {
      respBody = JSON.parse(await r.text());
    } catch {
      respBody = await r.text();
    }
    const line = {
      ts: new Date().toISOString(),
      scenario: input.scenario,
      method: req.method(),
      url: req.url(),
      reqHeaders: scrubHeaders(req.headers() as Record<string, string>),
      reqBody: scrubBody(start?.reqBody),
      status: r.status(),
      respHeaders: scrubHeaders(r.headers() as Record<string, string>),
      respBody: scrubBody(respBody),
      durationMs: Date.now() - startedAt,
    };
    appendFileSync(input.traceFile, JSON.stringify(line) + '\n');
  });
}
```

- [ ] **Step 4: Run, verify pass**

Run: `cd packages/http && bun test test/executor/trace-recorder.test.ts`
Expected: 1 green.

- [ ] **Step 5: Commit**

```bash
git add packages/http/src/executor/trace-recorder.ts packages/http/test/executor/trace-recorder.test.ts
git commit -m "http: trace recorder writes JSONL per request/response"
```

---

### Task 7.3: `runHttpScenarios`

**Files:**
- Create: `packages/http/src/executor/index.ts`
- Test: integration test deferred to plan 05 (needs mock-api fixture)

- [ ] **Step 1: Implement (no isolated unit test — covered by integration test in plan 05)**

```ts
// packages/http/src/executor/index.ts
import { spawn } from 'node:child_process';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import type { XeraConfig } from '@xera-ai/core';
import { generateHttpPlaywrightConfig } from './playwright-config';

export interface RunHttpScenariosInput {
  specPath: string;
  runDir: string;
  config: XeraConfig;
  env: string;
}

export interface RunHttpScenariosResult {
  rawReportPath: string;
  exitCode: number;
}

export async function runHttpScenarios(input: RunHttpScenariosInput): Promise<RunHttpScenariosResult> {
  if (!input.config.http) throw new Error('http config block is required for runHttpScenarios');
  const baseURL = input.config.http.baseUrl[input.env];
  if (!baseURL) throw new Error(`No baseUrl for env '${input.env}'`);
  mkdirSync(input.runDir, { recursive: true });
  const pwConfigPath = join(input.runDir, 'playwright.http.config.ts');
  writeFileSync(
    pwConfigPath,
    generateHttpPlaywrightConfig({ specPath: input.specPath, outputDir: input.runDir, baseURL }),
  );

  const rawReportPath = join(input.runDir, 'raw-report.json');
  const traceFile = join(input.runDir, 'http-trace.jsonl');

  return new Promise((resolve) => {
    const child = spawn('bunx', ['playwright', 'test', '--config', pwConfigPath], {
      stdio: 'inherit',
      env: {
        ...process.env,
        XERA_BASE_URL: baseURL,
        XERA_AUTH_DIR: join(process.cwd(), '.xera', '.auth'),
        XERA_HTTP_TRACE: traceFile,
      },
    });
    child.on('exit', (code) => resolve({ rawReportPath, exitCode: code ?? 0 }));
  });
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/http/src/executor/index.ts
git commit -m "http: runHttpScenarios entry point"
```

---

## Phase 8 — Trace normalizer

### Task 8.1: Normalize http-trace.jsonl

**Files:**
- Create: `packages/http/src/trace-normalizer/normalize.ts`
- Test: `packages/http/test/trace-normalizer/normalize.test.ts`

- [ ] **Step 1: Write failing test**

```ts
import { test, expect, beforeEach, afterEach } from 'bun:test';
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { normalizeHttpRun } from '../../src/trace-normalizer/normalize';

let dir: string;
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'norm-')); });
afterEach(() => rmSync(dir, { recursive: true, force: true }));

test('produces normalized.json with calls array and curl reproducer', async () => {
  const traceLines = [
    JSON.stringify({ ts: 't1', scenario: 'reject', method: 'POST', url: '/users', reqHeaders: { Authorization: '***' }, reqBody: { email: 'x' }, status: 422, respHeaders: {}, respBody: { errors: ['x'] }, durationMs: 10 }),
  ].join('\n');
  writeFileSync(join(dir, 'http-trace.jsonl'), traceLines);
  // raw-report mock
  writeFileSync(join(dir, 'raw-report.json'), JSON.stringify({
    suites: [{ specs: [{ title: 'reject', tests: [{ results: [{ status: 'failed', error: { message: 'oh no' } }] }] }] }],
  }));

  await normalizeHttpRun({ runId: 'RUN-1', runDir: dir });
  const out = JSON.parse(readFileSync(join(dir, 'normalized.json'), 'utf8'));
  expect(out.outcome).toBe('FAIL');
  expect(out.scenarios[0].name).toBe('reject');
  expect(out.http.calls[0].method).toBe('POST');
  expect(out.http.calls[0].curl).toContain("curl -X POST");
});
```

- [ ] **Step 2: Run, verify fail**

Run: `cd packages/http && bun test test/trace-normalizer/`
Expected: import error.

- [ ] **Step 3: Implement**

```ts
// packages/http/src/trace-normalizer/normalize.ts
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

interface TraceLine {
  ts: string;
  scenario: string;
  method: string;
  url: string;
  reqHeaders: Record<string, string>;
  reqBody: unknown;
  status: number;
  respHeaders: Record<string, string>;
  respBody: unknown;
  durationMs: number;
}

interface NormalizedScenario {
  name: string;
  outcome: 'PASS' | 'FAIL' | 'SKIPPED';
  failure?: { errorMessage?: string };
}

interface NormalizedRun {
  runId: string;
  outcome: 'PASS' | 'FAIL';
  scenarios: NormalizedScenario[];
  http: {
    calls: Array<TraceLine & { curl: string }>;
  };
}

function buildCurl(line: TraceLine): string {
  const headers = Object.entries(line.reqHeaders)
    .map(([k, v]) => `-H ${JSON.stringify(`${k}: ${v}`)}`).join(' ');
  const body = line.reqBody === undefined ? '' : ` -d ${JSON.stringify(JSON.stringify(line.reqBody))}`;
  return `curl -X ${line.method} ${headers} $BASE${line.url}${body}`;
}

export interface NormalizeHttpRunInput {
  runId: string;
  runDir: string;
}

export async function normalizeHttpRun(input: NormalizeHttpRunInput): Promise<NormalizedRun> {
  const tracePath = join(input.runDir, 'http-trace.jsonl');
  const rawReportPath = join(input.runDir, 'raw-report.json');
  const calls: Array<TraceLine & { curl: string }> = [];
  if (existsSync(tracePath)) {
    for (const line of readFileSync(tracePath, 'utf8').split('\n').filter(Boolean)) {
      const parsed = JSON.parse(line) as TraceLine;
      calls.push({ ...parsed, curl: buildCurl(parsed) });
    }
  }

  const raw = existsSync(rawReportPath) ? JSON.parse(readFileSync(rawReportPath, 'utf8')) : { suites: [] };
  const scenarios: NormalizedScenario[] = [];
  let anyFail = false;
  const walk = (s: { specs?: unknown[]; suites?: unknown[] }): void => {
    for (const spec of (s.specs ?? []) as Array<{ title: string; tests: Array<{ results: Array<{ status: string; error?: { message?: string } }> }> }>) {
      const result = spec.tests[0]?.results[0];
      const outcome: NormalizedScenario['outcome'] =
        !result ? 'SKIPPED' : result.status === 'passed' ? 'PASS' : result.status === 'skipped' ? 'SKIPPED' : 'FAIL';
      if (outcome === 'FAIL') anyFail = true;
      const sc: NormalizedScenario = { name: spec.title, outcome };
      if (outcome === 'FAIL' && result?.error) sc.failure = { errorMessage: result.error.message ?? '' };
      scenarios.push(sc);
    }
    for (const sub of (s.suites ?? []) as Array<{ specs?: unknown[]; suites?: unknown[] }>) walk(sub);
  };
  for (const top of (raw as { suites?: unknown[] }).suites ?? []) walk(top as { specs?: unknown[]; suites?: unknown[] });

  const out: NormalizedRun = {
    runId: input.runId,
    outcome: anyFail ? 'FAIL' : 'PASS',
    scenarios,
    http: { calls },
  };
  writeFileSync(join(input.runDir, 'normalized.json'), JSON.stringify(out, null, 2));
  return out;
}
```

- [ ] **Step 4: Run, verify pass**

Run: `cd packages/http && bun test test/trace-normalizer/`
Expected: 1 green.

- [ ] **Step 5: Commit**

```bash
git add packages/http/src/trace-normalizer/normalize.ts packages/http/test/trace-normalizer/
git commit -m "http: trace normalizer + curl reproducer"
```

---

## Phase 9 — Adapter wireup

### Task 9.1: `HttpAdapter`

**Files:**
- Create: `packages/http/src/adapter.ts`
- Test: `packages/http/test/adapter.test.ts`

- [ ] **Step 1: Write failing test**

```ts
import { test, expect } from 'bun:test';
import { HttpAdapter } from '../src/adapter';

test('HttpAdapter id is "http"', () => {
  expect(HttpAdapter.id).toBe('http');
});

test('HttpAdapter.generate is a no-op (LLM-driven)', async () => {
  const r = await HttpAdapter.generate({ ticketDir: '/x', feature: '', story: '', config: {} as never });
  expect(r.artifacts).toEqual([]);
});

test('HttpAdapter.doctor reports playwright presence', async () => {
  const r = await HttpAdapter.doctor();
  expect(r.checks.some((c) => c.name.includes('@playwright/test'))).toBe(true);
});
```

- [ ] **Step 2: Run, verify fail**

Run: `cd packages/http && bun test test/adapter.test.ts`
Expected: import error.

- [ ] **Step 3: Implement**

```ts
// packages/http/src/adapter.ts
import { join } from 'node:path';
import type { TestAdapter, ExecuteInput, GenerateInput, GenerateResult, RunResult, DoctorReport } from '@xera-ai/core/adapter';
import { runHttpScenarios } from './executor';
import { normalizeHttpRun } from './trace-normalizer/normalize';

export const HttpAdapter: TestAdapter = {
  id: 'http',

  async generate(_input: GenerateInput): Promise<GenerateResult> {
    return { artifacts: [], warnings: [] };
  },

  async execute(input: ExecuteInput): Promise<RunResult> {
    const runDir = join(input.ticketDir, 'runs', input.runId);
    const specPath = join(input.ticketDir, 'spec.ts');
    const raw = await runHttpScenarios({
      specPath,
      runDir,
      config: input.config,
      env: input.env,
    });
    const normalized = await normalizeHttpRun({ runId: input.runId, runDir });
    return {
      runId: input.runId,
      outcome: normalized.outcome,
      scenarios: normalized.scenarios.map((s) => {
        const out: RunResult['scenarios'][number] = { name: s.name, outcome: s.outcome };
        if (s.failure !== undefined) out.failure = s.failure;
        return out;
      }),
      artifactsDir: runDir,
      rawReportPath: raw.rawReportPath,
      normalizedReportPath: join(runDir, 'normalized.json'),
    };
  },

  async doctor(): Promise<DoctorReport> {
    const checks: DoctorReport['checks'] = [];
    try {
      await import('@playwright/test');
      checks.push({ name: '@playwright/test installed', ok: true });
    } catch {
      checks.push({ name: '@playwright/test installed', ok: false, message: 'Run `bun add -D @playwright/test`.' });
    }
    return { ok: checks.every((c) => c.ok), checks };
  },
};
```

- [ ] **Step 4: Run, verify pass**

Run: `cd packages/http && bun test test/adapter.test.ts`
Expected: 3 green.

- [ ] **Step 5: Commit**

```bash
git add packages/http/src/adapter.ts packages/http/test/adapter.test.ts
git commit -m "http: HttpAdapter implementation"
```

---

### Task 9.2: Finalize package exports + workspace milestone

**Files:**
- Modify: `packages/http/src/index.ts`

- [ ] **Step 1: Replace stub with full exports**

```ts
// packages/http/src/index.ts
export { HttpAdapter } from './adapter';
export { defineHttpAuthSetup, presetHttpAuth, runHttpAuthSetup } from './auth-setup';
export type { HttpAuthSetupFn, HttpAuthSetupResult, HttpAuthRoleCreds } from './auth-setup';
export { loadOpenApi, findOperation } from './openapi';
```

- [ ] **Step 2: Run full http suite**

Run: `cd packages/http && bun test && bun run typecheck`
Expected: all green, no type errors.

- [ ] **Step 3: Run full workspace suite**

Run: `bun test && bun run typecheck && bun run lint`
Expected: all green.

- [ ] **Step 4: Commit milestone**

```bash
git add packages/http/src/index.ts
git commit --allow-empty -m "chore: v0.7 plan 02 http package complete"
```

---

## Done with Plan 02

Proceed to [03-skills-prompts.md](2026-05-16-xera-v07-03-skills-prompts.md).
