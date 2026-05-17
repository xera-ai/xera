# xera v0.8 — Plan 02: Coverage CLI Surface & Skill (REVISED)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **REVISION NOTE (2026-05-17):** Initial Plan 02 referenced incorrect v0.6 internals (wrong helper names, wrong `defineConfig` semantics, mismatched skill frontmatter shape, separate edge arrays in seed data). This revision uses the actual patterns from `packages/core/src/bin-internal/impact-prepare.ts` (binary template), `packages/skills/xera-impact.md` (skill template), `packages/cli/src/checks.ts` (doctor extension point), and `packages/core/src/config/schema.ts` (`.prefault({})` pattern).

**Goal:** Add the optional `coverage` sub-schema to `XeraConfigSchema`, build the `coverage-prepare` xera-internal subcommand, ship the `/xera-coverage` skill `.md` (default list / `--why` / `--json` / `--all` / `--viewer` flag pass-through; `--viewer` is no-op stub until Plan 04), and extend `runChecks` in `packages/cli/src/checks.ts` with coverage-related checks. End state: a user in a v0.8.0-alpha project can run `/xera-coverage` and see the area-level + AC-level report. AC backfill orchestration is a stub (skill warns if `acBackfillNeeded=true`); Plan 03 wires the real flow.

**Architecture:** Config block validated by Zod (`.prefault({})` style, parsed in `loadConfig`). Binary follows `impact-prepare.ts` exactly: `xxxCmd(argv: string[]): Promise<number>` signature, imports from `@xera-ai/core` (Plan 01 barrel) + `deriveSnapshot(loadAllEvents(repoRoot))`, writes JSON + markdown via `node:fs`, emits event via `appendEvents` helper. Subcommand is registered in `bin-internal/index.ts` `COMMANDS` map. Skill .md mirrors `xera-impact.md` frontmatter shape (just `name` + `description`). Doctor checks live in `packages/cli/src/checks.ts` `runChecks` function.

**Tech Stack:** TypeScript, `bun:test`, Zod.

**Prereqs:** Plan 01 complete (`@xera-ai/core/coverage` barrel exists and exports `CoverageConfig`, `DEFAULT_COVERAGE_CONFIG`, `buildCoverageReport`, `renderMarkdown`, `buildWhyArea`, `buildWhyTicket`). The following v0.6 helpers are also used:

- `deriveSnapshot(events)`, `loadAllEvents(repoRoot)`, `appendEvents(repoRoot, events, opts)` from `packages/core/src/graph/store.ts`
- `graphPaths(repoRoot)` returns `{ snapshotFile, eventsDir, eventsMonthDir, eventFile }` from `packages/core/src/graph/paths.ts`
- `ulid()` from `packages/core/src/graph/ulid.ts` (re-exported via `@xera-ai/core`)
- `loadConfig(cwd)` from `packages/core/src/config/load.ts` returns `XeraConfig`
- `XeraConfigSchema` from `packages/core/src/config/schema.ts`
- `runChecks(cwd)` from `packages/cli/src/checks.ts`

**Naming conventions (from v0.6):**

| Concept | Name |
|---|---|
| Config type | `XeraConfig` (NOT `Config`) |
| Config schema | `XeraConfigSchema` |
| `defineConfig` | identity function (no Zod parse); parse happens in `loadConfig` |
| Subcommand fn signature | `xxxCmd(argv: string[]): Promise<number>` |
| Event shape | `{ event_id, schema_version, ts, actor, type, payload }` |
| Event discriminator | `type` |
| Snapshot file path | `graphPaths(cwd).snapshotFile` (NOT `paths.snapshot`) |
| Doctor extension | `runChecks` in `packages/cli/src/checks.ts` (NOT `runDoctor`) |

**Plan scope:** v0.8.0 user-facing surface for area + AC coverage reporting. `--viewer` flag is wired through skill, but the viewer effect is no-op until Plan 04 ships `graph-render --include-coverage`. AC backfill is Plan 03. Generative `/xera-fill-gap` is Plan 05.

---

## Phase 11 — Config schema addition

### Task 11.1: Add `coverage` block to `XeraConfigSchema`

**Files:**
- Modify: `packages/core/src/config/schema.ts`
- Test: `packages/core/test/config/schema.test.ts` (create if absent)

- [ ] **Step 1: Write the failing test**

```ts
import { describe, test, expect } from 'bun:test';
import { XeraConfigSchema } from '../../src/config/schema';

function validBase() {
  return {
    jira: {
      baseUrl: 'https://example.atlassian.net',
      projectKeys: ['PROJ'],
      fields: { story: 'description' },
    },
    web: {
      baseUrl: { local: 'http://localhost:3000' },
      defaultEnv: 'local',
    },
    adapters: ['web'],
  };
}

describe('XeraConfigSchema.coverage', () => {
  test('coverage block is optional; defaults fill when absent', () => {
    const parsed = XeraConfigSchema.parse(validBase());
    expect(parsed.coverage).toEqual({
      staleAfterDays: 30,
      criticalAreas: [],
      autoSnapshotOnCoverage: true,
    });
  });

  test('user-supplied coverage overrides defaults', () => {
    const parsed = XeraConfigSchema.parse({
      ...validBase(),
      coverage: {
        staleAfterDays: 14,
        criticalAreas: ['checkout', 'auth'],
        autoSnapshotOnCoverage: false,
      },
    });
    expect(parsed.coverage.staleAfterDays).toBe(14);
    expect(parsed.coverage.criticalAreas).toEqual(['checkout', 'auth']);
    expect(parsed.coverage.autoSnapshotOnCoverage).toBe(false);
  });

  test('rejects negative staleAfterDays', () => {
    expect(() =>
      XeraConfigSchema.parse({
        ...validBase(),
        coverage: { staleAfterDays: -1 },
      }),
    ).toThrow();
  });

  test('rejects criticalAreas containing non-slug strings', () => {
    expect(() =>
      XeraConfigSchema.parse({
        ...validBase(),
        coverage: { criticalAreas: ['Has Space'] },
      }),
    ).toThrow();
  });
});
```

- [ ] **Step 2: Verify failure**

```bash
cd packages/core && bun test test/config/schema.test.ts
```

Expected: `coverage` undefined on parsed object.

- [ ] **Step 3: Add `CoverageSchema` + extend `XeraConfigSchema`**

In `packages/core/src/config/schema.ts`, BEFORE the top-level `XeraConfigSchema`:

```ts
const CoverageSchema = z
  .object({
    staleAfterDays: z.number().int().positive().default(30),
    criticalAreas: z.array(z.string().regex(/^[a-z0-9-]+$/)).default([]),
    autoSnapshotOnCoverage: z.boolean().default(true),
  })
  .prefault({});
```

In `XeraConfigSchema`'s inner `z.object({...})`, add a new property:

```ts
export const XeraConfigSchema = z
  .object({
    jira: JiraSchema,
    web: WebSchema.optional(),
    http: HttpSchema.optional(),
    ai: AISchema,
    reporting: ReportingSchema,
    run: RunSchema.prefault({}),
    coverage: CoverageSchema,                      // NEW
    adapters: z.array(z.enum(['web', 'http'])).min(1).default(['web']),
  })
  .refine((c) => c.web !== undefined || c.http !== undefined, { /* unchanged */ })
  .refine((c) => c.adapters.every((a) => (a === 'web' ? c.web : c.http) !== undefined), { /* unchanged */ });
```

- [ ] **Step 4: Verify pass**

```bash
cd packages/core && bun test test/config/schema.test.ts
```

Expected: 4 passes + existing tests still green.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/config/schema.ts packages/core/test/config/schema.test.ts
git commit -m "feat(core): add coverage block to XeraConfigSchema"
```

---

## Phase 12 — `coverage-prepare` binary scaffold

### Task 12.1: Stub the subcommand + register in dispatcher

**Files:**
- Create: `packages/core/src/bin-internal/coverage-prepare.ts`
- Modify: `packages/core/src/bin-internal/index.ts`
- Test: `packages/core/test/bin-internal/coverage-prepare.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, test, expect } from 'bun:test';
import { coveragePrepareCmd } from '../../src/bin-internal/coverage-prepare';

describe('coverage-prepare subcommand', () => {
  test('exports coveragePrepareCmd that returns Promise<number>', () => {
    expect(typeof coveragePrepareCmd).toBe('function');
    const r = coveragePrepareCmd(['--help']);
    expect(r).toBeInstanceOf(Promise);
  });
});
```

- [ ] **Step 2: Verify failure**

```bash
cd packages/core && bun test test/bin-internal/coverage-prepare.test.ts
```

Expected: module not found.

- [ ] **Step 3: Stub + register**

Create `packages/core/src/bin-internal/coverage-prepare.ts`:

```ts
export async function coveragePrepareCmd(_argv: string[]): Promise<number> {
  // implemented in Task 12.2+
  console.error('[coverage-prepare] not implemented');
  return 4;
}
```

In `packages/core/src/bin-internal/index.ts`, add import + register in `COMMANDS`:

```ts
import { coveragePrepareCmd } from './coverage-prepare';

const COMMANDS: Record<string, (argv: string[]) => Promise<number>> = {
  // ... existing entries ...
  'coverage-prepare': coveragePrepareCmd,
};
```

- [ ] **Step 4: Verify pass**

```bash
cd packages/core && bun test test/bin-internal/coverage-prepare.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/bin-internal/coverage-prepare.ts packages/core/src/bin-internal/index.ts packages/core/test/bin-internal/coverage-prepare.test.ts
git commit -m "feat(core): scaffold coverage-prepare subcommand"
```

---

### Task 12.2: Core flow — load config + snapshot, compute report, write JSON + markdown

**Files:**
- Modify: `packages/core/src/bin-internal/coverage-prepare.ts`
- Modify: `packages/core/test/bin-internal/coverage-prepare.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

function makeProject(snapshotJson: object): string {
  const dir = mkdtempSync(join(tmpdir(), 'xera-coverage-'));
  mkdirSync(join(dir, '.xera', 'graph'), { recursive: true });
  writeFileSync(
    join(dir, 'xera.config.ts'),
    `import { defineConfig } from '@xera-ai/core';\n` +
    `export default defineConfig({\n` +
    `  jira: { baseUrl: 'https://example.atlassian.net', projectKeys: ['PROJ'], fields: { story: 'description' } },\n` +
    `  web: { baseUrl: { local: 'http://localhost:3000' }, defaultEnv: 'local' },\n` +
    `  adapters: ['web'],\n` +
    `});\n`,
  );
  // Coverage-prepare reads events (via loadAllEvents) and derives snapshot on the fly.
  // For test fixtures, we seed events JSONL instead of snapshot.json (since deriveSnapshot
  // is the canonical builder).
  // Empty events => empty snapshot is fine for the smoke test.
  return dir;
}

describe('coverage-prepare end-to-end', () => {
  test('writes report.json + report.md to .xera/coverage/ with empty events', async () => {
    const dir = makeProject({});
    const prevCwd = process.cwd();
    process.chdir(dir);
    try {
      const code = await coveragePrepareCmd(['--snapshot-ts', '2026-05-17T10:00:00.000Z', '--no-emit-event']);
      expect(code).toBe(0);
      const json = JSON.parse(readFileSync(join(dir, '.xera/coverage/report.json'), 'utf8'));
      expect(json.windowDays).toBe(30);
      expect(json.areas).toEqual([]);
      const md = readFileSync(join(dir, '.xera/coverage/report.md'), 'utf8');
      expect(md).toContain('Coverage report');
    } finally {
      process.chdir(prevCwd);
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
```

Note: this test calls `process.chdir(dir)` then restores in `finally`. CLAUDE.md flags `fixtures/golden-tickets/` resolution as cwd-sensitive — restoring cwd is non-negotiable.

- [ ] **Step 2: Verify failure**

```bash
cd packages/core && bun test test/bin-internal/coverage-prepare.test.ts
```

Expected: returns 4 / "not implemented".

- [ ] **Step 3: Implement core flow**

Replace `packages/core/src/bin-internal/coverage-prepare.ts` with:

```ts
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadConfig } from '../config/load';
import {
  buildCoverageReport,
  renderMarkdown,
  type RenderOptions,
} from '../coverage';
import { deriveSnapshot, loadAllEvents } from '../graph/store';

interface ParsedArgs {
  snapshotTs?: string;
  emitEvent: boolean;
  why?: string;
  json: boolean;
  all: boolean;
}

function parseArgs(argv: string[]): ParsedArgs {
  const args: ParsedArgs = { emitEvent: true, json: false, all: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--snapshot-ts') args.snapshotTs = argv[++i];
    else if (a === '--no-emit-event') args.emitEvent = false;
    else if (a === '--why') args.why = argv[++i];
    else if (a === '--json') args.json = true;
    else if (a === '--all') args.all = true;
    else {
      console.error(`[coverage-prepare] unknown flag: ${a}`);
      return { ...args, emitEvent: false };
    }
  }
  return args;
}

export async function coveragePrepareCmd(argv: string[]): Promise<number> {
  const args = parseArgs(argv);

  const cwd = process.cwd();
  let config;
  try {
    config = await loadConfig(cwd);
  } catch (e) {
    console.error(`[coverage-prepare] ${(e as Error).message}`);
    return 2;
  }

  const events = loadAllEvents(cwd);
  const snap = deriveSnapshot(events);

  const now = args.snapshotTs ? new Date(args.snapshotTs) : new Date();
  const report = buildCoverageReport(snap, config.coverage, now);

  if (args.json) {
    process.stdout.write(JSON.stringify(report, null, 2) + '\n');
    return 0;
  }

  const outDir = join(cwd, '.xera/coverage');
  mkdirSync(outDir, { recursive: true });
  const reportJsonPath = join(outDir, 'report.json');
  const reportMdPath = join(outDir, 'report.md');
  writeFileSync(reportJsonPath, JSON.stringify(report, null, 2));
  const renderOpts: RenderOptions = { includeCovered: args.all };
  writeFileSync(reportMdPath, renderMarkdown(report, renderOpts));

  return 0;
}
```

- [ ] **Step 4: Verify pass**

```bash
cd packages/core && bun test test/bin-internal/coverage-prepare.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/bin-internal/coverage-prepare.ts packages/core/test/bin-internal/coverage-prepare.test.ts
git commit -m "feat(core): coverage-prepare loads snapshot + writes report.json/md"
```

---

## Phase 13 — `--why` drill-down

### Task 13.1: `--why <area-or-ticket>` prints drill-down to stdout

**Files:**
- Modify: `packages/core/src/bin-internal/coverage-prepare.ts`
- Modify: `packages/core/test/bin-internal/coverage-prepare.test.ts`

- [ ] **Step 1: Write the failing test**

Add to the test file (and import a small helper to seed events):

```ts
import { appendEvents } from '../../src/graph/store';
import type { Event } from '../../src/graph/types';

function eid(seed: string): string {
  return ('01HXYZ' + seed.replace(/[^0-9]/g, '')).padEnd(26, '0').slice(0, 26);
}

function captureStdout(fn: () => Promise<unknown>): Promise<string> {
  const original = process.stdout.write.bind(process.stdout);
  const captured: string[] = [];
  (process.stdout as { write: typeof process.stdout.write }).write =
    ((chunk: string | Uint8Array) => {
      captured.push(typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString('utf8'));
      return true;
    }) as typeof process.stdout.write;
  return fn().finally(() => {
    (process.stdout as { write: typeof process.stdout.write }).write = original;
  }).then(() => captured.join(''));
}

test('--why <area> prints area drill-down', async () => {
  const dir = makeProject({});
  const events: Event[] = [
    {
      event_id: eid('20260515100000a'), schema_version: 1,
      ts: '2026-05-15T10:00:00.000Z', actor: 'test',
      type: 'ticket.fetched',
      payload: {
        ticketId: 'PROJ-1', summary: 'Add feature', ac: [],
        jiraLinks: [], storyHash: 'h', modifiesAreas: ['checkout'],
      },
    },
  ];
  appendEvents(dir, events, { skill: 'fetch', ticketId: 'PROJ-1' });
  const prevCwd = process.cwd();
  process.chdir(dir);
  try {
    const stdout = await captureStdout(() =>
      coveragePrepareCmd(['--snapshot-ts', '2026-05-17T10:00:00.000Z', '--no-emit-event', '--why', 'checkout']),
    );
    expect(stdout).toContain('Area: checkout');
    expect(stdout).toContain('UNCOVERED');
    expect(stdout).toContain('PROJ-1');
  } finally {
    process.chdir(prevCwd);
    rmSync(dir, { recursive: true, force: true });
  }
});

test('--why <ticket-id> prints ticket drill-down', async () => {
  const dir = makeProject({});
  const events: Event[] = [
    {
      event_id: eid('20260512100000b'), schema_version: 1,
      ts: '2026-05-12T10:00:00.000Z', actor: 'test',
      type: 'ticket.fetched',
      payload: {
        ticketId: 'PROJ-105', summary: 'Add tax',
        ac: ['Subtotal', 'Tax'],
        jiraLinks: [], storyHash: 'h', modifiesAreas: [],
      },
    },
  ];
  appendEvents(dir, events, { skill: 'fetch', ticketId: 'PROJ-105' });
  const prevCwd = process.cwd();
  process.chdir(dir);
  try {
    const stdout = await captureStdout(() =>
      coveragePrepareCmd(['--snapshot-ts', '2026-05-17T10:00:00.000Z', '--no-emit-event', '--why', 'PROJ-105']),
    );
    expect(stdout).toContain('Ticket: PROJ-105');
    expect(stdout).toContain('0/2 ACs covered');
    expect(stdout).toContain('✗ AC-0  Subtotal');
  } finally {
    process.chdir(prevCwd);
    rmSync(dir, { recursive: true, force: true });
  }
});
```

- [ ] **Step 2: Verify failure**

```bash
cd packages/core && bun test test/bin-internal/coverage-prepare.test.ts
```

- [ ] **Step 3: Implement `--why` dispatch**

In `packages/core/src/bin-internal/coverage-prepare.ts`, AFTER computing `snap` and `now`, BEFORE the JSON / file-write branches, add:

```ts
import { buildWhyArea, buildWhyTicket } from '../coverage';

const TICKET_RE = /^[A-Z][A-Z0-9]*-\d+$/;

// ...inside coveragePrepareCmd, after `const now = ...`:
if (args.why) {
  const out = TICKET_RE.test(args.why)
    ? buildWhyTicket(args.why, snap, config.coverage, now)
    : buildWhyArea(args.why, snap, config.coverage, now);
  process.stdout.write(out);
  return 0;
}
```

- [ ] **Step 4: Verify pass**

```bash
cd packages/core && bun test test/bin-internal/coverage-prepare.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/bin-internal/coverage-prepare.ts packages/core/test/bin-internal/coverage-prepare.test.ts
git commit -m "feat(core): coverage-prepare --why <area-or-ticket>"
```

---

## Phase 14 — Snapshot event emission

### Task 14.1: Emit `coverage.snapshot` event via `appendEvents`

**Files:**
- Modify: `packages/core/src/bin-internal/coverage-prepare.ts`
- Modify: `packages/core/test/bin-internal/coverage-prepare.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { readdirSync } from 'node:fs';

test('emits coverage.snapshot event when emitEvent=true and config.autoSnapshotOnCoverage=true', async () => {
  const dir = makeProject({});
  const prevCwd = process.cwd();
  process.chdir(dir);
  try {
    const code = await coveragePrepareCmd(['--snapshot-ts', '2026-05-17T10:00:00.000Z']);
    expect(code).toBe(0);
    const monthDir = join(dir, '.xera/graph/events/2026-05');
    const files = readdirSync(monthDir).filter((f) => f.endsWith('.jsonl'));
    const coverageFile = files.find((f) => f.includes('-coverage-'));
    expect(coverageFile).toBeDefined();
    const content = readFileSync(join(monthDir, coverageFile!), 'utf8').trim();
    const event = JSON.parse(content);
    expect(event.type).toBe('coverage.snapshot');
    expect(event.payload.windowDays).toBe(30);
  } finally {
    process.chdir(prevCwd);
    rmSync(dir, { recursive: true, force: true });
  }
});

test('does NOT emit when --no-emit-event', async () => {
  const dir = makeProject({});
  const prevCwd = process.cwd();
  process.chdir(dir);
  try {
    await coveragePrepareCmd(['--snapshot-ts', '2026-05-17T10:00:00.000Z', '--no-emit-event']);
    const monthDir = join(dir, '.xera/graph/events/2026-05');
    let files: string[] = [];
    try { files = readdirSync(monthDir); } catch { /* not created */ }
    const coverageFile = files.find((f) => f.includes('-coverage-'));
    expect(coverageFile).toBeUndefined();
  } finally {
    process.chdir(prevCwd);
    rmSync(dir, { recursive: true, force: true });
  }
});

test('does NOT emit when --why is used', async () => {
  const dir = makeProject({});
  const prevCwd = process.cwd();
  process.chdir(dir);
  try {
    await coveragePrepareCmd(['--snapshot-ts', '2026-05-17T10:00:00.000Z', '--why', 'nonexistent']);
    const monthDir = join(dir, '.xera/graph/events/2026-05');
    let files: string[] = [];
    try { files = readdirSync(monthDir); } catch { /* not created */ }
    expect(files.filter((f) => f.includes('-coverage-')).length).toBe(0);
  } finally {
    process.chdir(prevCwd);
    rmSync(dir, { recursive: true, force: true });
  }
});

test('does NOT emit when --json (machine-readable mode)', async () => {
  const dir = makeProject({});
  const prevCwd = process.cwd();
  process.chdir(dir);
  try {
    await captureStdout(() =>
      coveragePrepareCmd(['--snapshot-ts', '2026-05-17T10:00:00.000Z', '--json']),
    );
    const monthDir = join(dir, '.xera/graph/events/2026-05');
    let files: string[] = [];
    try { files = readdirSync(monthDir); } catch { /* not created */ }
    expect(files.filter((f) => f.includes('-coverage-')).length).toBe(0);
  } finally {
    process.chdir(prevCwd);
    rmSync(dir, { recursive: true, force: true });
  }
});
```

- [ ] **Step 2: Verify failure**

```bash
cd packages/core && bun test test/bin-internal/coverage-prepare.test.ts
```

- [ ] **Step 3: Implement event emission**

Update `packages/core/src/bin-internal/coverage-prepare.ts`. After writing the report files, BEFORE `return 0`:

```ts
import { appendEvents } from '../graph/store';
import { ulid } from '../graph/ulid';
import type { Event } from '../graph/types';

// ...inside coveragePrepareCmd, after writing report.md, before return 0:
if (args.emitEvent && config.coverage.autoSnapshotOnCoverage) {
  const event: Event = {
    event_id: ulid(),
    schema_version: 1,
    ts: now.toISOString(),
    actor: 'xera-coverage',
    type: 'coverage.snapshot',
    payload: {
      ts: now.toISOString(),
      windowDays: config.coverage.staleAfterDays,
      areas: report.areas.map((a) => ({
        id: a.id, status: a.status, risk: a.risk, breakdown: a.breakdown,
      })),
      tickets: report.tickets.map((t) => ({
        id: t.id, acCount: t.acCount,
        satisfiedCount: t.satisfiedCount, gapScore: t.gapScore,
      })),
    },
  };
  appendEvents(cwd, [event], { skill: 'coverage', ticketId: 'session', now });
}
```

Also: the existing code path that handles `--why` and `--json` must return BEFORE reaching the emission block (already does, since `--why` and `--json` early-return). Verify there are no code-flow issues.

- [ ] **Step 4: Verify pass**

```bash
cd packages/core && bun test test/bin-internal/coverage-prepare.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/bin-internal/coverage-prepare.ts packages/core/test/bin-internal/coverage-prepare.test.ts
git commit -m "feat(core): coverage-prepare emits coverage.snapshot event via appendEvents"
```

---

## Phase 15 — `--all` flag end-to-end

The `--all` flag was wired in Task 12.2 (`RenderOptions.includeCovered = args.all`). This phase adds an end-to-end test.

### Task 15.1: E2E test for `--all`

**Files:**
- Modify: `packages/core/test/bin-internal/coverage-prepare.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
test('--all includes COVERED rows in markdown', async () => {
  const dir = makeProject({});
  // Seed a COVERED area: ticket + scenario + POM + recent PASS classification
  const events: Event[] = [
    {
      event_id: eid('20260510100000c'), schema_version: 1,
      ts: '2026-05-10T10:00:00.000Z', actor: 'test',
      type: 'ticket.fetched',
      payload: { ticketId: 'PROJ-1', summary: 's', ac: [], jiraLinks: [], storyHash: 'h', modifiesAreas: ['login'] },
    },
    {
      event_id: eid('20260510110000d'), schema_version: 1,
      ts: '2026-05-10T11:00:00.000Z', actor: 'test',
      type: 'scenario.generated',
      payload: {
        scenarioId: 'PROJ-1#scenario-0', ticketId: 'PROJ-1',
        name: 'Login', gherkin: '...', priority: 'p1',
        featureHash: 'h', generatedAt: '2026-05-10T11:00:00.000Z',
      },
    },
    {
      event_id: eid('20260510110001e'), schema_version: 1,
      ts: '2026-05-10T11:00:01.000Z', actor: 'test',
      type: 'pom.generated',
      payload: {
        pomId: 'LoginPage', ticketId: 'PROJ-1',
        filePath: 'p.ts', route: '/login',
        locators: [], scope: 'local',
      },
    },
    {
      event_id: eid('20260510110002f'), schema_version: 1,
      ts: '2026-05-10T11:00:02.000Z', actor: 'test',
      type: 'edge.discovered',
      payload: { kind: 'uses',   from: 'PROJ-1#scenario-0', to: 'LoginPage', source: 'xera-script' },
    },
    {
      event_id: eid('20260510110003g'), schema_version: 1,
      ts: '2026-05-10T11:00:03.000Z', actor: 'test',
      type: 'edge.discovered',
      payload: { kind: 'covers', from: 'LoginPage', to: 'login', source: 'xera-script' },
    },
    {
      event_id: eid('20260515100000h'), schema_version: 1,
      ts: '2026-05-15T10:00:00.000Z', actor: 'test',
      type: 'run.classified',
      payload: { scenarioId: 'PROJ-1#scenario-0', runId: 'r1', classification: 'PASS', confidence: 'high' },
    },
  ];
  appendEvents(dir, events, { skill: 'fetch', ticketId: 'PROJ-1' });
  const prevCwd = process.cwd();
  process.chdir(dir);
  try {
    await coveragePrepareCmd(['--snapshot-ts', '2026-05-17T10:00:00.000Z', '--no-emit-event', '--all']);
    const md = readFileSync(join(dir, '.xera/coverage/report.md'), 'utf8');
    expect(md).toContain('COVERED — 1 area');
    expect(md).toMatch(/#1\s+login/);
  } finally {
    process.chdir(prevCwd);
    rmSync(dir, { recursive: true, force: true });
  }
});

test('default (no --all) shows collapsed COVERED line', async () => {
  // Same seed data, no --all flag
  // ... (copy above seed) ...
  const dir = makeProject({});
  const events: Event[] = [/* same as above */];
  appendEvents(dir, events, { skill: 'fetch', ticketId: 'PROJ-1' });
  const prevCwd = process.cwd();
  process.chdir(dir);
  try {
    await coveragePrepareCmd(['--snapshot-ts', '2026-05-17T10:00:00.000Z', '--no-emit-event']);
    const md = readFileSync(join(dir, '.xera/coverage/report.md'), 'utf8');
    expect(md).toContain('COVERED — 1 area (collapsed; show with --all)');
    expect(md).not.toMatch(/#1\s+login/);
  } finally {
    process.chdir(prevCwd);
    rmSync(dir, { recursive: true, force: true });
  }
});
```

- [ ] **Step 2: Verify failure** (should be PASS already after Task 12.2 wired the flag)

```bash
cd packages/core && bun test test/bin-internal/coverage-prepare.test.ts
```

If both PASS without further changes, skip to Step 5. If they fail, investigate — `args.all` may not be flowing through to `RenderOptions`.

- [ ] **Step 3-4: (no implementation change expected)**

- [ ] **Step 5: Commit**

```bash
git add packages/core/test/bin-internal/coverage-prepare.test.ts
git commit -m "test(core): coverage-prepare --all flag end-to-end"
```

---

## Phase 16 — `/xera-coverage` skill

### Task 16.1: Author `packages/skills/xera-coverage.md`

**Files:**
- Create: `packages/skills/xera-coverage.md`

- [ ] **Step 1: Write the file**

Frontmatter mirrors `xera-impact.md` style (just `name` + `description`):

```markdown
---
name: xera-coverage
description: Show area-level and AC-level coverage report for the current xera project; sort by risk; drill-down via --why; optional HTML viewer (v0.8.1+). Available v0.8.0+.
---

The user invoked `/xera-coverage [--why <area-or-TICKET>] [--all] [--json] [--viewer]`. Read flag arguments and forward to the binary.

This skill walks the project knowledge graph (`.xera/graph/`) to identify untested areas and unsatisfied acceptance criteria. It does NOT modify graph state or run tests — strictly read-only reporting plus an optional snapshot event for trend history.

## Step 1 — Verify project layout

Confirm the cwd is a xera project: `xera.config.ts` exists. If not, surface:

```
xera.config.ts not found — this command must run inside a xera project.
```

And STOP.

## Step 2 — Run coverage-prepare

Pass through the user's flags:

```bash
bun run xera:coverage-prepare [--why <id>] [--all] [--json] [--no-emit-event]
```

Flag handling:

- **`--why <id>`** — binary prints drill-down to stdout, no files written. Return that output to the user; do not continue to Step 3.
- **`--json`** — binary prints `report.json` to stdout. Return as-is.
- **No flag (default), or `--all`** — binary writes `.xera/coverage/report.json` and `.xera/coverage/report.md`, plus emits a `coverage.snapshot` event (unless config disables it).

Exit codes:

- `0` — report generated.
- `1` — unknown flag passed.
- `2` — `xera.config.ts` missing or invalid; surface stderr and STOP.
- `4` — internal error; surface stderr and STOP.

## Step 3 — Read report.json

If a normal (non-`--why`, non-`--json`) run, read `.xera/coverage/report.json`. Check `acBackfillNeeded`:

- If `true`: print this warning BEFORE the report (the actual backfill flow ships in v0.8.0-beta / Plan 03):

  ```
  ⚠ AC backfill is needed for legacy scenarios. AC-level coverage may be
    incomplete until /xera-coverage backfill runs (planned v0.8.0-beta).
  ```

## Step 4 — Print report.md

Read `.xera/coverage/report.md` and print it verbatim to the terminal.

## Step 5 — Handle --viewer

If the user passed `--viewer`, print:

```
HTML viewer for coverage is planned for v0.8.1.
For now, the report.md above is the full output.
```

(Plan 04 will wire `--viewer` through to `bun run xera:graph-render --include-coverage`.)

## Step 6 — Print next-step hints

After the report (skip for `--why` and `--json` runs):

```
Next:
  /xera-coverage --why <area-or-TICKET>   full breakdown
  /xera-coverage --viewer                  HTML viewer (v0.8.1)
  /xera-fill-gap <area>                    draft scenarios (v0.8.2)
  /xera-fill-gap --ticket <TICKET>         draft AC gap scenarios (v0.8.2)
```

## Edge cases

- Graph snapshot not present yet: `loadAllEvents` returns `[]` → empty report. That's fine; surface "no events yet, run /xera-fetch on a ticket first" hint after Step 6.
- Config has invalid `coverage.criticalAreas` slug → binary exits 2 with parse error; surface and STOP.
```

- [ ] **Step 2: Verify the file is present**

```bash
ls packages/skills/xera-coverage.md
```

- [ ] **Step 3: Verify with `xera:verify-prompts` (if it inspects skills)**

```bash
bun run xera:verify-prompts
```

Expected: existing in-scope prompt count unchanged (skills are separate; `map-ac-to-scenarios.md` lands in Plan 03). No errors.

- [ ] **Step 4: Commit**

```bash
git add packages/skills/xera-coverage.md
git commit -m "feat(skills): add xera-coverage skill (v0.8.0 Plan 02)"
```

---

## Phase 17 — Doctor checks (CLI consumer side)

### Task 17.1: Warn when `coverage.staleAfterDays > 90`

**Files:**
- Modify: `packages/cli/src/checks.ts`
- Test: `packages/cli/test/checks.test.ts` (create if absent)

- [ ] **Step 1: Write the failing test**

```ts
import { describe, test, expect } from 'bun:test';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runChecks } from '../src/checks';

function makeProject(coverageConfig?: string): string {
  const dir = mkdtempSync(join(tmpdir(), 'xera-checks-'));
  mkdirSync(join(dir, '.xera'), { recursive: true });
  const coverageBlock = coverageConfig ? `, coverage: ${coverageConfig}` : '';
  writeFileSync(
    join(dir, 'xera.config.ts'),
    `import { defineConfig } from '@xera-ai/core';\n` +
    `export default defineConfig({\n` +
    `  jira: { baseUrl: 'https://example.atlassian.net', projectKeys: ['PROJ'], fields: { story: 'description' } },\n` +
    `  web: { baseUrl: { local: 'http://localhost:3000' }, defaultEnv: 'local' },\n` +
    `  adapters: ['web']${coverageBlock}\n` +
    `});\n`,
  );
  return dir;
}

describe('runChecks coverage warnings', () => {
  test('warns when coverage.staleAfterDays > 90', async () => {
    const dir = makeProject(`{ staleAfterDays: 120 }`);
    try {
      const checks = await runChecks(dir);
      const warning = checks.find((c) => c.name.includes('coverage.staleAfterDays'));
      expect(warning).toBeDefined();
      expect(warning!.ok).toBe(false);
      expect(warning!.message ?? '').toContain('large window');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('no warning when staleAfterDays <= 90', async () => {
    const dir = makeProject(`{ staleAfterDays: 60 }`);
    try {
      const checks = await runChecks(dir);
      const warning = checks.find((c) => c.name.includes('coverage.staleAfterDays'));
      expect(warning).toBeUndefined();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
```

- [ ] **Step 2: Verify failure**

```bash
cd packages/cli && bun test test/checks.test.ts
```

- [ ] **Step 3: Implement check**

In `packages/cli/src/checks.ts`, INSIDE `runChecks` after the existing `xera.config.ts found and valid` check (the `try { const cfg = await loadConfig(cwd); ...` block), append a coverage-related check inside that same `try` block:

```ts
// inside the existing try block, after web/http checks:
if (cfg.coverage.staleAfterDays > 90) {
  checks.push({
    name: 'coverage.staleAfterDays sanity',
    ok: false,
    message: `${cfg.coverage.staleAfterDays}d is a very large window — coverage will be slow to react to drift`,
  });
}
```

- [ ] **Step 4: Verify pass**

```bash
cd packages/cli && bun test test/checks.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add packages/cli/src/checks.ts packages/cli/test/checks.test.ts
git commit -m "feat(cli): doctor warns when coverage.staleAfterDays > 90"
```

---

### Task 17.2: Warn when `criticalAreas` contains a slug not present in graph

**Files:**
- Modify: `packages/cli/src/checks.ts`
- Modify: `packages/cli/test/checks.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
test('warns when criticalAreas contains a slug missing from snapshot', async () => {
  const dir = makeProject(`{ criticalAreas: ['typo-area'] }`);
  // Seed a snapshot with no 'typo-area'
  mkdirSync(join(dir, '.xera/graph'), { recursive: true });
  writeFileSync(
    join(dir, '.xera/graph/snapshot.json'),
    JSON.stringify({
      schema_version: 1, generated_at: '2026-05-17T10:00:00.000Z',
      event_count: 0, events_hash: 'sha256:',
      tickets: {}, scenarios: {}, poms: {},
      areas: { checkout: { id: 'checkout' } },
      edges: [], latest_failures: {},
      acNodes: {}, classifications: [],
    }),
  );
  try {
    const checks = await runChecks(dir);
    const w = checks.find((c) => c.name.includes('typo-area'));
    expect(w).toBeDefined();
    expect(w!.ok).toBe(false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('no warning when all criticalAreas exist in snapshot', async () => {
  const dir = makeProject(`{ criticalAreas: ['checkout'] }`);
  mkdirSync(join(dir, '.xera/graph'), { recursive: true });
  writeFileSync(
    join(dir, '.xera/graph/snapshot.json'),
    JSON.stringify({
      schema_version: 1, generated_at: '2026-05-17T10:00:00.000Z',
      event_count: 0, events_hash: 'sha256:',
      tickets: {}, scenarios: {}, poms: {},
      areas: { checkout: { id: 'checkout' } },
      edges: [], latest_failures: {},
      acNodes: {}, classifications: [],
    }),
  );
  try {
    const checks = await runChecks(dir);
    const w = checks.find((c) => c.name.toLowerCase().includes('critical'));
    expect(w).toBeUndefined();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
```

- [ ] **Step 2: Verify failure**

```bash
cd packages/cli && bun test test/checks.test.ts
```

- [ ] **Step 3: Implement**

In `packages/cli/src/checks.ts`, after the previous coverage check, add:

```ts
import { existsSync, readFileSync } from 'node:fs';

// ... inside runChecks try block, after staleAfterDays check:
const snapPath = join(cwd, '.xera/graph/snapshot.json');
if (existsSync(snapPath) && cfg.coverage.criticalAreas.length > 0) {
  try {
    const snap = JSON.parse(readFileSync(snapPath, 'utf8')) as { areas?: Record<string, unknown> };
    const known = new Set(Object.keys(snap.areas ?? {}));
    for (const slug of cfg.coverage.criticalAreas) {
      if (!known.has(slug)) {
        checks.push({
          name: `criticalArea "${slug}" exists`,
          ok: false,
          message: 'marked critical but no ticket modifies this area; check spelling',
        });
      }
    }
  } catch {
    /* malformed snapshot — separate check covers this */
  }
}
```

(The `existsSync`/`readFileSync` imports already at the top of `checks.ts` — add them if missing.)

- [ ] **Step 4: Verify pass**

```bash
cd packages/cli && bun test test/checks.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add packages/cli/src/checks.ts packages/cli/test/checks.test.ts
git commit -m "feat(cli): doctor warns when criticalAreas slug missing from snapshot"
```

---

### Task 17.3: Warn when ticket has `ac.length > 0` but no `ACNode` materialized

**Files:**
- Modify: `packages/cli/src/checks.ts`
- Modify: `packages/cli/test/checks.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
test('warns when ticket has acs but no ACNode (snapshot stale)', async () => {
  const dir = makeProject();
  mkdirSync(join(dir, '.xera/graph'), { recursive: true });
  writeFileSync(
    join(dir, '.xera/graph/snapshot.json'),
    JSON.stringify({
      schema_version: 1, generated_at: '2026-05-17T10:00:00.000Z',
      event_count: 0, events_hash: 'sha256:',
      tickets: {
        'PROJ-1': {
          id: 'PROJ-1', summary: 's', ac: ['x'],
          storyHash: 'h', modifiesAreas: [], fetchedAt: '2026-05-01T10:00:00.000Z',
        },
      },
      scenarios: {}, poms: {}, areas: {},
      edges: [], latest_failures: {},
      acNodes: {},
      classifications: [],
    }),
  );
  try {
    const checks = await runChecks(dir);
    const w = checks.find((c) => c.name.includes('PROJ-1') && c.name.toLowerCase().includes('ac'));
    expect(w).toBeDefined();
    expect(w!.ok).toBe(false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
```

- [ ] **Step 2: Verify failure**

```bash
cd packages/cli && bun test test/checks.test.ts
```

- [ ] **Step 3: Implement**

In `packages/cli/src/checks.ts`, after the criticalAreas check:

```ts
if (existsSync(snapPath)) {
  try {
    const snap = JSON.parse(readFileSync(snapPath, 'utf8')) as {
      tickets?: Record<string, { id: string; ac?: string[] }>;
      acNodes?: Record<string, { ticketId: string }>;
    };
    const acByTicket: Record<string, number> = {};
    for (const node of Object.values(snap.acNodes ?? {})) {
      acByTicket[node.ticketId] = (acByTicket[node.ticketId] ?? 0) + 1;
    }
    for (const ticket of Object.values(snap.tickets ?? {})) {
      const acCount = ticket.ac?.length ?? 0;
      if (acCount > 0 && (acByTicket[ticket.id] ?? 0) === 0) {
        checks.push({
          name: `${ticket.id}: ACNodes materialized`,
          ok: false,
          message: 'ticket has acceptance criteria but no ACNode in snapshot — rebuild via xera:graph-backfill',
        });
      }
    }
  } catch {
    /* malformed snapshot */
  }
}
```

- [ ] **Step 4: Verify pass**

```bash
cd packages/cli && bun test test/checks.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add packages/cli/src/checks.ts packages/cli/test/checks.test.ts
git commit -m "feat(cli): doctor warns when ACNodes not materialized for tickets with ACs"
```

---

## Phase 18 — Integration against golden fixtures

### Task 18.1: E2E test — coverage-prepare against `mixed.json`

**Files:**
- Create: `packages/core/test/bin-internal/coverage-prepare-golden.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, test, expect } from 'bun:test';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, copyFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { coveragePrepareCmd } from '../../src/bin-internal/coverage-prepare';

const here = dirname(fileURLToPath(import.meta.url));
const fixtureDir = join(here, '../../../../fixtures/golden-coverage');

function setupGoldenProject(fixtureName: string, coverageConfig = ''): string {
  const dir = mkdtempSync(join(tmpdir(), `xera-coverage-${fixtureName}-`));
  mkdirSync(join(dir, '.xera/graph'), { recursive: true });
  writeFileSync(
    join(dir, 'xera.config.ts'),
    `import { defineConfig } from '@xera-ai/core';\n` +
    `export default defineConfig({\n` +
    `  jira: { baseUrl: 'https://example.atlassian.net', projectKeys: ['PROJ'], fields: { story: 'description' } },\n` +
    `  web: { baseUrl: { local: 'http://localhost:3000' }, defaultEnv: 'local' },\n` +
    `  adapters: ['web']${coverageConfig ? `, coverage: ${coverageConfig}` : ''}\n` +
    `});\n`,
  );
  // The binary calls deriveSnapshot(loadAllEvents(cwd)) — events are empty,
  // so derived snapshot would be empty. To use a golden fixture directly,
  // write it as the snapshot.json and disable events loading by writing zero events.
  // We bypass loadAllEvents by directly placing the fixture; but coverage-prepare
  // uses loadAllEvents → deriveSnapshot. So we must instead either:
  //   (a) extend coverage-prepare to accept --snapshot-file <path>, or
  //   (b) translate fixture → events.
  // Simplest for v0.8.0: option (a). See Task 18.2 if absent.
  copyFileSync(
    join(fixtureDir, `${fixtureName}.json`),
    join(dir, '.xera/graph/snapshot.json'),
  );
  return dir;
}

describe('coverage-prepare against golden fixtures', () => {
  test('mixed.json end-to-end matches expected report', async () => {
    const dir = setupGoldenProject('mixed');
    const prevCwd = process.cwd();
    process.chdir(dir);
    try {
      const code = await coveragePrepareCmd([
        '--snapshot-ts', '2026-05-17T10:00:00.000Z',
        '--no-emit-event',
        '--snapshot-file', join(dir, '.xera/graph/snapshot.json'),
      ]);
      expect(code).toBe(0);
      const got = JSON.parse(readFileSync(join(dir, '.xera/coverage/report.json'), 'utf8'));
      const expected = JSON.parse(readFileSync(join(fixtureDir, 'mixed.expected.json'), 'utf8'));
      expect(got).toEqual(expected);
    } finally {
      process.chdir(prevCwd);
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('critical-boost.json with criticalAreas: ["checkout"]', async () => {
    const dir = setupGoldenProject('critical-boost', `{ criticalAreas: ['checkout'] }`);
    const prevCwd = process.cwd();
    process.chdir(dir);
    try {
      const code = await coveragePrepareCmd([
        '--snapshot-ts', '2026-05-17T10:00:00.000Z',
        '--no-emit-event',
        '--snapshot-file', join(dir, '.xera/graph/snapshot.json'),
      ]);
      expect(code).toBe(0);
      const got = JSON.parse(readFileSync(join(dir, '.xera/coverage/report.json'), 'utf8'));
      const expected = JSON.parse(readFileSync(join(fixtureDir, 'critical-boost.expected.json'), 'utf8'));
      expect(got).toEqual(expected);
    } finally {
      process.chdir(prevCwd);
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
```

- [ ] **Step 2: Verify failure**

```bash
cd packages/core && bun test test/bin-internal/coverage-prepare-golden.test.ts
```

Expected: unknown flag `--snapshot-file` OR (if the flag is silently ignored) report has empty areas because `loadAllEvents` returns empty events.

- [ ] **Step 3: Add `--snapshot-file <path>` to binary**

In `packages/core/src/bin-internal/coverage-prepare.ts`, extend `ParsedArgs` and `parseArgs`:

```ts
interface ParsedArgs {
  snapshotTs?: string;
  emitEvent: boolean;
  why?: string;
  json: boolean;
  all: boolean;
  snapshotFile?: string;   // NEW: test-only escape hatch
}

// In parseArgs loop:
else if (a === '--snapshot-file') args.snapshotFile = argv[++i];
```

In `coveragePrepareCmd`, after the existing snapshot derivation, allow override:

```ts
import { readFileSync } from 'node:fs';
import type { Snapshot } from '../graph/types';

// Replace:
//   const events = loadAllEvents(cwd);
//   const snap = deriveSnapshot(events);
// With:
let snap: Snapshot;
if (args.snapshotFile) {
  snap = JSON.parse(readFileSync(args.snapshotFile, 'utf8')) as Snapshot;
} else {
  snap = deriveSnapshot(loadAllEvents(cwd));
}
```

This `--snapshot-file` flag is intended for tests and rare diagnostic use. The skill never passes it.

- [ ] **Step 4: Verify pass**

```bash
cd packages/core && bun test test/bin-internal/coverage-prepare-golden.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/bin-internal/coverage-prepare.ts packages/core/test/bin-internal/coverage-prepare-golden.test.ts
git commit -m "feat(core): coverage-prepare --snapshot-file flag for fixture testing"
```

---

## Phase 19 — Manual smoke + workspace verification

### Task 19.1: Manual smoke in a throwaway project

This task is non-automated. Documenting the recipe so the engineer can reproduce.

- [ ] **Step 1: Scaffold a throwaway project**

```bash
cd /tmp && rm -rf xera-coverage-smoke && mkdir xera-coverage-smoke && cd xera-coverage-smoke
bunx @xera-ai/cli init --yes --shape web
```

- [ ] **Step 2: Seed a snapshot from the `mixed.json` golden fixture**

```bash
mkdir -p .xera/graph
cp /home/user/xera/fixtures/golden-coverage/mixed.json .xera/graph/snapshot.json
```

- [ ] **Step 3: Edit `xera.config.ts` to mark `checkout` critical**

Append inside the `defineConfig({...})` call:

```ts
coverage: { criticalAreas: ['checkout'] },
```

- [ ] **Step 4: Run the binary directly using the snapshot file**

```bash
bun run xera:coverage-prepare --snapshot-ts 2026-05-17T10:00:00.000Z --no-emit-event --snapshot-file .xera/graph/snapshot.json
cat .xera/coverage/report.md
```

Expected: UNCOVERED `checkout` at risk 2 (critical ×2), STALE `search`, COVERED `login`, AC GAP for `PROJ-101`.

- [ ] **Step 5: `--why checkout`**

```bash
bun run xera:coverage-prepare --snapshot-ts 2026-05-17T10:00:00.000Z --no-emit-event --snapshot-file .xera/graph/snapshot.json --why checkout
```

Expected: formula expansion `1 × 2 + 0 = 2` + ticket list.

- [ ] **Step 6: `--why PROJ-101`**

```bash
bun run xera:coverage-prepare --snapshot-ts 2026-05-17T10:00:00.000Z --no-emit-event --snapshot-file .xera/graph/snapshot.json --why PROJ-101
```

Expected: AC list with ✗ markers + next-step hint.

- [ ] **Step 7: Confirm event emission with real events**

Remove `--snapshot-file` and `--no-emit-event`:

```bash
bun run xera:coverage-prepare --snapshot-ts 2026-05-17T10:00:00.000Z
ls .xera/graph/events/2026-05/
```

Expected: a `<ULID>-coverage-session.jsonl` file present. Inspect content; should be a single `coverage.snapshot` event.

(With no real events, the snapshot will be empty — so the report content is mostly empty. The event emission is what we're verifying.)

- [ ] **Step 8: Run `bunx @xera-ai/cli doctor`**

```bash
bunx @xera-ai/cli doctor
```

Expected: green for everything except possibly the `criticalArea "checkout"` check (the seeded snapshot may now be empty after Step 7's overwrite — re-seed if needed).

- [ ] **Step 9: Cleanup**

```bash
cd / && rm -rf /tmp/xera-coverage-smoke
```

- [ ] **Step 10: Checkpoint commit if any fixups**

```bash
cd /home/user/xera && git status
# If clean, no action. If fix-ups happened:
git commit -am "chore(core): coverage-prepare smoke-test fix-ups"
```

---

### Task 19.2: Workspace typecheck + full test suite

- [ ] **Step 1: Typecheck**

```bash
cd /home/user/xera && bun run typecheck
```

Expected: no errors.

- [ ] **Step 2: Full test suite**

```bash
cd /home/user/xera && bun test
```

Expected: all green — Plans 01 + 02 tests + no v0.6/v0.7 regressions.

- [ ] **Step 3: verify-prompts**

```bash
bun run xera:verify-prompts
```

Expected: existing in-scope prompts pass (Plan 03 adds `map-ac-to-scenarios.md`; not in this plan).

---

## Done

End state of Plan 02 (revised):

- `packages/core/src/config/schema.ts` — `XeraConfigSchema` gains optional `coverage` block with `.prefault({})` defaults
- `packages/core/src/bin-internal/coverage-prepare.ts` — full implementation: CLI parsing (flags: `--snapshot-ts`, `--no-emit-event`, `--why`, `--json`, `--all`, `--snapshot-file`), config load, snapshot derive (or fixture override), report compute, JSON + markdown write, `--why` drill-down to stdout, optional `coverage.snapshot` event emission via `appendEvents`
- `packages/core/src/bin-internal/index.ts` — `coverage-prepare` registered in `COMMANDS`
- `packages/skills/xera-coverage.md` — user-facing skill (frontmatter matches xera-impact.md style), handles flag pass-through, prints output, prints next-step hints, stubs `--viewer` (Plan 04) and AC backfill warning (Plan 03)
- `packages/cli/src/checks.ts` — three new doctor checks (large window, unknown criticalAreas slug, missing ACNode)
- `packages/core/test/config/schema.test.ts` — new tests for `coverage` block
- `packages/core/test/bin-internal/coverage-prepare.test.ts` — unit + integration tests
- `packages/core/test/bin-internal/coverage-prepare-golden.test.ts` — E2E against golden fixtures
- `packages/cli/test/checks.test.ts` — doctor check tests

What works after Plan 02:

- `bun run xera:coverage-prepare` produces a coverage report from real graph events
- `/xera-coverage` skill prints the report; `--why` drill-down works; `--json` machine output works; `--all` reveals COVERED
- `coverage.snapshot` events accumulate in `.xera/graph/events/` for Plan 04 (Trend tab)
- Doctor surfaces config + snapshot health

What's still missing for v0.8.0 full release:

- AC backfill flow (Plan 03)
- HTML viewer Coverage tab (Plan 04, v0.8.1)
- `/xera-fill-gap` generative skill (Plan 05, v0.8.2)
