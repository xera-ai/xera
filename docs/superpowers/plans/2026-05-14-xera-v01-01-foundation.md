# xera v0.1 — Plan 01: Foundation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up the npm workspace and build `@xera-ai/core` foundations: config, artifact paths, hashing, logging, file lock, Jira client (MCP + REST), and the encrypted auth-state manager.

**Architecture:** Five workspace packages scaffolded. All shared types and IO live in `@xera-ai/core`. Jira is abstracted behind a `JiraClient` interface with two backends (MCP preferred, REST fallback). Auth state is AES-256-GCM-encrypted at rest, with TTL/expiry-based refresh.

**Tech Stack:** Node, TypeScript 5.x strict, vitest-style `npx vitest run`, zod, biome, node:crypto.

**Prereqs:** Node ≥22 installed. `gh` CLI authenticated.

---

> **Status:** ✅ Completed 2026-05-14. All tasks in this plan are implemented and shipped. See [POSTMORTEM.md](POSTMORTEM.md) for bugs that surfaced in the plan code itself and post-launch patches.


## Phase 0 — Workspace bootstrap

### Task 0.1: Root workspace files

**Files:**
- Create: `package.json`
- Create: `bunfig.toml`
- Create: `tsconfig.base.json`
- Create: `biome.json`

- [x] **Step 1: Create the root `package.json`**

```json
{
  "name": "xera-monorepo",
  "private": true,
  "version": "0.0.0",
  "type": "module",
  "engines": { "node": ">=22.0.0" },
  "workspaces": [
    "packages/*",
    "fixtures/*"
  ],
  "scripts": {
    "build": "npm run --filter '*' build",
    "test": "npx vitest run",
    "lint": "biome check .",
    "lint:fix": "biome check --write .",
    "typecheck": "npm run --filter '*' typecheck"
  },
  "devDependencies": {
    "@biomejs/biome": "1.9.4",
    "typescript": "5.6.3"
  }
}
```

- [x] **Step 2: Create `bunfig.toml`**

```toml
[install]
exact = true

[test]
preload = []
```

- [x] **Step 3: Create `tsconfig.base.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "lib": ["ES2022"],
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "noImplicitOverride": true,
    "noFallthroughCasesInSwitch": true,
    "isolatedModules": true,
    "skipLibCheck": true,
    "esModuleInterop": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "types": ["@types/node"]
  }
}
```

- [x] **Step 4: Create `biome.json`**

```json
{
  "$schema": "https://biomejs.dev/schemas/1.9.4/schema.json",
  "files": { "ignore": ["**/dist/**", "**/node_modules/**", "fixtures/sample-app/**"] },
  "formatter": { "indentStyle": "space", "indentWidth": 2, "lineWidth": 100 },
  "linter": {
    "enabled": true,
    "rules": { "recommended": true, "style": { "useImportType": "error" } }
  },
  "javascript": { "formatter": { "quoteStyle": "single", "semicolons": "always" } }
}
```

- [x] **Step 5: Install root devDeps**

Run: `npm install`
Expected: lockfile created at `package-lock.json`, no errors.

- [x] **Step 6: Commit**

```bash
git add package.json bunfig.toml tsconfig.base.json biome.json package-lock.json
git commit -m "chore: bootstrap npm workspace + biome + tsconfig"
```

---

### Task 0.2: Package skeletons

**Files (all created):**
- `packages/core/package.json`, `packages/core/tsconfig.json`, `packages/core/src/index.ts`
- `packages/cli/package.json`, `packages/cli/tsconfig.json`, `packages/cli/src/index.ts`, `packages/cli/bin/xera`
- `packages/web/package.json`, `packages/web/tsconfig.json`, `packages/web/src/index.ts`
- `packages/skills/package.json`, `packages/skills/version.json`
- `packages/prompts/package.json`, `packages/prompts/version.json`

- [x] **Step 1: `packages/core/package.json`**

```json
{
  "name": "@xera-ai/core",
  "version": "0.1.0",
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": { "import": "./dist/index.js", "types": "./dist/index.d.ts" },
    "./adapter": { "import": "./dist/adapter/types.js", "types": "./dist/adapter/types.d.ts" }
  },
  "bin": { "xera-internal": "./dist/bin/internal.js" },
  "files": ["dist", "bin"],
  "scripts": {
    "build": "tsup",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "zod": "3.23.8"
  }
}
```

- [x] **Step 2: `packages/core/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src",
    "declaration": true,
    "declarationMap": true
  },
  "include": ["src/**/*"]
}
```

- [x] **Step 3: `packages/core/src/index.ts`**

```ts
export const VERSION = '0.1.0';
```

- [x] **Step 4: Create `packages/cli/package.json`**

```json
{
  "name": "@xera-ai/cli",
  "version": "0.1.0",
  "type": "module",
  "bin": { "xera": "./bin/xera" },
  "files": ["dist", "bin", "templates"],
  "scripts": {
    "build": "tsup",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@xera-ai/core": "workspace:*",
    "@clack/prompts": "0.7.0",
    "cac": "6.7.14",
    "picocolors": "1.1.0"
  }
}
```

- [x] **Step 5: `packages/cli/tsconfig.json`** (identical shape to `core/tsconfig.json` but root path is `src`)

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "outDir": "./dist", "rootDir": "./src" },
  "include": ["src/**/*"]
}
```

- [x] **Step 6: `packages/cli/src/index.ts`**

```ts
export const CLI_VERSION = '0.1.0';
```

- [x] **Step 7: `packages/cli/bin/xera`**

```sh
#!/usr/bin/env node
import('../dist/index.js').then(m => m.default ? m.default() : undefined);
```

Make executable: `chmod +x packages/cli/bin/xera`

- [x] **Step 8: `packages/web/package.json`**

```json
{
  "name": "@xera-ai/web",
  "version": "0.1.0",
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": { "import": "./dist/index.js", "types": "./dist/index.d.ts" }
  },
  "files": ["dist"],
  "scripts": {
    "build": "tsup",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@xera-ai/core": "workspace:*",
    "@cucumber/gherkin": "30.0.4",
    "@cucumber/messages": "27.0.2",
    "@playwright/test": "1.48.0"
  }
}
```

- [x] **Step 9: `packages/web/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "outDir": "./dist", "rootDir": "./src" },
  "include": ["src/**/*"]
}
```

- [x] **Step 10: `packages/web/src/index.ts`**

```ts
export const WEB_VERSION = '0.1.0';
```

- [x] **Step 11: `packages/skills/package.json`**

```json
{
  "name": "@xera-ai/skills",
  "version": "0.1.0",
  "files": ["*.md", "version.json"]
}
```

- [x] **Step 12: `packages/skills/version.json`**

```json
{ "skills": "0.1.0", "compatible_prompts": "^1.0.0" }
```

- [x] **Step 13: `packages/prompts/package.json`**

```json
{
  "name": "@xera-ai/prompts",
  "version": "1.0.0",
  "files": ["*.md", "version.json"]
}
```

- [x] **Step 14: `packages/prompts/version.json`**

```json
{ "prompts": "1.0.0" }
```

- [x] **Step 15: Verify workspace resolution**

Run: `npm install`
Expected: `node_modules/@xera-ai/core` (symlink), `node_modules/@xera-ai/cli`, `node_modules/@xera-ai/web` all exist.

- [x] **Step 16: Commit**

```bash
git add packages/
git commit -m "chore: scaffold five workspace packages"
```

---

### Task 0.3: CI workflow scaffolding

**Files:**
- Create: `.github/workflows/ci.yml`

- [x] **Step 1: Write the workflow**

```yaml
name: CI
on:
  push: { branches: [main] }
  pull_request:
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22 }
      - run: npm ci
      - run: npm run lint
      - run: npm run typecheck
      - run: npx vitest run
```

- [x] **Step 2: Commit and verify**

```bash
git add .github/workflows/ci.yml
git commit -m "ci: add lint + typecheck + test workflow"
git push
```

Open the Actions tab on GitHub; the workflow should pass (no tests yet, just typecheck + lint).

---

## Phase 1 — `@xera-ai/core` foundations

### Task 1.1: Config schema

**Files:**
- Create: `packages/core/src/config/schema.ts`
- Create: `packages/core/test/config/schema.test.ts`

- [x] **Step 1: Write failing tests first**

`packages/core/test/config/schema.test.ts`:

```ts
import { describe, expect, test } from 'vitest';
import { XeraConfigSchema } from '../../src/config/schema';

describe('XeraConfigSchema', () => {
  test('accepts minimal valid config', () => {
    const config = {
      jira: {
        baseUrl: 'https://example.atlassian.net',
        projectKeys: ['JIRA'],
        fields: { story: 'description' },
      },
      web: {
        baseUrl: { staging: 'https://staging.example.com' },
        defaultEnv: 'staging',
      },
      adapters: ['web'],
    };
    const result = XeraConfigSchema.safeParse(config);
    expect(result.success).toBe(true);
  });

  test('rejects empty projectKeys', () => {
    const result = XeraConfigSchema.safeParse({
      jira: { baseUrl: 'https://x.atlassian.net', projectKeys: [], fields: { story: 'description' } },
      web: { baseUrl: { staging: 'https://x.com' }, defaultEnv: 'staging' },
      adapters: ['web'],
    });
    expect(result.success).toBe(false);
  });

  test('rejects defaultEnv not present in baseUrl map', () => {
    const result = XeraConfigSchema.safeParse({
      jira: { baseUrl: 'https://x.atlassian.net', projectKeys: ['X'], fields: { story: 'description' } },
      web: { baseUrl: { staging: 'https://x.com' }, defaultEnv: 'prod' },
      adapters: ['web'],
    });
    expect(result.success).toBe(false);
  });

  test('auth strategy default is "none"', () => {
    const parsed = XeraConfigSchema.parse({
      jira: { baseUrl: 'https://x.atlassian.net', projectKeys: ['X'], fields: { story: 'description' } },
      web: { baseUrl: { staging: 'https://x.com' }, defaultEnv: 'staging' },
      adapters: ['web'],
    });
    expect(parsed.web.auth.strategy).toBe('none');
  });
});
```

- [x] **Step 2: Run tests, confirm they fail**

```bash
cd packages/core && npx vitest run
```
Expected: 4 failures (module not found).

- [x] **Step 3: Implement `packages/core/src/config/schema.ts`**

```ts
import { z } from 'zod';

const AuthRoleSchema = z.object({
  envEmail: z.string().min(1),
  envPassword: z.string().min(1),
});

const AuthSchema = z.object({
  strategy: z.enum(['storageState', 'apiToken', 'none']).default('none'),
  ttl: z.string().default('8h'),
  refreshBuffer: z.string().default('30m'),
  setupScript: z.string().optional(),
  roles: z.record(z.string(), AuthRoleSchema).default({}),
});

const WebSchema = z.object({
  baseUrl: z.record(z.string(), z.string().url()).refine(m => Object.keys(m).length > 0, {
    message: 'baseUrl must have at least one environment',
  }),
  defaultEnv: z.string(),
  auth: AuthSchema.default({}),
  testData: z
    .object({
      users: z.record(z.string(), z.object({ fromAuth: z.string() })).default({}),
    })
    .default({ users: {} }),
}).refine(w => w.baseUrl[w.defaultEnv] !== undefined, {
  message: 'defaultEnv must exist in baseUrl map',
  path: ['defaultEnv'],
});

const JiraSchema = z.object({
  baseUrl: z.string().url(),
  projectKeys: z.array(z.string().min(1)).min(1),
  fields: z.object({
    story: z.string().min(1),
    acceptanceCriteria: z.string().optional(),
    attachments: z.string().default('attachment'),
  }),
});

const AISchema = z.object({
  livePageSnapshot: z.boolean().default(true),
  confidenceThreshold: z.enum(['low', 'medium', 'high']).default('medium'),
  maxRetries: z
    .object({
      typecheck: z.number().int().min(0).max(5).default(2),
      lint: z.number().int().min(0).max(5).default(2),
      validateFeature: z.number().int().min(0).max(5).default(2),
    })
    .default({}),
}).default({});

const ReportingSchema = z.object({
  language: z.enum(['en', 'vi']).default('en'),
  postToJira: z.boolean().default(true),
  transition: z
    .object({
      onPass: z.string().nullable().default(null),
      onFail: z.string().nullable().default(null),
    })
    .default({}),
  artifactLinks: z.enum(['git', 'local']).default('git'),
}).default({});

export const XeraConfigSchema = z.object({
  jira: JiraSchema,
  web: WebSchema,
  ai: AISchema,
  reporting: ReportingSchema,
  adapters: z.array(z.string().min(1)).min(1).default(['web']),
});

export type XeraConfig = z.infer<typeof XeraConfigSchema>;
```

- [x] **Step 4: Run tests, confirm pass**

```bash
cd packages/core && npx vitest run
```
Expected: 4 passes.

- [x] **Step 5: Commit**

```bash
git add packages/core/src/config/schema.ts packages/core/test/config/schema.test.ts
git commit -m "core: add XeraConfig zod schema with defaults"
```

---

### Task 1.2: `defineConfig` helper and config loader

**Files:**
- Create: `packages/core/src/config/define.ts`
- Create: `packages/core/src/config/load.ts`
- Create: `packages/core/test/config/load.test.ts`

- [x] **Step 1: Write `define.ts`**

```ts
import type { XeraConfig } from './schema';
export function defineConfig(config: XeraConfig): XeraConfig { return config; }
```

- [x] **Step 2: Write failing test for loader**

`packages/core/test/config/load.test.ts`:

```ts
import { describe, expect, test } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadConfig } from '../../src/config/load';

describe('loadConfig', () => {
  test('finds and parses xera.config.ts in given dir', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'xera-cfg-'));
    writeFileSync(
      join(dir, 'xera.config.ts'),
      `import { defineConfig } from '${process.cwd()}/packages/core/src/config/define.ts';
       export default defineConfig({
         jira: { baseUrl: 'https://x.atlassian.net', projectKeys: ['X'], fields: { story: 'description' } },
         web: { baseUrl: { staging: 'https://x.com' }, defaultEnv: 'staging' },
         adapters: ['web'],
       });`,
    );
    const cfg = await loadConfig(dir);
    expect(cfg.jira.projectKeys).toEqual(['X']);
    expect(cfg.web.auth.strategy).toBe('none');
    rmSync(dir, { recursive: true });
  });

  test('throws when xera.config.ts missing', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'xera-cfg-'));
    await expect(loadConfig(dir)).rejects.toThrow(/xera\.config\.ts not found/);
    rmSync(dir, { recursive: true });
  });
});
```

- [x] **Step 3: Run failing test**

```bash
cd packages/core && npx vitest run test/config/load.test.ts
```
Expected: 2 failures.

- [x] **Step 4: Implement `load.ts`**

```ts
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { XeraConfigSchema, type XeraConfig } from './schema';

export async function loadConfig(cwd: string): Promise<XeraConfig> {
  const path = join(cwd, 'xera.config.ts');
  if (!existsSync(path)) {
    throw new Error(`xera.config.ts not found in ${cwd}`);
  }
  const mod = await import(pathToFileURL(path).href);
  const raw = mod.default ?? mod;
  return XeraConfigSchema.parse(raw);
}
```

- [x] **Step 5: Run tests, confirm pass**

```bash
cd packages/core && npx vitest run
```
Expected: all pass.

- [x] **Step 6: Commit**

```bash
git add packages/core/src/config packages/core/test/config/load.test.ts
git commit -m "core: add defineConfig helper and loader"
```

---

### Task 1.3: Artifact paths

**Files:**
- Create: `packages/core/src/artifact/paths.ts`
- Create: `packages/core/test/artifact/paths.test.ts`

- [x] **Step 1: Write failing tests**

```ts
import { describe, expect, test } from 'vitest';
import { resolveArtifactPaths } from '../../src/artifact/paths';

describe('resolveArtifactPaths', () => {
  test('returns standard paths under .xera/<TICKET>', () => {
    const p = resolveArtifactPaths('/repo', 'JIRA-123');
    expect(p.ticketDir).toBe('/repo/.xera/JIRA-123');
    expect(p.storyPath).toBe('/repo/.xera/JIRA-123/story.md');
    expect(p.featurePath).toBe('/repo/.xera/JIRA-123/test.feature');
    expect(p.specPath).toBe('/repo/.xera/JIRA-123/spec.ts');
    expect(p.pageObjectsDir).toBe('/repo/.xera/JIRA-123/page-objects');
    expect(p.runsDir).toBe('/repo/.xera/JIRA-123/runs');
    expect(p.metaPath).toBe('/repo/.xera/JIRA-123/meta.json');
    expect(p.statusPath).toBe('/repo/.xera/JIRA-123/status.json');
    expect(p.logPath).toBe('/repo/.xera/JIRA-123/xera.log');
    expect(p.lockPath).toBe('/repo/.xera/JIRA-123/.lock');
  });

  test('runPath produces sortable ISO-like timestamp dir', () => {
    const p = resolveArtifactPaths('/repo', 'JIRA-123');
    const run = p.runPath('2026-05-14T10-30-00');
    expect(run.runDir).toBe('/repo/.xera/JIRA-123/runs/2026-05-14T10-30-00');
    expect(run.reportJsonPath).toBe('/repo/.xera/JIRA-123/runs/2026-05-14T10-30-00/report.json');
    expect(run.tracePath).toBe('/repo/.xera/JIRA-123/runs/2026-05-14T10-30-00/trace.zip');
    expect(run.normalizedPath).toBe('/repo/.xera/JIRA-123/runs/2026-05-14T10-30-00/normalized.json');
    expect(run.screenshotsDir).toBe('/repo/.xera/JIRA-123/runs/2026-05-14T10-30-00/screenshots');
  });

  test('rejects invalid ticket keys', () => {
    expect(() => resolveArtifactPaths('/repo', '')).toThrow();
    expect(() => resolveArtifactPaths('/repo', '../etc')).toThrow();
    expect(() => resolveArtifactPaths('/repo', 'has space')).toThrow();
  });
});
```

- [x] **Step 2: Run failing**

```bash
cd packages/core && npx vitest run test/artifact/paths.test.ts
```

- [x] **Step 3: Implement**

```ts
import { join } from 'node:path';

const TICKET_RE = /^[A-Z][A-Z0-9_]*-\d+$|^SAMPLE-\d+$/;

export interface RunPaths {
  runDir: string;
  reportJsonPath: string;
  tracePath: string;
  normalizedPath: string;
  screenshotsDir: string;
  videoDir: string;
}

export interface ArtifactPaths {
  ticketDir: string;
  storyPath: string;
  featurePath: string;
  specPath: string;
  pageObjectsDir: string;
  runsDir: string;
  metaPath: string;
  statusPath: string;
  logPath: string;
  lockPath: string;
  authDir: string;
  runPath: (runId: string) => RunPaths;
}

export function resolveArtifactPaths(repoRoot: string, ticket: string): ArtifactPaths {
  if (!TICKET_RE.test(ticket)) {
    throw new Error(`Invalid ticket key: "${ticket}" (expected e.g. JIRA-123 or SAMPLE-001)`);
  }
  const ticketDir = join(repoRoot, '.xera', ticket);
  return {
    ticketDir,
    storyPath: join(ticketDir, 'story.md'),
    featurePath: join(ticketDir, 'test.feature'),
    specPath: join(ticketDir, 'spec.ts'),
    pageObjectsDir: join(ticketDir, 'page-objects'),
    runsDir: join(ticketDir, 'runs'),
    metaPath: join(ticketDir, 'meta.json'),
    statusPath: join(ticketDir, 'status.json'),
    logPath: join(ticketDir, 'xera.log'),
    lockPath: join(ticketDir, '.lock'),
    authDir: join(repoRoot, '.xera', '.auth'),
    runPath: (runId: string) => {
      const runDir = join(ticketDir, 'runs', runId);
      return {
        runDir,
        reportJsonPath: join(runDir, 'report.json'),
        tracePath: join(runDir, 'trace.zip'),
        normalizedPath: join(runDir, 'normalized.json'),
        screenshotsDir: join(runDir, 'screenshots'),
        videoDir: join(runDir, 'videos'),
      };
    },
  };
}

export function generateRunId(now: Date = new Date()): string {
  return now.toISOString().replace(/[:.]/g, '-').replace('Z', '');
}
```

- [x] **Step 4: Tests pass**

```bash
cd packages/core && npx vitest run
```

- [x] **Step 5: Commit**

```bash
git add packages/core/src/artifact/paths.ts packages/core/test/artifact/paths.test.ts
git commit -m "core: add artifact path resolver with ticket key validation"
```

---

### Task 1.4: Hash utilities

**Files:**
- Create: `packages/core/src/artifact/hash.ts`
- Create: `packages/core/test/artifact/hash.test.ts`

- [x] **Step 1: Failing tests**

```ts
import { describe, expect, test } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { hashString, hashFile, hashFileIfExists } from '../../src/artifact/hash';

describe('hash utilities', () => {
  test('hashString produces stable sha256 hex prefixed with sha256:', () => {
    expect(hashString('hello')).toBe(
      'sha256:2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824',
    );
  });

  test('hashFile reads and hashes file contents', () => {
    const dir = mkdtempSync(join(tmpdir(), 'xera-hash-'));
    const f = join(dir, 'a.txt');
    writeFileSync(f, 'hello');
    expect(hashFile(f)).toBe(hashString('hello'));
    rmSync(dir, { recursive: true });
  });

  test('hashFileIfExists returns null when file missing', () => {
    expect(hashFileIfExists('/no/such/file.xyz')).toBeNull();
  });
});
```

- [x] **Step 2: Run failing**

```bash
cd packages/core && npx vitest run test/artifact/hash.test.ts
```

- [x] **Step 3: Implement `hash.ts`**

```ts
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';

export function hashString(s: string): string {
  return `sha256:${createHash('sha256').update(s).digest('hex')}`;
}

export function hashFile(path: string): string {
  return hashString(readFileSync(path, 'utf8'));
}

export function hashFileIfExists(path: string): string | null {
  if (!existsSync(path)) return null;
  return hashFile(path);
}
```

- [x] **Step 4: Tests pass + commit**

```bash
cd packages/core && npx vitest run
git add packages/core/src/artifact/hash.ts packages/core/test/artifact/hash.test.ts
git commit -m "core: add sha256 hash utilities"
```

---

### Task 1.5: Meta and status JSON readers/writers

**Files:**
- Create: `packages/core/src/artifact/meta.ts`
- Create: `packages/core/src/artifact/status.ts`
- Create: `packages/core/test/artifact/meta.test.ts`
- Create: `packages/core/test/artifact/status.test.ts`

- [x] **Step 1: Failing test for meta**

`packages/core/test/artifact/meta.test.ts`:

```ts
import { describe, expect, test } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readMeta, writeMeta, type MetaJson } from '../../src/artifact/meta';

describe('meta.json IO', () => {
  test('writeMeta then readMeta round-trips', () => {
    const dir = mkdtempSync(join(tmpdir(), 'xera-meta-'));
    const path = join(dir, 'meta.json');
    const m: MetaJson = {
      ticket: 'JIRA-1',
      adapter: 'web',
      xera_version: '0.1.0',
      prompts_version: '1.0.0',
      fetched_at: '2026-05-14T10:00:00.000Z',
      story_hash: 'sha256:abc',
    };
    writeMeta(path, m);
    expect(readMeta(path)).toEqual(m);
    rmSync(dir, { recursive: true });
  });

  test('readMeta returns null when missing', () => {
    expect(readMeta('/no/such/meta.json')).toBeNull();
  });
});
```

- [x] **Step 2: Run failing**

```bash
cd packages/core && npx vitest run test/artifact/meta.test.ts
```

- [x] **Step 3: Implement `meta.ts`**

```ts
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { z } from 'zod';

export const MetaJsonSchema = z.object({
  ticket: z.string(),
  adapter: z.string(),
  xera_version: z.string(),
  prompts_version: z.string(),
  fetched_at: z.string().optional(),
  story_hash: z.string().optional(),
  feature_generated_at: z.string().optional(),
  feature_generated_from_story_hash: z.string().optional(),
  feature_hash: z.string().optional(),
  script_generated_at: z.string().optional(),
  script_generated_from_feature_hash: z.string().optional(),
  script_warnings: z.array(z.string()).optional(),
});

export type MetaJson = z.infer<typeof MetaJsonSchema>;

export function readMeta(path: string): MetaJson | null {
  if (!existsSync(path)) return null;
  return MetaJsonSchema.parse(JSON.parse(readFileSync(path, 'utf8')));
}

export function writeMeta(path: string, meta: MetaJson): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(meta, null, 2));
}

export function updateMeta(path: string, patch: Partial<MetaJson>): MetaJson {
  const existing = readMeta(path);
  if (!existing) {
    throw new Error(`meta.json not found at ${path}; cannot update`);
  }
  const next = { ...existing, ...patch };
  writeMeta(path, next);
  return next;
}
```

- [x] **Step 4: Failing test for status**

`packages/core/test/artifact/status.test.ts`:

```ts
import { describe, expect, test } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readStatus, writeStatus, appendHistory, type StatusJson } from '../../src/artifact/status';

describe('status.json IO', () => {
  test('round-trip', () => {
    const dir = mkdtempSync(join(tmpdir(), 'xera-status-'));
    const path = join(dir, 'status.json');
    const s: StatusJson = {
      ticket: 'JIRA-1',
      lastRun: '2026-05-14T10:30:00.000Z',
      result: 'PASS',
      classification: 'PASS',
      confidence: 'high',
      scenarios: { total: 2, passed: 2, failed: 0, skipped: 0 },
      history: [],
    };
    writeStatus(path, s);
    expect(readStatus(path)).toEqual(s);
    rmSync(dir, { recursive: true });
  });

  test('appendHistory keeps newest first, caps at 20', () => {
    const dir = mkdtempSync(join(tmpdir(), 'xera-status-'));
    const path = join(dir, 'status.json');
    const initial: StatusJson = {
      ticket: 'JIRA-1',
      lastRun: '2026-01-01T00:00:00.000Z',
      result: 'PASS',
      classification: 'PASS',
      confidence: 'high',
      scenarios: { total: 1, passed: 1, failed: 0, skipped: 0 },
      history: [],
    };
    writeStatus(path, initial);
    for (let i = 0; i < 25; i++) {
      appendHistory(path, {
        ts: `2026-01-${String(i + 2).padStart(2, '0')}T00:00:00.000Z`,
        result: 'PASS',
        class: 'PASS',
      });
    }
    const final = readStatus(path)!;
    expect(final.history.length).toBe(20);
    expect(final.history[0]?.ts).toBe('2026-01-26T00:00:00.000Z');
    rmSync(dir, { recursive: true });
  });
});
```

- [x] **Step 5: Run failing**

```bash
cd packages/core && npx vitest run test/artifact/status.test.ts
```

- [x] **Step 6: Implement `status.ts`**

```ts
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { z } from 'zod';

const ClassificationEnum = z.enum(['PASS', 'REAL_BUG', 'SELECTOR_DRIFT', 'FLAKY', 'TEST_BUG']);
const ResultEnum = z.enum(['PASS', 'FAIL']);
const ConfidenceEnum = z.enum(['low', 'medium', 'high']);

export const HistoryEntrySchema = z.object({
  ts: z.string(),
  result: ResultEnum,
  class: ClassificationEnum,
});

export const StatusJsonSchema = z.object({
  ticket: z.string(),
  lastRun: z.string(),
  result: ResultEnum,
  classification: ClassificationEnum,
  confidence: ConfidenceEnum,
  scenarios: z.object({
    total: z.number().int().nonnegative(),
    passed: z.number().int().nonnegative(),
    failed: z.number().int().nonnegative(),
    skipped: z.number().int().nonnegative(),
  }),
  history: z.array(HistoryEntrySchema).default([]),
  last_jira_comment_id: z.string().optional(),
});

export type StatusJson = z.infer<typeof StatusJsonSchema>;
export type HistoryEntry = z.infer<typeof HistoryEntrySchema>;
export type Classification = z.infer<typeof ClassificationEnum>;

const HISTORY_CAP = 20;

export function readStatus(path: string): StatusJson | null {
  if (!existsSync(path)) return null;
  return StatusJsonSchema.parse(JSON.parse(readFileSync(path, 'utf8')));
}

export function writeStatus(path: string, status: StatusJson): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(status, null, 2));
}

export function appendHistory(path: string, entry: HistoryEntry): StatusJson {
  const s = readStatus(path);
  if (!s) {
    throw new Error(`status.json not found at ${path}`);
  }
  s.history = [entry, ...s.history].slice(0, HISTORY_CAP);
  writeStatus(path, s);
  return s;
}
```

- [x] **Step 7: Tests pass + commit**

```bash
cd packages/core && npx vitest run
git add packages/core/src/artifact/{meta,status}.ts packages/core/test/artifact/{meta,status}.test.ts
git commit -m "core: add meta.json + status.json IO with history cap"
```

---

### Task 1.6: NDJSON logger

**Files:**
- Create: `packages/core/src/logging/ndjson-logger.ts`
- Create: `packages/core/test/logging/ndjson-logger.test.ts`

- [x] **Step 1: Failing test**

```ts
import { describe, expect, test } from 'vitest';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { NdjsonLogger } from '../../src/logging/ndjson-logger';

describe('NdjsonLogger', () => {
  test('appends one JSON line per log()', () => {
    const dir = mkdtempSync(join(tmpdir(), 'xera-log-'));
    const path = join(dir, 'xera.log');
    const log = new NdjsonLogger(path);
    log.log({ step: 'fetch', exit: 0, ms: 12 });
    log.log({ step: 'feature', tokens_in: 100, tokens_out: 50 });
    const content = readFileSync(path, 'utf8');
    const lines = content.trim().split('\n');
    expect(lines).toHaveLength(2);
    const parsed1 = JSON.parse(lines[0]!);
    expect(parsed1.step).toBe('fetch');
    expect(typeof parsed1.ts).toBe('string');
    rmSync(dir, { recursive: true });
  });

  test('readAll parses NDJSON file', () => {
    const dir = mkdtempSync(join(tmpdir(), 'xera-log-'));
    const path = join(dir, 'xera.log');
    const log = new NdjsonLogger(path);
    log.log({ step: 'a' });
    log.log({ step: 'b' });
    expect(NdjsonLogger.readAll(path).map(e => e.step)).toEqual(['a', 'b']);
    rmSync(dir, { recursive: true });
  });

  test('readAll returns empty array when file missing', () => {
    expect(NdjsonLogger.readAll('/no/such.log')).toEqual([]);
  });
});
```

- [x] **Step 2: Run failing**

```bash
cd packages/core && npx vitest run test/logging/
```

- [x] **Step 3: Implement**

```ts
import { appendFileSync, mkdirSync, existsSync, readFileSync } from 'node:fs';
import { dirname } from 'node:path';

export interface LogEntry {
  ts: string;
  [key: string]: unknown;
}

export class NdjsonLogger {
  constructor(private readonly path: string) {
    mkdirSync(dirname(path), { recursive: true });
  }

  log(payload: Record<string, unknown>): void {
    const entry: LogEntry = { ts: new Date().toISOString(), ...payload };
    appendFileSync(this.path, `${JSON.stringify(entry)}\n`);
  }

  static readAll(path: string): LogEntry[] {
    if (!existsSync(path)) return [];
    const txt = readFileSync(path, 'utf8').trim();
    if (!txt) return [];
    return txt.split('\n').map(line => JSON.parse(line) as LogEntry);
  }
}
```

- [x] **Step 4: Tests pass + commit**

```bash
cd packages/core && npx vitest run
git add packages/core/src/logging packages/core/test/logging
git commit -m "core: add append-only NDJSON logger"
```

---

### Task 1.7: File lock

**Files:**
- Create: `packages/core/src/lock/file-lock.ts`
- Create: `packages/core/test/lock/file-lock.test.ts`

- [x] **Step 1: Failing tests**

```ts
import { describe, expect, test } from 'vitest';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { acquireLock, releaseLock, readLock, isLockStale } from '../../src/lock/file-lock';

describe('file-lock', () => {
  test('acquireLock creates file with PID/host/run-id; second acquire fails', () => {
    const dir = mkdtempSync(join(tmpdir(), 'xera-lock-'));
    const lockPath = join(dir, '.lock');
    const ok = acquireLock(lockPath, 'run-1');
    expect(ok).toBe(true);
    expect(existsSync(lockPath)).toBe(true);
    const lockData = readLock(lockPath)!;
    expect(lockData.pid).toBe(process.pid);
    expect(lockData.run_id).toBe('run-1');
    const ok2 = acquireLock(lockPath, 'run-2');
    expect(ok2).toBe(false);
    rmSync(dir, { recursive: true });
  });

  test('releaseLock removes file', () => {
    const dir = mkdtempSync(join(tmpdir(), 'xera-lock-'));
    const lockPath = join(dir, '.lock');
    acquireLock(lockPath, 'r1');
    releaseLock(lockPath);
    expect(existsSync(lockPath)).toBe(false);
    rmSync(dir, { recursive: true });
  });

  test('isLockStale returns true when PID does not exist on same host', () => {
    const dir = mkdtempSync(join(tmpdir(), 'xera-lock-'));
    const lockPath = join(dir, '.lock');
    // Manually write a lock with an impossible PID
    const fakeLock = {
      pid: 9999999,
      hostname: require('node:os').hostname(),
      started_at: new Date().toISOString(),
      run_id: 'r1',
    };
    require('node:fs').writeFileSync(lockPath, JSON.stringify(fakeLock));
    expect(isLockStale(lockPath)).toBe(true);
    rmSync(dir, { recursive: true });
  });
});
```

- [x] **Step 2: Run failing**

```bash
cd packages/core && npx vitest run test/lock/
```

- [x] **Step 3: Implement**

```ts
import { existsSync, readFileSync, writeFileSync, unlinkSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { hostname } from 'node:os';

export interface LockData {
  pid: number;
  hostname: string;
  started_at: string;
  run_id: string;
}

export function acquireLock(path: string, runId: string): boolean {
  if (existsSync(path)) return false;
  mkdirSync(dirname(path), { recursive: true });
  const data: LockData = {
    pid: process.pid,
    hostname: hostname(),
    started_at: new Date().toISOString(),
    run_id: runId,
  };
  // Use 'wx' flag for atomic-ish create-only.
  try {
    writeFileSync(path, JSON.stringify(data), { flag: 'wx' });
    return true;
  } catch {
    return false;
  }
}

export function releaseLock(path: string): void {
  if (existsSync(path)) unlinkSync(path);
}

export function readLock(path: string): LockData | null {
  if (!existsSync(path)) return null;
  return JSON.parse(readFileSync(path, 'utf8')) as LockData;
}

export function isLockStale(path: string): boolean {
  const lock = readLock(path);
  if (!lock) return true;
  if (lock.hostname !== hostname()) {
    // Cannot verify a remote PID; treat as not stale.
    return false;
  }
  try {
    // Signal 0 = "check if process exists". Throws if not.
    process.kill(lock.pid, 0);
    return false;
  } catch {
    return true;
  }
}

export function forceUnlock(path: string): void {
  releaseLock(path);
}
```

- [x] **Step 4: Tests pass + commit**

```bash
cd packages/core && npx vitest run
git add packages/core/src/lock packages/core/test/lock
git commit -m "core: add file lock with stale detection"
```

---

### Task 1.8: Adapter interface

**Files:**
- Create: `packages/core/src/adapter/types.ts`

- [x] **Step 1: Write the types**

```ts
import type { XeraConfig } from '../config/schema';
import type { Classification } from '../artifact/status';

export interface GenerateInput {
  ticketDir: string;
  feature: string;
  story: string;
  config: XeraConfig;
}

export interface GenerateResult {
  artifacts: string[];
  warnings: string[];
}

export interface ExecuteInput {
  ticketDir: string;
  config: XeraConfig;
  runId: string;
  env: string;
}

export interface ScenarioResult {
  name: string;
  outcome: 'PASS' | 'FAIL' | 'SKIPPED';
  failure?: {
    step?: string;
    errorMessage?: string;
    domSnapshotAtFailure?: string;
    networkAtFailure?: Array<{ method: string; url: string; status: number }>;
    consoleAtFailure?: string[];
    screenshotPath?: string;
  };
}

export interface RunResult {
  runId: string;
  outcome: 'PASS' | 'FAIL';
  scenarios: ScenarioResult[];
  artifactsDir: string;
  rawReportPath: string;
  normalizedReportPath: string;
}

export interface ClassifyContext {
  history: Array<{ ts: string; result: 'PASS' | 'FAIL'; class: Classification }>;
  storyHashChanged: boolean;
  specHashChanged: boolean;
}

export interface DoctorReport {
  ok: boolean;
  checks: Array<{ name: string; ok: boolean; message?: string }>;
}

export interface TestAdapter {
  readonly id: string;
  generate(input: GenerateInput): Promise<GenerateResult>;
  execute(input: ExecuteInput): Promise<RunResult>;
  classify?(run: RunResult, ctx: ClassifyContext): Partial<{ class: Classification; rationale: string }>;
  doctor(): Promise<DoctorReport>;
}
```

- [x] **Step 2: Re-export from `packages/core/src/index.ts`**

```ts
export const VERSION = '0.1.0';
export type * from './adapter/types';
export * from './config/schema';
export * from './config/define';
export * from './config/load';
export * from './artifact/paths';
export * from './artifact/hash';
export * from './artifact/meta';
export * from './artifact/status';
export * from './logging/ndjson-logger';
export * from './lock/file-lock';
```

- [x] **Step 3: Typecheck + commit**

```bash
cd packages/core && npm run typecheck
git add packages/core/src/adapter/types.ts packages/core/src/index.ts
git commit -m "core: define TestAdapter interface and public re-exports"
```

---

## Phase 2 — Jira integration

### Task 2.1: Jira types and client interface

**Files:**
- Create: `packages/core/src/jira/types.ts`
- Create: `packages/core/src/jira/client.ts`

- [x] **Step 1: Define types in `types.ts`**

```ts
export interface JiraTicket {
  key: string;
  summary: string;
  story: string;
  acceptanceCriteria?: string;
  attachments: Array<{ filename: string; url: string }>;
  raw: Record<string, unknown>;
}

export interface JiraFieldMap {
  story: string;
  acceptanceCriteria?: string;
}

export interface JiraClient {
  readonly backend: 'mcp' | 'rest';
  fetchTicket(key: string, fields: JiraFieldMap): Promise<JiraTicket>;
  postComment(key: string, body: string): Promise<{ id: string }>;
  transitionStatus(key: string, statusName: string): Promise<void>;
  listFields(sampleKey: string): Promise<Array<{ id: string; name: string; hasContent: boolean }>>;
}
```

- [x] **Step 2: Stub `client.ts` (backend factory)**

```ts
import type { JiraClient } from './types';
import { createMcpBackend } from './mcp-backend';
import { createRestBackend } from './rest-backend';

export interface CreateJiraClientOptions {
  baseUrl: string;
  preferMcp?: boolean;
  rest?: { email: string; apiToken: string };
}

export async function createJiraClient(opts: CreateJiraClientOptions): Promise<JiraClient> {
  if (opts.preferMcp !== false) {
    const mcp = await createMcpBackend(opts.baseUrl);
    if (mcp) return mcp;
  }
  if (!opts.rest) {
    throw new Error('Atlassian MCP not connected and no REST credentials provided (JIRA_EMAIL + JIRA_API_TOKEN).');
  }
  return createRestBackend(opts.baseUrl, opts.rest);
}
```

- [x] **Step 3: Commit (no tests yet — backends needed first)**

```bash
git add packages/core/src/jira/types.ts packages/core/src/jira/client.ts
git commit -m "core: add JiraClient interface and backend factory"
```

---

### Task 2.2: REST backend

**Files:**
- Create: `packages/core/src/jira/rest-backend.ts`
- Create: `packages/core/test/jira/rest-backend.test.ts`

- [x] **Step 1: Failing test using a mock fetch**

```ts
import { describe, expect, test, beforeEach, afterEach, mock } from 'vitest';
import { createRestBackend } from '../../src/jira/rest-backend';

const originalFetch = globalThis.fetch;

describe('rest-backend', () => {
  beforeEach(() => {
    globalThis.fetch = mock(async (url: string | URL, init?: RequestInit) => {
      const u = url.toString();
      if (u.includes('/rest/api/3/issue/JIRA-1?')) {
        return new Response(JSON.stringify({
          key: 'JIRA-1',
          fields: {
            summary: 'A summary',
            description: 'A story',
            customfield_10001: 'An AC',
            attachment: [{ filename: 'a.png', content: 'https://x.com/a.png' }],
          },
        }), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      if (u.endsWith('/comment') && init?.method === 'POST') {
        return new Response(JSON.stringify({ id: '42' }), { status: 201 });
      }
      return new Response('not found', { status: 404 });
    }) as unknown as typeof fetch;
  });
  afterEach(() => { globalThis.fetch = originalFetch; });

  test('fetchTicket maps fields per JiraFieldMap', async () => {
    const c = createRestBackend('https://x.atlassian.net', { email: 'a@b.com', apiToken: 't' });
    const t = await c.fetchTicket('JIRA-1', { story: 'description', acceptanceCriteria: 'customfield_10001' });
    expect(t.key).toBe('JIRA-1');
    expect(t.summary).toBe('A summary');
    expect(t.story).toBe('A story');
    expect(t.acceptanceCriteria).toBe('An AC');
    expect(t.attachments).toHaveLength(1);
  });

  test('postComment returns comment id', async () => {
    const c = createRestBackend('https://x.atlassian.net', { email: 'a@b.com', apiToken: 't' });
    const r = await c.postComment('JIRA-1', 'hello');
    expect(r.id).toBe('42');
  });
});
```

- [x] **Step 2: Run failing**

```bash
cd packages/core && npx vitest run test/jira/rest-backend.test.ts
```

- [x] **Step 3: Implement**

```ts
import type { JiraClient, JiraFieldMap, JiraTicket } from './types';

interface RestCreds { email: string; apiToken: string; }

export function createRestBackend(baseUrl: string, creds: RestCreds): JiraClient {
  const authHeader = `Basic ${Buffer.from(`${creds.email}:${creds.apiToken}`).toString('base64')}`;
  const base = baseUrl.replace(/\/$/, '');

  async function req(path: string, init?: RequestInit): Promise<Response> {
    const r = await fetch(`${base}${path}`, {
      ...init,
      headers: {
        Authorization: authHeader,
        Accept: 'application/json',
        'Content-Type': 'application/json',
        ...(init?.headers ?? {}),
      },
    });
    if (!r.ok && r.status !== 201) {
      throw new Error(`Jira REST ${init?.method ?? 'GET'} ${path} failed: ${r.status} ${await r.text()}`);
    }
    return r;
  }

  return {
    backend: 'rest',
    async fetchTicket(key, fields): Promise<JiraTicket> {
      const want = ['summary', fields.story];
      if (fields.acceptanceCriteria) want.push(fields.acceptanceCriteria);
      want.push('attachment');
      const r = await req(`/rest/api/3/issue/${encodeURIComponent(key)}?fields=${want.join(',')}`);
      const json = (await r.json()) as { key: string; fields: Record<string, unknown> };
      const f = json.fields;
      const attachments = Array.isArray(f.attachment)
        ? (f.attachment as Array<{ filename: string; content: string }>).map(a => ({ filename: a.filename, url: a.content }))
        : [];
      return {
        key: json.key,
        summary: String(f.summary ?? ''),
        story: String(f[fields.story] ?? ''),
        acceptanceCriteria: fields.acceptanceCriteria ? String(f[fields.acceptanceCriteria] ?? '') : undefined,
        attachments,
        raw: f,
      };
    },
    async postComment(key, body) {
      const r = await req(`/rest/api/3/issue/${encodeURIComponent(key)}/comment`, {
        method: 'POST',
        body: JSON.stringify({
          body: { type: 'doc', version: 1, content: [{ type: 'paragraph', content: [{ type: 'text', text: body }] }] },
        }),
      });
      const json = (await r.json()) as { id: string };
      return { id: json.id };
    },
    async transitionStatus(key, statusName) {
      const tr = await req(`/rest/api/3/issue/${encodeURIComponent(key)}/transitions`);
      const json = (await tr.json()) as { transitions: Array<{ id: string; name: string }> };
      const t = json.transitions.find(x => x.name === statusName);
      if (!t) throw new Error(`No transition named "${statusName}" available for ${key}`);
      await req(`/rest/api/3/issue/${encodeURIComponent(key)}/transitions`, {
        method: 'POST',
        body: JSON.stringify({ transition: { id: t.id } }),
      });
    },
    async listFields(sampleKey) {
      const r = await req(`/rest/api/3/issue/${encodeURIComponent(sampleKey)}?fields=*all`);
      const json = (await r.json()) as { fields: Record<string, unknown> };
      return Object.entries(json.fields).map(([id, value]) => ({
        id,
        name: id,
        hasContent: value !== null && value !== undefined && value !== '',
      }));
    },
  };
}
```

- [x] **Step 4: Tests pass + commit**

```bash
cd packages/core && npx vitest run
git add packages/core/src/jira/rest-backend.ts packages/core/test/jira/rest-backend.test.ts
git commit -m "core: add Jira REST backend with auth + field mapping"
```

---

### Task 2.3: MCP backend (placeholder + detection)

**Files:**
- Create: `packages/core/src/jira/mcp-backend.ts`

- [x] **Step 1: Implement minimal MCP shim**

The MCP integration runs only when xera is invoked from within a Claude Code session that exposes the Atlassian MCP. In `xera-internal` (Node process), MCP tools are not directly callable; instead the skill calls them and writes results to disk. So this backend, when used from `xera-internal`, simply detects MCP-ness via an env var the skill sets, and delegates by reading/writing well-known files.

```ts
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { JiraClient, JiraFieldMap, JiraTicket } from './types';

const MCP_ENV = 'XERA_MCP_JIRA';

export async function createMcpBackend(_baseUrl: string): Promise<JiraClient | null> {
  if (process.env[MCP_ENV] !== '1') return null;
  const tmpDir = join(tmpdir(), 'xera-mcp');
  mkdirSync(tmpDir, { recursive: true });

  return {
    backend: 'mcp',
    async fetchTicket(key, _fields): Promise<JiraTicket> {
      const cachePath = join(tmpDir, `${key}.json`);
      if (!existsSync(cachePath)) {
        throw new Error(
          `MCP-mode fetch requires the skill to first call mcp__atlassian__getJiraIssue and write ${cachePath}. ` +
            `If you are running this directly, unset ${MCP_ENV} to use REST.`,
        );
      }
      const parsed = JSON.parse(readFileSync(cachePath, 'utf8')) as JiraTicket;
      return parsed;
    },
    async postComment(key, body) {
      const outPath = join(tmpDir, `${key}.comment.json`);
      writeFileSync(outPath, JSON.stringify({ key, body }));
      // The skill will read this file and call mcp__atlassian__addCommentToJiraIssue.
      return { id: 'mcp-pending' };
    },
    async transitionStatus(key, statusName) {
      const outPath = join(tmpDir, `${key}.transition.json`);
      writeFileSync(outPath, JSON.stringify({ key, statusName }));
    },
    async listFields(_sampleKey) {
      throw new Error('listFields is REST-only; init flow uses REST for field discovery.');
    },
  };
}
```

- [x] **Step 2: Commit**

```bash
git add packages/core/src/jira/mcp-backend.ts
git commit -m "core: add MCP-backed Jira shim (file-handoff)"
```

---

### Task 2.4: Field detection helper

**Files:**
- Create: `packages/core/src/jira/fields.ts`
- Create: `packages/core/test/jira/fields.test.ts`

- [x] **Step 1: Failing test**

```ts
import { describe, expect, test } from 'vitest';
import { rankStoryCandidates } from '../../src/jira/fields';

describe('rankStoryCandidates', () => {
  test('ranks "description" highest by default', () => {
    const ranked = rankStoryCandidates([
      { id: 'description', name: 'description', hasContent: true },
      { id: 'summary', name: 'summary', hasContent: true },
      { id: 'customfield_10001', name: 'customfield_10001', hasContent: true },
    ]);
    expect(ranked[0]?.id).toBe('description');
  });

  test('drops empty fields', () => {
    const ranked = rankStoryCandidates([
      { id: 'description', name: 'description', hasContent: false },
      { id: 'customfield_10001', name: 'customfield_10001', hasContent: true },
    ]);
    expect(ranked.map(f => f.id)).toEqual(['customfield_10001']);
  });
});
```

- [x] **Step 2: Run failing**

```bash
cd packages/core && npx vitest run test/jira/fields.test.ts
```

- [x] **Step 3: Implement**

```ts
const PREFERRED_STORY_IDS = ['description', 'story'];

export interface JiraFieldInfo {
  id: string;
  name: string;
  hasContent: boolean;
}

export function rankStoryCandidates(fields: JiraFieldInfo[]): JiraFieldInfo[] {
  return fields
    .filter(f => f.hasContent)
    .filter(f => !['attachment', 'comment', 'created', 'updated', 'reporter', 'creator'].includes(f.id))
    .sort((a, b) => {
      const ai = PREFERRED_STORY_IDS.indexOf(a.id);
      const bi = PREFERRED_STORY_IDS.indexOf(b.id);
      if (ai >= 0 && bi >= 0) return ai - bi;
      if (ai >= 0) return -1;
      if (bi >= 0) return 1;
      return a.id.localeCompare(b.id);
    });
}
```

- [x] **Step 4: Tests pass + commit**

```bash
cd packages/core && npx vitest run
git add packages/core/src/jira/fields.ts packages/core/test/jira/fields.test.ts
git commit -m "core: rank Jira field candidates for story/AC detection"
```

---

### Task 2.5: Retry/backoff wrapper

**Files:**
- Create: `packages/core/src/jira/retry.ts`
- Create: `packages/core/test/jira/retry.test.ts`

- [x] **Step 1: Failing test**

```ts
import { describe, expect, test } from 'vitest';
import { withRetry } from '../../src/jira/retry';

describe('withRetry', () => {
  test('retries up to maxAttempts with exponential backoff', async () => {
    let calls = 0;
    const result = await withRetry(
      async () => {
        calls++;
        if (calls < 3) throw new Error('transient');
        return 'ok';
      },
      { maxAttempts: 5, baseMs: 1, factor: 2 },
    );
    expect(result).toBe('ok');
    expect(calls).toBe(3);
  });

  test('throws original error after maxAttempts', async () => {
    let calls = 0;
    await expect(
      withRetry(async () => { calls++; throw new Error('nope'); }, { maxAttempts: 3, baseMs: 1, factor: 2 }),
    ).rejects.toThrow('nope');
    expect(calls).toBe(3);
  });

  test('does not retry when shouldRetry returns false', async () => {
    let calls = 0;
    await expect(
      withRetry(
        async () => { calls++; throw new Error('401'); },
        { maxAttempts: 5, baseMs: 1, factor: 2, shouldRetry: e => !/401/.test(String(e)) },
      ),
    ).rejects.toThrow('401');
    expect(calls).toBe(1);
  });
});
```

- [x] **Step 2: Run failing + implement**

```ts
export interface RetryOptions {
  maxAttempts: number;
  baseMs: number;
  factor: number;
  shouldRetry?: (err: unknown) => boolean;
}

export async function withRetry<T>(fn: () => Promise<T>, opts: RetryOptions): Promise<T> {
  let attempt = 0;
  let lastErr: unknown;
  while (attempt < opts.maxAttempts) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (opts.shouldRetry && !opts.shouldRetry(err)) throw err;
      attempt++;
      if (attempt >= opts.maxAttempts) break;
      const delay = opts.baseMs * Math.pow(opts.factor, attempt - 1);
      await new Promise(r => setTimeout(r, delay));
    }
  }
  throw lastErr;
}
```

- [x] **Step 3: Tests pass + commit**

```bash
cd packages/core && npx vitest run
git add packages/core/src/jira/retry.ts packages/core/test/jira/retry.test.ts
git commit -m "core: add exponential-backoff retry helper"
```

---

## Phase 3 — Auth state manager

### Task 3.1: AES-256-GCM encryption helpers

**Files:**
- Create: `packages/core/src/auth/encrypt.ts`
- Create: `packages/core/test/auth/encrypt.test.ts`

- [x] **Step 1: Failing tests**

```ts
import { describe, expect, test } from 'vitest';
import { encrypt, decrypt, generateKey } from '../../src/auth/encrypt';

describe('AES-256-GCM helpers', () => {
  test('round-trips plaintext', () => {
    const key = generateKey();
    const ct = encrypt('hello world', key);
    expect(ct.startsWith('v1:')).toBe(true);
    expect(decrypt(ct, key)).toBe('hello world');
  });

  test('different keys produce different ciphertext for same plaintext', () => {
    const k1 = generateKey();
    const k2 = generateKey();
    expect(encrypt('x', k1)).not.toBe(encrypt('x', k2));
  });

  test('decrypt with wrong key throws', () => {
    const k1 = generateKey();
    const k2 = generateKey();
    const ct = encrypt('hello', k1);
    expect(() => decrypt(ct, k2)).toThrow();
  });

  test('tampered ciphertext throws (GCM auth)', () => {
    const k = generateKey();
    const ct = encrypt('hello', k);
    const tampered = ct.slice(0, -2) + (ct.endsWith('A') ? 'B' : 'A');
    expect(() => decrypt(tampered, k)).toThrow();
  });

  test('generateKey returns 64-hex-char string', () => {
    const k = generateKey();
    expect(k).toMatch(/^[0-9a-f]{64}$/);
  });
});
```

- [x] **Step 2: Run failing**

```bash
cd packages/core && npx vitest run test/auth/encrypt.test.ts
```

- [x] **Step 3: Implement**

```ts
import { randomBytes, createCipheriv, createDecipheriv } from 'node:crypto';

const ALGO = 'aes-256-gcm';
const KEY_LEN = 32; // bytes (256 bits)
const IV_LEN = 12;  // recommended for GCM
const TAG_LEN = 16;
const VERSION = 'v1';

export function generateKey(): string {
  return randomBytes(KEY_LEN).toString('hex');
}

function keyToBuf(key: string): Buffer {
  const buf = Buffer.from(key, 'hex');
  if (buf.length !== KEY_LEN) throw new Error(`Key must be ${KEY_LEN} bytes (got ${buf.length})`);
  return buf;
}

export function encrypt(plaintext: string, keyHex: string): string {
  const key = keyToBuf(keyHex);
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv(ALGO, key, iv);
  const ct = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${VERSION}:${iv.toString('base64')}:${tag.toString('base64')}:${ct.toString('base64')}`;
}

export function decrypt(ciphertext: string, keyHex: string): string {
  const [version, ivB64, tagB64, ctB64] = ciphertext.split(':');
  if (version !== VERSION) throw new Error(`Unsupported ciphertext version: ${version}`);
  if (!ivB64 || !tagB64 || !ctB64) throw new Error('Malformed ciphertext');
  const key = keyToBuf(keyHex);
  const iv = Buffer.from(ivB64, 'base64');
  const tag = Buffer.from(tagB64, 'base64');
  const ct = Buffer.from(ctB64, 'base64');
  if (tag.length !== TAG_LEN) throw new Error('Bad auth tag length');
  const decipher = createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ct), decipher.final()]).toString('utf8');
}
```

- [x] **Step 4: Tests pass + commit**

```bash
cd packages/core && npx vitest run
git add packages/core/src/auth/encrypt.ts packages/core/test/auth/encrypt.test.ts
git commit -m "core: add AES-256-GCM encrypt/decrypt with versioned envelope"
```

---

### Task 3.2: Auth key resolution

**Files:**
- Create: `packages/core/src/auth/key.ts`
- Create: `packages/core/test/auth/key.test.ts`

- [x] **Step 1: Failing test**

```ts
import { describe, expect, test } from 'vitest';
import { resolveAuthKey, AUTH_KEY_ENV } from '../../src/auth/key';

describe('resolveAuthKey', () => {
  test('reads XERA_AUTH_KEY from env', () => {
    process.env[AUTH_KEY_ENV] = 'a'.repeat(64);
    expect(resolveAuthKey()).toBe('a'.repeat(64));
    delete process.env[AUTH_KEY_ENV];
  });

  test('throws when missing', () => {
    delete process.env[AUTH_KEY_ENV];
    expect(() => resolveAuthKey()).toThrow(/XERA_AUTH_KEY/);
  });

  test('throws when wrong length', () => {
    process.env[AUTH_KEY_ENV] = 'short';
    expect(() => resolveAuthKey()).toThrow();
    delete process.env[AUTH_KEY_ENV];
  });
});
```

- [x] **Step 2: Run failing + implement**

```ts
export const AUTH_KEY_ENV = 'XERA_AUTH_KEY';

export function resolveAuthKey(): string {
  const key = process.env[AUTH_KEY_ENV];
  if (!key) {
    throw new Error(
      `${AUTH_KEY_ENV} not set. It is auto-generated by \`xera init\` and saved to .env. ` +
        `If you deleted .env, regenerate it by running \`xera init --update\` — note that any cached auth state will be invalidated.`,
    );
  }
  if (!/^[0-9a-f]{64}$/i.test(key)) {
    throw new Error(`${AUTH_KEY_ENV} must be a 64-character hex string (32 bytes).`);
  }
  return key;
}
```

- [x] **Step 3: Tests pass + commit**

```bash
cd packages/core && npx vitest run
git add packages/core/src/auth/key.ts packages/core/test/auth/key.test.ts
git commit -m "core: resolve XERA_AUTH_KEY from env with validation"
```

---

### Task 3.3: Auth state IO (encrypted)

**Files:**
- Create: `packages/core/src/auth/state.ts`
- Create: `packages/core/test/auth/state.test.ts`

- [x] **Step 1: Failing test**

```ts
import { describe, expect, test } from 'vitest';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { generateKey } from '../../src/auth/encrypt';
import { writeAuthState, readAuthState, type AuthStateEntry } from '../../src/auth/state';
import { AUTH_KEY_ENV } from '../../src/auth/key';

describe('auth state IO', () => {
  test('round-trips encrypted', () => {
    const dir = mkdtempSync(join(tmpdir(), 'xera-auth-'));
    const key = generateKey();
    process.env[AUTH_KEY_ENV] = key;
    const entry: AuthStateEntry = {
      role: 'admin',
      strategy: 'storageState',
      created_at: '2026-05-14T10:00:00.000Z',
      expires_at: '2026-05-14T18:00:00.000Z',
      payload: { cookies: [{ name: 's', value: 'secret', domain: 'x' }], origins: [] },
    };
    writeAuthState(dir, entry);
    const onDisk = readFileSync(join(dir, 'admin.json'), 'utf8');
    expect(onDisk).not.toContain('secret'); // confirms encryption
    const decoded = readAuthState(dir, 'admin');
    expect(decoded).toEqual(entry);
    delete process.env[AUTH_KEY_ENV];
    rmSync(dir, { recursive: true });
  });

  test('readAuthState returns null when missing', () => {
    process.env[AUTH_KEY_ENV] = 'a'.repeat(64);
    const dir = mkdtempSync(join(tmpdir(), 'xera-auth-'));
    expect(readAuthState(dir, 'nobody')).toBeNull();
    delete process.env[AUTH_KEY_ENV];
    rmSync(dir, { recursive: true });
  });
});
```

- [x] **Step 2: Run failing**

```bash
cd packages/core && npx vitest run test/auth/state.test.ts
```

- [x] **Step 3: Implement**

```ts
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';
import { encrypt, decrypt } from './encrypt';
import { resolveAuthKey } from './key';

export const AuthStateEntrySchema = z.object({
  role: z.string(),
  strategy: z.enum(['storageState', 'apiToken']),
  created_at: z.string(),
  expires_at: z.string(),
  payload: z.record(z.string(), z.unknown()),
});
export type AuthStateEntry = z.infer<typeof AuthStateEntrySchema>;

function pathFor(authDir: string, role: string): string {
  return join(authDir, `${role}.json`);
}

export function writeAuthState(authDir: string, entry: AuthStateEntry): void {
  mkdirSync(authDir, { recursive: true });
  const ct = encrypt(JSON.stringify(entry), resolveAuthKey());
  writeFileSync(pathFor(authDir, entry.role), ct);
}

export function readAuthState(authDir: string, role: string): AuthStateEntry | null {
  const p = pathFor(authDir, role);
  if (!existsSync(p)) return null;
  const txt = readFileSync(p, 'utf8');
  const plain = decrypt(txt, resolveAuthKey());
  return AuthStateEntrySchema.parse(JSON.parse(plain));
}
```

- [x] **Step 4: Tests pass + commit**

```bash
cd packages/core && npx vitest run
git add packages/core/src/auth/state.ts packages/core/test/auth/state.test.ts
git commit -m "core: add encrypted auth-state IO"
```

---

### Task 3.4: TTL parsing and refresh decision

**Files:**
- Create: `packages/core/src/auth/refresh.ts`
- Create: `packages/core/test/auth/refresh.test.ts`

- [x] **Step 1: Failing tests**

```ts
import { describe, expect, test } from 'vitest';
import { parseDuration, needsRefresh, type AuthStateEntry } from '../../src/auth/refresh';

describe('parseDuration', () => {
  test('parses h/m/s', () => {
    expect(parseDuration('8h')).toBe(8 * 3600 * 1000);
    expect(parseDuration('30m')).toBe(30 * 60 * 1000);
    expect(parseDuration('45s')).toBe(45 * 1000);
  });
  test('rejects bad input', () => {
    expect(() => parseDuration('forever')).toThrow();
  });
});

describe('needsRefresh', () => {
  const now = new Date('2026-05-14T12:00:00Z');
  const baseEntry: AuthStateEntry = {
    role: 'admin',
    strategy: 'storageState',
    created_at: '2026-05-14T04:00:00.000Z',
    expires_at: '2026-05-14T18:00:00.000Z',
    payload: {},
  };

  test('missing entry needs refresh', () => {
    expect(needsRefresh(null, { ttl: '8h', refreshBuffer: '30m' }, now)).toBe(true);
  });
  test('entry within ttl and not expiring soon: no refresh', () => {
    expect(needsRefresh(baseEntry, { ttl: '24h', refreshBuffer: '30m' }, now)).toBe(false);
  });
  test('entry older than ttl: refresh', () => {
    expect(needsRefresh(baseEntry, { ttl: '4h', refreshBuffer: '30m' }, now)).toBe(true);
  });
  test('expires within refreshBuffer: refresh', () => {
    expect(needsRefresh(baseEntry, { ttl: '24h', refreshBuffer: '7h' }, now)).toBe(true);
  });
});
```

- [x] **Step 2: Run failing + implement**

```ts
import type { AuthStateEntry } from './state';
export type { AuthStateEntry } from './state';

const RE = /^(\d+)([hms])$/;

export function parseDuration(d: string): number {
  const m = RE.exec(d);
  if (!m) throw new Error(`Bad duration "${d}" — expected e.g. "8h", "30m", "45s"`);
  const n = Number(m[1]);
  const unit = m[2]!;
  if (unit === 'h') return n * 3600 * 1000;
  if (unit === 'm') return n * 60 * 1000;
  return n * 1000;
}

export interface RefreshPolicy { ttl: string; refreshBuffer: string; }

export function needsRefresh(
  entry: AuthStateEntry | null,
  policy: RefreshPolicy,
  now: Date = new Date(),
): boolean {
  if (!entry) return true;
  const ttlMs = parseDuration(policy.ttl);
  const bufMs = parseDuration(policy.refreshBuffer);
  const createdAt = new Date(entry.created_at).getTime();
  if (now.getTime() - createdAt > ttlMs) return true;
  const expiresAt = new Date(entry.expires_at).getTime();
  if (expiresAt - now.getTime() < bufMs) return true;
  return false;
}
```

- [x] **Step 3: Tests pass + commit**

```bash
cd packages/core && npx vitest run
git add packages/core/src/auth/refresh.ts packages/core/test/auth/refresh.test.ts
git commit -m "core: add auth refresh policy (TTL + buffer)"
```

---

### Task 3.5: Public re-exports for jira + auth

**Files:**
- Modify: `packages/core/src/index.ts`

- [x] **Step 1: Update re-exports**

```ts
export const VERSION = '0.1.0';
export type * from './adapter/types';
export * from './config/schema';
export * from './config/define';
export * from './config/load';
export * from './artifact/paths';
export * from './artifact/hash';
export * from './artifact/meta';
export * from './artifact/status';
export * from './logging/ndjson-logger';
export * from './lock/file-lock';
export * from './jira/types';
export * from './jira/client';
export * from './jira/fields';
export * from './jira/retry';
export * from './auth/encrypt';
export * from './auth/key';
export * from './auth/state';
export * from './auth/refresh';
```

- [x] **Step 2: Typecheck + commit**

```bash
cd packages/core && npm run typecheck
git add packages/core/src/index.ts
git commit -m "core: re-export jira + auth modules"
```

---

## End of Plan 01

At this point `@xera-ai/core` has all foundation modules with passing tests. CI should be green.

Verify:

```bash
npm run lint
npm run typecheck
npx vitest run
```

Tag and push:

```bash
git tag -a v0.1.0-foundation -m "Phase 0-3 complete"
git push --tags
```

Continue with [Plan 02: Web Adapter](2026-05-14-xera-v01-02-web-adapter.md).
