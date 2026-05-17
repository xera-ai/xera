# xera v0.8 — Plan 02: Coverage CLI Surface & Skill

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the `coverage.*` block to `xera.config.ts` schema, build the `coverage-prepare` xera-internal subcommand (computes report, writes JSON + markdown, optionally emits `coverage.snapshot` event), ship the `/xera-coverage` skill `.md` (default list / `--why` / `--all` / `--json` / `--viewer` flag pass-through; `--viewer` is no-op stub until Plan 04), and extend `cli/doctor` with coverage-related warnings. End state: a user in a v0.8.0-alpha project can run `/xera-coverage` and see the area-level + AC-level report. AC backfill auto-trigger is a stub here (prints a warning when `acBackfillNeeded`); Plan 03 wires up the real backfill flow.

**Architecture:** Config schema gains an optional `coverage` block validated by Zod; defaults match `DEFAULT_COVERAGE_CONFIG` from Plan 01. The binary lives at `packages/core/src/bin-internal/coverage-prepare.ts` and follows the same args-parsing + JSON-I/O pattern as the existing `impact-prepare` binary; it imports the pure functions from `@xera-ai/core/coverage` (Plan 01 barrel). The skill is a single `packages/skills/xera-coverage.md` file that points at the binary via `bun run xera:coverage-prepare`. Doctor checks live in `packages/cli/src/commands/doctor.ts`.

**Tech Stack:** TypeScript, `bun:test`, Zod, existing args-parsing utility.

**Prereqs:** Plan 01 complete (`@xera-ai/core/coverage` module exists and passes its unit tests).

**Plan scope:** v0.8.0 user-facing surface for area + AC coverage reporting, minus the AC backfill orchestration. `--viewer` flag is wired through the skill but its effect (open HTML) is no-op until Plan 04 ships `graph-render --include-coverage`. Generative `/xera-fill-gap` is Plan 05.

---

## Phase 11 — Config schema additions

### Task 11.1: Add `CoverageConfigSchema` to config Zod schema

**Files:**
- Modify: `packages/core/src/config/schema.ts`
- Test: `packages/core/test/config/schema.test.ts`

- [ ] **Step 1: Write the failing test**

Add to `packages/core/test/config/schema.test.ts`:

```ts
import { describe, test, expect } from 'bun:test';
import { ConfigSchema } from '../../src/config/schema';

describe('Config.coverage', () => {
  test('coverage is optional; defaults populate when absent', () => {
    const parsed = ConfigSchema.parse({
      adapters: ['web'],
      // no coverage block
    });
    expect(parsed.coverage).toEqual({
      staleAfterDays: 30,
      criticalAreas: [],
      autoSnapshotOnCoverage: true,
    });
  });

  test('user-supplied coverage overrides defaults', () => {
    const parsed = ConfigSchema.parse({
      adapters: ['web'],
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
      ConfigSchema.parse({
        adapters: ['web'],
        coverage: { staleAfterDays: -1 },
      }),
    ).toThrow();
  });

  test('rejects criticalAreas containing non-slug strings', () => {
    expect(() =>
      ConfigSchema.parse({
        adapters: ['web'],
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

Expected: `coverage` property missing on parsed result OR validation accepts invalid input.

- [ ] **Step 3: Implement schema additions**

Open `packages/core/src/config/schema.ts`. Near the top (after existing imports), import the slug regex if it's defined as a constant elsewhere; otherwise re-declare:

```ts
const AREA_SLUG_REGEX = /^[a-z0-9-]+$/;
```

Add the coverage block schema (just before the top-level `ConfigSchema`):

```ts
const CoverageConfigSchema = z.object({
  staleAfterDays: z.number().int().positive().default(30),
  criticalAreas: z.array(z.string().regex(AREA_SLUG_REGEX)).default([]),
  autoSnapshotOnCoverage: z.boolean().default(true),
}).default({});
```

In the top-level `ConfigSchema` object, append the `coverage` property:

```ts
export const ConfigSchema = z.object({
  // ... existing fields ...
  coverage: CoverageConfigSchema,
});
```

- [ ] **Step 4: Verify pass**

```bash
cd packages/core && bun test test/config/schema.test.ts
```

Expected: 4 new passes + existing tests still green.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/config/schema.ts packages/core/test/config/schema.test.ts
git commit -m "feat(core): add coverage config block to ConfigSchema"
```

---

### Task 11.2: Update `defineConfig` TypeScript signature

**Files:**
- Modify: `packages/core/src/config/define-config.ts` (or wherever `defineConfig` is exported)
- Test: type-only assertion in `packages/core/test/config/define-config.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, test, expect } from 'bun:test';
import { defineConfig } from '../../src/config/define-config';

describe('defineConfig', () => {
  test('accepts coverage block', () => {
    const cfg = defineConfig({
      adapters: ['web'],
      coverage: {
        criticalAreas: ['checkout'],
      },
    });
    // After parsing, defaults fill in:
    expect(cfg.coverage.staleAfterDays).toBe(30);
    expect(cfg.coverage.criticalAreas).toEqual(['checkout']);
  });
});
```

- [ ] **Step 2: Verify failure**

```bash
cd packages/core && bun test test/config/define-config.test.ts
```

Expected: TypeScript error on `coverage` field (if input type is not Zod-derived).

- [ ] **Step 3: Verify or update `defineConfig` to derive its input type from `ConfigSchema`**

If `defineConfig` is already typed as `z.input<typeof ConfigSchema>` → `z.infer<typeof ConfigSchema>`, no change needed (it picks up the new field automatically). Otherwise, ensure:

```ts
// packages/core/src/config/define-config.ts
import { ConfigSchema, type Config, type ConfigInput } from './schema';

export type ConfigInput = z.input<typeof ConfigSchema>;
export type Config = z.infer<typeof ConfigSchema>;

export function defineConfig(input: ConfigInput): Config {
  return ConfigSchema.parse(input);
}
```

- [ ] **Step 4: Verify pass**

```bash
cd packages/core && bun test test/config/define-config.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/config/define-config.ts packages/core/test/config/define-config.test.ts
git commit -m "feat(core): propagate coverage block to defineConfig types"
```

---

## Phase 12 — `coverage-prepare` binary

### Task 12.1: Stub the subcommand and register in dispatcher

**Files:**
- Create: `packages/core/src/bin-internal/coverage-prepare.ts`
- Modify: `packages/core/src/bin-internal/index.ts` (or wherever subcommand dispatch lives)
- Test: `packages/core/test/bin-internal/coverage-prepare.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, test, expect } from 'bun:test';
import { runCoveragePrepare } from '../../src/bin-internal/coverage-prepare';

describe('coverage-prepare subcommand', () => {
  test('exports runCoveragePrepare entry point', () => {
    expect(typeof runCoveragePrepare).toBe('function');
  });
});
```

- [ ] **Step 2: Verify failure**

```bash
cd packages/core && bun test test/bin-internal/coverage-prepare.test.ts
```

Expected: module not found.

- [ ] **Step 3: Stub implementation**

Create `packages/core/src/bin-internal/coverage-prepare.ts`:

```ts
export type CoveragePrepareArgs = {
  outputDir?: string;          // default: .xera/coverage
  snapshotTs?: string;         // ISO8601 override for "now" (testing)
  emitEvent?: boolean;         // default: from config.coverage.autoSnapshotOnCoverage
  why?: string;                // area slug or ticket ID for drill-down
  json?: boolean;              // print report JSON to stdout instead of writing files
  all?: boolean;               // include COVERED section in markdown
};

export type CoveragePrepareResult = {
  reportJsonPath: string;
  reportMdPath: string;
  eventPath?: string;
};

export async function runCoveragePrepare(_args: CoveragePrepareArgs): Promise<CoveragePrepareResult> {
  throw new Error('not implemented');
}
```

Wire into the dispatcher in `packages/core/src/bin-internal/index.ts`:

```ts
// In the switch over subcommand name:
case 'coverage-prepare': {
  const args = parseCoveragePrepareArgs(process.argv.slice(3));
  return runCoveragePrepare(args);
}
```

Add CLI arg parsing helper (top of `coverage-prepare.ts` or in `bin-internal/util/`):

```ts
export function parseCoveragePrepareArgs(argv: string[]): CoveragePrepareArgs {
  const args: CoveragePrepareArgs = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--output-dir') { args.outputDir = argv[++i]; }
    else if (a === '--snapshot-ts') { args.snapshotTs = argv[++i]; }
    else if (a === '--no-emit-event') { args.emitEvent = false; }
    else if (a === '--why') { args.why = argv[++i]; }
    else if (a === '--json') { args.json = true; }
    else if (a === '--all') { args.all = true; }
    else throw new Error(`Unknown coverage-prepare flag: ${a}`);
  }
  return args;
}
```

- [ ] **Step 4: Verify the type-only test passes**

```bash
cd packages/core && bun test test/bin-internal/coverage-prepare.test.ts
```

Expected: 1 pass.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/bin-internal/coverage-prepare.ts packages/core/src/bin-internal/index.ts packages/core/test/bin-internal/coverage-prepare.test.ts
git commit -m "feat(core): scaffold coverage-prepare subcommand"
```

---

### Task 12.2: Implement core flow — load graph, compute report, write JSON + markdown

**Files:**
- Modify: `packages/core/src/bin-internal/coverage-prepare.ts`
- Modify: `packages/core/test/bin-internal/coverage-prepare.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

function makeTempProject(): string {
  const dir = mkdtempSync(join(tmpdir(), 'xera-coverage-'));
  mkdirSync(join(dir, '.xera', 'graph'), { recursive: true });
  // Seed a minimal config and graph snapshot
  writeFileSync(
    join(dir, 'xera.config.ts'),
    `import { defineConfig } from '@xera-ai/core';\nexport default defineConfig({ adapters: ['web'] });\n`,
  );
  writeFileSync(
    join(dir, '.xera', 'graph', 'snapshot.json'),
    JSON.stringify({
      tickets: {}, scenarios: {}, poms: {}, areas: {},
      ticketEdges: [], scenarioPomEdges: [], pomAreaEdges: [],
      ticketAreaEdges: [], jiraLinkEdges: [], similarEdges: [],
      failureEdges: [], latestFailures: {},
      acNodes: {}, satisfiesEdges: [], classificationEvents: [],
    }),
  );
  return dir;
}

describe('coverage-prepare end-to-end', () => {
  test('writes report.json and report.md to .xera/coverage/', async () => {
    const dir = makeTempProject();
    const prevCwd = process.cwd();
    process.chdir(dir);
    try {
      const result = await runCoveragePrepare({
        snapshotTs: '2026-05-17T10:00:00.000Z',
        emitEvent: false,
      });
      const json = JSON.parse(readFileSync(result.reportJsonPath, 'utf8'));
      expect(json.windowDays).toBe(30);
      expect(json.areas).toEqual([]);
      const md = readFileSync(result.reportMdPath, 'utf8');
      expect(md).toContain('Coverage report');
    } finally {
      process.chdir(prevCwd);
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
```

Note: this test calls `process.chdir`. **Restore in `afterEach` or `finally`** per the CLAUDE.md reflex about cwd leaks.

- [ ] **Step 2: Verify failure**

```bash
cd packages/core && bun test test/bin-internal/coverage-prepare.test.ts
```

Expected: "not implemented".

- [ ] **Step 3: Implement core flow**

In `packages/core/src/bin-internal/coverage-prepare.ts`:

```ts
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadConfig } from '../config/loader';                // existing v0.6 helper
import { buildCoverageReport, renderMarkdown, DEFAULT_COVERAGE_CONFIG } from '../coverage';
import { resolveGraphPaths } from '../graph/paths';           // existing v0.6 helper

const DEFAULT_OUTPUT_DIR = '.xera/coverage';

export async function runCoveragePrepare(args: CoveragePrepareArgs): Promise<CoveragePrepareResult> {
  const cwd = process.cwd();
  const config = await loadConfig(cwd);
  const coverageCfg = { ...DEFAULT_COVERAGE_CONFIG, ...config.coverage };

  const paths = resolveGraphPaths(cwd);
  const snapshotRaw = readFileSync(paths.snapshot, 'utf8');
  const graph = JSON.parse(snapshotRaw);    // shape validated by buildCoverageReport callers' tests

  const now = args.snapshotTs ? new Date(args.snapshotTs) : new Date();
  const report = buildCoverageReport(graph, coverageCfg, now);

  const outDir = join(cwd, args.outputDir ?? DEFAULT_OUTPUT_DIR);
  mkdirSync(outDir, { recursive: true });
  const reportJsonPath = join(outDir, 'report.json');
  const reportMdPath = join(outDir, 'report.md');
  writeFileSync(reportJsonPath, JSON.stringify(report, null, 2));
  writeFileSync(reportMdPath, renderMarkdown(report));

  return { reportJsonPath, reportMdPath };
}
```

- [ ] **Step 4: Verify pass**

```bash
cd packages/core && bun test test/bin-internal/coverage-prepare.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/bin-internal/coverage-prepare.ts packages/core/test/bin-internal/coverage-prepare.test.ts
git commit -m "feat(core): coverage-prepare writes report.json + report.md"
```

---

### Task 12.3: `--json` flag prints report to stdout instead of writing files

**Files:**
- Modify: `packages/core/src/bin-internal/coverage-prepare.ts`
- Modify: `packages/core/test/bin-internal/coverage-prepare.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
test('--json flag prints report to stdout, no files written', async () => {
  const dir = makeTempProject();
  const prevCwd = process.cwd();
  process.chdir(dir);

  const writeCalls: string[] = [];
  const origWrite = process.stdout.write.bind(process.stdout);
  // @ts-expect-error mocking
  process.stdout.write = (chunk: string | Uint8Array) => {
    writeCalls.push(typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString('utf8'));
    return true;
  };

  try {
    await runCoveragePrepare({
      snapshotTs: '2026-05-17T10:00:00.000Z',
      emitEvent: false,
      json: true,
    });
    const stdout = writeCalls.join('');
    expect(stdout).toContain('"windowDays": 30');
    expect(stdout).toContain('"areas":');
  } finally {
    process.stdout.write = origWrite;
    process.chdir(prevCwd);
    rmSync(dir, { recursive: true, force: true });
  }
});
```

- [ ] **Step 2: Verify failure**

```bash
cd packages/core && bun test test/bin-internal/coverage-prepare.test.ts
```

Expected: stdout not captured / no JSON output.

- [ ] **Step 3: Implement `--json`**

In `runCoveragePrepare`, after computing `report`:

```ts
if (args.json) {
  process.stdout.write(JSON.stringify(report, null, 2) + '\n');
  return { reportJsonPath: '', reportMdPath: '' };
}
// ... existing mkdir/write flow ...
```

- [ ] **Step 4: Verify pass**

```bash
cd packages/core && bun test test/bin-internal/coverage-prepare.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/bin-internal/coverage-prepare.ts packages/core/test/bin-internal/coverage-prepare.test.ts
git commit -m "feat(core): coverage-prepare --json prints to stdout"
```

---

## Phase 13 — `--why` drill-down

### Task 13.1: `--why <area-or-ticket>` outputs drill-down markdown

**Files:**
- Modify: `packages/core/src/bin-internal/coverage-prepare.ts`
- Modify: `packages/core/test/bin-internal/coverage-prepare.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
test('--why <area> outputs drill-down for an area', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'xera-coverage-'));
  mkdirSync(join(dir, '.xera', 'graph'), { recursive: true });
  writeFileSync(join(dir, 'xera.config.ts'),
    `import { defineConfig } from '@xera-ai/core';\nexport default defineConfig({ adapters: ['web'] });\n`);
  writeFileSync(join(dir, '.xera', 'graph', 'snapshot.json'), JSON.stringify({
    tickets: {
      'PROJ-1': {
        kind: 'Ticket', id: 'PROJ-1', summary: 'Add feature',
        acceptanceCriteria: [], storyHash: 'h', modifiesAreas: ['checkout'],
        fetchedAt: '2026-05-15T10:00:00.000Z',
      },
    },
    scenarios: {}, poms: {},
    areas: { checkout: { kind: 'Area', id: 'checkout' } },
    ticketEdges: [], scenarioPomEdges: [], pomAreaEdges: [],
    ticketAreaEdges: [{
      kind: 'modifies', source: 'PROJ-1', target: 'checkout',
      discoveredAt: '2026-05-15T10:00:00.000Z', source_label: 'extract',
    }],
    jiraLinkEdges: [], similarEdges: [], failureEdges: [],
    latestFailures: {}, acNodes: {}, satisfiesEdges: [], classificationEvents: [],
  }));
  const prevCwd = process.cwd();
  process.chdir(dir);
  const capture: string[] = [];
  const origWrite = process.stdout.write.bind(process.stdout);
  // @ts-expect-error mocking
  process.stdout.write = (chunk: string | Uint8Array) => {
    capture.push(typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString('utf8'));
    return true;
  };
  try {
    await runCoveragePrepare({
      snapshotTs: '2026-05-17T10:00:00.000Z',
      emitEvent: false,
      why: 'checkout',
    });
    const out = capture.join('');
    expect(out).toContain('Area: checkout');
    expect(out).toContain('UNCOVERED');
    expect(out).toContain('PROJ-1');
  } finally {
    process.stdout.write = origWrite;
    process.chdir(prevCwd);
    rmSync(dir, { recursive: true, force: true });
  }
});

test('--why <ticket> outputs drill-down for a ticket', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'xera-coverage-'));
  mkdirSync(join(dir, '.xera', 'graph'), { recursive: true });
  writeFileSync(join(dir, 'xera.config.ts'),
    `import { defineConfig } from '@xera-ai/core';\nexport default defineConfig({ adapters: ['web'] });\n`);
  writeFileSync(join(dir, '.xera', 'graph', 'snapshot.json'), JSON.stringify({
    tickets: {
      'PROJ-105': {
        kind: 'Ticket', id: 'PROJ-105', summary: 'Add tax',
        acceptanceCriteria: ['Subtotal shows', 'Tax shows'],
        storyHash: 'h', modifiesAreas: [],
        fetchedAt: '2026-05-12T10:00:00.000Z',
      },
    },
    scenarios: {}, poms: {}, areas: {},
    ticketEdges: [], scenarioPomEdges: [], pomAreaEdges: [],
    ticketAreaEdges: [], jiraLinkEdges: [], similarEdges: [],
    failureEdges: [], latestFailures: {},
    acNodes: {
      'PROJ-105#ac-0': { kind: 'AC', id: 'PROJ-105#ac-0', ticketId: 'PROJ-105', index: 0, text: 'Subtotal shows' },
      'PROJ-105#ac-1': { kind: 'AC', id: 'PROJ-105#ac-1', ticketId: 'PROJ-105', index: 1, text: 'Tax shows' },
    },
    satisfiesEdges: [], classificationEvents: [],
  }));
  const prevCwd = process.cwd();
  process.chdir(dir);
  const capture: string[] = [];
  const origWrite = process.stdout.write.bind(process.stdout);
  // @ts-expect-error mocking
  process.stdout.write = (chunk: string | Uint8Array) => {
    capture.push(typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString('utf8'));
    return true;
  };
  try {
    await runCoveragePrepare({
      snapshotTs: '2026-05-17T10:00:00.000Z',
      emitEvent: false,
      why: 'PROJ-105',
    });
    const out = capture.join('');
    expect(out).toContain('Ticket: PROJ-105');
    expect(out).toContain('0/2 ACs covered');
    expect(out).toContain('✗ AC-0  Subtotal shows');
  } finally {
    process.stdout.write = origWrite;
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

In `runCoveragePrepare`, after loading `graph` and `coverageCfg`:

```ts
import { buildWhyArea, buildWhyTicket } from '../coverage';

// Heuristic: if argument matches /^[A-Z][A-Z0-9_]*-\d+$/ → ticket; otherwise → area slug.
const TICKET_REGEX = /^[A-Z][A-Z0-9_]*-\d+$/;

if (args.why) {
  const out = TICKET_REGEX.test(args.why)
    ? buildWhyTicket(args.why, graph, coverageCfg, now)
    : buildWhyArea(args.why, graph, coverageCfg, now);
  process.stdout.write(out);
  return { reportJsonPath: '', reportMdPath: '' };
}
```

- [ ] **Step 4: Verify pass**

```bash
cd packages/core && bun test test/bin-internal/coverage-prepare.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/bin-internal/coverage-prepare.ts packages/core/test/bin-internal/coverage-prepare.test.ts
git commit -m "feat(core): coverage-prepare --why <area-or-ticket> drill-down"
```

---

## Phase 14 — `--all` flag (include COVERED section)

### Task 14.1: `renderMarkdown` accepts `includeCovered` option

**Files:**
- Modify: `packages/core/src/coverage/report.ts`
- Modify: `packages/core/test/coverage/report.test.ts`
- Modify: `packages/core/src/bin-internal/coverage-prepare.ts`
- Modify: `packages/core/test/bin-internal/coverage-prepare.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// In packages/core/test/coverage/report.test.ts:
test('renderMarkdown(report, { includeCovered: true }) includes COVERED section', () => {
  const md = renderMarkdown({
    generatedAt: '2026-05-17T10:00:00.000Z',
    windowDays: 30,
    areas: [{
      id: 'login', status: 'COVERED', risk: 0,
      breakdown: { recentTickets: 0, recentBugs: 0, criticalBoost: 1 },
    }],
    tickets: [], acBackfillNeeded: false,
  }, { includeCovered: true });
  expect(md).toContain('COVERED');
  expect(md).toContain('login');
});

test('renderMarkdown default omits COVERED section, shows collapsed line', () => {
  const md = renderMarkdown({
    generatedAt: '2026-05-17T10:00:00.000Z',
    windowDays: 30,
    areas: [{
      id: 'login', status: 'COVERED', risk: 0,
      breakdown: { recentTickets: 0, recentBugs: 0, criticalBoost: 1 },
    }],
    tickets: [], acBackfillNeeded: false,
  });
  expect(md).not.toContain('  #1');                // no area row
  expect(md).toContain('COVERED — 1 area');         // summary count line
  expect(md).toContain('show with --all');          // hint
});
```

- [ ] **Step 2: Verify failure**

```bash
cd packages/core && bun test test/coverage/report.test.ts
```

- [ ] **Step 3: Extend `renderMarkdown`**

In `packages/core/src/coverage/report.ts`:

```ts
export type RenderOptions = { includeCovered?: boolean };

export function renderMarkdown(report: CoverageReport, options: RenderOptions = {}): string {
  // ... existing UNCOVERED / STALE / AC GAPS rendering ...

  const covered = report.areas.filter((a) => a.status === 'COVERED');
  if (covered.length > 0) {
    if (options.includeCovered) {
      lines.push(`COVERED — ${covered.length} area${covered.length === 1 ? '' : 's'}`);
      lines.push('');
      covered.forEach((a, i) => {
        lines.push(`  #${i + 1}  ${pad(a.id, 10)} ok`);
      });
      lines.push('');
    } else {
      lines.push(`COVERED — ${covered.length} area${covered.length === 1 ? '' : 's'} (collapsed; show with --all)`);
      lines.push('');
    }
  }

  return lines.join('\n');
}
```

- [ ] **Step 4: Wire into binary**

In `runCoveragePrepare`, when writing markdown:

```ts
writeFileSync(reportMdPath, renderMarkdown(report, { includeCovered: args.all === true }));
```

Add a test that the file content reflects the flag:

```ts
test('--all writes markdown with full COVERED section', async () => {
  // ... fixture with one COVERED area ...
  await runCoveragePrepare({
    snapshotTs: '2026-05-17T10:00:00.000Z',
    emitEvent: false,
    all: true,
  });
  const md = readFileSync(result.reportMdPath, 'utf8');
  expect(md).toContain('  #1');
});
```

- [ ] **Step 5: Verify + commit**

```bash
cd packages/core && bun test test/coverage/report.test.ts test/bin-internal/coverage-prepare.test.ts
```

```bash
git add packages/core/src/coverage/report.ts packages/core/src/bin-internal/coverage-prepare.ts packages/core/test/coverage/report.test.ts packages/core/test/bin-internal/coverage-prepare.test.ts
git commit -m "feat(core): renderMarkdown gains includeCovered option (--all)"
```

---

## Phase 15 — Snapshot event emission

### Task 15.1: Emit `coverage.snapshot` event JSONL after report

**Files:**
- Modify: `packages/core/src/bin-internal/coverage-prepare.ts`
- Modify: `packages/core/test/bin-internal/coverage-prepare.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
test('emits coverage.snapshot JSONL event when autoSnapshotOnCoverage=true', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'xera-coverage-'));
  mkdirSync(join(dir, '.xera', 'graph'), { recursive: true });
  writeFileSync(join(dir, 'xera.config.ts'),
    `import { defineConfig } from '@xera-ai/core';\nexport default defineConfig({ adapters: ['web'], coverage: { autoSnapshotOnCoverage: true } });\n`);
  writeFileSync(join(dir, '.xera', 'graph', 'snapshot.json'), JSON.stringify({
    tickets: {}, scenarios: {}, poms: {}, areas: {},
    ticketEdges: [], scenarioPomEdges: [], pomAreaEdges: [],
    ticketAreaEdges: [], jiraLinkEdges: [], similarEdges: [],
    failureEdges: [], latestFailures: {},
    acNodes: {}, satisfiesEdges: [], classificationEvents: [],
  }));
  const prevCwd = process.cwd();
  process.chdir(dir);
  try {
    const result = await runCoveragePrepare({
      snapshotTs: '2026-05-17T10:00:00.000Z',
    });
    expect(result.eventPath).toBeDefined();
    expect(result.eventPath).toContain('.xera/graph/events/2026-05/');
    expect(result.eventPath).toContain('-coverage-');
    expect(result.eventPath?.endsWith('.jsonl')).toBe(true);

    const eventRaw = readFileSync(result.eventPath!, 'utf8');
    const parsed = JSON.parse(eventRaw.trim());
    expect(parsed.kind).toBe('coverage.snapshot');
    expect(parsed.payload.windowDays).toBe(30);
  } finally {
    process.chdir(prevCwd);
    rmSync(dir, { recursive: true, force: true });
  }
});

test('does not emit event when --no-emit-event flag passed', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'xera-coverage-'));
  mkdirSync(join(dir, '.xera', 'graph'), { recursive: true });
  writeFileSync(join(dir, 'xera.config.ts'),
    `import { defineConfig } from '@xera-ai/core';\nexport default defineConfig({ adapters: ['web'] });\n`);
  writeFileSync(join(dir, '.xera', 'graph', 'snapshot.json'), JSON.stringify({
    tickets: {}, scenarios: {}, poms: {}, areas: {},
    ticketEdges: [], scenarioPomEdges: [], pomAreaEdges: [],
    ticketAreaEdges: [], jiraLinkEdges: [], similarEdges: [],
    failureEdges: [], latestFailures: {},
    acNodes: {}, satisfiesEdges: [], classificationEvents: [],
  }));
  const prevCwd = process.cwd();
  process.chdir(dir);
  try {
    const result = await runCoveragePrepare({
      snapshotTs: '2026-05-17T10:00:00.000Z',
      emitEvent: false,
    });
    expect(result.eventPath).toBeUndefined();
  } finally {
    process.chdir(prevCwd);
    rmSync(dir, { recursive: true, force: true });
  }
});

test('does not emit when config.coverage.autoSnapshotOnCoverage=false', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'xera-coverage-'));
  mkdirSync(join(dir, '.xera', 'graph'), { recursive: true });
  writeFileSync(join(dir, 'xera.config.ts'),
    `import { defineConfig } from '@xera-ai/core';\nexport default defineConfig({ adapters: ['web'], coverage: { autoSnapshotOnCoverage: false } });\n`);
  writeFileSync(join(dir, '.xera', 'graph', 'snapshot.json'), JSON.stringify({
    tickets: {}, scenarios: {}, poms: {}, areas: {},
    ticketEdges: [], scenarioPomEdges: [], pomAreaEdges: [],
    ticketAreaEdges: [], jiraLinkEdges: [], similarEdges: [],
    failureEdges: [], latestFailures: {},
    acNodes: {}, satisfiesEdges: [], classificationEvents: [],
  }));
  const prevCwd = process.cwd();
  process.chdir(dir);
  try {
    const result = await runCoveragePrepare({
      snapshotTs: '2026-05-17T10:00:00.000Z',
    });
    expect(result.eventPath).toBeUndefined();
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

- [ ] **Step 3: Implement emission**

In `runCoveragePrepare`, after writing report files, decide on event emission:

```ts
import { ulid } from '../graph/ulid';   // existing helper

// ... after writeFileSync of report.md ...

const shouldEmit = args.emitEvent !== false && coverageCfg.autoSnapshotOnCoverage;
let eventPath: string | undefined;
if (shouldEmit) {
  const yyyymm = now.toISOString().slice(0, 7);   // YYYY-MM
  const eventsDir = join(cwd, '.xera', 'graph', 'events', yyyymm);
  mkdirSync(eventsDir, { recursive: true });
  const sessionId = process.env['XERA_SESSION_ID'] ?? 'local';
  const id = ulid();
  eventPath = join(eventsDir, `${id}-coverage-${sessionId}.jsonl`);
  const event = {
    kind: 'coverage.snapshot',
    payload: {
      ts: now.toISOString(),
      windowDays: coverageCfg.staleAfterDays,
      areas: report.areas.map((a) => ({
        id: a.id, status: a.status, risk: a.risk,
        breakdown: a.breakdown,
      })),
      tickets: report.tickets.map((t) => ({
        id: t.id, acCount: t.acCount,
        satisfiedCount: t.satisfiedCount, gapScore: t.gapScore,
      })),
    },
  };
  // Atomic tmp + rename to mirror existing event-writer pattern
  const tmpPath = `${eventPath}.tmp`;
  writeFileSync(tmpPath, JSON.stringify(event) + '\n');
  // (use fs.renameSync; importing here for completeness)
  const { renameSync } = await import('node:fs');
  renameSync(tmpPath, eventPath);
}

return { reportJsonPath, reportMdPath, eventPath };
```

- [ ] **Step 4: Verify pass**

```bash
cd packages/core && bun test test/bin-internal/coverage-prepare.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/bin-internal/coverage-prepare.ts packages/core/test/bin-internal/coverage-prepare.test.ts
git commit -m "feat(core): coverage-prepare emits coverage.snapshot JSONL event"
```

---

## Phase 16 — `/xera-coverage` skill `.md`

### Task 16.1: Author skill markdown

**Files:**
- Create: `packages/skills/xera-coverage.md`
- Modify: `packages/skills/package.json` if it ships a file manifest (likely auto-exports `*.md`)
- Test: `packages/core/test/verify-prompts/verify-prompts.test.ts` (or wherever skill manifest is asserted)

- [ ] **Step 1: Write the failing test**

Locate the existing skill-count assertion. Update it to expect the new skill:

```ts
// e.g. packages/core/test/skill-manifest/skill-count.test.ts
test('packages/skills/ exports 10 skills after v0.8', () => {
  const files = readdirSync(join(__dirname, '../../../skills'))
    .filter((f) => f.endsWith('.md') && !f.startsWith('README'));
  expect(files.sort()).toEqual([
    'xera-coverage.md',
    'xera-eval.md',
    'xera-exec.md',
    'xera-feature.md',
    'xera-fetch.md',
    'xera-fill-gap.md',   // added in Plan 05 — see note
    'xera-impact.md',
    'xera-promote.md',
    'xera-run.md',
    'xera-script.md',
  ]);
});
```

For Plan 02's checkpoint, the list should NOT include `xera-fill-gap.md` yet (Plan 05). Adjust:

```ts
test('packages/skills/ exports 9 skills after Plan 02', () => {
  const files = readdirSync(join(__dirname, '../../../skills'))
    .filter((f) => f.endsWith('.md') && !f.startsWith('README'));
  expect(files.sort()).toEqual([
    'xera-coverage.md',     // NEW v0.8 Plan 02
    'xera-eval.md',
    'xera-exec.md',
    'xera-feature.md',
    'xera-fetch.md',
    'xera-impact.md',
    'xera-promote.md',
    'xera-run.md',
    'xera-script.md',
  ]);
});
```

- [ ] **Step 2: Verify failure**

```bash
cd packages/core && bun test test/skill-manifest/skill-count.test.ts
```

Expected: `xera-coverage.md` missing.

- [ ] **Step 3: Author `packages/skills/xera-coverage.md`**

```markdown
---
name: xera-coverage
description: Show area-level and AC-level coverage report for the current xera project; sort by risk; drill-down via --why; optional HTML viewer.
version: 0.8.0
inputs:
  - flag (optional): --why <area-or-ticket>
  - flag (optional): --all
  - flag (optional): --json
  - flag (optional): --viewer
outputs:
  - .xera/coverage/report.json
  - .xera/coverage/report.md (printed to terminal)
  - .xera/graph/events/<YYYY-MM>/<ULID>-coverage-<session>.jsonl (when autoSnapshotOnCoverage=true)
---

# /xera-coverage

You are running inside a xera consumer project. Use this skill to show the
coverage report.

## Workflow

1. **Validate the project layout.** Confirm `xera.config.ts` exists in the
   current working directory and that `.xera/graph/snapshot.json` is present.
   If the snapshot is missing, stop and tell the user:

   > Graph snapshot not found. Run `bun run xera:graph-backfill` first to
   > materialize it from event history.

2. **Run coverage-prepare.** Invoke the binary with any flags the user passed:

   ```
   bun run xera:coverage-prepare [--why <id>] [--all] [--json] [--no-emit-event]
   ```

   - For `--why <id>`, just pass it through; the binary handles area-vs-ticket
     detection and prints the drill-down to stdout. Return that stdout to the
     user; no further steps.
   - For `--json`, the binary prints JSON to stdout. Return it; no further
     steps.
   - Otherwise, the binary writes `.xera/coverage/report.json` and
     `.xera/coverage/report.md`.

3. **Read `.xera/coverage/report.json`.** If `acBackfillNeeded === true`,
   print this warning before the report:

   > AC backfill is needed for legacy scenarios. AC-level coverage may be
   > incomplete until backfill is wired up (planned for v0.8.0-beta).

   (Plan 03 will replace this stub with the actual backfill orchestration.)

4. **Print `.xera/coverage/report.md`** to the terminal.

5. **If `--viewer` was passed**, print:

   > HTML viewer for coverage is planned for v0.8.1. For now, this flag is
   > a no-op.

   (Plan 04 will wire `--viewer` through to `graph-render --include-coverage`.)

6. **Print next-step hints:**

   ```
   Next:
     /xera-coverage --why <area-or-TICKET>   full breakdown
     /xera-coverage --viewer                  HTML viewer (v0.8.1)
     /xera-fill-gap <area>                    draft scenarios (v0.8.2)
     /xera-fill-gap --ticket <TICKET>         draft AC gap scenarios (v0.8.2)
   ```

## Exit codes

| Code | Meaning |
|---|---|
| 0    | Report generated, no errors |
| 1    | Graph snapshot missing or corrupt |
| 2    | Config invalid (e.g. `coverage.criticalAreas` slug malformed) |
```

- [ ] **Step 4: Verify pass**

```bash
cd packages/core && bun test test/skill-manifest/skill-count.test.ts
```

If `verify-prompts` validates skill frontmatter shape, run that too:

```bash
bun run xera:verify-prompts
```

Expected: no errors (skill frontmatter parses; in-scope prompt count unchanged at 9 until Plan 03 adds `map-ac-to-scenarios`).

- [ ] **Step 5: Commit**

```bash
git add packages/skills/xera-coverage.md packages/core/test/skill-manifest/skill-count.test.ts
git commit -m "feat(skills): add xera-coverage skill .md (v0.8.0 Plan 02)"
```

---

## Phase 17 — `cli/doctor` checks

### Task 17.1: Warn if `coverage.staleAfterDays > 90`

**Files:**
- Modify: `packages/cli/src/commands/doctor.ts`
- Test: `packages/cli/test/doctor.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, test, expect } from 'bun:test';
import { runDoctor } from '../src/commands/doctor';
// reuse existing makeTempProject helper (or inline)

describe('doctor coverage checks', () => {
  test('warns when staleAfterDays > 90', async () => {
    // ... set up project with coverage.staleAfterDays: 120 ...
    const result = await runDoctor({ cwd: dir });
    expect(result.warnings.some(w => w.includes('staleAfterDays') && w.includes('large window'))).toBe(true);
  });

  test('no warning when staleAfterDays <= 90', async () => {
    // ... project with staleAfterDays: 60 ...
    const result = await runDoctor({ cwd: dir });
    expect(result.warnings.some(w => w.includes('staleAfterDays'))).toBe(false);
  });
});
```

- [ ] **Step 2: Verify failure**

```bash
cd packages/cli && bun test test/doctor.test.ts
```

- [ ] **Step 3: Implement**

In `packages/cli/src/commands/doctor.ts`, locate where other config-based warnings are pushed. Add:

```ts
if (config.coverage.staleAfterDays > 90) {
  result.warnings.push(
    `coverage.staleAfterDays = ${config.coverage.staleAfterDays} is a very large window — coverage will be slow to react to drift`,
  );
}
```

- [ ] **Step 4: Verify pass**

```bash
cd packages/cli && bun test test/doctor.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add packages/cli/src/commands/doctor.ts packages/cli/test/doctor.test.ts
git commit -m "feat(cli): doctor warns when coverage.staleAfterDays > 90"
```

---

### Task 17.2: Warn when `criticalAreas` contains a slug not present as AreaNode

**Files:**
- Modify: `packages/cli/src/commands/doctor.ts`
- Modify: `packages/cli/test/doctor.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
test('warns when criticalAreas contains a slug missing from graph', async () => {
  // project with coverage.criticalAreas: ['typo'], snapshot has no 'typo' area
  const result = await runDoctor({ cwd: dir });
  expect(result.warnings.some(w => w.includes('typo') && w.includes('marked critical') && w.includes('check spelling'))).toBe(true);
});

test('no warning when all critical areas exist in graph', async () => {
  // project with criticalAreas: ['checkout'], snapshot has areas.checkout
  const result = await runDoctor({ cwd: dir });
  expect(result.warnings.some(w => w.includes('marked critical'))).toBe(false);
});
```

- [ ] **Step 2: Verify failure**

```bash
cd packages/cli && bun test test/doctor.test.ts
```

- [ ] **Step 3: Implement**

In `runDoctor`, after loading the snapshot:

```ts
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const snapshotPath = join(cwd, '.xera', 'graph', 'snapshot.json');
if (existsSync(snapshotPath)) {
  const snap = JSON.parse(readFileSync(snapshotPath, 'utf8'));
  const areaIds = new Set(Object.keys(snap.areas ?? {}));
  for (const slug of config.coverage.criticalAreas) {
    if (!areaIds.has(slug)) {
      result.warnings.push(
        `"${slug}" is marked critical but no ticket modifies this area; check spelling`,
      );
    }
  }
}
```

- [ ] **Step 4: Verify pass**

```bash
cd packages/cli && bun test test/doctor.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add packages/cli/src/commands/doctor.ts packages/cli/test/doctor.test.ts
git commit -m "feat(cli): doctor warns on unknown criticalAreas slug"
```

---

### Task 17.3: Warn when `acceptanceCriteria.length > 0` but no `ACNode` materialized

**Files:**
- Modify: `packages/cli/src/commands/doctor.ts`
- Modify: `packages/cli/test/doctor.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
test('warns when ticket has ACs but no ACNode materialized (snapshot stale)', async () => {
  // snapshot: tickets['PROJ-1'].acceptanceCriteria = ['x'], but acNodes = {}
  const result = await runDoctor({ cwd: dir });
  expect(result.warnings.some(w => w.includes('PROJ-1') && w.includes('ACNode not materialized'))).toBe(true);
});

test('no warning when ACNodes match acceptanceCriteria', async () => {
  // snapshot with acNodes['PROJ-1#ac-0']
  const result = await runDoctor({ cwd: dir });
  expect(result.warnings.some(w => w.includes('ACNode not materialized'))).toBe(false);
});
```

- [ ] **Step 2: Verify failure**

```bash
cd packages/cli && bun test test/doctor.test.ts
```

- [ ] **Step 3: Implement**

```ts
for (const ticket of Object.values(snap.tickets ?? {}) as Array<{ id: string; acceptanceCriteria: string[] }>) {
  if (ticket.acceptanceCriteria.length === 0) continue;
  const hasAnyAcNode = Object.values(snap.acNodes ?? {}).some(
    (n: any) => n.ticketId === ticket.id,
  );
  if (!hasAnyAcNode) {
    result.warnings.push(
      `${ticket.id}: ACNode not materialized in snapshot — run "bun run xera:graph-backfill" to refresh`,
    );
  }
}
```

- [ ] **Step 4: Verify pass**

```bash
cd packages/cli && bun test test/doctor.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add packages/cli/src/commands/doctor.ts packages/cli/test/doctor.test.ts
git commit -m "feat(cli): doctor warns on missing ACNode materialization"
```

---

## Phase 18 — Integration: coverage-prepare against golden fixtures

### Task 18.1: E2E test — coverage-prepare loads `mixed.json` and writes expected report

**Files:**
- Create: `packages/core/test/bin-internal/coverage-prepare-golden.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, test, expect } from 'bun:test';
import { runCoveragePrepare } from '../../src/bin-internal/coverage-prepare';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, copyFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const fixtureDir = join(here, '../../../../fixtures/golden-coverage');

function setupGoldenProject(fixtureName: string): string {
  const dir = mkdtempSync(join(tmpdir(), `xera-coverage-${fixtureName}-`));
  mkdirSync(join(dir, '.xera', 'graph'), { recursive: true });
  writeFileSync(
    join(dir, 'xera.config.ts'),
    `import { defineConfig } from '@xera-ai/core';\nexport default defineConfig({ adapters: ['web'] });\n`,
  );
  copyFileSync(
    join(fixtureDir, `${fixtureName}.json`),
    join(dir, '.xera', 'graph', 'snapshot.json'),
  );
  return dir;
}

describe('coverage-prepare against golden fixtures', () => {
  test('mixed.json produces expected report', async () => {
    const dir = setupGoldenProject('mixed');
    const prevCwd = process.cwd();
    process.chdir(dir);
    try {
      const result = await runCoveragePrepare({
        snapshotTs: '2026-05-17T10:00:00.000Z',
        emitEvent: false,
      });
      const report = JSON.parse(readFileSync(result.reportJsonPath, 'utf8'));
      const expected = JSON.parse(readFileSync(join(fixtureDir, 'mixed.expected.json'), 'utf8'));
      expect(report).toEqual(expected);
    } finally {
      process.chdir(prevCwd);
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('critical-boost requires config override', async () => {
    const dir = setupGoldenProject('critical-boost');
    // Overwrite config to include criticalAreas
    writeFileSync(
      join(dir, 'xera.config.ts'),
      `import { defineConfig } from '@xera-ai/core';\nexport default defineConfig({ adapters: ['web'], coverage: { criticalAreas: ['checkout'] } });\n`,
    );
    const prevCwd = process.cwd();
    process.chdir(dir);
    try {
      const result = await runCoveragePrepare({
        snapshotTs: '2026-05-17T10:00:00.000Z',
        emitEvent: false,
      });
      const report = JSON.parse(readFileSync(result.reportJsonPath, 'utf8'));
      const expected = JSON.parse(readFileSync(join(fixtureDir, 'critical-boost.expected.json'), 'utf8'));
      expect(report).toEqual(expected);
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

- [ ] **Step 3: No new implementation needed** — should pass if Plan 01 and prior Plan 02 tasks are correct. If it fails, the failure points at either:
  - `coverage-prepare` not reading `coverage.criticalAreas` from config (re-check Task 12.2)
  - Sort tie-break missing (re-check Task 9.5 step 2 note)
  - Path resolution differing across OSes (use `path.posix` if needed)

Fix the underlying issue rather than relaxing the assertion.

- [ ] **Step 4: Verify pass**

```bash
cd packages/core && bun test test/bin-internal/coverage-prepare-golden.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add packages/core/test/bin-internal/coverage-prepare-golden.test.ts
git commit -m "test(core): E2E coverage-prepare against golden fixtures"
```

---

## Phase 19 — Manual smoke + checkpoint

### Task 19.1: Manual smoke in a throwaway project

This is a non-automated step. Document the exact recipe so the engineer can reproduce.

- [ ] **Step 1: Scaffold a throwaway project**

```bash
cd /tmp && rm -rf xera-coverage-smoke && mkdir xera-coverage-smoke && cd xera-coverage-smoke
bunx @xera-ai/cli init --yes --shape web
```

- [ ] **Step 2: Seed a graph snapshot from `mixed.json`**

```bash
mkdir -p .xera/graph
cp /home/user/xera/fixtures/golden-coverage/mixed.json .xera/graph/snapshot.json
```

- [ ] **Step 3: Add criticalAreas to config**

Edit `xera.config.ts`:

```ts
coverage: {
  criticalAreas: ['checkout'],
},
```

- [ ] **Step 4: Run `bun run xera:coverage-prepare` directly**

```bash
bun run xera:coverage-prepare
```

Expected output: report.md printed via skill workflow (when run via skill — for the binary directly, files written to `.xera/coverage/`). Verify:

```bash
cat .xera/coverage/report.md
```

Expected: UNCOVERED section with `checkout`, STALE with `search`, AC GAPS with `PROJ-101`.

- [ ] **Step 5: Run `bun run xera:coverage-prepare --why checkout`**

Expected: drill-down printout with formula expansion.

- [ ] **Step 6: Run `bun run xera:coverage-prepare --why PROJ-101`**

Expected: AC list with ✗ markers.

- [ ] **Step 7: Confirm event emission**

```bash
ls .xera/graph/events/2026-05/
```

Expected: one `<ULID>-coverage-<session>.jsonl` file.

- [ ] **Step 8: Run `bunx @xera-ai/cli doctor`**

Expected: ok with no warnings (or one warning if smoke run modified `staleAfterDays` > 90).

- [ ] **Step 9: Cleanup**

```bash
cd / && rm -rf /tmp/xera-coverage-smoke
```

- [ ] **Step 10: Checkpoint commit**

```bash
cd /home/user/xera && git status   # should be clean
```

If there were any tweaks during smoke (most often: a stdout-flush issue, or a path on case-insensitive filesystems), commit them:

```bash
git commit -am "chore(core): smoke-test fix-ups for coverage-prepare"
```

---

## Phase 20 — Workspace typecheck + full test run

### Task 20.1: Workspace-level verification

- [ ] **Step 1: Typecheck workspace**

```bash
cd /home/user/xera && bun run typecheck
```

Expected: no errors.

- [ ] **Step 2: Run full test suite**

```bash
cd /home/user/xera && bun test
```

Expected: all pass — Plan 01 + Plan 02 tests + no v0.6/v0.7 regressions.

- [ ] **Step 3: Run `bun run xera:verify-prompts`**

Expected: 9 in-scope prompts (unchanged from baseline — `map-ac-to-scenarios.md` lands in Plan 03).

- [ ] **Step 4: Run `bun run xera:doctor` against this monorepo**

Expected: same warnings as before the plan (this repo is the monorepo, not a consumer project; coverage warnings about missing `.xera/graph/snapshot.json` are expected here).

---

## Done

End state of Plan 02:

- `packages/core/src/config/schema.ts` — adds `CoverageConfigSchema` block to top-level `ConfigSchema`
- `packages/core/src/bin-internal/coverage-prepare.ts` — full implementation: CLI args parsing, graph load, report compute, JSON + markdown write, optional `coverage.snapshot` event emission, `--why` drill-down, `--json` stdout, `--all` includeCovered
- `packages/skills/xera-coverage.md` — user-facing skill that calls the binary, handles flag pass-through, prints output, prints next-step hints, stubs `--viewer` (Plan 04) and AC backfill warning (Plan 03)
- `packages/cli/src/commands/doctor.ts` — three coverage-related warnings (large window, unknown criticalAreas slug, missing ACNode materialization)
- `packages/core/src/coverage/report.ts` — `renderMarkdown` gains `RenderOptions { includeCovered }`; sort tie-break made deterministic
- `packages/core/test/bin-internal/coverage-prepare.test.ts` — unit + integration tests
- `packages/core/test/bin-internal/coverage-prepare-golden.test.ts` — E2E against golden fixtures from Plan 01

What works after Plan 02:

- `bun run xera:coverage-prepare` produces a coverage report in any v0.8.0-alpha project
- `/xera-coverage` skill prints the report; `--why` drill-down works; `--json` machine output works; `--all` reveals COVERED
- Snapshot events accumulate in `.xera/graph/events/` for Trend tab consumption (Plan 04)
- Doctor surfaces config + snapshot health
- All six golden fixtures from Plan 01 produce expected output end-to-end

What's still missing for v0.8.0 release:

- AC backfill flow (Plan 03): `/xera-script` extension to write `satisfiesAcs`, `map-ac-to-scenarios.md` prompt, `ac-coverage-backfill-prepare/finalize` binaries, skill update to auto-run backfill on first invocation
- HTML viewer Coverage tab (Plan 04, v0.8.1)
- `/xera-fill-gap` generative skill (Plan 05, v0.8.2)

Plan 02's CLI surface is complete and stable — Plan 03 only extends it (skill workflow gains the backfill orchestration step; binary is unchanged).
