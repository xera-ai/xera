# xera v0.1 — Plan 05: Fixtures, Tests, Docs, Release

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a fixture web app (Next.js) and mock-Jira server for integration tests, wire up the E2E nightly workflow, write user-facing documentation, and cut the v0.1.0 release.

**Architecture:** `fixtures/sample-app/` is a tiny Next.js app with login, dashboard, form pages — enough surface area to exercise auth-state refresh, POM reuse, classifier categories. A separate `fixtures/mock-jira/` is a single-file Bun HTTP server that responds with deterministic ticket JSON. The E2E workflow boots both, runs `xera init` + `/xera-run SAMPLE-001` and asserts pass.

**Prereqs:** Plans 01–04 complete.

---

## Phase 12 — Fixtures and integration tests

### Task 12.1: Next.js sample-app — login + dashboard

**Files:**
- Create: `fixtures/sample-app/package.json`
- Create: `fixtures/sample-app/next.config.mjs`
- Create: `fixtures/sample-app/tsconfig.json`
- Create: `fixtures/sample-app/app/layout.tsx`
- Create: `fixtures/sample-app/app/page.tsx` (home)
- Create: `fixtures/sample-app/app/login/page.tsx`
- Create: `fixtures/sample-app/app/dashboard/page.tsx`
- Create: `fixtures/sample-app/app/api/login/route.ts`
- Create: `fixtures/sample-app/middleware.ts`

- [ ] **Step 1: `package.json`**

```json
{
  "name": "@xera-fixtures/sample-app",
  "private": true,
  "version": "0.0.0",
  "scripts": {
    "dev": "next dev --port 4321",
    "build": "next build",
    "start": "next start --port 4321"
  },
  "dependencies": {
    "next": "15.0.0",
    "react": "19.0.0",
    "react-dom": "19.0.0"
  },
  "devDependencies": {
    "@types/node": "20.x",
    "@types/react": "19.x",
    "@types/react-dom": "19.x",
    "typescript": "5.6.3"
  }
}
```

- [ ] **Step 2: `next.config.mjs` + `tsconfig.json`**

`next.config.mjs`:
```js
export default { reactStrictMode: true };
```

`tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["dom", "dom.iterable", "ES2022"],
    "allowJs": false,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "plugins": [{ "name": "next" }],
    "paths": { "@/*": ["./*"] }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx"],
  "exclude": ["node_modules"]
}
```

- [ ] **Step 3: `app/layout.tsx` and `app/page.tsx`**

`app/layout.tsx`:
```tsx
import type { ReactNode } from 'react';
export default function RootLayout({ children }: { children: ReactNode }) {
  return <html lang="en"><body>{children}</body></html>;
}
```

`app/page.tsx`:
```tsx
export default function Home() {
  return (
    <main>
      <h1>xera fixture app</h1>
      <a href="/login">Login</a>
    </main>
  );
}
```

- [ ] **Step 4: `app/login/page.tsx`**

```tsx
'use client';
import { useState } from 'react';

export default function LoginPage() {
  const [error, setError] = useState('');
  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const res = await fetch('/api/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: fd.get('email'), password: fd.get('password') }),
    });
    if (res.ok) window.location.href = '/dashboard';
    else {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? 'Login failed');
    }
  };
  return (
    <main>
      <h1>Sign in</h1>
      <form onSubmit={submit}>
        <label>Email <input name="email" type="email" /></label>
        <label>Password <input name="password" type="password" /></label>
        <button type="submit">Sign in</button>
      </form>
      {error && <div role="alert">{error}</div>}
    </main>
  );
}
```

- [ ] **Step 5: `app/dashboard/page.tsx`**

```tsx
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

export default async function DashboardPage() {
  const c = await cookies();
  const session = c.get('session');
  if (!session) redirect('/login');
  return (
    <main>
      <h1>Dashboard</h1>
      <p>Welcome, {session.value}</p>
    </main>
  );
}
```

- [ ] **Step 6: `app/api/login/route.ts`**

```ts
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

const VALID = { 'alice@example.com': 'ValidPass123!' } as Record<string, string>;

export async function POST(req: Request) {
  const { email, password } = await req.json();
  if (VALID[email] === password) {
    const c = await cookies();
    c.set('session', email.split('@')[0], { httpOnly: true });
    return NextResponse.json({ ok: true });
  }
  return NextResponse.json({ error: 'Invalid email or password' }, { status: 401 });
}
```

- [ ] **Step 7: Install + commit**

```bash
cd fixtures/sample-app && bun install
cd ../..
git add fixtures/sample-app
git commit -m "fixtures: Next.js sample app with login + dashboard + protected route"
```

---

### Task 12.2: Mock-Jira HTTP server

**Files:**
- Create: `fixtures/mock-jira/package.json`
- Create: `fixtures/mock-jira/server.ts`
- Create: `fixtures/mock-jira/tickets/SAMPLE-001.json`
- Create: `fixtures/mock-jira/tickets/SAMPLE-002.json`

- [ ] **Step 1: `package.json`**

```json
{
  "name": "@xera-fixtures/mock-jira",
  "private": true,
  "version": "0.0.0",
  "type": "module",
  "scripts": {
    "start": "bun run server.ts"
  }
}
```

- [ ] **Step 2: `server.ts`**

```ts
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const TICKETS_DIR = join(HERE, 'tickets');
const PORT = Number(process.env.MOCK_JIRA_PORT ?? 4322);

function loadTicket(key: string): unknown | null {
  const p = join(TICKETS_DIR, `${key}.json`);
  if (!existsSync(p)) return null;
  return JSON.parse(readFileSync(p, 'utf8'));
}

const comments: Array<{ key: string; body: unknown }> = [];

Bun.serve({
  port: PORT,
  fetch(req) {
    const url = new URL(req.url);

    // GET /rest/api/3/issue/<KEY>
    const issueMatch = url.pathname.match(/^\/rest\/api\/3\/issue\/([^/]+)$/);
    if (req.method === 'GET' && issueMatch) {
      const ticket = loadTicket(decodeURIComponent(issueMatch[1]!));
      return ticket
        ? new Response(JSON.stringify(ticket), { status: 200, headers: { 'content-type': 'application/json' } })
        : new Response('not found', { status: 404 });
    }

    // POST /rest/api/3/issue/<KEY>/comment
    const commentMatch = url.pathname.match(/^\/rest\/api\/3\/issue\/([^/]+)\/comment$/);
    if (req.method === 'POST' && commentMatch) {
      return req.json().then(body => {
        comments.push({ key: commentMatch[1]!, body });
        return new Response(JSON.stringify({ id: String(comments.length) }), { status: 201, headers: { 'content-type': 'application/json' } });
      });
    }

    // GET /__comments__ for assertions
    if (req.method === 'GET' && url.pathname === '/__comments__') {
      return new Response(JSON.stringify(comments), { status: 200, headers: { 'content-type': 'application/json' } });
    }

    return new Response('not found', { status: 404 });
  },
});
console.log(`mock-jira listening on http://localhost:${PORT}`);
console.log(`available tickets: ${readdirSync(TICKETS_DIR).join(', ')}`);
```

- [ ] **Step 3: Ticket fixtures**

`fixtures/mock-jira/tickets/SAMPLE-001.json`:

```json
{
  "key": "SAMPLE-001",
  "fields": {
    "summary": "User can log in with valid credentials",
    "description": "As a user I want to sign in with email + password so that I can access my dashboard.\n\nAcceptance Criteria:\n- Login form has email + password fields\n- Successful login redirects to /dashboard\n- Invalid credentials show an error",
    "attachment": []
  }
}
```

`fixtures/mock-jira/tickets/SAMPLE-002.json`:

```json
{
  "key": "SAMPLE-002",
  "fields": {
    "summary": "Dashboard shows welcome message after login",
    "description": "After a successful login, /dashboard displays 'Welcome, <username>' where username is the local part of the email.",
    "attachment": []
  }
}
```

- [ ] **Step 4: Commit**

```bash
git add fixtures/mock-jira
git commit -m "fixtures: mock-jira HTTP server with deterministic tickets"
```

---

### Task 12.3: Integration test — pipeline against fixtures

**Files:**
- Create: `packages/cli/test/integration/init-and-run.test.ts`

This test boots mock-jira + sample-app, runs `xera init`, then exercises `xera-internal` end-to-end. Skill steps are skipped (they require a Claude Code session) — instead the test pre-stages `test.feature` and `spec.ts` files identical to what the skills would have produced, and asserts the deterministic parts work.

- [ ] **Step 1: Write the test**

```ts
import { describe, expect, test, beforeAll, afterAll } from 'bun:test';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn, type Subprocess } from 'bun';

let mockJira: Subprocess | undefined;
let sampleApp: Subprocess | undefined;

beforeAll(async () => {
  mockJira = spawn(['bun', 'run', 'fixtures/mock-jira/server.ts'], { env: { ...process.env, MOCK_JIRA_PORT: '4322' } });
  sampleApp = spawn(['bun', 'run', '--cwd', 'fixtures/sample-app', 'dev']);
  // Wait for both to come up
  for (let i = 0; i < 30; i++) {
    try {
      const a = await fetch('http://localhost:4322/__comments__').then(r => r.ok);
      const b = await fetch('http://localhost:4321/').then(r => r.ok);
      if (a && b) return;
    } catch {}
    await new Promise(r => setTimeout(r, 1000));
  }
  throw new Error('fixtures did not start within 30s');
});

afterAll(async () => {
  mockJira?.kill();
  sampleApp?.kill();
});

describe('xera integration — init + fetch + exec + report', () => {
  test('happy path with prepared spec', async () => {
    const cwd = mkdtempSync(join(tmpdir(), 'xera-int-'));

    // 1. Run `xera init --yes`
    const init = spawn(['bun', 'run', '--cwd', cwd, '../../packages/cli/bin/xera', 'init', '--yes'], { cwd });
    expect(await init.exited).toBe(0);
    expect(existsSync(join(cwd, 'xera.config.ts'))).toBe(true);
    expect(existsSync(join(cwd, '.xera/SAMPLE-001/spec.ts'))).toBe(true);

    // 2. Rewrite xera.config.ts to point at mock-jira
    let cfg = readFileSync(join(cwd, 'xera.config.ts'), 'utf8');
    cfg = cfg.replace(/https:\/\/[^'"]*atlassian[^'"]*/, 'http://localhost:4322');
    cfg = cfg.replace(/http:\/\/localhost:3000|https:\/\/[^'"]+/g, 'http://localhost:4321');
    writeFileSync(join(cwd, 'xera.config.ts'), cfg);
    writeFileSync(join(cwd, '.env'), [
      `JIRA_EMAIL=test@example.com`,
      `JIRA_API_TOKEN=mock`,
      `TEST_ADMIN_EMAIL=alice@example.com`,
      `TEST_ADMIN_PWD=ValidPass123!`,
      `TEST_REGULAR_EMAIL=alice@example.com`,
      `TEST_REGULAR_PWD=ValidPass123!`,
      `XERA_AUTH_KEY=${'a'.repeat(64)}`,
    ].join('\n'));

    // 3. Pre-stage a real ticket directory mimicking what the skills produce
    const ticketDir = join(cwd, '.xera/SAMPLE-002');
    mkdirSync(ticketDir, { recursive: true });
    writeFileSync(join(ticketDir, 'story.md'), 'After login, dashboard says "Welcome, alice".');
    writeFileSync(join(ticketDir, 'test.feature'),
      `Feature: SAMPLE-002\n  Scenario: After login dashboard shows welcome\n    Given I am on /dashboard\n    Then I see "Welcome, alice"\n`);
    writeFileSync(join(ticketDir, 'spec.ts'), `
      import { test, expect } from '@playwright/test';
      test.describe('SAMPLE-002', () => {
        test('After login dashboard shows welcome', async ({ page }) => {
          await page.goto('/dashboard');
          await expect(page.getByText('Welcome, alice')).toBeVisible();
        });
      });
    `);

    // 4. Run xera-internal fetch SAMPLE-001 (uses mock-jira REST since no MCP)
    const fetchProc = spawn(['bun', 'run', '--cwd', cwd, 'xera:fetch', 'SAMPLE-001'], { cwd });
    expect(await fetchProc.exited).toBe(0);
    expect(existsSync(join(cwd, '.xera/SAMPLE-001/story.md'))).toBe(true);

    rmSync(cwd, { recursive: true });
  }, 60000);
});
```

- [ ] **Step 2: Commit**

```bash
git add packages/cli/test/integration/init-and-run.test.ts
git commit -m "cli: integration test — init + fetch against mock-jira"
```

---

### Task 12.4: Nightly E2E workflow

**Files:**
- Create: `.github/workflows/nightly-e2e.yml`

- [ ] **Step 1: Write the workflow**

```yaml
name: Nightly E2E
on:
  schedule: [{ cron: '17 2 * * *' }]
  workflow_dispatch:
jobs:
  e2e:
    runs-on: ubuntu-latest
    timeout-minutes: 30
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v2
        with: { bun-version: '1.1.x' }
      - run: bun install --frozen-lockfile
      - name: Install Playwright browsers
        run: bunx playwright install --with-deps chromium
      - name: Run integration tests
        run: bun test packages/cli/test/integration
      - name: Upload artifacts on failure
        if: failure()
        uses: actions/upload-artifact@v4
        with:
          name: xera-e2e-artifacts
          path: |
            **/.xera/**/runs/**
            **/playwright-report
```

- [ ] **Step 2: Commit + push**

```bash
git add .github/workflows/nightly-e2e.yml
git commit -m "ci: nightly E2E workflow with Playwright + fixtures"
git push
```

---

## Phase 13 — Documentation and release

### Task 13.1: Top-level README

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Rewrite to reflect implemented framework**

Open `README.md` and replace the "design phase" framing with the real quickstart. Keep the structure but update status to "v0.1.0".

```markdown
# xera

AI-native test framework for QA teams — fetch a Jira ticket, generate Gherkin + Playwright spec, run the test, diagnose the failure, and post results back to Jira. Driven entirely by Claude Code skills.

## Quickstart

Prereqs: Bun ≥1.1.0, Claude Code, an Atlassian-connected MCP **or** a Jira API token, a web app to test.

```bash
mkdir my-tests && cd my-tests
bunx xera init                  # answers ~5 prompts
cp .env.example .env            # fill in credentials
bun install
bunx playwright install chromium
# Then open Claude Code in this directory:
claude
> /xera-run SAMPLE-001          # smoke test — runs against playwright.dev
> /xera-run JIRA-123            # your first real ticket
```

## What you get out of the box

| Skill | What it does |
|---|---|
| `/xera-run <TICKET>` | Full pipeline end-to-end |
| `/xera-fetch <TICKET>` | Pull story from Jira |
| `/xera-feature <TICKET>` | Generate Gherkin |
| `/xera-script <TICKET>` | Generate Playwright spec + page objects |
| `/xera-exec <TICKET>` | Run the test only |
| `/xera-report <TICKET>` | Classify + post diagnosis to Jira |
| `/xera-promote <TICKET> <POM>` | Move a POM to `shared/` |

## Architecture

See [the design spec](docs/superpowers/specs/2026-05-14-xera-core-web-design.md) for the full architecture. In short:

- `@xera/cli` — public CLI (`init`, `doctor`)
- `@xera/core` — config, artifact IO, classifier, Jira client, auth state, `xera-internal` binary
- `@xera/web` — Playwright adapter
- `@xera/skills` — Claude Code skill `.md` files
- `@xera/prompts` — versioned LLM prompt templates

## Documentation

- [Quickstart + commands (this file)](#quickstart)
- [Configuration reference](docs/CONFIGURATION.md)
- [Troubleshooting](docs/TROUBLESHOOTING.md)
- [Architecture (design spec)](docs/superpowers/specs/2026-05-14-xera-core-web-design.md)

## Roadmap

| Version | Adds |
|---|---|
| v0.1 (current) | Core + Web adapter; local QA-trigger only |
| v0.2 | CI mode; self-healing auto-fix; AI gen evaluation harness |
| v0.3 | API adapter |
| v0.5 | Mobile adapter |
| v0.6 | Performance adapter |
| v0.7 | Security adapter |
| v1.0 | Read-only static dashboard |
| v2.0 | Optional SaaS backend (only if multi-org demand) |

## License

MIT.

## Contact

thanh@trinity-technology.com
```

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "docs: README quickstart for v0.1.0"
```

---

### Task 13.2: `docs/CONFIGURATION.md`

**Files:**
- Create: `docs/CONFIGURATION.md`

- [ ] **Step 1: Write reference doc**

```markdown
# xera Configuration Reference

Every project has a single root config: `xera.config.ts`. This file is committed to your repo. Secrets live in `.env` (gitignored). The `XERA_AUTH_KEY` environment variable is auto-generated by `xera init` — **do not regenerate it**, or your cached auth state becomes unreadable.

## Precedence (highest to lowest)

1. CLI flag (e.g. `--env=prod`)
2. ENV var (e.g. `XERA_ENV=prod`)
3. `.env` file in project root
4. `xera.config.ts`
5. Built-in defaults

## Full schema

```ts
import { defineConfig } from '@xera/core';

export default defineConfig({
  jira: {
    baseUrl: 'https://thanhtrinity.atlassian.net',
    projectKeys: ['JIRA', 'XERA'],
    fields: {
      story: 'description',
      acceptanceCriteria: 'customfield_10001',
    },
  },
  web: {
    baseUrl: {
      local:   'http://localhost:3000',
      staging: 'https://staging.example.com',
      prod:    'https://example.com',
    },
    defaultEnv: 'staging',
    auth: {
      strategy: 'storageState',
      ttl: '8h',
      refreshBuffer: '30m',
      setupScript: './shared/auth-setup.ts',
      roles: {
        admin:   { envEmail: 'TEST_ADMIN_EMAIL',   envPassword: 'TEST_ADMIN_PWD' },
        regular: { envEmail: 'TEST_USER_EMAIL',    envPassword: 'TEST_USER_PWD' },
      },
    },
    testData: {
      users: {
        admin:   { fromAuth: 'admin' },
        regular: { fromAuth: 'regular' },
      },
    },
  },
  ai: {
    livePageSnapshot: true,
    confidenceThreshold: 'medium',
    maxRetries: { typecheck: 2, lint: 2, validateFeature: 2 },
  },
  reporting: {
    language: 'en',
    postToJira: true,
    transition: { onPass: null, onFail: null },
    artifactLinks: 'git',
  },
  adapters: ['web'],
});
```

## Field-by-field

### `jira`
- `baseUrl`: your Atlassian Cloud workspace URL.
- `projectKeys`: prefixes valid for ticket keys, e.g. `['JIRA']` matches `JIRA-123`.
- `fields.story`: Jira field id holding the user story. Default `description`. Use `xera init` to detect.
- `fields.acceptanceCriteria`: optional. If unset, xera reads AC from the story body.

### `web`
- `baseUrl`: map of environment name → URL. Must include `defaultEnv`.
- `defaultEnv`: which environment xera targets by default.
- `auth.strategy`: `storageState` (browser login form), `apiToken` (Bearer), or `none`.
- `auth.ttl`: how long cached auth state is valid (`8h`, `30m`, etc.).
- `auth.refreshBuffer`: refresh proactively this far before expiry.
- `auth.setupScript`: path to your `defineAuthSetup`-exported function.
- `auth.roles`: declares which env vars hold credentials for each role.

### `ai`
- `livePageSnapshot`: probe staging via Playwright MCP during POM generation. Disable for offline workflows.
- `confidenceThreshold`: minimum confidence for classifier to commit a verdict.
- `maxRetries`: per-gate retry caps in skills.

### `reporting`
- `language`: Jira comment language. `en` or `vi`.
- `postToJira`: master switch.
- `transition`: optional Jira status transitions on pass/fail. Default disabled.
- `artifactLinks`: where Jira links should point. `git` (committed paths in repo) or `local` (filesystem).

### `adapters`
- Array of adapter ids to enable. v0.1 supports only `['web']`.

## Environment variables

```
JIRA_EMAIL=
JIRA_API_TOKEN=
TEST_<ROLE>_EMAIL=
TEST_<ROLE>_PWD=
XERA_AUTH_KEY=               # 64-char hex, generated by `xera init`
XERA_ENV=staging             # optional override
```

## `xera doctor`

Validates everything above and prints what is missing. Run after any config change.
```

- [ ] **Step 2: Commit**

```bash
git add docs/CONFIGURATION.md
git commit -m "docs: full configuration reference"
```

---

### Task 13.3: `docs/TROUBLESHOOTING.md`

**Files:**
- Create: `docs/TROUBLESHOOTING.md`

- [ ] **Step 1: Write the doc**

```markdown
# xera Troubleshooting

The 10 most common errors and how to fix them.

## 1. `Jira authentication rejected` / HTTP 401

The token in `.env` is missing, expired, or for the wrong account.

```bash
# Generate a new API token at:
https://id.atlassian.com/manage-profile/security/api-tokens
# Then edit .env:
JIRA_EMAIL=your-email@company.com
JIRA_API_TOKEN=<paste-here>
# Verify:
bunx xera doctor
```

## 2. `Atlassian MCP not connecting`

The MCP server isn't running in your Claude Code session. Either:

- Install/enable the Atlassian connector for Claude Code, or
- Fall back to REST: set `JIRA_EMAIL` + `JIRA_API_TOKEN` in `.env` and re-run.

## 3. `Playwright browser not installed`

```bash
bunx playwright install chromium
```

## 4. `Web baseUrl unreachable`

`xera doctor` will tell you which URL fails. Common causes: VPN required, staging environment down, wrong port. Update `xera.config.ts.web.baseUrl` and re-run doctor.

## 5. `tsc errors in generated spec`

The AI emitted code that doesn't type-check. The skill retries automatically up to 2 times. If it still fails:

- Edit `.xera/<TICKET>/spec.ts` manually.
- Re-run `/xera-script` to regenerate, or `/xera-exec` to run as-is.

## 6. `Gherkin parse error`

The skill retries automatically. If it still fails, open `.xera/<TICKET>/test.feature` and inspect — usually missing colon after `Scenario` or stray quotes.

## 7. `Auth setupScript failing`

The shared/auth-setup.ts couldn't log in. Most often: selectors changed in your login page. Edit it manually to match your current UI. Run `bun run xera:exec <TICKET>` to test in isolation.

## 8. `.lock file stale`

Another xera run was killed mid-run. To force-clear:

```bash
bunx xera-internal unlock <TICKET> --force
```

## 9. `Skill not found in Claude Code`

The `.claude/skills/` directory is missing or out of date.

```bash
# In your project:
bunx xera init --update
# Restart Claude Code to refresh skill discovery.
```

## 10. `XERA_AUTH_KEY mismatch — cannot decrypt`

You either regenerated the key in `.env` or deleted `.env`. The auth state cache is unreadable. Fix:

```bash
# Option A — accept the loss and refresh all auth states:
rm -rf .xera/.auth/
# Next exec will regenerate fresh state for each role.
# Option B — restore the previous key value if you have it.
```

Do not regenerate `XERA_AUTH_KEY` unless you accept losing cached auth state.
```

- [ ] **Step 2: Commit**

```bash
git add docs/TROUBLESHOOTING.md
git commit -m "docs: top-10 troubleshooting guide"
```

---

### Task 13.4: `docs/ARCHITECTURE.md`

**Files:**
- Create: `docs/ARCHITECTURE.md`

- [ ] **Step 1: Write a condensed architecture overview**

```markdown
# xera Architecture (v0.1)

For the full spec see [the design doc](superpowers/specs/2026-05-14-xera-core-web-design.md). This is a shorter overview for developers contributing to xera itself.

## Layers

```
End user (QA)
  │ uses `bunx xera init` once
  │ then `/xera-*` slash commands in Claude Code
  ▼
Skills (`.claude/skills/xera-*.md`)
  │ tell the session LLM what to do
  │ session LLM calls `bun run xera:*`
  ▼
`xera-internal` binary (in @xera/core)
  │ deterministic helpers only
  │ writes artifacts to .xera/<TICKET>/
  ▼
@xera/web — Playwright adapter
  │ generator helpers (validate, typecheck, lint)
  │ executor + trace normalizer + secret scrubber
  ▼
Playwright + the user's app under test
```

## Key invariants

- The public CLI exposes only `init` and `doctor`. Everything else is via skills.
- Skill prompts + `xera-internal` form a closed pair: the skill knows when to call which subcommand and what to do with its output.
- Every `xera-internal` subcommand reads from disk and writes to disk. No subcommand keeps state across invocations.
- AI work happens in the QA's Claude Code session — there is no `claude` binary shell-out from `xera-internal`.
- Secret scrubbing is deterministic and runs before LLM ever sees normalized run data.

## Packages

| Package | Responsibility | Public bin |
|---|---|---|
| `@xera/core` | Config, paths, hashing, lock, log, Jira client, classifier framework, auth state | `xera-internal` |
| `@xera/cli` | Public CLI: `init`, `doctor` | `xera` |
| `@xera/web` | Playwright adapter | — |
| `@xera/skills` | Claude Code skill `.md` files | — |
| `@xera/prompts` | Versioned LLM prompt templates | — |

## Extension model

To add a new test adapter (mobile, API, performance, security):

1. Create `packages/<adapter>/` implementing `TestAdapter` from `@xera/core/adapter`.
2. Add the adapter id to `xera.config.ts.adapters`.
3. Write per-adapter generator helpers and a trace normalizer.
4. Reuse the classifier framework, status writer, Jira comment builder, and skills as-is.

The classifier and reporter are adapter-agnostic by design.
```

- [ ] **Step 2: Commit**

```bash
git add docs/ARCHITECTURE.md
git commit -m "docs: condensed architecture overview"
```

---

### Task 13.5: `xera-starter` template repo

**Files:** (in a separate repo)
- Create `thanhtrinity/xera-starter` on GitHub
- Initialize with: `xera.config.ts`, `playwright.config.ts`, `package.json` skeleton, `.env.example`, README

- [ ] **Step 1: Create starter repo**

```bash
gh repo create thanhtrinity/xera-starter --public --description "Template repo for xera projects — pre-init'd boilerplate"
cd /tmp && gh repo clone thanhtrinity/xera-starter && cd xera-starter
```

- [ ] **Step 2: Run `bunx xera init --yes` against an empty dir to produce the starter content**

```bash
# (after publishing @xera/cli to npm — see Task 13.6)
bunx @xera/cli init --yes
# Edit the generated files to be more generic templates:
#  - xera.config.ts: leave placeholders like https://YOUR-WORKSPACE.atlassian.net
#  - .env.example: blank values
#  - shared/auth-setup.ts: commented template
# Write a README pointing at thanhtrinity/xera for docs.
git add . && git commit -m "Initial xera-starter content"
git push -u origin main
```

- [ ] **Step 3: Mark as template via GitHub UI** (Settings → "Template repository")

```bash
gh repo edit thanhtrinity/xera-starter --template
```

---

### Task 13.6: Publish packages to npm

**Files:** none (publish step)

- [ ] **Step 1: Pre-publish checks**

```bash
bun install --frozen-lockfile
bun run lint
bun run typecheck
bun test
bun run --filter '*' build
```

All must be green.

- [ ] **Step 2: Login to npm + dry-run publish (in order: core, web, cli, skills, prompts)**

```bash
bunx npm login
# core depends on nothing internal
bun publish --filter @xera/core --dry-run
# web depends on core
bun publish --filter @xera/web --dry-run
# cli depends on core
bun publish --filter @xera/cli --dry-run
bun publish --filter @xera/skills --dry-run
bun publish --filter @xera/prompts --dry-run
```

- [ ] **Step 3: Real publish**

```bash
bun publish --filter @xera/core
bun publish --filter @xera/web
bun publish --filter @xera/cli
bun publish --filter @xera/skills
bun publish --filter @xera/prompts
```

- [ ] **Step 4: Verify**

```bash
# In a fresh tmp dir
cd /tmp && mkdir t && cd t
bunx xera init --yes
ls -la
# xera.config.ts, .xera/SAMPLE-001/, .claude/skills/* should all be present
```

---

### Task 13.7: Cut the v0.1.0 release

**Files:** none (release step)

- [ ] **Step 1: Tag and push**

```bash
git tag -a v0.1.0 -m "xera v0.1.0 — Core + Web adapter"
git push --tags
```

- [ ] **Step 2: Create GitHub release**

```bash
gh release create v0.1.0 \
  --title "v0.1.0 — Core + Web adapter" \
  --notes "$(cat <<'EOF'
First public release of xera.

## What is xera?

xera is an AI-native test framework that lets QA teams generate, run, and diagnose Playwright tests by invoking Claude Code skills against Jira tickets. No per-QA API key needed — the AI work runs inside the QA's Claude Code session.

## Highlights

- Public CLI: `bunx xera init`, `bunx xera doctor`
- Skills: `/xera-run`, `/xera-fetch`, `/xera-feature`, `/xera-script`, `/xera-exec`, `/xera-report`, `/xera-promote`
- Web adapter: Playwright + auto Page Object generation + selector lint rules
- Failure classifier: PASS / REAL_BUG / SELECTOR_DRIFT / FLAKY / TEST_BUG with confidence
- Encrypted auth state cache (AES-256-GCM), automatic refresh
- Deterministic secret scrubber on every artifact before AI ever sees it

## Get started

\`\`\`bash
mkdir my-tests && cd my-tests
bunx xera init
\`\`\`

See the [README](https://github.com/thanhtrinity/xera#readme) for the full quickstart.

## Roadmap

v0.2 will add CI mode, self-healing auto-fix, and the AI generation evaluation rubric.
EOF
)"
```

- [ ] **Step 3: Done**

```bash
git push
echo "v0.1.0 shipped"
```

---

## End of Plan 05 — and end of v0.1 plans

Final verification:

```bash
bun run lint
bun run typecheck
bun test
bunx xera doctor
```

In a fresh directory:

```bash
mkdir /tmp/xera-smoke && cd /tmp/xera-smoke
bunx xera@latest init
# Open Claude Code → /xera-run SAMPLE-001 → green ✓
```

If all of the above pass, v0.1.0 is **ready to use**.
