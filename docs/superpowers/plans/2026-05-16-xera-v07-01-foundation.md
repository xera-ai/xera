# xera v0.7 — Plan 01: Foundation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Relocate `scrub-rules` to `@xera-ai/core`, extend config schema with the new `http` block (making `web` optional), and extend the classifier with three new buckets (`CONTRACT_DRIFT`, `RATE_LIMITED`, `AUTH_EXPIRED`).

**Architecture:** Three independent phases. Phase 0 is a pure file move with adversarial tests carried over. Phase 1 adds a top-level optional block + a refinement ensuring at least one of `web`/`http` is present. Phase 2 adds rule files under `packages/core/src/classifier/` that the existing `classify()` driver applies in priority order before falling through to the existing 5 buckets.

**Prereqs:** v0.6 codebase clean. `bun install && bun test` green.

---

## Phase 0 — Relocate `scrub-rules` to `@xera-ai/core`

### Task 0.1: Create core scrub module

**Files:**
- Create: `packages/core/src/scrub/rules.ts`
- Create: `packages/core/src/scrub/index.ts`
- Test: `packages/core/test/scrub/scrub.test.ts`

- [ ] **Step 1: Copy `scrub-rules.ts` content from web to core**

Read: `packages/web/src/trace-normalizer/scrub-rules.ts`. Copy the regex rules and header blacklist verbatim into `packages/core/src/scrub/rules.ts`. Do not change content (rules are security-sensitive).

- [ ] **Step 2: Write the public API in `packages/core/src/scrub/index.ts`**

```ts
export { HEADER_BLACKLIST, BODY_PATTERNS } from './rules';

export function scrubString(input: string): string {
  let s = input;
  for (const p of BODY_PATTERNS) s = s.replace(p.pattern, p.replacement);
  return s;
}

export function scrubHeaders(h: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(h)) {
    out[k] = HEADER_BLACKLIST.has(k.toLowerCase()) ? '***' : v;
  }
  return out;
}

export function scrubBody(body: unknown): unknown {
  if (typeof body === 'string') return scrubString(body);
  if (body === null || body === undefined) return body;
  if (typeof body !== 'object') return body;
  if (Array.isArray(body)) return body.map(scrubBody);
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(body as Record<string, unknown>)) {
    if (HEADER_BLACKLIST.has(k.toLowerCase())) out[k] = '***';
    else out[k] = scrubBody(v);
  }
  return out;
}
```

(`HEADER_BLACKLIST` and `BODY_PATTERNS` are imported from `./rules` — the imports are re-exported in the first line.)

- [ ] **Step 3: Write the adversarial test**

```ts
// packages/core/test/scrub/scrub.test.ts
import { test, expect } from 'bun:test';
import { scrubBody, scrubHeaders, scrubString } from '../../src/scrub';

test('scrubHeaders masks Authorization', () => {
  const out = scrubHeaders({ Authorization: 'Bearer abc', Accept: 'application/json' });
  expect(out.Authorization).toBe('***');
  expect(out.Accept).toBe('application/json');
});

test('scrubBody masks password field in nested object', () => {
  const out = scrubBody({ user: { email: 'a@b.com', password: 'hunter2' } }) as Record<string, Record<string, string>>;
  expect(out.user.password).toBe('***');
  expect(out.user.email).toBe('a@b.com');
});

test('scrubString redacts credit card pattern', () => {
  expect(scrubString('card: 4111 1111 1111 1111')).not.toContain('4111 1111 1111 1111');
});

test('scrubBody handles arrays', () => {
  const out = scrubBody([{ token: 'x' }, { token: 'y' }]) as Array<Record<string, string>>;
  expect(out[0]!.token).toBe('***');
  expect(out[1]!.token).toBe('***');
});
```

- [ ] **Step 4: Run tests, verify pass**

Run: `cd packages/core && bun test test/scrub/`
Expected: 4 passing tests.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/scrub/ packages/core/test/scrub/
git commit -m "core: add scrub module (relocated from web)"
```

---

### Task 0.2: Re-export from `@xera-ai/core` public surface

**Files:**
- Modify: `packages/core/src/index.ts`

- [ ] **Step 1: Add the re-export**

Append to `packages/core/src/index.ts`:

```ts
export { scrubBody, scrubHeaders, scrubString, HEADER_BLACKLIST, BODY_PATTERNS } from './scrub';
```

- [ ] **Step 2: Run typecheck**

Run: `cd packages/core && bun run typecheck`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add packages/core/src/index.ts
git commit -m "core: re-export scrub from public surface"
```

---

### Task 0.3: Delete web's scrub-rules + update web's normalizer

**Files:**
- Delete: `packages/web/src/trace-normalizer/scrub-rules.ts`
- Modify: `packages/web/src/trace-normalizer/scrub.ts`
- Delete or move: `packages/web/test/trace-normalizer/scrub.test.ts` (move tests to core if not already covered)

- [ ] **Step 1: Inspect web's existing `scrub.ts` and rewrite to import from core**

Replace contents of `packages/web/src/trace-normalizer/scrub.ts`:

```ts
import { scrubBody, scrubHeaders, scrubString } from '@xera-ai/core';

export { scrubBody, scrubHeaders, scrubString };

// Keep any web-specific scrub helpers below if they exist; ONLY remove the rules file.
```

(Check existing file — if there are web-specific helpers like DOM-text scrubbing, keep them after the imports.)

- [ ] **Step 2: Delete the now-unused rules file**

Run: `rm packages/web/src/trace-normalizer/scrub-rules.ts`

- [ ] **Step 3: Move web's adversarial tests to core if any are not yet covered**

Check `packages/web/test/trace-normalizer/scrub.test.ts`. If it has tests that aren't in `packages/core/test/scrub/scrub.test.ts`, copy them into core and adjust the import path. Delete the web copy when fully migrated.

- [ ] **Step 4: Run both package tests**

```bash
cd packages/web && bun test
cd ../core && bun test
```
Expected: all green, scrub coverage intact.

- [ ] **Step 5: Commit**

```bash
git add packages/web/src/trace-normalizer/ packages/web/test/trace-normalizer/ packages/core/test/scrub/
git commit -m "web: delete scrub-rules, import from core"
```

---

## Phase 1 — Config schema: add `http` block, make `web` optional

### Task 1.1: Add HTTP-related schemas

**Files:**
- Modify: `packages/core/src/config/schema.ts`
- Test: `packages/core/test/config/schema.test.ts` (extend existing)

- [ ] **Step 1: Write the failing test first**

Add to `packages/core/test/config/schema.test.ts`:

```ts
import { test, expect } from 'bun:test';
import { XeraConfigSchema } from '../../src/config/schema';

test('http block validates with bearer strategy and roles', () => {
  const parsed = XeraConfigSchema.parse({
    jira: { baseUrl: 'https://x.atlassian.net', projectKeys: ['PROJ'], fields: { story: 'description' } },
    http: {
      baseUrl: { dev: 'https://api.dev.x.com' },
      defaultEnv: 'dev',
      auth: {
        strategy: 'bearer',
        roles: { admin: { tokenEnv: 'ADMIN_BEARER_TOKEN' } },
      },
    },
    adapters: ['http'],
  });
  expect(parsed.http?.auth.strategy).toBe('bearer');
  expect(parsed.http?.auth.roles.admin?.tokenEnv).toBe('ADMIN_BEARER_TOKEN');
});

test('http block rejects defaultEnv not in baseUrl', () => {
  expect(() => XeraConfigSchema.parse({
    jira: { baseUrl: 'https://x.atlassian.net', projectKeys: ['PROJ'], fields: { story: 'description' } },
    http: { baseUrl: { dev: 'https://api.dev.x.com' }, defaultEnv: 'prod', auth: { strategy: 'none' } },
    adapters: ['http'],
  })).toThrow();
});
```

- [ ] **Step 2: Run, verify fail**

Run: `cd packages/core && bun test test/config/schema.test.ts`
Expected: fail with "Cannot read properties of undefined (reading 'auth')" or "http" key not allowed.

- [ ] **Step 3: Implement schemas in `packages/core/src/config/schema.ts`**

Add after the existing `WebSchema` definition:

```ts
const HttpAuthRoleSchema = z.object({
  tokenEnv: z.string().optional(),
  userEnv: z.string().optional(),
  passEnv: z.string().optional(),
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

const HttpSchema = z
  .object({
    baseUrl: z
      .record(z.string(), z.string().url())
      .refine((m) => Object.keys(m).length > 0, { message: 'baseUrl must have at least one environment' }),
    defaultEnv: z.string(),
    spec: z.string().optional(),
    auth: HttpAuthSchema.prefault({}),
  })
  .refine((h) => h.baseUrl[h.defaultEnv] !== undefined, {
    message: 'defaultEnv must exist in baseUrl map',
    path: ['defaultEnv'],
  });
```

- [ ] **Step 4: Run test, verify pass**

Run: `cd packages/core && bun test test/config/schema.test.ts`
Expected: 2 new tests pass.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/config/schema.ts packages/core/test/config/schema.test.ts
git commit -m "core: add http config schemas"
```

---

### Task 1.2: Make `web` optional and add top-level refines

**Files:**
- Modify: `packages/core/src/config/schema.ts`
- Test: `packages/core/test/config/schema.test.ts`

- [ ] **Step 1: Write failing tests**

Add:

```ts
test('web becomes optional; http alone is valid', () => {
  const parsed = XeraConfigSchema.parse({
    jira: { baseUrl: 'https://x.atlassian.net', projectKeys: ['PROJ'], fields: { story: 'description' } },
    http: { baseUrl: { dev: 'https://api.dev.x.com' }, defaultEnv: 'dev', auth: { strategy: 'none' } },
    adapters: ['http'],
  });
  expect(parsed.web).toBeUndefined();
  expect(parsed.http).toBeDefined();
});

test('config rejects when neither web nor http present', () => {
  expect(() => XeraConfigSchema.parse({
    jira: { baseUrl: 'https://x.atlassian.net', projectKeys: ['PROJ'], fields: { story: 'description' } },
    adapters: ['web'],
  })).toThrow(/At least one of/);
});

test('config rejects when adapters references unconfigured adapter', () => {
  expect(() => XeraConfigSchema.parse({
    jira: { baseUrl: 'https://x.atlassian.net', projectKeys: ['PROJ'], fields: { story: 'description' } },
    web: { baseUrl: { dev: 'https://app.dev.x.com' }, defaultEnv: 'dev', auth: { strategy: 'none' } },
    adapters: ['web', 'http'],
  })).toThrow(/must have a corresponding config block/);
});
```

- [ ] **Step 2: Run, verify fail**

Run: `cd packages/core && bun test test/config/schema.test.ts`
Expected: 3 failures.

- [ ] **Step 3: Update the top-level schema**

In `packages/core/src/config/schema.ts`, replace the existing `XeraConfigSchema` definition with:

```ts
export const XeraConfigSchema = z
  .object({
    jira: JiraSchema,
    web: WebSchema.optional(),
    http: HttpSchema.optional(),
    ai: AISchema,
    reporting: ReportingSchema,
    run: RunSchema.prefault({}),
    adapters: z.array(z.enum(['web', 'http'])).min(1).default(['web']),
  })
  .refine((c) => c.web !== undefined || c.http !== undefined, {
    message: 'At least one of `web` or `http` must be configured',
  })
  .refine((c) => c.adapters.every((a) => (a === 'web' ? c.web : c.http) !== undefined), {
    message: 'Every adapter in `adapters` must have a corresponding config block',
    path: ['adapters'],
  });
```

- [ ] **Step 4: Run, verify pass**

Run: `cd packages/core && bun test test/config/schema.test.ts`
Expected: all green.

- [ ] **Step 5: Run full core suite to catch regressions**

Run: `cd packages/core && bun test`
Expected: all green.

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/config/schema.ts packages/core/test/config/schema.test.ts
git commit -m "core: web becomes optional, add top-level refines"
```

---

### Task 1.3: Update `loadConfig` to handle optional `web`

**Files:**
- Modify: `packages/core/src/config/load.ts` (only if it dereferences `config.web` unconditionally)

- [ ] **Step 1: Inspect `packages/core/src/config/load.ts` for `config.web.*` usages**

Read the file. If it accesses `config.web.baseUrl` etc. without checking presence, you'll hit `undefined` errors at runtime when only http is configured.

- [ ] **Step 2: Make web accesses conditional**

Wherever the loader reads `config.web.X`, guard with `if (config.web !== undefined)`. There should not be uses in load.ts that materially depend on web — load.ts just validates and returns; if it does anything web-specific, move it to a caller.

- [ ] **Step 3: Run core tests**

Run: `cd packages/core && bun test`
Expected: green.

- [ ] **Step 4: Commit** (only if there were changes)

```bash
git add packages/core/src/config/load.ts
git commit -m "core: loadConfig handles optional web block"
```

---

## Phase 2 — Classifier: 3 new buckets

### Task 2.1: Extend Classification enum

**Files:**
- Modify: `packages/core/src/artifact/status.ts`
- Modify: `packages/core/src/classifier/types.ts` (if separate)
- Test: `packages/core/test/artifact/status.test.ts` (extend)

- [ ] **Step 1: Locate Classification type**

Run: `grep -n "Classification" packages/core/src/artifact/status.ts packages/core/src/classifier/`. Identify the source-of-truth definition. Existing values are likely: `'PASS' | 'REAL_BUG' | 'TEST_BUG' | 'SELECTOR_DRIFT' | 'FLAKY' | 'TEST_OUTDATED'` (5 + PASS).

- [ ] **Step 2: Write failing test**

In `packages/core/test/classifier/types.test.ts` (create if missing):

```ts
import { test, expect } from 'bun:test';
import type { Classification } from '../../src/artifact/status';

const all: Classification[] = [
  'PASS', 'REAL_BUG', 'TEST_BUG', 'SELECTOR_DRIFT', 'FLAKY', 'TEST_OUTDATED',
  'CONTRACT_DRIFT', 'RATE_LIMITED', 'AUTH_EXPIRED',
];

test('Classification enum includes v0.7 buckets', () => {
  expect(all).toContain('CONTRACT_DRIFT');
  expect(all).toContain('RATE_LIMITED');
  expect(all).toContain('AUTH_EXPIRED');
});
```

- [ ] **Step 3: Run, verify fail**

Run: `cd packages/core && bun test test/classifier/types.test.ts`
Expected: compile error — the new values aren't valid `Classification`.

- [ ] **Step 4: Extend the union type**

In `packages/core/src/artifact/status.ts` (or wherever the source-of-truth is), update:

```ts
export type Classification =
  | 'PASS'
  | 'REAL_BUG'
  | 'TEST_BUG'
  | 'SELECTOR_DRIFT'
  | 'FLAKY'
  | 'TEST_OUTDATED'
  | 'CONTRACT_DRIFT'
  | 'RATE_LIMITED'
  | 'AUTH_EXPIRED';
```

Search for any zod enum that mirrors this and update it too: `grep -rn "z.enum(\[.*'TEST_OUTDATED'" packages/core/src/`.

- [ ] **Step 5: Run typecheck across workspace**

Run: `bun run typecheck`
Expected: no errors. If any exhaustive `switch (cls)` exists, it will fail to compile — add the new cases (initially returning the same fallthrough as `FAIL` or default).

- [ ] **Step 6: Run test**

Run: `cd packages/core && bun test test/classifier/types.test.ts`
Expected: pass.

- [ ] **Step 7: Commit**

```bash
git add packages/core/src/artifact/status.ts packages/core/test/classifier/
# include any files updated for exhaustive switches
git commit -m "core: extend Classification enum with v0.7 buckets"
```

---

### Task 2.2: Implement `RATE_LIMITED` rule

**Files:**
- Create: `packages/core/src/classifier/rate-limited.ts`
- Test: `packages/core/test/classifier/rate-limited.test.ts`
- Modify: `packages/core/src/classifier/index.ts` (apply rule)

- [ ] **Step 1: Write the failing test**

```ts
// packages/core/test/classifier/rate-limited.test.ts
import { test, expect } from 'bun:test';
import { classifyRateLimited } from '../../src/classifier/rate-limited';

test('returns RATE_LIMITED when any captured call has status 429', () => {
  const calls = [
    { status: 200, method: 'GET', url: '/x' },
    { status: 429, method: 'POST', url: '/orders' },
  ];
  expect(classifyRateLimited({ calls })).toEqual({
    class: 'RATE_LIMITED',
    rationale: 'Captured HTTP 429 on POST /orders',
  });
});

test('returns null when no 429 present', () => {
  const calls = [{ status: 200, method: 'GET', url: '/x' }];
  expect(classifyRateLimited({ calls })).toBeNull();
});

test('returns null with no calls', () => {
  expect(classifyRateLimited({ calls: [] })).toBeNull();
});
```

- [ ] **Step 2: Run, verify fail**

Run: `cd packages/core && bun test test/classifier/rate-limited.test.ts`
Expected: import error.

- [ ] **Step 3: Implement**

```ts
// packages/core/src/classifier/rate-limited.ts
import type { Classification } from '../artifact/status';

export interface HttpCallSummary {
  method: string;
  url: string;
  status: number;
}

export interface ClassifyRateLimitedInput {
  calls: readonly HttpCallSummary[];
}

export interface ClassifyResult {
  class: Classification;
  rationale: string;
}

export function classifyRateLimited(input: ClassifyRateLimitedInput): ClassifyResult | null {
  const hit = input.calls.find((c) => c.status === 429);
  if (!hit) return null;
  return {
    class: 'RATE_LIMITED',
    rationale: `Captured HTTP 429 on ${hit.method} ${hit.url}`,
  };
}
```

- [ ] **Step 4: Run, verify pass**

Run: `cd packages/core && bun test test/classifier/rate-limited.test.ts`
Expected: 3 green.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/classifier/rate-limited.ts packages/core/test/classifier/rate-limited.test.ts
git commit -m "core: classifier rule for RATE_LIMITED"
```

---

### Task 2.3: Implement `AUTH_EXPIRED` rule

**Files:**
- Create: `packages/core/src/classifier/auth-expired.ts`
- Test: `packages/core/test/classifier/auth-expired.test.ts`

- [ ] **Step 1: Write failing test**

```ts
// packages/core/test/classifier/auth-expired.test.ts
import { test, expect } from 'bun:test';
import { classifyAuthExpired } from '../../src/classifier/auth-expired';

const expiredJwt = () => {
  const past = Math.floor(Date.now() / 1000) - 60;
  const payload = Buffer.from(JSON.stringify({ exp: past })).toString('base64url');
  return `eyJhbGciOiJIUzI1NiJ9.${payload}.fake-sig`;
};

const freshJwt = () => {
  const future = Math.floor(Date.now() / 1000) + 3600;
  const payload = Buffer.from(JSON.stringify({ exp: future })).toString('base64url');
  return `eyJhbGciOiJIUzI1NiJ9.${payload}.fake-sig`;
};

test('returns AUTH_EXPIRED on 401 with expired JWT in auth file', () => {
  const out = classifyAuthExpired({
    calls: [{ status: 401, method: 'GET', url: '/users' }],
    authFiles: { user: { token: expiredJwt(), type: 'bearer', expires_at: new Date(Date.now() - 1000).toISOString() } },
  });
  expect(out?.class).toBe('AUTH_EXPIRED');
});

test('returns null on 401 with fresh JWT (likely REAL_BUG path)', () => {
  expect(classifyAuthExpired({
    calls: [{ status: 401, method: 'GET', url: '/users' }],
    authFiles: { user: { token: freshJwt(), type: 'bearer', expires_at: new Date(Date.now() + 1e6).toISOString() } },
  })).toBeNull();
});

test('returns AUTH_EXPIRED when no 401 but auth file already past expiry (preflight signal)', () => {
  // Only triggered when there is a 401; pre-flight is a doctor concern, not a run classifier.
  expect(classifyAuthExpired({
    calls: [{ status: 200, method: 'GET', url: '/users' }],
    authFiles: { user: { token: expiredJwt(), type: 'bearer', expires_at: new Date(Date.now() - 1000).toISOString() } },
  })).toBeNull();
});
```

- [ ] **Step 2: Run, verify fail**

Run: `cd packages/core && bun test test/classifier/auth-expired.test.ts`
Expected: import error.

- [ ] **Step 3: Implement**

```ts
// packages/core/src/classifier/auth-expired.ts
import type { Classification } from '../artifact/status';
import type { HttpCallSummary, ClassifyResult } from './rate-limited';

export interface AuthFileSummary {
  token: string;
  type: 'bearer' | 'apiKey' | 'basic' | 'cookie';
  expires_at: string;
}

export interface ClassifyAuthExpiredInput {
  calls: readonly HttpCallSummary[];
  authFiles: Record<string, AuthFileSummary>;
}

function jwtExpPast(jwt: string, now: number = Date.now()): boolean {
  const parts = jwt.split('.');
  if (parts.length !== 3) return false;
  try {
    const payload = JSON.parse(Buffer.from(parts[1]!, 'base64url').toString('utf8'));
    return typeof payload.exp === 'number' && payload.exp * 1000 < now;
  } catch {
    return false;
  }
}

export function classifyAuthExpired(input: ClassifyAuthExpiredInput): ClassifyResult | null {
  const has401 = input.calls.some((c) => c.status === 401);
  if (!has401) return null;
  const now = Date.now();
  for (const [role, entry] of Object.entries(input.authFiles)) {
    const fileExpired = new Date(entry.expires_at).getTime() < now;
    const jwtExpired = entry.type === 'bearer' && jwtExpPast(entry.token, now);
    if (fileExpired || jwtExpired) {
      return {
        class: 'AUTH_EXPIRED',
        rationale: `HTTP 401 captured; auth file for role '${role}' is past expiry. Run: bun run xera:auth-setup --role ${role}`,
      };
    }
  }
  return null;
}
```

- [ ] **Step 4: Run, verify pass**

Run: `cd packages/core && bun test test/classifier/auth-expired.test.ts`
Expected: 3 green.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/classifier/auth-expired.ts packages/core/test/classifier/auth-expired.test.ts
git commit -m "core: classifier rule for AUTH_EXPIRED"
```

---

### Task 2.4: Implement `CONTRACT_DRIFT` rule (deterministic OpenAPI match)

**Files:**
- Create: `packages/core/src/classifier/contract-drift.ts`
- Test: `packages/core/test/classifier/contract-drift.test.ts`

This rule consumes a pre-loaded OpenAPI document (dereferenced — see plan 02 for the loader) and a captured call. To keep core decoupled from `@apidevtools/json-schema-ref-parser`, the rule receives the already-dereferenced spec object. The http adapter is responsible for loading + dereferencing.

- [ ] **Step 1: Write failing test**

```ts
// packages/core/test/classifier/contract-drift.test.ts
import { test, expect } from 'bun:test';
import { classifyContractDrift } from '../../src/classifier/contract-drift';

const spec = {
  paths: {
    '/users': {
      post: {
        responses: {
          '422': {
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['errors'],
                  properties: { errors: { type: 'array' } },
                },
              },
            },
          },
        },
      },
    },
  },
};

test('returns CONTRACT_DRIFT when response field renamed', () => {
  const out = classifyContractDrift({
    calls: [{
      method: 'POST', url: '/users', status: 422,
      respBody: { validation_errors: ['x'] }, // missing required `errors`
    }],
    openapi: spec,
  });
  expect(out?.class).toBe('CONTRACT_DRIFT');
});

test('returns CONTRACT_DRIFT when status not enumerated', () => {
  const out = classifyContractDrift({
    calls: [{ method: 'POST', url: '/users', status: 418, respBody: {} }],
    openapi: spec,
  });
  expect(out?.class).toBe('CONTRACT_DRIFT');
});

test('returns CONTRACT_DRIFT when operation not in spec', () => {
  const out = classifyContractDrift({
    calls: [{ method: 'POST', url: '/orders', status: 201, respBody: {} }],
    openapi: spec,
  });
  expect(out?.class).toBe('CONTRACT_DRIFT');
});

test('returns null when no openapi configured', () => {
  expect(classifyContractDrift({ calls: [{ method: 'POST', url: '/users', status: 422, respBody: { errors: [] } }], openapi: null })).toBeNull();
});

test('returns null when response matches schema', () => {
  expect(classifyContractDrift({ calls: [{ method: 'POST', url: '/users', status: 422, respBody: { errors: ['x'] } }], openapi: spec })).toBeNull();
});
```

- [ ] **Step 2: Run, verify fail**

Run: `cd packages/core && bun test test/classifier/contract-drift.test.ts`
Expected: import error.

- [ ] **Step 3: Implement**

```ts
// packages/core/src/classifier/contract-drift.ts
import type { ClassifyResult } from './rate-limited';

export interface OpenAPISchema {
  type?: string;
  properties?: Record<string, OpenAPISchema>;
  required?: readonly string[];
  items?: OpenAPISchema;
}

export interface OpenAPIDocument {
  paths: Record<string, Partial<Record<'get' | 'post' | 'put' | 'patch' | 'delete', {
    responses?: Record<string, { content?: Record<string, { schema?: OpenAPISchema }> }>;
    requestBody?: { content?: Record<string, { schema?: OpenAPISchema }> };
  }>>>;
}

export interface ContractDriftCall {
  method: string;
  url: string;
  status: number;
  respBody: unknown;
}

export interface ClassifyContractDriftInput {
  calls: readonly ContractDriftCall[];
  openapi: OpenAPIDocument | null;
}

function matchPath(specPaths: string[], actualUrl: string): string | null {
  const pathOnly = actualUrl.split('?')[0]!;
  for (const tmpl of specPaths) {
    const re = new RegExp('^' + tmpl.replace(/\{[^}]+\}/g, '[^/]+') + '$');
    if (re.test(pathOnly)) return tmpl;
  }
  return null;
}

function matchesSchema(body: unknown, schema: OpenAPISchema | undefined): boolean {
  if (!schema) return true;
  if (schema.type === 'object') {
    if (typeof body !== 'object' || body === null || Array.isArray(body)) return false;
    const obj = body as Record<string, unknown>;
    for (const req of schema.required ?? []) {
      if (!(req in obj)) return false;
    }
    return true;
  }
  if (schema.type === 'array') {
    return Array.isArray(body);
  }
  if (schema.type === 'string') return typeof body === 'string';
  if (schema.type === 'integer' || schema.type === 'number') return typeof body === 'number';
  if (schema.type === 'boolean') return typeof body === 'boolean';
  return true;
}

export function classifyContractDrift(input: ClassifyContractDriftInput): ClassifyResult | null {
  if (input.openapi === null) return null;
  const specPaths = Object.keys(input.openapi.paths);
  for (const call of input.calls) {
    const tmpl = matchPath(specPaths, call.url);
    if (!tmpl) {
      return { class: 'CONTRACT_DRIFT', rationale: `Endpoint ${call.method} ${call.url} not found in OpenAPI` };
    }
    const op = input.openapi.paths[tmpl]?.[call.method.toLowerCase() as 'get'];
    if (!op) {
      return { class: 'CONTRACT_DRIFT', rationale: `${call.method} not defined for ${tmpl} in OpenAPI` };
    }
    const respDef = op.responses?.[String(call.status)];
    if (!respDef) {
      return {
        class: 'CONTRACT_DRIFT',
        rationale: `Status ${call.status} not enumerated for ${call.method} ${tmpl} in OpenAPI`,
      };
    }
    const schema = respDef.content?.['application/json']?.schema;
    if (!matchesSchema(call.respBody, schema)) {
      return {
        class: 'CONTRACT_DRIFT',
        rationale: `Response body for ${call.method} ${tmpl} (${call.status}) does not match OpenAPI schema`,
      };
    }
  }
  return null;
}
```

- [ ] **Step 4: Run, verify pass**

Run: `cd packages/core && bun test test/classifier/contract-drift.test.ts`
Expected: 5 green.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/classifier/contract-drift.ts packages/core/test/classifier/contract-drift.test.ts
git commit -m "core: classifier rule for CONTRACT_DRIFT"
```

---

### Task 2.5: Wire new rules into `classify()` dispatcher

**Files:**
- Modify: `packages/core/src/classifier/index.ts`
- Test: `packages/core/test/classifier/index.test.ts` (extend or create integration test)

- [ ] **Step 1: Read existing classify() to find rule order**

Run: `cat packages/core/src/classifier/index.ts`. Identify where existing rules (REAL_BUG, TEST_BUG, SELECTOR_DRIFT, FLAKY, TEST_OUTDATED) are applied.

- [ ] **Step 2: Write integration test**

```ts
// packages/core/test/classifier/index.test.ts (add)
import { test, expect } from 'bun:test';
import { classify } from '../../src/classifier';

test('classify prefers RATE_LIMITED over REAL_BUG when 429 present', () => {
  const result = classify({
    adapter: 'http',
    run: { outcome: 'FAIL', scenarios: [{ outcome: 'FAIL', failure: { errorMessage: 'expected 200, got 429' } }] },
    history: [],
    storyHashChanged: false,
    specHashChanged: false,
    httpCalls: [{ method: 'GET', url: '/x', status: 429 }],
    authFiles: {},
    openapi: null,
  });
  expect(result.class).toBe('RATE_LIMITED');
});

test('classify falls through to existing rules when http signals absent', () => {
  const result = classify({
    adapter: 'web',
    run: { outcome: 'PASS', scenarios: [{ outcome: 'PASS' }] },
    history: [],
    storyHashChanged: false,
    specHashChanged: false,
  });
  expect(result.class).toBe('PASS');
});
```

- [ ] **Step 3: Run, verify fail**

Run: `cd packages/core && bun test test/classifier/index.test.ts`
Expected: fail (classify doesn't yet accept http signals or apply new rules).

- [ ] **Step 4: Extend `classify()` input type and dispatch**

In `packages/core/src/classifier/index.ts`, extend the input to optionally carry http-specific signals and apply the rules in order **before** existing FAIL-paths:

```ts
import { classifyRateLimited, type HttpCallSummary } from './rate-limited';
import { classifyAuthExpired, type AuthFileSummary } from './auth-expired';
import { classifyContractDrift, type OpenAPIDocument } from './contract-drift';

export interface ClassifyInput {
  // existing fields...
  httpCalls?: readonly HttpCallSummary[];
  authFiles?: Record<string, AuthFileSummary>;
  openapi?: OpenAPIDocument | null;
}

export function classify(input: ClassifyInput): { class: Classification; rationale: string } {
  // PASS short-circuit (existing)
  if (input.run.outcome === 'PASS') return { class: 'PASS', rationale: '...' };

  // v0.7: apply new rules in priority order
  const calls = input.httpCalls ?? [];
  if (calls.length > 0) {
    const rate = classifyRateLimited({ calls });
    if (rate) return rate;

    const auth = classifyAuthExpired({ calls, authFiles: input.authFiles ?? {} });
    if (auth) return auth;

    if (input.openapi) {
      // CONTRACT_DRIFT consumes calls with response body — only http adapter populates this
      const drift = classifyContractDrift({
        calls: calls as unknown as { method: string; url: string; status: number; respBody: unknown }[],
        openapi: input.openapi,
      });
      if (drift) return drift;
    }
  }

  // existing rules fall through here unchanged
  // ...
}
```

(Note: the actual existing function body remains; we ONLY add the new-rules block between PASS short-circuit and the existing rules.)

- [ ] **Step 5: Run, verify pass**

Run: `cd packages/core && bun test test/classifier/`
Expected: all green.

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/classifier/index.ts packages/core/test/classifier/index.test.ts
git commit -m "core: classify() dispatches v0.7 rules first"
```

---

### Task 2.6: Update Jira post template to render new buckets

**Files:**
- Modify: `packages/core/src/reporter/jira-comment.ts`
- Test: `packages/core/test/reporter/jira-comment.test.ts`

- [ ] **Step 1: Add failing test**

```ts
test('jira-comment renders CONTRACT_DRIFT bucket with rationale', () => {
  const md = buildJiraComment({
    runId: 'PROJ-1-x', outcome: 'FAIL', adapter: 'http',
    scenarios: [{ name: 'reject email', outcome: 'FAIL' }],
    classification: { class: 'CONTRACT_DRIFT', rationale: 'Response field renamed' },
  });
  expect(md).toContain('Classification: CONTRACT_DRIFT');
  expect(md).toContain('Response field renamed');
});

test('jira-comment renders RATE_LIMITED with hint to back off', () => {
  const md = buildJiraComment({
    runId: 'x', outcome: 'FAIL', adapter: 'http',
    scenarios: [],
    classification: { class: 'RATE_LIMITED', rationale: 'HTTP 429 on POST /orders' },
  });
  expect(md).toContain('RATE_LIMITED');
});

test('jira-comment renders AUTH_EXPIRED with re-auth command', () => {
  const md = buildJiraComment({
    runId: 'x', outcome: 'FAIL', adapter: 'http',
    scenarios: [],
    classification: { class: 'AUTH_EXPIRED', rationale: 'auth file for role \'user\' is past expiry. Run: bun run xera:auth-setup --role user' },
  });
  expect(md).toContain('xera:auth-setup --role user');
});
```

- [ ] **Step 2: Run, verify fail**

Run: `cd packages/core && bun test test/reporter/jira-comment.test.ts`
Expected: rationale text missing or template doesn't handle new enum values.

- [ ] **Step 3: Update `buildJiraComment` to include rationale for new buckets**

Inspect existing implementation. The template should already print `Classification: <class>` and `<rationale>` for any classification — the test failing means we may have a switch that drops unknown values. Add cases for the 3 new buckets in any explicit switch.

- [ ] **Step 4: Run, verify pass**

Run: `cd packages/core && bun test test/reporter/`
Expected: green.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/reporter/ packages/core/test/reporter/
git commit -m "core: jira-comment renders v0.7 buckets"
```

---

### Task 2.7: Phase milestone — full core suite green

- [ ] **Step 1: Run full core tests**

Run: `cd packages/core && bun test`
Expected: all green.

- [ ] **Step 2: Run workspace typecheck**

Run: `bun run typecheck`
Expected: green.

- [ ] **Step 3: Run lint**

Run: `bun run lint`
Expected: green (or auto-fix with `bun run lint:fix`).

- [ ] **Step 4: Tag commit for milestone**

```bash
git commit --allow-empty -m "chore: v0.7 plan 01 foundation complete"
```

---

## Done with Plan 01

Proceed to [02-http-package.md](2026-05-16-xera-v07-02-http-package.md).
