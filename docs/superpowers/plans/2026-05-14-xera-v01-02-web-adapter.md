# xera v0.1 — Plan 02: Web Adapter

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build `@xera-ai/web` — the Playwright adapter: executor wrapper that handles auth-state refresh, the trace normalizer with secret scrubber, and the generator helpers (Gherkin validate, typecheck, lint, POM scan, promote).

**Architecture:** Adapter implements the `TestAdapter` interface from `@xera-ai/core`. The executor invokes `playwright test` as a subprocess with a generated config that pre-injects `storageState`. The trace normalizer unzips `trace.zip`, parses Playwright trace events, runs the deterministic secret scrubber, and emits `normalized.json`. Generator helpers are stateless utilities consumed by skills.

**Tech Stack:** `@playwright/test`, `@cucumber/gherkin`, `@cucumber/messages`, `node:zlib`, `node:stream`.

**Prereqs:** Plan 01 complete (`@xera-ai/core` exports available).

---

> **Status:** ✅ Completed 2026-05-14. All tasks in this plan are implemented and shipped. See [POSTMORTEM.md](POSTMORTEM.md) for bugs that surfaced in the plan code itself and post-launch patches.


## Phase 4 — Web executor & auth setup

### Task 4.1: Playwright args + config builder

**Files:**
- Create: `packages/web/src/executor/playwright-args.ts`
- Create: `packages/web/test/executor/playwright-args.test.ts`

- [x] **Step 1: Failing test**

```ts
import { describe, expect, test } from 'vitest';
import { buildPlaywrightArgs } from '../../src/executor/playwright-args';

describe('buildPlaywrightArgs', () => {
  test('includes spec path, reporter, output dir, trace on', () => {
    const args = buildPlaywrightArgs({
      specPath: '/r/.xera/JIRA-1/spec.ts',
      outputDir: '/r/.xera/JIRA-1/runs/2026-05-14T10-30',
      configPath: '/r/.xera/JIRA-1/playwright.config.ts',
    });
    expect(args).toContain('test');
    expect(args).toContain('/r/.xera/JIRA-1/spec.ts');
    expect(args).toContain('--reporter=json');
    expect(args).toContain('--output=/r/.xera/JIRA-1/runs/2026-05-14T10-30');
    expect(args).toContain('--trace=on');
    expect(args).toContain('--config=/r/.xera/JIRA-1/playwright.config.ts');
  });
});
```

- [x] **Step 2: Run failing + implement**

```ts
export interface PlaywrightArgsInput {
  specPath: string;
  outputDir: string;
  configPath: string;
}

export function buildPlaywrightArgs(input: PlaywrightArgsInput): string[] {
  return [
    'test',
    input.specPath,
    `--config=${input.configPath}`,
    '--reporter=json',
    `--output=${input.outputDir}`,
    '--trace=on',
  ];
}
```

- [x] **Step 3: Tests pass + commit**

```bash
cd packages/web && npx vitest run
git add packages/web/src/executor/playwright-args.ts packages/web/test/executor/playwright-args.test.ts
git commit -m "web: build Playwright CLI args"
```

---

### Task 4.2: defineAuthSetup helper export

**Files:**
- Create: `packages/web/src/auth-setup/define.ts`

- [x] **Step 1: Write helper**

```ts
import type { Page } from '@playwright/test';

export interface AuthRoleCreds { email: string; password: string; }

export interface AuthSetupResult {
  /** Optional explicit expiry hint, ms since epoch. */
  expiresAt?: number;
}

export type AuthSetupFn = (page: Page, role: string, creds: AuthRoleCreds) => Promise<AuthSetupResult | void>;

/**
 * Helper to type-narrow the user's auth setup function. Users import this in
 * `shared/auth-setup.ts`.
 */
export function defineAuthSetup(fn: AuthSetupFn): AuthSetupFn { return fn; }
```

- [x] **Step 2: Commit**

```bash
git add packages/web/src/auth-setup/define.ts
git commit -m "web: export defineAuthSetup helper"
```

---

### Task 4.3: Auth setup runner

**Files:**
- Create: `packages/web/src/auth-setup/runner.ts`
- Create: `packages/web/test/auth-setup/runner.test.ts`

- [x] **Step 1: Failing test (mocks Playwright)**

The runner is the most subtle piece because it orchestrates: load setup script → run headless browser → capture storageState → encrypt + persist. For the unit test we mock the setup function and a fake "browser context" that returns deterministic state.

```ts
import { describe, expect, test } from 'vitest';
import { mkdtempSync, rmSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { generateKey } from '@xera-ai/core';
import { AUTH_KEY_ENV } from '@xera-ai/core';
import { runAuthSetup } from '../../src/auth-setup/runner';

describe('runAuthSetup', () => {
  test('writes encrypted state with role payload', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'xera-arun-'));
    process.env[AUTH_KEY_ENV] = generateKey();

    // Stub script that just returns expiry hint
    const scriptPath = join(dir, 'auth-setup.ts');
    writeFileSync(scriptPath, `
      import { defineAuthSetup } from '${process.cwd()}/packages/web/src/auth-setup/define.ts';
      export default defineAuthSetup(async (_page, _role, _creds) => ({ expiresAt: 1900000000000 }));
    `);

    // Provide a fake browser/context factory the runner accepts via DI.
    const fakeBrowser = {
      newContext: async () => ({
        newPage: async () => ({} as any),
        storageState: async () => ({ cookies: [{ name: 's', value: 'secret', domain: 'x', path: '/', expires: -1, httpOnly: false, secure: false, sameSite: 'Lax' as const }], origins: [] }),
        close: async () => {},
      }),
      close: async () => {},
    };

    await runAuthSetup({
      role: 'admin',
      creds: { email: 'a@b.com', password: 'p' },
      setupScriptPath: scriptPath,
      authDir: join(dir, '.auth'),
      browser: fakeBrowser as any,
      now: new Date('2026-05-14T10:00:00Z'),
    });

    const onDisk = readFileSync(join(dir, '.auth', 'admin.json'), 'utf8');
    expect(onDisk).not.toContain('secret');

    delete process.env[AUTH_KEY_ENV];
    rmSync(dir, { recursive: true });
  });
});
```

- [x] **Step 2: Run failing + implement**

```ts
import type { Browser } from '@playwright/test';
import { pathToFileURL } from 'node:url';
import { writeAuthState } from '@xera-ai/core';
import type { AuthRoleCreds } from './define';

export interface RunAuthSetupInput {
  role: string;
  creds: AuthRoleCreds;
  setupScriptPath: string;
  authDir: string;
  browser: Browser;
  now?: Date;
}

export async function runAuthSetup(input: RunAuthSetupInput): Promise<void> {
  const mod = await import(pathToFileURL(input.setupScriptPath).href);
  const fn = mod.default;
  if (typeof fn !== 'function') {
    throw new Error(`Auth setup script at ${input.setupScriptPath} must default-export a function (see defineAuthSetup).`);
  }
  const context = await input.browser.newContext();
  try {
    const page = await context.newPage();
    const result = (await fn(page, input.role, input.creds)) ?? {};
    const storageState = await context.storageState();
    const now = input.now ?? new Date();
    const expiresAtMs = result.expiresAt ?? now.getTime() + 8 * 3600 * 1000;
    writeAuthState(input.authDir, {
      role: input.role,
      strategy: 'storageState',
      created_at: now.toISOString(),
      expires_at: new Date(expiresAtMs).toISOString(),
      payload: storageState as unknown as Record<string, unknown>,
    });
  } finally {
    await context.close();
  }
}
```

- [x] **Step 3: Tests pass + commit**

```bash
cd packages/web && npx vitest run
git add packages/web/src/auth-setup packages/web/test/auth-setup
git commit -m "web: auth-setup runner persists encrypted storageState"
```

---

### Task 4.4: Pre-exec auth refresh + playwright-state staging

**Files:**
- Create: `packages/web/src/auth-setup/playwright-state.ts`
- Create: `packages/web/test/auth-setup/playwright-state.test.ts`

The Playwright config receives a path to a storageState JSON file. We can't hand it our encrypted blob, so before exec we stage decrypted state to a temp file (gitignored auto since it's in `.xera/.auth/.cache/<role>.json` which is also gitignored).

- [x] **Step 1: Failing test**

```ts
import { describe, expect, test } from 'vitest';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { generateKey, AUTH_KEY_ENV, writeAuthState } from '@xera-ai/core';
import { stagePlaywrightState } from '../../src/auth-setup/playwright-state';

describe('stagePlaywrightState', () => {
  test('decrypts auth-state and writes plaintext to .cache/<role>.json', () => {
    const dir = mkdtempSync(join(tmpdir(), 'xera-stage-'));
    const authDir = join(dir, '.auth');
    process.env[AUTH_KEY_ENV] = generateKey();
    writeAuthState(authDir, {
      role: 'admin',
      strategy: 'storageState',
      created_at: '2026-05-14T10:00:00.000Z',
      expires_at: '2026-05-14T18:00:00.000Z',
      payload: { cookies: [], origins: [] },
    });

    const stagedPath = stagePlaywrightState(authDir, 'admin');
    expect(stagedPath).toBe(join(authDir, '.cache', 'admin.json'));
    const txt = readFileSync(stagedPath, 'utf8');
    expect(JSON.parse(txt)).toEqual({ cookies: [], origins: [] });

    delete process.env[AUTH_KEY_ENV];
    rmSync(dir, { recursive: true });
  });
});
```

- [x] **Step 2: Run failing + implement**

```ts
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { readAuthState } from '@xera-ai/core';

export function stagePlaywrightState(authDir: string, role: string): string {
  const entry = readAuthState(authDir, role);
  if (!entry) throw new Error(`No auth state for role "${role}" in ${authDir}`);
  const cacheDir = join(authDir, '.cache');
  mkdirSync(cacheDir, { recursive: true });
  const stagedPath = join(cacheDir, `${role}.json`);
  writeFileSync(stagedPath, JSON.stringify(entry.payload));
  return stagedPath;
}
```

- [x] **Step 3: Tests pass + commit**

```bash
cd packages/web && npx vitest run
git add packages/web/src/auth-setup/playwright-state.ts packages/web/test/auth-setup/playwright-state.test.ts
git commit -m "web: stage decrypted Playwright storageState to .cache"
```

---

### Task 4.5: Executor entry — runPlaywright

**Files:**
- Create: `packages/web/src/executor/index.ts`
- Create: `packages/web/test/executor/runner.test.ts`

- [x] **Step 1: Failing test using a mocked spawn**

```ts
import { describe, expect, test } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runPlaywright } from '../../src/executor';

describe('runPlaywright', () => {
  test('returns PASS when subprocess exits 0', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'xera-exec-'));
    const fakeReport = { suites: [], stats: { unexpected: 0 } };
    writeFileSync(join(dir, 'report.json'), JSON.stringify(fakeReport));

    const result = await runPlaywright({
      specPath: '/tmp/spec.ts',
      configPath: '/tmp/playwright.config.ts',
      outputDir: dir,
      // DI hook: simulate subprocess
      spawn: async () => ({ exitCode: 0 }),
    });
    expect(result.outcome).toBe('PASS');
    expect(result.rawReportPath).toBe(join(dir, 'report.json'));
    rmSync(dir, { recursive: true });
  });

  test('returns FAIL when subprocess exits non-zero', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'xera-exec-'));
    writeFileSync(join(dir, 'report.json'), JSON.stringify({ suites: [], stats: { unexpected: 1 } }));
    const result = await runPlaywright({
      specPath: '/tmp/spec.ts',
      configPath: '/tmp/playwright.config.ts',
      outputDir: dir,
      spawn: async () => ({ exitCode: 1 }),
    });
    expect(result.outcome).toBe('FAIL');
    rmSync(dir, { recursive: true });
  });
});
```

- [x] **Step 2: Run failing + implement**

```ts
import { join } from 'node:path';
import { buildPlaywrightArgs } from './playwright-args';

export interface SpawnResult { exitCode: number; }
export type SpawnFn = (cmd: string, args: string[], env: NodeJS.ProcessEnv) => Promise<SpawnResult>;

export interface RunPlaywrightInput {
  specPath: string;
  configPath: string;
  outputDir: string;
  env?: NodeJS.ProcessEnv;
  spawn?: SpawnFn;
}

export interface RunPlaywrightResult {
  outcome: 'PASS' | 'FAIL';
  rawReportPath: string;
  exitCode: number;
}

const defaultSpawn: SpawnFn = (cmd, args, env) =>
  new Promise((resolve) => {
    const child = spawn(cmd, args, { env, stdio: 'inherit' });
    child.on('error', () => resolve({ exitCode: 1 }));
    child.on('close', (code) => resolve({ exitCode: code ?? 1 }));
  });

export async function runPlaywright(input: RunPlaywrightInput): Promise<RunPlaywrightResult> {
  const args = buildPlaywrightArgs({
    specPath: input.specPath,
    configPath: input.configPath,
    outputDir: input.outputDir,
  });
  const spawn = input.spawn ?? defaultSpawn;
  const { exitCode } = await spawn('npx', ['playwright', ...args], { ...process.env, ...input.env });
  return {
    outcome: exitCode === 0 ? 'PASS' : 'FAIL',
    rawReportPath: join(input.outputDir, 'report.json'),
    exitCode,
  };
}
```

- [x] **Step 3: Tests pass + commit**

```bash
cd packages/web && npx vitest run
git add packages/web/src/executor/index.ts packages/web/test/executor/runner.test.ts
git commit -m "web: runPlaywright subprocess wrapper"
```

---

## Phase 5 — Trace normalizer & secret scrubber (security-critical)

### Task 5.1: Scrub rules catalog

**Files:**
- Create: `packages/web/src/trace-normalizer/scrub-rules.ts`
- Create: `packages/web/test/trace-normalizer/scrub-rules.test.ts`

The scrub rules are deterministic regexes. We test every rule individually with both positive and adversarial cases.

- [x] **Step 1: Failing tests (positive + adversarial)**

```ts
import { describe, expect, test } from 'vitest';
import {
  SENSITIVE_HEADERS,
  SENSITIVE_BODY_KEYS,
  JWT_RE,
  CREDIT_CARD_RE,
  scrubHeaders,
  scrubBodyJson,
  scrubFreeText,
} from '../../src/trace-normalizer/scrub-rules';

describe('SENSITIVE_HEADERS', () => {
  test('includes lowercase Authorization, Cookie, etc.', () => {
    expect(SENSITIVE_HEADERS).toContain('authorization');
    expect(SENSITIVE_HEADERS).toContain('cookie');
    expect(SENSITIVE_HEADERS).toContain('set-cookie');
    expect(SENSITIVE_HEADERS).toContain('x-api-key');
    expect(SENSITIVE_HEADERS).toContain('x-auth-token');
  });
});

describe('scrubHeaders', () => {
  test('replaces sensitive header values with [REDACTED]', () => {
    const r = scrubHeaders({ Authorization: 'Bearer abc', 'content-type': 'application/json' });
    expect(r.Authorization).toBe('[REDACTED]');
    expect(r['content-type']).toBe('application/json');
  });
  test('case-insensitive', () => {
    const r = scrubHeaders({ AUTHORIZATION: 'x', cookie: 'y' });
    expect(r.AUTHORIZATION).toBe('[REDACTED]');
    expect(r.cookie).toBe('[REDACTED]');
  });
});

describe('scrubBodyJson', () => {
  test('masks password/token/secret/apiKey fields', () => {
    const r = scrubBodyJson({ email: 'a@b.com', password: 'p', token: 't', other: 'ok' });
    expect(r.password).toBe('[REDACTED]');
    expect(r.token).toBe('[REDACTED]');
    expect(r.email).toBe('a@b.com');
    expect(r.other).toBe('ok');
  });
  test('case-insensitive nested fields', () => {
    const r = scrubBodyJson({ outer: { ApiKey: 'k', NESTED: { secret: 's' } } }) as Record<string, any>;
    expect(r.outer.ApiKey).toBe('[REDACTED]');
    expect(r.outer.NESTED.secret).toBe('[REDACTED]');
  });
  test('handles arrays', () => {
    const r = scrubBodyJson([{ password: 'p' }, { ok: 1 }]) as Array<Record<string, unknown>>;
    expect(r[0]!.password).toBe('[REDACTED]');
  });
});

describe('JWT and credit-card regex', () => {
  test('JWT_RE matches three-part token', () => {
    expect(JWT_RE.test('eyJhbGciOi.eyJzdWIiOi.SflKxw')).toBe(true);
    expect(JWT_RE.test('eyJhbGciOi')).toBe(false);
  });
  test('CREDIT_CARD_RE matches 16-digit groups with optional spaces/dashes', () => {
    expect(CREDIT_CARD_RE.test('4111 1111 1111 1111')).toBe(true);
    expect(CREDIT_CARD_RE.test('4111-1111-1111-1111')).toBe(true);
    expect(CREDIT_CARD_RE.test('4111111111111111')).toBe(true);
    expect(CREDIT_CARD_RE.test('1234')).toBe(false);
  });
});

describe('scrubFreeText', () => {
  test('replaces JWT in free text', () => {
    expect(scrubFreeText('token=eyJhbGciOi.eyJzdWIiOi.SflKxw end')).not.toContain('SflKxw');
  });
  test('replaces credit card in free text', () => {
    expect(scrubFreeText('card 4111 1111 1111 1111 charged')).not.toContain('4111 1111 1111 1111');
  });
});
```

- [x] **Step 2: Run failing**

```bash
cd packages/web && npx vitest run test/trace-normalizer/scrub-rules.test.ts
```

- [x] **Step 3: Implement**

```ts
export const SENSITIVE_HEADERS: readonly string[] = [
  'authorization',
  'cookie',
  'set-cookie',
  'x-api-key',
  'x-auth-token',
  'x-csrf-token',
  'proxy-authorization',
];

export const SENSITIVE_BODY_KEYS: readonly RegExp[] = [
  /password/i,
  /passwd/i,
  /token/i,
  /secret/i,
  /api[-_]?key/i,
  /access[-_]?key/i,
  /private[-_]?key/i,
  /authorization/i,
  /credit[-_]?card/i,
  /card[-_]?number/i,
  /cvv/i,
];

export const JWT_RE = /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{5,}\b/g;
export const CREDIT_CARD_RE = /\b(?:\d{4}[-\s]?){3}\d{4}\b/g;

const REDACTED = '[REDACTED]';

export function scrubHeaders(headers: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(headers)) {
    out[k] = SENSITIVE_HEADERS.includes(k.toLowerCase()) ? REDACTED : v;
  }
  return out;
}

export function scrubBodyJson(body: unknown): unknown {
  if (Array.isArray(body)) return body.map(scrubBodyJson);
  if (body && typeof body === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(body)) {
      if (SENSITIVE_BODY_KEYS.some(re => re.test(k))) {
        out[k] = REDACTED;
      } else {
        out[k] = scrubBodyJson(v);
      }
    }
    return out;
  }
  if (typeof body === 'string') return scrubFreeText(body);
  return body;
}

export function scrubFreeText(s: string): string {
  return s.replace(JWT_RE, REDACTED).replace(CREDIT_CARD_RE, REDACTED);
}
```

- [x] **Step 4: Tests pass + commit**

```bash
cd packages/web && npx vitest run
git add packages/web/src/trace-normalizer/scrub-rules.ts packages/web/test/trace-normalizer/scrub-rules.test.ts
git commit -m "web: scrub-rules catalog with regex tests"
```

---

### Task 5.2: scrub() composite function

**Files:**
- Create: `packages/web/src/trace-normalizer/scrub.ts`
- Create: `packages/web/test/trace-normalizer/scrub.test.ts`

- [x] **Step 1: Failing test**

```ts
import { describe, expect, test } from 'vitest';
import { scrub, type NormalizedNetworkEntry, type NormalizedRun } from '../../src/trace-normalizer/scrub';

describe('scrub(normalizedRun)', () => {
  test('counts scrubbed fields', () => {
    const run: NormalizedRun = {
      runId: 'r',
      outcome: 'FAIL',
      scenarios: [{
        name: 's',
        outcome: 'FAIL',
        failure: {
          errorMessage: 'token eyJhbGciOi.eyJzdWIiOi.SflKxw bad',
          networkAtFailure: [
            { method: 'POST', url: '/api/login?token=eyJhbGciOi.eyJzdWIiOi.SflKxw', status: 500,
              requestHeaders: { Authorization: 'Bearer x', 'content-type': 'application/json' },
              requestBody: { email: 'a@b.com', password: 'p' },
              responseHeaders: { 'set-cookie': 's=1' },
            } as NormalizedNetworkEntry,
          ],
          consoleAtFailure: ['user 4111 1111 1111 1111'],
        },
      }],
      scrubbed_fields_count: 0,
    };
    const scrubbed = scrub(run);
    expect(scrubbed.scrubbed_fields_count).toBeGreaterThan(0);
    const net = scrubbed.scenarios[0]!.failure!.networkAtFailure![0]!;
    expect(net.requestHeaders!.Authorization).toBe('[REDACTED]');
    expect((net.requestBody as Record<string, unknown>).password).toBe('[REDACTED]');
    expect(scrubbed.scenarios[0]!.failure!.errorMessage).not.toContain('SflKxw');
    expect(scrubbed.scenarios[0]!.failure!.consoleAtFailure![0]).not.toContain('4111');
  });
});
```

- [x] **Step 2: Run failing + implement**

```ts
import { scrubHeaders, scrubBodyJson, scrubFreeText } from './scrub-rules';

export interface NormalizedNetworkEntry {
  method: string;
  url: string;
  status: number;
  requestHeaders?: Record<string, string>;
  requestBody?: unknown;
  responseHeaders?: Record<string, string>;
  responseBody?: unknown;
}

export interface NormalizedScenario {
  name: string;
  outcome: 'PASS' | 'FAIL' | 'SKIPPED';
  failure?: {
    step?: string;
    errorMessage?: string;
    domSnapshotAtFailure?: string;
    networkAtFailure?: NormalizedNetworkEntry[];
    consoleAtFailure?: string[];
    screenshotPath?: string;
  };
}

export interface NormalizedRun {
  runId: string;
  outcome: 'PASS' | 'FAIL';
  scenarios: NormalizedScenario[];
  scrubbed_fields_count: number;
}

function countScrubbed(before: unknown, after: unknown): number {
  if (typeof before === 'string' && typeof after === 'string') return before !== after ? 1 : 0;
  if (Array.isArray(before) && Array.isArray(after)) {
    return before.reduce((acc, b, i) => acc + countScrubbed(b, after[i]), 0);
  }
  if (before && after && typeof before === 'object' && typeof after === 'object') {
    let n = 0;
    for (const k of Object.keys(before as Record<string, unknown>)) {
      n += countScrubbed((before as Record<string, unknown>)[k], (after as Record<string, unknown>)[k]);
    }
    return n;
  }
  return 0;
}

export function scrub(run: NormalizedRun): NormalizedRun {
  const out: NormalizedRun = { ...run, scrubbed_fields_count: 0, scenarios: [] };
  let totalScrubs = 0;
  for (const sc of run.scenarios) {
    const newSc: NormalizedScenario = { ...sc };
    if (sc.failure) {
      const f = sc.failure;
      const newF = { ...f };
      if (f.errorMessage) {
        newF.errorMessage = scrubFreeText(f.errorMessage);
        totalScrubs += countScrubbed(f.errorMessage, newF.errorMessage);
      }
      if (f.consoleAtFailure) {
        newF.consoleAtFailure = f.consoleAtFailure.map(scrubFreeText);
        totalScrubs += f.consoleAtFailure.reduce(
          (acc, b, i) => acc + countScrubbed(b, newF.consoleAtFailure![i]),
          0,
        );
      }
      if (f.networkAtFailure) {
        newF.networkAtFailure = f.networkAtFailure.map(n => {
          const reqHeaders = n.requestHeaders ? scrubHeaders(n.requestHeaders) : undefined;
          const resHeaders = n.responseHeaders ? scrubHeaders(n.responseHeaders) : undefined;
          const reqBody = n.requestBody !== undefined ? scrubBodyJson(n.requestBody) : undefined;
          const resBody = n.responseBody !== undefined ? scrubBodyJson(n.responseBody) : undefined;
          totalScrubs += countScrubbed(n.requestHeaders ?? {}, reqHeaders ?? {});
          totalScrubs += countScrubbed(n.responseHeaders ?? {}, resHeaders ?? {});
          totalScrubs += countScrubbed(n.requestBody ?? {}, reqBody ?? {});
          totalScrubs += countScrubbed(n.responseBody ?? {}, resBody ?? {});
          return { ...n, requestHeaders: reqHeaders, responseHeaders: resHeaders, requestBody: reqBody, responseBody: resBody };
        });
      }
      newSc.failure = newF;
    }
    out.scenarios.push(newSc);
  }
  out.scrubbed_fields_count = totalScrubs;
  return out;
}
```

- [x] **Step 3: Tests pass + commit**

```bash
cd packages/web && npx vitest run
git add packages/web/src/trace-normalizer/scrub.ts packages/web/test/trace-normalizer/scrub.test.ts
git commit -m "web: scrub() pass over normalized run with field count"
```

---

### Task 5.3: Adversarial scrubber fixtures

**Files:**
- Create: `packages/web/test/trace-normalizer/scrub-adversarial.test.ts`

Real production tokens hide in awkward places. This test suite acts as the regression guard for must-have #8.

- [x] **Step 1: Write adversarial cases**

```ts
import { describe, expect, test } from 'vitest';
import { scrub, type NormalizedRun } from '../../src/trace-normalizer/scrub';

function runWithError(msg: string): NormalizedRun {
  return {
    runId: 'r', outcome: 'FAIL',
    scenarios: [{ name: 's', outcome: 'FAIL', failure: { errorMessage: msg } }],
    scrubbed_fields_count: 0,
  };
}

describe('scrub adversarial', () => {
  test('JWT with unicode-like noise around it', () => {
    const r = scrub(runWithError('—«eyJhbGciOi.eyJzdWIiOi.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c»—'));
    expect(r.scenarios[0]!.failure!.errorMessage).not.toContain('SflKxw');
    expect(r.scrubbed_fields_count).toBeGreaterThan(0);
  });

  test('multiple JWTs in one string', () => {
    const r = scrub(runWithError('a=eyJhbGciOi.eyJzdWIiOi.SflKxw and b=eyJhbGciOi.eyJzdWIiOi.ABCDEFGHI'));
    expect(r.scenarios[0]!.failure!.errorMessage).not.toMatch(/SflKxw|ABCDEFGHI/);
  });

  test('credit card with dashes', () => {
    const r = scrub(runWithError('card 5500-0000-0000-0004 used'));
    expect(r.scenarios[0]!.failure!.errorMessage).not.toContain('5500-0000-0000-0004');
  });

  test('case variants of password key', () => {
    const r = scrub({
      runId: 'r', outcome: 'FAIL',
      scenarios: [{ name: 's', outcome: 'FAIL', failure: { networkAtFailure: [{ method: 'P', url: '/x', status: 200, requestBody: { Password: 'a', PASSWORD: 'b', passWord: 'c' } }] } }],
      scrubbed_fields_count: 0,
    });
    const body = r.scenarios[0]!.failure!.networkAtFailure![0]!.requestBody as Record<string, string>;
    expect(body.Password).toBe('[REDACTED]');
    expect(body.PASSWORD).toBe('[REDACTED]');
    expect(body.passWord).toBe('[REDACTED]');
  });

  test('api_key, apiKey, api-key variants', () => {
    const r = scrub({
      runId: 'r', outcome: 'FAIL',
      scenarios: [{ name: 's', outcome: 'FAIL', failure: { networkAtFailure: [{ method: 'P', url: '/x', status: 200, requestBody: { api_key: 'a', apiKey: 'b', 'api-key': 'c' } }] } }],
      scrubbed_fields_count: 0,
    });
    const body = r.scenarios[0]!.failure!.networkAtFailure![0]!.requestBody as Record<string, string>;
    expect(body.api_key).toBe('[REDACTED]');
    expect(body.apiKey).toBe('[REDACTED]');
    expect(body['api-key']).toBe('[REDACTED]');
  });

  test('Set-Cookie response header', () => {
    const r = scrub({
      runId: 'r', outcome: 'FAIL',
      scenarios: [{ name: 's', outcome: 'FAIL', failure: { networkAtFailure: [{ method: 'P', url: '/x', status: 200, responseHeaders: { 'Set-Cookie': 'session=xyz; HttpOnly' } }] } }],
      scrubbed_fields_count: 0,
    });
    expect(r.scenarios[0]!.failure!.networkAtFailure![0]!.responseHeaders!['Set-Cookie']).toBe('[REDACTED]');
  });
});
```

- [x] **Step 2: Tests pass + commit**

```bash
cd packages/web && npx vitest run
git add packages/web/test/trace-normalizer/scrub-adversarial.test.ts
git commit -m "web: scrubber adversarial regression suite"
```

---

### Task 5.4: Playwright report parser

**Files:**
- Create: `packages/web/src/trace-normalizer/parse.ts`
- Create: `packages/web/test/trace-normalizer/parse.test.ts`
- Create: `packages/web/test/trace-normalizer/fixtures/report-pass.json`
- Create: `packages/web/test/trace-normalizer/fixtures/report-fail.json`

Playwright's JSON reporter format has a defined shape. We extract just the scenario-level data we need.

- [x] **Step 1: Create fixture report-pass.json**

```json
{
  "config": {},
  "stats": { "expected": 2, "unexpected": 0, "flaky": 0, "skipped": 0, "duration": 1234 },
  "suites": [{
    "title": "JIRA-1: login",
    "specs": [
      { "title": "Successful login", "ok": true, "tests": [{ "results": [{ "status": "passed", "duration": 500 }] }] },
      { "title": "Login fails", "ok": true, "tests": [{ "results": [{ "status": "passed", "duration": 500 }] }] }
    ]
  }]
}
```

- [x] **Step 2: Create fixture report-fail.json**

```json
{
  "config": {},
  "stats": { "expected": 1, "unexpected": 1, "flaky": 0, "skipped": 0, "duration": 1234 },
  "suites": [{
    "title": "JIRA-1: login",
    "specs": [
      { "title": "Successful login", "ok": true, "tests": [{ "results": [{ "status": "passed", "duration": 500 }] }] },
      { "title": "Login fails with invalid password", "ok": false, "tests": [{ "results": [{
          "status": "failed",
          "duration": 800,
          "error": { "message": "expect(getByText('Invalid')).toBeVisible() failed", "stack": "at spec.ts:14" },
          "attachments": [
            { "name": "screenshot", "path": "screenshots/scenario-2-failure.png", "contentType": "image/png" }
          ]
      }] }] }
    ]
  }]
}
```

- [x] **Step 3: Failing test**

```ts
import { describe, expect, test } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parsePlaywrightReport } from '../../src/trace-normalizer/parse';

describe('parsePlaywrightReport', () => {
  test('PASS report', () => {
    const json = JSON.parse(readFileSync(join(__dirname, 'fixtures/report-pass.json'), 'utf8'));
    const parsed = parsePlaywrightReport(json, 'r1');
    expect(parsed.outcome).toBe('PASS');
    expect(parsed.scenarios.map(s => s.outcome)).toEqual(['PASS', 'PASS']);
  });

  test('FAIL report extracts error + screenshot path', () => {
    const json = JSON.parse(readFileSync(join(__dirname, 'fixtures/report-fail.json'), 'utf8'));
    const parsed = parsePlaywrightReport(json, 'r1');
    expect(parsed.outcome).toBe('FAIL');
    const failing = parsed.scenarios.find(s => s.outcome === 'FAIL')!;
    expect(failing.failure?.errorMessage).toContain('Invalid');
    expect(failing.failure?.screenshotPath).toBe('screenshots/scenario-2-failure.png');
  });
});
```

- [x] **Step 4: Run failing + implement**

```ts
import type { NormalizedRun, NormalizedScenario } from './scrub';

interface PWAttachment { name: string; path?: string; contentType?: string; }
interface PWResult { status: string; duration: number; error?: { message?: string; stack?: string }; attachments?: PWAttachment[]; }
interface PWTest { results: PWResult[]; }
interface PWSpec { title: string; ok: boolean; tests: PWTest[]; }
interface PWSuite { title: string; specs?: PWSpec[]; suites?: PWSuite[]; }
interface PWReport { stats: { unexpected: number }; suites: PWSuite[]; }

function* flatSpecs(suites: PWSuite[]): Generator<PWSpec> {
  for (const s of suites) {
    for (const sp of s.specs ?? []) yield sp;
    if (s.suites) yield* flatSpecs(s.suites);
  }
}

export function parsePlaywrightReport(report: PWReport, runId: string): NormalizedRun {
  const scenarios: NormalizedScenario[] = [];
  for (const spec of flatSpecs(report.suites)) {
    const lastResult = spec.tests[0]?.results[0];
    const outcome: 'PASS' | 'FAIL' | 'SKIPPED' =
      !lastResult ? 'SKIPPED' :
      lastResult.status === 'passed' ? 'PASS' :
      lastResult.status === 'skipped' ? 'SKIPPED' : 'FAIL';
    const sc: NormalizedScenario = { name: spec.title, outcome };
    if (outcome === 'FAIL' && lastResult) {
      const screenshot = lastResult.attachments?.find(a => a.name === 'screenshot')?.path;
      sc.failure = {
        errorMessage: lastResult.error?.message,
        screenshotPath: screenshot,
      };
    }
    scenarios.push(sc);
  }
  return {
    runId,
    outcome: report.stats.unexpected === 0 ? 'PASS' : 'FAIL',
    scenarios,
    scrubbed_fields_count: 0,
  };
}
```

- [x] **Step 5: Tests pass + commit**

```bash
cd packages/web && npx vitest run
git add packages/web/src/trace-normalizer/parse.ts packages/web/test/trace-normalizer
git commit -m "web: parse Playwright JSON report into NormalizedRun"
```

---

### Task 5.5: Trace.zip unzip + network/console extraction

**Files:**
- Create: `packages/web/src/trace-normalizer/unzip.ts`
- Create: `packages/web/src/trace-normalizer/normalize.ts`
- Create: `packages/web/test/trace-normalizer/normalize.test.ts`

Playwright's trace.zip contains `trace.network` (NDJSON), `trace.trace` (NDJSON of events), and resources. For v0.1 we only enrich the FAILED scenarios with network + console events near the failure step. We unzip the trace.zip with `fflate` (read via `readFileSync`).

- [x] **Step 1: Implement unzip helper using `fflate`**

Add dependency:
```bash
cd packages/web && npm install fflate@0.8.2
```

Implementation:

```ts
import { readFileSync } from 'node:fs';
import { unzipSync } from 'fflate';

export interface TraceEntries {
  /** Filename → text contents */
  files: Record<string, string>;
}

export function unzipTrace(tracePath: string): TraceEntries {
  const buf = readFileSync(tracePath);
  const entries = unzipSync(buf);
  const files: Record<string, string> = {};
  for (const [name, data] of Object.entries(entries)) {
    if (name.endsWith('/')) continue;
    if (name.endsWith('.network') || name.endsWith('.trace') || name.endsWith('.txt') || name.endsWith('.json')) {
      files[name] = new TextDecoder().decode(data);
    }
  }
  return { files };
}
```

- [x] **Step 2: Failing test for normalize**

```ts
import { describe, expect, test } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, cpSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { zipSync, strToU8 } from 'fflate';
import { writeFileSync as wfs } from 'node:fs';
import { normalizeRun } from '../../src/trace-normalizer/normalize';

function makeFakeTrace(dest: string, networkLines: object[], traceLines: object[]) {
  const zipped = zipSync({
    'test.network': strToU8(networkLines.map(o => JSON.stringify(o)).join('\n')),
    'test.trace': strToU8(traceLines.map(o => JSON.stringify(o)).join('\n')),
  });
  wfs(dest, zipped);
}

describe('normalizeRun', () => {
  test('attaches network entries from trace.zip to failed scenario', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'xera-norm-'));
    const runDir = join(dir, 'run');
    mkdirSync(runDir, { recursive: true });
    writeFileSync(join(runDir, 'report.json'), JSON.stringify({
      stats: { unexpected: 1 },
      suites: [{ title: 's', specs: [{ title: 'Login fails', ok: false, tests: [{ results: [{ status: 'failed', duration: 1, error: { message: 'err' } }] }] }] }],
    }));
    makeFakeTrace(join(runDir, 'trace.zip'),
      [{ type: 'request', method: 'POST', url: '/api/login', status: 500, requestHeaders: { Authorization: 'Bearer abc' } }],
      [{ type: 'console', text: 'fetch failed: token=eyJhbGciOi.eyJzdWIiOi.SflKxw' }],
    );

    const out = await normalizeRun({ runId: 'r1', runDir });

    const failing = out.scenarios.find(s => s.outcome === 'FAIL')!;
    expect(failing.failure?.networkAtFailure?.length).toBe(1);
    // Header should be scrubbed
    expect(failing.failure?.networkAtFailure?.[0]?.requestHeaders?.Authorization).toBe('[REDACTED]');
    // Console scrubbed
    expect(failing.failure?.consoleAtFailure?.[0]).not.toContain('SflKxw');
    expect(out.scrubbed_fields_count).toBeGreaterThan(0);

    rmSync(dir, { recursive: true });
  });
});
```

- [x] **Step 3: Run failing + implement `normalize.ts`**

```ts
import { readFileSync, existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parsePlaywrightReport } from './parse';
import { scrub, type NormalizedRun } from './scrub';
import { unzipTrace } from './unzip';

export interface NormalizeRunInput {
  runId: string;
  runDir: string;
}

interface TraceNetworkEntry {
  type: 'request';
  method: string;
  url: string;
  status: number;
  requestHeaders?: Record<string, string>;
  responseHeaders?: Record<string, string>;
  requestBody?: unknown;
  responseBody?: unknown;
}

interface TraceConsoleEntry { type: 'console'; text: string; }

export async function normalizeRun(input: NormalizeRunInput): Promise<NormalizedRun> {
  const reportPath = join(input.runDir, 'report.json');
  const report = JSON.parse(readFileSync(reportPath, 'utf8'));
  let normalized = parsePlaywrightReport(report, input.runId);

  // Enrich with trace.zip if present
  const tracePath = join(input.runDir, 'trace.zip');
  if (existsSync(tracePath)) {
    const { files } = unzipTrace(tracePath);
    const networkFile = Object.entries(files).find(([k]) => k.endsWith('.network'))?.[1];
    const traceFile = Object.entries(files).find(([k]) => k.endsWith('.trace'))?.[1];
    const network: TraceNetworkEntry[] = networkFile
      ? networkFile.trim().split('\n').filter(Boolean).map(l => JSON.parse(l)).filter((e: any) => e.type === 'request')
      : [];
    const consoleEvents: TraceConsoleEntry[] = traceFile
      ? traceFile.trim().split('\n').filter(Boolean).map(l => JSON.parse(l)).filter((e: any) => e.type === 'console')
      : [];

    // Attach to each failing scenario (all entries — v0.1 doesn't yet correlate by step time)
    for (const sc of normalized.scenarios) {
      if (sc.outcome !== 'FAIL') continue;
      sc.failure = sc.failure ?? {};
      sc.failure.networkAtFailure = network.map(n => ({
        method: n.method,
        url: n.url,
        status: n.status,
        requestHeaders: n.requestHeaders,
        responseHeaders: n.responseHeaders,
        requestBody: n.requestBody,
        responseBody: n.responseBody,
      }));
      sc.failure.consoleAtFailure = consoleEvents.map(c => c.text);
    }
  }

  normalized = scrub(normalized);
  writeFileSync(join(input.runDir, 'normalized.json'), JSON.stringify(normalized, null, 2));
  return normalized;
}
```

- [x] **Step 4: Tests pass + commit**

```bash
cd packages/web && npx vitest run
git add packages/web/src/trace-normalizer packages/web/test/trace-normalizer/normalize.test.ts
git commit -m "web: trace normalizer with network + console enrichment"
```

---

## Phase 6 — Generator helpers

### Task 6.1: Gherkin validate

**Files:**
- Create: `packages/web/src/generator/gherkin-validate.ts`
- Create: `packages/web/test/generator/gherkin-validate.test.ts`

- [x] **Step 1: Failing test**

```ts
import { describe, expect, test } from 'vitest';
import { validateGherkin } from '../../src/generator/gherkin-validate';

describe('validateGherkin', () => {
  test('accepts well-formed feature', () => {
    const r = validateGherkin(`Feature: Login\n  Scenario: ok\n    Given I am on /\n    Then I see "x"\n`);
    expect(r.ok).toBe(true);
  });
  test('rejects empty input', () => {
    const r = validateGherkin('');
    expect(r.ok).toBe(false);
  });
  test('reports parse errors with line numbers', () => {
    const r = validateGherkin(`Feature: x\n  Scenario\n    Given y\n`); // missing colon on Scenario
    expect(r.ok).toBe(false);
    expect(r.errors[0]?.line).toBeGreaterThan(0);
  });
});
```

- [x] **Step 2: Run failing + implement**

```ts
import { AstBuilder, GherkinClassicTokenMatcher, Parser } from '@cucumber/gherkin';
import { IdGenerator } from '@cucumber/messages';

export interface GherkinValidateResult {
  ok: boolean;
  errors: Array<{ line: number; message: string }>;
}

export function validateGherkin(content: string): GherkinValidateResult {
  if (!content.trim()) {
    return { ok: false, errors: [{ line: 0, message: 'Empty feature file' }] };
  }
  try {
    const parser = new Parser(new AstBuilder(IdGenerator.uuid()), new GherkinClassicTokenMatcher());
    parser.parse(content);
    return { ok: true, errors: [] };
  } catch (e: any) {
    const errors: Array<{ line: number; message: string }> = [];
    if (e?.errors && Array.isArray(e.errors)) {
      for (const inner of e.errors) {
        errors.push({ line: inner?.location?.line ?? 0, message: String(inner?.message ?? inner) });
      }
    } else {
      errors.push({ line: 0, message: String(e?.message ?? e) });
    }
    return { ok: false, errors };
  }
}
```

- [x] **Step 3: Tests pass + commit**

```bash
cd packages/web && npx vitest run
git add packages/web/src/generator/gherkin-validate.ts packages/web/test/generator/gherkin-validate.test.ts
git commit -m "web: Gherkin validator with line-aware errors"
```

---

### Task 6.2: Typecheck command

**Files:**
- Create: `packages/web/src/generator/typecheck.ts`
- Create: `packages/web/test/generator/typecheck.test.ts`

- [x] **Step 1: Failing test**

```ts
import { describe, expect, test } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { typecheckTicket } from '../../src/generator/typecheck';

describe('typecheckTicket', () => {
  test('returns ok=true for valid file', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'xera-tc-'));
    writeFileSync(join(dir, 'tsconfig.json'), JSON.stringify({ compilerOptions: { strict: true, target: 'ES2022', module: 'ESNext', moduleResolution: 'Bundler' } }));
    writeFileSync(join(dir, 'spec.ts'), `export const x: number = 1;`);
    const r = await typecheckTicket(dir);
    expect(r.ok).toBe(true);
  });

  test('returns ok=false with errors for broken file', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'xera-tc-'));
    writeFileSync(join(dir, 'tsconfig.json'), JSON.stringify({ compilerOptions: { strict: true, target: 'ES2022', module: 'ESNext', moduleResolution: 'Bundler' } }));
    writeFileSync(join(dir, 'spec.ts'), `export const x: number = 'string';`);
    const r = await typecheckTicket(dir);
    expect(r.ok).toBe(false);
    expect(r.errors[0]).toBeDefined();
    rmSync(dir, { recursive: true });
  });
});
```

- [x] **Step 2: Run failing + implement**

```ts
import { spawnSync } from 'node:child_process';

export interface TypecheckResult {
  ok: boolean;
  errors: string[];
}

export async function typecheckTicket(ticketDir: string): Promise<TypecheckResult> {
  const proc = spawnSync('npx', ['tsc', '--noEmit', '--project', ticketDir], { encoding: 'utf8' });
  if (proc.status === 0) return { ok: true, errors: [] };
  const out = (proc.stdout || '') + (proc.stderr || '');
  const errors = out.split('\n').filter(line => /error TS\d+/.test(line));
  return { ok: false, errors };
}
```

- [x] **Step 3: Tests pass + commit**

```bash
cd packages/web && npx vitest run
git add packages/web/src/generator/typecheck.ts packages/web/test/generator/typecheck.test.ts
git commit -m "web: typecheck wrapper using tsc --noEmit"
```

---

### Task 6.3: Selector rules (xera-specific lint)

**Files:**
- Create: `packages/web/src/generator/selector-rules.ts`
- Create: `packages/web/test/generator/selector-rules.test.ts`

We don't pull in a full AST tool for MVP; a simple regex visitor on `.ts` content catches the common cases. The rule warnings are LLM-actionable.

- [x] **Step 1: Failing tests**

```ts
import { describe, expect, test } from 'vitest';
import { lintSelectors } from '../../src/generator/selector-rules';

describe('lintSelectors', () => {
  test('warns on auto-class CSS selector', () => {
    const r = lintSelectors(`page.locator('.MuiButton-root-3xyz')`);
    expect(r.warnings.some(w => w.rule === 'no-auto-classname')).toBe(true);
  });
  test('warns on bare CSS selector without justification comment', () => {
    const r = lintSelectors(`page.locator('div > button.submit')`);
    expect(r.warnings.some(w => w.rule === 'prefer-role-over-css')).toBe(true);
  });
  test('accepts CSS with xera-allow-css justification', () => {
    const r = lintSelectors(`// xera-allow-css: 3rd-party widget no roles\npage.locator('div.widget')`);
    expect(r.warnings.length).toBe(0);
  });
  test('no warning for getByRole', () => {
    const r = lintSelectors(`page.getByRole('button', { name: 'Sign in' })`);
    expect(r.warnings.length).toBe(0);
  });
});
```

- [x] **Step 2: Run failing + implement**

```ts
export interface SelectorWarning {
  rule: 'no-auto-classname' | 'prefer-role-over-css' | 'no-xpath';
  line: number;
  text: string;
  message: string;
}

const AUTO_CLASS_RE = /\.(?:Mui|css|ant|chakra|MuiButton)[A-Za-z]*-[A-Za-z0-9_]*-[A-Za-z0-9_]{3,}/;
const LOCATOR_CSS_RE = /\.locator\(\s*['"`]([^'"`]+)['"`]/;
const XPATH_RE = /\.locator\(\s*['"`](xpath=|\/\/)/;
const ALLOW_CSS_RE = /xera-allow-css:/;

export function lintSelectors(source: string): { warnings: SelectorWarning[] } {
  const warnings: SelectorWarning[] = [];
  const lines = source.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const text = lines[i]!;
    const prev = lines[i - 1] ?? '';
    if (XPATH_RE.test(text)) {
      warnings.push({ rule: 'no-xpath', line: i + 1, text, message: 'XPath selectors are forbidden in v0.1.' });
      continue;
    }
    const cssMatch = LOCATOR_CSS_RE.exec(text);
    if (cssMatch) {
      const sel = cssMatch[1]!;
      if (AUTO_CLASS_RE.test(sel)) {
        warnings.push({ rule: 'no-auto-classname', line: i + 1, text, message: `Auto-generated class name "${sel}" — refactor to role/label/test-id.` });
      } else if (!ALLOW_CSS_RE.test(prev)) {
        warnings.push({ rule: 'prefer-role-over-css', line: i + 1, text, message: `Prefer getByRole/getByLabel over CSS "${sel}". If unavoidable, add "// xera-allow-css: <reason>" on the previous line.` });
      }
    }
  }
  return { warnings };
}
```

- [x] **Step 3: Tests pass + commit**

```bash
cd packages/web && npx vitest run
git add packages/web/src/generator/selector-rules.ts packages/web/test/generator/selector-rules.test.ts
git commit -m "web: selector lint rules (no auto-class, prefer-role, no-xpath)"
```

---

### Task 6.4: Lint command (biome + selector rules)

**Files:**
- Create: `packages/web/src/generator/lint.ts`
- Create: `packages/web/test/generator/lint.test.ts`

- [x] **Step 1: Failing test**

```ts
import { describe, expect, test } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { lintTicket } from '../../src/generator/lint';

describe('lintTicket', () => {
  test('returns warnings for bad selectors in spec.ts', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'xera-lint-'));
    writeFileSync(join(dir, 'spec.ts'), `page.locator('.MuiButton-root-3xyz')`);
    const r = await lintTicket(dir);
    expect(r.ok).toBe(false);
    expect(r.warnings.some(w => w.rule === 'no-auto-classname')).toBe(true);
    rmSync(dir, { recursive: true });
  });
  test('returns ok when no issues', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'xera-lint-'));
    writeFileSync(join(dir, 'spec.ts'), `page.getByRole('button')`);
    const r = await lintTicket(dir);
    expect(r.ok).toBe(true);
    rmSync(dir, { recursive: true });
  });
});
```

- [x] **Step 2: Run failing + implement**

```ts
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { lintSelectors, type SelectorWarning } from './selector-rules';

export interface LintResult {
  ok: boolean;
  warnings: Array<SelectorWarning & { file: string }>;
}

function listTsFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  for (const name of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, name.name);
    if (name.isDirectory()) out.push(...listTsFiles(full));
    else if (name.name.endsWith('.ts')) out.push(full);
  }
  return out;
}

export async function lintTicket(ticketDir: string): Promise<LintResult> {
  const files = listTsFiles(ticketDir);
  const warnings: LintResult['warnings'] = [];
  for (const f of files) {
    const src = readFileSync(f, 'utf8');
    const r = lintSelectors(src);
    for (const w of r.warnings) warnings.push({ ...w, file: f });
  }
  return { ok: warnings.length === 0, warnings };
}
```

- [x] **Step 3: Tests pass + commit**

```bash
cd packages/web && npx vitest run
git add packages/web/src/generator/lint.ts packages/web/test/generator/lint.test.ts
git commit -m "web: lintTicket walks ticket dir and runs selector rules"
```

---

### Task 6.5: POM scanner + promote

**Files:**
- Create: `packages/web/src/generator/pom-scan.ts`
- Create: `packages/web/src/generator/promote.ts`
- Create: `packages/web/test/generator/pom-scan.test.ts`
- Create: `packages/web/test/generator/promote.test.ts`

- [x] **Step 1: Failing test for pom-scan**

```ts
import { describe, expect, test } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { scanSharedPoms } from '../../src/generator/pom-scan';

describe('scanSharedPoms', () => {
  test('lists exported classes from shared/page-objects/*.ts', () => {
    const root = mkdtempSync(join(tmpdir(), 'xera-pom-'));
    mkdirSync(join(root, 'shared/page-objects'), { recursive: true });
    writeFileSync(join(root, 'shared/page-objects/LoginPage.ts'), `export class LoginPage {}\n`);
    writeFileSync(join(root, 'shared/page-objects/DashboardPage.ts'), `export class DashboardPage {}\n`);
    const found = scanSharedPoms(root);
    expect(found.map(p => p.className).sort()).toEqual(['DashboardPage', 'LoginPage']);
    expect(found[0]?.absolutePath).toMatch(/page-objects/);
    rmSync(root, { recursive: true });
  });
});
```

- [x] **Step 2: Implement pom-scan**

```ts
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const CLASS_RE = /export\s+class\s+([A-Z][A-Za-z0-9_]*)/g;

export interface SharedPom {
  className: string;
  absolutePath: string;
}

export function scanSharedPoms(repoRoot: string): SharedPom[] {
  const dir = join(repoRoot, 'shared', 'page-objects');
  if (!existsSync(dir)) return [];
  const found: SharedPom[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith('.ts')) continue;
    const path = join(dir, entry.name);
    const src = readFileSync(path, 'utf8');
    for (const m of src.matchAll(CLASS_RE)) {
      found.push({ className: m[1]!, absolutePath: path });
    }
  }
  return found;
}
```

- [x] **Step 3: Failing test for promote**

```ts
import { describe, expect, test } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promotePom } from '../../src/generator/promote';

describe('promotePom', () => {
  test('moves POM file and rewrites spec.ts import', async () => {
    const root = mkdtempSync(join(tmpdir(), 'xera-prom-'));
    const ticketDir = join(root, '.xera/JIRA-1');
    mkdirSync(join(ticketDir, 'page-objects'), { recursive: true });
    mkdirSync(join(root, 'shared/page-objects'), { recursive: true });
    writeFileSync(join(ticketDir, 'page-objects/LoginPage.ts'), `export class LoginPage {}\n`);
    writeFileSync(join(ticketDir, 'spec.ts'),
      `import { LoginPage } from './page-objects/LoginPage';\nnew LoginPage();\n`);

    await promotePom({ repoRoot: root, ticket: 'JIRA-1', className: 'LoginPage' });

    expect(existsSync(join(root, 'shared/page-objects/LoginPage.ts'))).toBe(true);
    expect(existsSync(join(ticketDir, 'page-objects/LoginPage.ts'))).toBe(false);
    const newSpec = require('node:fs').readFileSync(join(ticketDir, 'spec.ts'), 'utf8');
    expect(newSpec).toContain(`from '../../shared/page-objects/LoginPage'`);

    rmSync(root, { recursive: true });
  });

  test('refuses promote when shared/page-objects already has different class with same name', async () => {
    const root = mkdtempSync(join(tmpdir(), 'xera-prom-'));
    const ticketDir = join(root, '.xera/JIRA-1');
    mkdirSync(join(ticketDir, 'page-objects'), { recursive: true });
    mkdirSync(join(root, 'shared/page-objects'), { recursive: true });
    writeFileSync(join(root, 'shared/page-objects/LoginPage.ts'), `export class LoginPage { old() {} }\n`);
    writeFileSync(join(ticketDir, 'page-objects/LoginPage.ts'), `export class LoginPage { newm() {} }\n`);

    await expect(promotePom({ repoRoot: root, ticket: 'JIRA-1', className: 'LoginPage' })).rejects.toThrow(/already exists/);

    rmSync(root, { recursive: true });
  });
});
```

- [x] **Step 4: Implement promote**

```ts
import { existsSync, readFileSync, writeFileSync, renameSync } from 'node:fs';
import { join } from 'node:path';

export interface PromoteInput {
  repoRoot: string;
  ticket: string;
  className: string;
}

export async function promotePom(input: PromoteInput): Promise<void> {
  const fromDir = join(input.repoRoot, '.xera', input.ticket, 'page-objects');
  const toDir = join(input.repoRoot, 'shared', 'page-objects');
  const file = `${input.className}.ts`;
  const fromPath = join(fromDir, file);
  const toPath = join(toDir, file);

  if (!existsSync(fromPath)) {
    throw new Error(`POM ${file} not found at ${fromPath}`);
  }
  if (existsSync(toPath)) {
    throw new Error(`POM ${file} already exists at ${toPath}. Reconcile manually before promoting.`);
  }

  renameSync(fromPath, toPath);

  const specPath = join(input.repoRoot, '.xera', input.ticket, 'spec.ts');
  if (existsSync(specPath)) {
    const src = readFileSync(specPath, 'utf8');
    const updated = src.replace(
      new RegExp(`from\\s+['"]\\./page-objects/${input.className}['"]`, 'g'),
      `from '../../shared/page-objects/${input.className}'`,
    );
    writeFileSync(specPath, updated);
  }
}
```

- [x] **Step 5: Tests pass + commit**

```bash
cd packages/web && npx vitest run
git add packages/web/src/generator/{pom-scan,promote}.ts packages/web/test/generator/{pom-scan,promote}.test.ts
git commit -m "web: scan shared POMs + explicit promote with rewrite"
```

---

### Task 6.6: WebAdapter implementation + package index

**Files:**
- Create: `packages/web/src/adapter.ts`
- Modify: `packages/web/src/index.ts`

- [x] **Step 1: Write adapter**

```ts
import { runPlaywright } from './executor';
import { normalizeRun } from './trace-normalizer/normalize';
import type { TestAdapter, GenerateInput, GenerateResult, ExecuteInput, RunResult, DoctorReport } from '@xera-ai/core/adapter';
import { join } from 'node:path';

export const WebAdapter: TestAdapter = {
  id: 'web',

  async generate(_input: GenerateInput): Promise<GenerateResult> {
    // Generation itself is LLM-driven via skills + prompts; the adapter
    // exposes helpers (validateGherkin, typecheckTicket, lintTicket) that
    // the skills call via `npx xera-internal`. No direct artifact writing here.
    return { artifacts: [], warnings: [] };
  },

  async execute(input: ExecuteInput): Promise<RunResult> {
    const runDir = join(input.ticketDir, 'runs', input.runId);
    const specPath = join(input.ticketDir, 'spec.ts');
    const configPath = join(input.ticketDir, 'playwright.config.ts');
    const pwResult = await runPlaywright({ specPath, configPath, outputDir: runDir });
    const normalized = await normalizeRun({ runId: input.runId, runDir });
    return {
      runId: input.runId,
      outcome: normalized.outcome,
      scenarios: normalized.scenarios.map(s => ({ name: s.name, outcome: s.outcome, failure: s.failure })),
      artifactsDir: runDir,
      rawReportPath: pwResult.rawReportPath,
      normalizedReportPath: join(runDir, 'normalized.json'),
    };
  },

  async doctor(): Promise<DoctorReport> {
    const checks: DoctorReport['checks'] = [];
    try {
      await import('@playwright/test');
      checks.push({ name: '@playwright/test installed', ok: true });
    } catch {
      checks.push({ name: '@playwright/test installed', ok: false, message: 'Run `npm install -D @playwright/test`.' });
    }
    return { ok: checks.every(c => c.ok), checks };
  },
};
```

- [x] **Step 2: Update `packages/web/src/index.ts`**

```ts
export * from './adapter';
export * from './auth-setup/define';
export * from './auth-setup/runner';
export * from './auth-setup/playwright-state';
export * from './executor';
export * from './executor/playwright-args';
export * from './trace-normalizer/normalize';
export * from './trace-normalizer/parse';
export * from './trace-normalizer/scrub';
export * from './trace-normalizer/scrub-rules';
export * from './trace-normalizer/unzip';
export * from './generator/gherkin-validate';
export * from './generator/typecheck';
export * from './generator/lint';
export * from './generator/selector-rules';
export * from './generator/pom-scan';
export * from './generator/promote';
```

- [x] **Step 3: Typecheck + commit**

```bash
cd packages/web && npm run typecheck
git add packages/web/src/adapter.ts packages/web/src/index.ts
git commit -m "web: WebAdapter implementation + public exports"
```

---

## End of Plan 02

Verify across the workspace:

```bash
npm run lint
npm run typecheck
npx vitest run
```

All packages should be green. Continue with [Plan 03: Classifier + CLI](2026-05-14-xera-v01-03-classifier-and-cli.md).
