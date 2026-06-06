# xera Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship `xera dashboard` — a single command that aggregates cross-ticket last-run results into text / JSON / HTML, with `--serve` mode for browser drill-down. Closes the "no project-level test result view" gap (existing graph viewer = structure; coverage = AC gaps; dashboard = test status).

**Architecture:** Pure deterministic binary `xera-internal dashboard` walks `.xera/<TICKET>/status.json` files + graph snapshot, applies filters server-side, renders text/JSON/HTML. CLI `xera dashboard` wraps the binary and adds `--serve` via a shared `serveHtmlFile` helper extracted from `show-report.ts`. No AI, no LLM, no new artifact writes. New optional config block `dashboard: { staleAfterDays, recentFailureLimit }`.

**Tech Stack:** TypeScript ESM, Zod, vitest, plain HTML/CSS/vanilla JS (no framework, no vis-network). Reuses `deriveSnapshot(loadAllEvents(cwd))` from v0.6 graph + `readStatus` from v0.1 artifact layer.

**Spec:** [2026-06-06-xera-dashboard-design.md](../specs/2026-06-06-xera-dashboard-design.md). Open questions §12 locked as:
- (1) keep `open` package for browser launch (consistent with `show-report`)
- (2) auto-refresh OUT of scope, documented as follow-up
- (3) per-scenario expansion IN scope if ≤ 30 LOC vanilla JS — implement; bail to follow-up if it grows
- (4) plain ANSI escape codes in core (no picocolors dep in core), gated on `process.stdout.isTTY`
- (5) `--watch` OUT of scope, follow-up

**Conventions:**
- `exactOptionalPropertyTypes` + `noUncheckedIndexedAccess` ON
- ESM only
- vitest (not jest)
- Tests that `process.chdir` MUST restore in `afterEach`
- No comments unless WHY non-obvious
- Workspace deps explicit caret semver

---

## File Structure

| File | Action | Responsibility |
|---|---|---|
| `packages/core/src/config/schema.ts` | Modify | Add `DashboardSchema` + optional `dashboard` field |
| `packages/core/src/dashboard/types.ts` | Create | `DashboardSnapshot`, `TicketRow`, etc. types + Zod schemas |
| `packages/core/src/dashboard/collect.ts` | Create | `collectDashboard(cwd, opts)` pure collector |
| `packages/core/src/dashboard/render-text.ts` | Create | `renderText(snapshot, opts): string` ASCII renderer |
| `packages/core/src/dashboard/render-html.ts` | Create | `renderHtml(snapshot, opts): string` self-contained HTML |
| `packages/core/src/dashboard/index.ts` | Create | Public re-exports |
| `packages/core/src/index.ts` | Modify | Re-export `DashboardSnapshotSchema` |
| `packages/core/src/bin-internal/dashboard.ts` | Create | `dashboardCmd(argv)` flag parser + delegation |
| `packages/core/src/bin-internal/index.ts` | Modify | Dispatch `'dashboard'` → `dashboardCmd` |
| `packages/cli/src/serve.ts` | Create | `serveHtmlFile(file, port, rootDir)` shared helper |
| `packages/cli/src/commands/show-report.ts` | Modify | Use `serveHtmlFile` from new shared module |
| `packages/cli/src/commands/dashboard.ts` | Create | `xera dashboard` command (incl. `--serve`) |
| `packages/cli/src/index.ts` | Modify | Register `dashboard` subcommand |
| `packages/cli/templates/AGENTS.md.tmpl` | Modify | Add dashboard commands to scripts table |
| `docs/CONFIGURATION.md` | Modify | New "Dashboard" section + `dashboard` config block |
| `packages/core/test/dashboard/types.test.ts` | Create | Zod schema round-trip |
| `packages/core/test/dashboard/collect.test.ts` | Create | Golden fixture project tests |
| `packages/core/test/dashboard/render-text.test.ts` | Create | Snapshot test for text output |
| `packages/core/test/dashboard/render-html.test.ts` | Create | Smoke test HTML contains expected elements |
| `packages/core/test/bin-internal/dashboard.test.ts` | Create | Binary integration test |
| `packages/cli/test/dashboard.test.ts` | Create | CLI exit codes |
| `fixtures/golden-dashboard/5-tickets/` | Create | Pre-seeded project fixture |
| `.changeset/dashboard.md` | Create | Minor bump (fixed group v0.23.0) |

13 modifications + 13 creations.

---

## Task 1: Config schema `dashboard` block

**Files:**
- Modify: `packages/core/src/config/schema.ts`
- Test: `packages/core/test/config/dashboard-schema.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// packages/core/test/config/dashboard-schema.test.ts
import { describe, expect, test } from 'vitest';
import { XeraConfigSchema } from '../../src/config/schema';

const base = {
  github: { repo: 'owner/repo' },
  adapters: ['web' as const],
  web: { baseUrl: { dev: 'http://example.test' }, defaultEnv: 'dev', auth: {} },
};

describe('dashboard config schema', () => {
  test('omitted dashboard block is fine (backwards compat)', () => {
    const cfg = XeraConfigSchema.parse(base);
    expect(cfg.dashboard).toBeUndefined();
  });

  test('accepts dashboard block with defaults', () => {
    const cfg = XeraConfigSchema.parse({ ...base, dashboard: {} });
    expect(cfg.dashboard?.staleAfterDays).toBe(7);
    expect(cfg.dashboard?.recentFailureLimit).toBe(10);
  });

  test('accepts explicit values', () => {
    const cfg = XeraConfigSchema.parse({ ...base, dashboard: { staleAfterDays: 14, recentFailureLimit: 25 } });
    expect(cfg.dashboard?.staleAfterDays).toBe(14);
    expect(cfg.dashboard?.recentFailureLimit).toBe(25);
  });

  test('rejects negative values', () => {
    const r = XeraConfigSchema.safeParse({ ...base, dashboard: { staleAfterDays: -1 } });
    expect(r.success).toBe(false);
  });
});
```

- [ ] **Step 2: Run to confirm FAIL**

```bash
npx vitest run packages/core/test/config/dashboard-schema.test.ts
```

Expected: FAIL — schema doesn't know `dashboard` key.

- [ ] **Step 3: Modify schema.ts**

After the existing `ReportingSchema` (or similar mid-file block), add:

```ts
const DashboardSchema = z
  .object({
    staleAfterDays: z.number().int().positive().default(7),
    recentFailureLimit: z.number().int().positive().default(10),
  })
  .prefault({});
```

In the main `XeraConfigSchema` `.object({...})` block, add:

```ts
dashboard: DashboardSchema.optional(),
```

- [ ] **Step 4: Run PASS + regressions**

```bash
npx vitest run packages/core/test/config/dashboard-schema.test.ts
npx vitest run packages/core/test/config/
```

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/config/schema.ts packages/core/test/config/dashboard-schema.test.ts
git commit -m "feat(core): dashboard config block (staleAfterDays, recentFailureLimit)"
```

---

## Task 2: `dashboard/types.ts` — types + Zod schema

**Files:**
- Create: `packages/core/src/dashboard/types.ts`
- Test: `packages/core/test/dashboard/types.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// packages/core/test/dashboard/types.test.ts
import { describe, expect, test } from 'vitest';
import { DashboardSnapshotSchema, type DashboardSnapshot } from '../../src/dashboard/types';

const minimal: DashboardSnapshot = {
  generated_at: '2026-06-06T00:00:00.000Z',
  totals: { tickets: 0, last_pass: 0, last_fail: 0, never_run: 0, scenarios_pass: 0, scenarios_fail: 0 },
  classifications: [],
  tickets: [],
  recent_failures: [],
  stale: [],
  critical_alerts: [],
  top_failing_areas: [],
  filters_applied: {},
};

describe('DashboardSnapshotSchema', () => {
  test('round-trips a minimal snapshot', () => {
    const parsed = DashboardSnapshotSchema.parse(minimal);
    expect(parsed.totals.tickets).toBe(0);
  });

  test('round-trips a full snapshot with one ticket', () => {
    const full: DashboardSnapshot = {
      ...minimal,
      totals: { tickets: 1, last_pass: 0, last_fail: 1, never_run: 0, scenarios_pass: 3, scenarios_fail: 2 },
      classifications: [{ classification: 'REAL_BUG', count: 1 }],
      tickets: [{
        ticketId: 'TICKET-001', result: 'FAIL', classification: 'REAL_BUG', confidence: 0.85,
        scenarios: { total: 5, passed: 3, failed: 2 }, lastRun: '2026-06-06T08:23:14.000Z',
        areas: ['checkout'], has_html_report: true,
      }],
      recent_failures: [{
        ticketId: 'TICKET-001', classification: 'REAL_BUG', confidence: 0.85,
        lastRun: '2026-06-06T08:23:14.000Z', scenarios_failed: 2, scenarios_total: 5, areas: ['checkout'],
      }],
      critical_alerts: [{ area: 'checkout', failing_tickets: ['TICKET-001'], is_critical: true }],
      top_failing_areas: [{ area: 'checkout', failing_tickets: ['TICKET-001'], is_critical: true }],
      filters_applied: { failing_only: true },
    };
    const parsed = DashboardSnapshotSchema.parse(full);
    expect(parsed.tickets[0]?.ticketId).toBe('TICKET-001');
  });

  test('rejects invalid result enum', () => {
    const bad = { ...minimal, tickets: [{ ticketId: 'X', result: 'WAT', classification: null, confidence: null,
      scenarios: { total: 0, passed: 0, failed: 0 }, lastRun: null, areas: [], has_html_report: false }] };
    expect(DashboardSnapshotSchema.safeParse(bad).success).toBe(false);
  });
});
```

- [ ] **Step 2: Run to confirm FAIL**

Expected: module not found.

- [ ] **Step 3: Implement `types.ts`**

```ts
import { z } from 'zod';

export const TicketResultEnum = z.enum(['PASS', 'FAIL', 'UNKNOWN', 'NEVER_RUN']);

export const TicketRowSchema = z.object({
  ticketId: z.string(),
  result: TicketResultEnum,
  classification: z.string().nullable(),
  confidence: z.number().nullable(),
  scenarios: z.object({
    total: z.number().int().nonnegative(),
    passed: z.number().int().nonnegative(),
    failed: z.number().int().nonnegative(),
  }),
  lastRun: z.string().nullable(),
  areas: z.array(z.string()),
  has_html_report: z.boolean(),
});

export const RecentFailureSchema = z.object({
  ticketId: z.string(),
  classification: z.string(),
  confidence: z.number(),
  lastRun: z.string(),
  scenarios_failed: z.number().int().nonnegative(),
  scenarios_total: z.number().int().nonnegative(),
  areas: z.array(z.string()),
});

export const ClassificationBinSchema = z.object({
  classification: z.string(),
  count: z.number().int().nonnegative(),
});

export const AreaStatSchema = z.object({
  area: z.string(),
  failing_tickets: z.array(z.string()),
  is_critical: z.boolean(),
});

export const AppliedFiltersSchema = z.object({
  since: z.string().optional(),
  classifications: z.array(z.string()).optional(),
  areas: z.array(z.string()).optional(),
  failing_only: z.boolean().optional(),
});

export const DashboardSnapshotSchema = z.object({
  generated_at: z.string(),
  totals: z.object({
    tickets: z.number().int().nonnegative(),
    last_pass: z.number().int().nonnegative(),
    last_fail: z.number().int().nonnegative(),
    never_run: z.number().int().nonnegative(),
    scenarios_pass: z.number().int().nonnegative(),
    scenarios_fail: z.number().int().nonnegative(),
  }),
  classifications: z.array(ClassificationBinSchema),
  tickets: z.array(TicketRowSchema),
  recent_failures: z.array(RecentFailureSchema),
  stale: z.array(TicketRowSchema),
  critical_alerts: z.array(AreaStatSchema),
  top_failing_areas: z.array(AreaStatSchema),
  filters_applied: AppliedFiltersSchema,
});

export type DashboardSnapshot = z.infer<typeof DashboardSnapshotSchema>;
export type TicketRow = z.infer<typeof TicketRowSchema>;
export type RecentFailure = z.infer<typeof RecentFailureSchema>;
export type ClassificationBin = z.infer<typeof ClassificationBinSchema>;
export type AreaStat = z.infer<typeof AreaStatSchema>;
export type AppliedFilters = z.infer<typeof AppliedFiltersSchema>;

export interface CollectOpts {
  since?: string;
  classifications?: string[];
  areas?: string[];
  failingOnly?: boolean;
}
```

- [ ] **Step 4: Run PASS**

```bash
npx vitest run packages/core/test/dashboard/types.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/dashboard/types.ts packages/core/test/dashboard/types.test.ts
git commit -m "feat(core): DashboardSnapshot types + Zod schema"
```

---

## Task 3: Golden fixture `golden-dashboard/5-tickets/`

This fixture is shared by Tasks 4–7. Build it now so subsequent tests have stable data.

**Files:**
- Create: `fixtures/golden-dashboard/5-tickets/xera.config.ts`
- Create: `fixtures/golden-dashboard/5-tickets/.xera/TICKET-001/status.json`
- Create: `fixtures/golden-dashboard/5-tickets/.xera/TICKET-002/status.json`
- Create: `fixtures/golden-dashboard/5-tickets/.xera/TICKET-003/status.json`
- Create: `fixtures/golden-dashboard/5-tickets/.xera/TICKET-004/status.json`
- Create: `fixtures/golden-dashboard/5-tickets/.xera/TICKET-005/` (no status.json — NEVER_RUN)
- Create: `fixtures/golden-dashboard/5-tickets/.xera/graph/events/seed.jsonl` (area edges)
- Create: `fixtures/golden-dashboard/5-tickets/expected-snapshot.json`
- Create: `fixtures/golden-dashboard/5-tickets/expected-text.txt`

- [ ] **Step 1: Create config**

```ts
// fixtures/golden-dashboard/5-tickets/xera.config.ts
export default {
  github: { repo: 'owner/test' },
  adapters: ['web'],
  web: { baseUrl: { dev: 'http://test.local' }, defaultEnv: 'dev', auth: {} },
  coverage: { criticalAreas: ['checkout'] },
  dashboard: { staleAfterDays: 7 },
};
```

- [ ] **Step 2: Create 5 ticket status files**

`TICKET-001/status.json` (PASS, recent):
```json
{
  "result": "PASS", "classification": "PASS", "confidence": 1.0,
  "scenarios": { "total": 5, "passed": 5, "failed": 0 },
  "lastRun": "2026-06-06T08:00:00.000Z",
  "history": [{ "ts": "2026-06-06T08:00:00.000Z", "result": "PASS", "class": "PASS" }]
}
```

`TICKET-002/status.json` (FAIL REAL_BUG in checkout):
```json
{
  "result": "FAIL", "classification": "REAL_BUG", "confidence": 0.85,
  "scenarios": { "total": 5, "passed": 3, "failed": 2 },
  "lastRun": "2026-06-06T07:00:00.000Z",
  "history": []
}
```

`TICKET-003/status.json` (FAIL SELECTOR_DRIFT in auth):
```json
{
  "result": "FAIL", "classification": "SELECTOR_DRIFT", "confidence": 0.92,
  "scenarios": { "total": 6, "passed": 4, "failed": 2 },
  "lastRun": "2026-06-05T22:00:00.000Z",
  "history": []
}
```

`TICKET-004/status.json` (PASS, stale — 10d ago):
```json
{
  "result": "PASS", "classification": "PASS", "confidence": 1.0,
  "scenarios": { "total": 3, "passed": 3, "failed": 0 },
  "lastRun": "2026-05-27T12:00:00.000Z",
  "history": []
}
```

`TICKET-005/` — empty dir, NO `status.json` (NEVER_RUN row).

- [ ] **Step 3: Seed graph events for area mapping**

`.xera/graph/events/seed.jsonl`:
```
{"type":"fetch","ticketId":"TICKET-001","areas":["profile"],"ts":"2026-06-01T00:00:00.000Z"}
{"type":"fetch","ticketId":"TICKET-002","areas":["checkout"],"ts":"2026-06-01T00:00:00.000Z"}
{"type":"fetch","ticketId":"TICKET-003","areas":["auth","login"],"ts":"2026-06-01T00:00:00.000Z"}
{"type":"fetch","ticketId":"TICKET-004","areas":["reports"],"ts":"2026-06-01T00:00:00.000Z"}
{"type":"fetch","ticketId":"TICKET-005","areas":["settings"],"ts":"2026-06-01T00:00:00.000Z"}
```

(Confirm by reading `packages/core/src/graph/types.ts` for the exact `Event` shape — adapt the JSON fields to match the union members. If the event schema requires additional required fields the implementer must add them; pause and inspect `packages/core/src/graph/store.ts` for the parser's required keys.)

- [ ] **Step 4: Create expected snapshot fixture**

`expected-snapshot.json` — partial, key fields only:
```json
{
  "totals": { "tickets": 5, "last_pass": 2, "last_fail": 2, "never_run": 1, "scenarios_pass": 15, "scenarios_fail": 4 },
  "classifications": [
    { "classification": "PASS", "count": 2 },
    { "classification": "REAL_BUG", "count": 1 },
    { "classification": "SELECTOR_DRIFT", "count": 1 }
  ],
  "critical_alerts_areas": ["checkout"]
}
```

Tests compare specific fields, not the whole snapshot (timestamps are not stable).

- [ ] **Step 5: Commit fixture**

```bash
git add fixtures/golden-dashboard/
git commit -m "test: golden-dashboard 5-tickets fixture"
```

---

## Task 4: `collectDashboard` collector

**Files:**
- Create: `packages/core/src/dashboard/collect.ts`
- Test: `packages/core/test/dashboard/collect.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// packages/core/test/dashboard/collect.test.ts
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { cpSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { collectDashboard } from '../../src/dashboard/collect';

const FIXTURE = join(__dirname, '..', '..', '..', '..', 'fixtures/golden-dashboard/5-tickets');

let dir: string;
const origCwd = process.cwd();

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'xera-dash-'));
  cpSync(FIXTURE, dir, { recursive: true });
  process.chdir(dir);
});

afterEach(() => {
  process.chdir(origCwd);
  rmSync(dir, { recursive: true, force: true });
});

describe('collectDashboard — 5-ticket fixture', () => {
  test('aggregates totals correctly', () => {
    const snap = collectDashboard(dir, {});
    expect(snap.totals).toEqual({
      tickets: 5, last_pass: 2, last_fail: 2, never_run: 1,
      scenarios_pass: 15, scenarios_fail: 4,
    });
  });

  test('classifications sorted by count desc', () => {
    const snap = collectDashboard(dir, {});
    expect(snap.classifications[0]?.classification).toBe('PASS');
    expect(snap.classifications[0]?.count).toBe(2);
  });

  test('recent_failures excludes PASS + NEVER_RUN, sorted by lastRun desc', () => {
    const snap = collectDashboard(dir, {});
    expect(snap.recent_failures.map(f => f.ticketId)).toEqual(['TICKET-002', 'TICKET-003']);
  });

  test('stale identifies TICKET-004 (10d ago > 7d threshold)', () => {
    const snap = collectDashboard(dir, {});
    expect(snap.stale.map(t => t.ticketId)).toContain('TICKET-004');
  });

  test('critical_alerts surfaces checkout', () => {
    const snap = collectDashboard(dir, {});
    const checkout = snap.critical_alerts.find(a => a.area === 'checkout');
    expect(checkout).toBeDefined();
    expect(checkout?.is_critical).toBe(true);
    expect(checkout?.failing_tickets).toContain('TICKET-002');
  });

  test('--failing-only filter', () => {
    const snap = collectDashboard(dir, { failingOnly: true });
    expect(snap.tickets.map(t => t.ticketId).sort()).toEqual(['TICKET-002', 'TICKET-003']);
  });

  test('--classification filter', () => {
    const snap = collectDashboard(dir, { classifications: ['REAL_BUG'] });
    expect(snap.tickets.map(t => t.ticketId)).toEqual(['TICKET-002']);
  });

  test('--area filter', () => {
    const snap = collectDashboard(dir, { areas: ['checkout'] });
    expect(snap.tickets.map(t => t.ticketId)).toEqual(['TICKET-002']);
  });

  test('--since limits recent_failures only', () => {
    // 1h since cutoff = nothing in last hour (all fixtures are older)
    const snap = collectDashboard(dir, { since: '1h' });
    expect(snap.recent_failures).toEqual([]);
    // But tickets list is unfiltered (since only affects recent_failures bucket)
    expect(snap.tickets.length).toBeGreaterThan(0);
  });

  test('NEVER_RUN ticket has null classification', () => {
    const snap = collectDashboard(dir, {});
    const t5 = snap.tickets.find(t => t.ticketId === 'TICKET-005');
    expect(t5?.result).toBe('NEVER_RUN');
    expect(t5?.classification).toBeNull();
  });

  test('missing .xera dir returns empty snapshot', () => {
    const empty = mkdtempSync(join(tmpdir(), 'xera-dash-empty-'));
    try {
      const snap = collectDashboard(empty, {});
      expect(snap.totals.tickets).toBe(0);
      expect(snap.tickets).toEqual([]);
    } finally {
      rmSync(empty, { recursive: true, force: true });
    }
  });

  test('corrupt status.json is surfaced as UNKNOWN, does not throw', () => {
    writeFileSync(join(dir, '.xera/TICKET-002/status.json'), '{"corrupt"}');
    const snap = collectDashboard(dir, {});
    const t2 = snap.tickets.find(t => t.ticketId === 'TICKET-002');
    expect(t2?.result).toBe('UNKNOWN');
  });
});
```

(Add `import { writeFileSync } from 'node:fs';` at top.)

- [ ] **Step 2: Run to confirm FAIL**

Expected: module not found.

- [ ] **Step 3: Implement `collect.ts`**

```ts
// packages/core/src/dashboard/collect.ts
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { readStatus } from '../artifact/status';
import { loadConfigSync } from '../config/load';
import { deriveSnapshot, loadAllEvents } from '../graph/store';
import type {
  AppliedFilters, AreaStat, ClassificationBin, CollectOpts,
  DashboardSnapshot, RecentFailure, TicketRow,
} from './types';

const TICKET_RE = /^[A-Z][A-Z0-9-]+$/;
const DAY_MS = 86_400_000;

function parseDurationMs(s: string): number {
  const m = s.match(/^(\d+)([smhd])$/);
  if (!m) throw new Error(`invalid --since '${s}' (expected like '24h', '7d')`);
  const n = Number(m[1]);
  const unit = m[2];
  return n * (unit === 's' ? 1000 : unit === 'm' ? 60_000 : unit === 'h' ? 3_600_000 : DAY_MS);
}

function hasPlaywrightReport(xeraDir: string, ticketId: string): boolean {
  const runsDir = join(xeraDir, ticketId, 'runs');
  if (!existsSync(runsDir)) return false;
  const runs = readdirSync(runsDir).sort();
  const latest = runs[runs.length - 1];
  if (!latest) return false;
  return existsSync(join(runsDir, latest, 'playwright-report', 'index.html'));
}

export function collectDashboard(cwd: string, opts: CollectOpts): DashboardSnapshot {
  const config = loadConfigSync(cwd);
  const xeraDir = join(cwd, '.xera');
  const events = loadAllEvents(cwd);
  const snap = deriveSnapshot(events);

  const sinceMs = opts.since ? parseDurationMs(opts.since) : undefined;
  const sinceCutoff = sinceMs ? Date.now() - sinceMs : 0;
  const staleAfterMs = (config.dashboard?.staleAfterDays ?? 7) * DAY_MS;
  const recentLimit = config.dashboard?.recentFailureLimit ?? 10;

  let allTickets: TicketRow[] = [];
  if (existsSync(xeraDir)) {
    const entries = readdirSync(xeraDir, { withFileTypes: true })
      .filter(d => d.isDirectory() && TICKET_RE.test(d.name));

    for (const entry of entries) {
      const ticketId = entry.name;
      const statusPath = join(xeraDir, ticketId, 'status.json');
      const areas = snap.tickets[ticketId]?.areas ?? [];
      const hasHtml = hasPlaywrightReport(xeraDir, ticketId);

      if (!existsSync(statusPath)) {
        allTickets.push({
          ticketId, result: 'NEVER_RUN', classification: null, confidence: null,
          scenarios: { total: 0, passed: 0, failed: 0 }, lastRun: null,
          areas, has_html_report: hasHtml,
        });
        continue;
      }

      try {
        const status = readStatus(statusPath);
        if (!status) throw new Error('readStatus returned null');
        allTickets.push({
          ticketId, result: status.result === 'UNKNOWN' ? 'UNKNOWN' : status.result,
          classification: status.classification,
          confidence: status.confidence,
          scenarios: status.scenarios,
          lastRun: status.lastRun, areas, has_html_report: hasHtml,
        });
      } catch {
        allTickets.push({
          ticketId, result: 'UNKNOWN', classification: null, confidence: null,
          scenarios: { total: 0, passed: 0, failed: 0 }, lastRun: null,
          areas, has_html_report: hasHtml,
        });
      }
    }
  }

  let filtered = allTickets;
  if (opts.failingOnly) filtered = filtered.filter(t => t.result === 'FAIL');
  if (opts.classifications?.length) {
    const set = new Set(opts.classifications);
    filtered = filtered.filter(t => t.classification !== null && set.has(t.classification));
  }
  if (opts.areas?.length) {
    const set = new Set(opts.areas);
    filtered = filtered.filter(t => t.areas.some(a => set.has(a)));
  }

  const totals = {
    tickets: filtered.length,
    last_pass: filtered.filter(t => t.result === 'PASS').length,
    last_fail: filtered.filter(t => t.result === 'FAIL').length,
    never_run: filtered.filter(t => t.result === 'NEVER_RUN').length,
    scenarios_pass: filtered.reduce((s, t) => s + t.scenarios.passed, 0),
    scenarios_fail: filtered.reduce((s, t) => s + t.scenarios.failed, 0),
  };

  const classBins = new Map<string, number>();
  for (const t of filtered) {
    if (t.classification) classBins.set(t.classification, (classBins.get(t.classification) ?? 0) + 1);
  }
  const classifications: ClassificationBin[] = Array.from(classBins.entries())
    .map(([classification, count]) => ({ classification, count }))
    .sort((a, b) => b.count - a.count);

  const recent_failures: RecentFailure[] = filtered
    .filter(t => t.result === 'FAIL' && t.lastRun)
    .filter(t => sinceMs ? new Date(t.lastRun!).getTime() >= sinceCutoff : true)
    .sort((a, b) => new Date(b.lastRun!).getTime() - new Date(a.lastRun!).getTime())
    .slice(0, recentLimit)
    .map(t => ({
      ticketId: t.ticketId, classification: t.classification!, confidence: t.confidence!,
      lastRun: t.lastRun!, scenarios_failed: t.scenarios.failed,
      scenarios_total: t.scenarios.total, areas: t.areas,
    }));

  const stale = filtered.filter(t =>
    t.lastRun && t.result !== 'NEVER_RUN' &&
    Date.now() - new Date(t.lastRun).getTime() > staleAfterMs);

  const criticalAreaSet = new Set(config.coverage?.criticalAreas ?? []);
  const areaToTickets = new Map<string, string[]>();
  for (const t of filtered) {
    if (t.result !== 'FAIL') continue;
    for (const a of t.areas) {
      if (!areaToTickets.has(a)) areaToTickets.set(a, []);
      areaToTickets.get(a)!.push(t.ticketId);
    }
  }
  const allAreas: AreaStat[] = Array.from(areaToTickets.entries())
    .map(([area, tickets]) => ({ area, failing_tickets: tickets, is_critical: criticalAreaSet.has(area) }));

  const critical_alerts = allAreas.filter(a => a.is_critical);
  const top_failing_areas = [...allAreas].sort((a, b) => b.failing_tickets.length - a.failing_tickets.length).slice(0, 5);

  filtered.sort((a, b) => {
    if (!a.lastRun && !b.lastRun) return a.ticketId.localeCompare(b.ticketId);
    if (!a.lastRun) return 1;
    if (!b.lastRun) return -1;
    return new Date(b.lastRun).getTime() - new Date(a.lastRun).getTime();
  });

  const filters_applied: AppliedFilters = {};
  if (opts.since) filters_applied.since = opts.since;
  if (opts.classifications?.length) filters_applied.classifications = opts.classifications;
  if (opts.areas?.length) filters_applied.areas = opts.areas;
  if (opts.failingOnly) filters_applied.failing_only = true;

  return {
    generated_at: new Date().toISOString(),
    totals, classifications, tickets: filtered, recent_failures, stale,
    critical_alerts, top_failing_areas, filters_applied,
  };
}
```

**Important:** Verify that `loadConfigSync` exists in `packages/core/src/config/load.ts`. If only async `loadConfig` exists, either (a) add a sync variant or (b) make `collectDashboard` async. The plan assumes a sync helper for simpler test setup; if absent, implementer should make it async and update test signatures.

- [ ] **Step 4: Run PASS**

```bash
npx vitest run packages/core/test/dashboard/collect.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/dashboard/collect.ts packages/core/test/dashboard/collect.test.ts
git commit -m "feat(core): collectDashboard walks status.json + graph snapshot"
```

---

## Task 5: `render-text.ts`

**Files:**
- Create: `packages/core/src/dashboard/render-text.ts`
- Test: `packages/core/test/dashboard/render-text.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, test } from 'vitest';
import { renderText } from '../../src/dashboard/render-text';
import type { DashboardSnapshot } from '../../src/dashboard/types';

const snap: DashboardSnapshot = {
  generated_at: '2026-06-06T09:00:00.000Z',
  totals: { tickets: 5, last_pass: 2, last_fail: 2, never_run: 1, scenarios_pass: 15, scenarios_fail: 4 },
  classifications: [
    { classification: 'PASS', count: 2 },
    { classification: 'REAL_BUG', count: 1 },
    { classification: 'SELECTOR_DRIFT', count: 1 },
  ],
  tickets: [],
  recent_failures: [
    { ticketId: 'TICKET-002', classification: 'REAL_BUG', confidence: 0.85,
      lastRun: '2026-06-06T07:00:00.000Z', scenarios_failed: 2, scenarios_total: 5, areas: ['checkout'] },
  ],
  stale: [
    { ticketId: 'TICKET-004', result: 'PASS', classification: 'PASS', confidence: 1,
      scenarios: { total: 3, passed: 3, failed: 0 }, lastRun: '2026-05-27T12:00:00.000Z',
      areas: ['reports'], has_html_report: false },
  ],
  critical_alerts: [{ area: 'checkout', failing_tickets: ['TICKET-002'], is_critical: true }],
  top_failing_areas: [{ area: 'checkout', failing_tickets: ['TICKET-002'], is_critical: true }],
  filters_applied: {},
};

describe('renderText', () => {
  test('contains the dashboard header', () => {
    const out = renderText(snap, { color: false });
    expect(out).toContain('xera Dashboard');
    expect(out).toContain('5 tickets');
  });

  test('shows totals percentages', () => {
    const out = renderText(snap, { color: false });
    expect(out).toMatch(/PASS:\s*2/);
    expect(out).toMatch(/FAIL:\s*2/);
  });

  test('shows recent failures section', () => {
    const out = renderText(snap, { color: false });
    expect(out).toContain('Recent failures');
    expect(out).toContain('TICKET-002');
    expect(out).toContain('REAL_BUG');
  });

  test('shows critical alerts', () => {
    const out = renderText(snap, { color: false });
    expect(out).toContain('Critical areas');
    expect(out).toContain('checkout');
  });

  test('suppresses empty sections', () => {
    const empty: DashboardSnapshot = { ...snap, recent_failures: [], stale: [], critical_alerts: [] };
    const out = renderText(empty, { color: false });
    expect(out).not.toContain('Recent failures');
    expect(out).not.toContain('Stale');
    expect(out).not.toContain('Critical areas');
  });

  test('no tickets → friendly empty message', () => {
    const e: DashboardSnapshot = { ...snap, totals: { ...snap.totals, tickets: 0 } };
    const out = renderText(e, { color: false });
    expect(out).toContain('no tickets');
  });
});
```

- [ ] **Step 2: Run FAIL**

- [ ] **Step 3: Implement `render-text.ts`**

```ts
import type { DashboardSnapshot } from './types';

const BOX_WIDTH = 75;

export interface RenderTextOpts {
  color?: boolean;
}

function pct(n: number, total: number): string {
  return total === 0 ? '0%' : `${Math.round((n / total) * 100)}%`;
}

function bar(count: number, max: number, width = 12): string {
  if (max === 0) return '';
  return '█'.repeat(Math.max(1, Math.round((count / max) * width)));
}

function pad(s: string, n: number): string {
  return s.length >= n ? s : s + ' '.repeat(n - s.length);
}

function truncate(s: string, n: number): string {
  return s.length <= n ? s : `${s.slice(0, n - 1)}…`;
}

function box(line: string): string {
  // Line includes its own borders. Helper to align inner content.
  return `║ ${pad(line, BOX_WIDTH - 4)} ║`;
}

const TOP = `╔${'═'.repeat(BOX_WIDTH - 2)}╗`;
const MID = `╠${'═'.repeat(BOX_WIDTH - 2)}╣`;
const BOT = `╚${'═'.repeat(BOX_WIDTH - 2)}╝`;

function colorize(text: string, c: 'green' | 'red' | 'gray' | 'yellow', enabled: boolean): string {
  if (!enabled) return text;
  const codes = { green: '32', red: '31', gray: '90', yellow: '33' };
  return `\x1b[${codes[c]}m${text}\x1b[0m`;
}

export function renderText(snap: DashboardSnapshot, opts: RenderTextOpts = {}): string {
  const color = opts.color ?? false;
  const lines: string[] = [];

  if (snap.totals.tickets === 0) {
    lines.push('xera Dashboard — no tickets yet');
    lines.push('');
    lines.push('Run /xera-fetch <TICKET> to add a ticket.');
    return lines.join('\n');
  }

  // Header
  lines.push(TOP);
  lines.push(box(`xera Dashboard — last run summary across ${snap.totals.tickets} tickets`));
  lines.push(MID);
  lines.push(box(
    `Tickets:  ${snap.totals.tickets}    ` +
    `${colorize('PASS', 'green', color)}: ${snap.totals.last_pass} (${pct(snap.totals.last_pass, snap.totals.tickets)})   ` +
    `${colorize('FAIL', 'red', color)}: ${snap.totals.last_fail} (${pct(snap.totals.last_fail, snap.totals.tickets)})   ` +
    `NEVER_RUN: ${snap.totals.never_run}`
  ));
  const scTotal = snap.totals.scenarios_pass + snap.totals.scenarios_fail;
  lines.push(box(
    `Scenarios: ${scTotal}  PASS: ${snap.totals.scenarios_pass} (${pct(snap.totals.scenarios_pass, scTotal)})  FAIL: ${snap.totals.scenarios_fail}`
  ));
  lines.push(BOT);
  lines.push('');

  // Classifications
  if (snap.classifications.length > 0) {
    lines.push('Classifications (last run):');
    const maxCount = Math.max(...snap.classifications.map(c => c.count));
    const maxLabel = Math.max(...snap.classifications.map(c => c.classification.length), 12);
    for (const c of snap.classifications) {
      lines.push(`  ${pad(c.classification, maxLabel)} ${pad(bar(c.count, maxCount), 14)} ${c.count}`);
    }
    lines.push('');
  }

  // Recent failures
  if (snap.recent_failures.length > 0) {
    lines.push('Recent failures:');
    for (const f of snap.recent_failures) {
      const areas = truncate(f.areas.join(', '), 30);
      lines.push(`  ${pad(f.ticketId, 12)} ${colorize('FAIL', 'red', color)}  ${pad(f.classification, 17)} conf=${f.confidence.toFixed(2)}  ${f.lastRun.slice(0, 16)}  ${f.scenarios_failed}/${f.scenarios_total}  areas: ${areas}`);
    }
    lines.push('');
  }

  // Stale
  if (snap.stale.length > 0) {
    lines.push('Stale (last run > threshold):');
    for (const t of snap.stale) {
      lines.push(`  ${pad(t.ticketId, 12)} ${pad(t.result, 6)} ${(t.lastRun ?? '').slice(0, 16)}  areas: ${truncate(t.areas.join(', '), 30)}`);
    }
    lines.push('');
  }

  // Critical alerts
  if (snap.critical_alerts.length > 0) {
    lines.push('Critical areas with failures:');
    for (const a of snap.critical_alerts) {
      lines.push(`  ⚠ ${a.area}: ${a.failing_tickets.length} failing ticket${a.failing_tickets.length === 1 ? '' : 's'} (${a.failing_tickets.join(', ')})`);
    }
    lines.push('');
  }

  // Top failing areas
  if (snap.top_failing_areas.length > 0) {
    lines.push('Top failing areas:');
    lines.push('  ' + snap.top_failing_areas.map(a => `${a.area} (${a.failing_tickets.length})`).join('   '));
    lines.push('');
  }

  // Footer hints
  lines.push('→ Inspect a ticket:   /xera-report <TICKET>');
  lines.push('→ HTML viewer:        npx xera dashboard --serve');

  return lines.join('\n');
}
```

- [ ] **Step 4: Run PASS**

```bash
npx vitest run packages/core/test/dashboard/render-text.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/dashboard/render-text.ts packages/core/test/dashboard/render-text.test.ts
git commit -m "feat(core): dashboard text renderer with totals + recent failures + critical alerts"
```

---

## Task 6: `render-html.ts`

**Files:**
- Create: `packages/core/src/dashboard/render-html.ts`
- Test: `packages/core/test/dashboard/render-html.test.ts`

- [ ] **Step 1: Test**

```ts
import { describe, expect, test } from 'vitest';
import { renderHtml } from '../../src/dashboard/render-html';
import type { DashboardSnapshot } from '../../src/dashboard/types';

const snap: DashboardSnapshot = {
  generated_at: '2026-06-06T09:00:00.000Z',
  totals: { tickets: 1, last_pass: 0, last_fail: 1, never_run: 0, scenarios_pass: 3, scenarios_fail: 2 },
  classifications: [{ classification: 'REAL_BUG', count: 1 }],
  tickets: [{ ticketId: 'TICKET-001', result: 'FAIL', classification: 'REAL_BUG', confidence: 0.85,
    scenarios: { total: 5, passed: 3, failed: 2 }, lastRun: '2026-06-06T08:23:14.000Z',
    areas: ['checkout'], has_html_report: true }],
  recent_failures: [], stale: [], critical_alerts: [], top_failing_areas: [], filters_applied: {},
};

describe('renderHtml', () => {
  test('emits a complete HTML document', () => {
    const html = renderHtml(snap);
    expect(html).toMatch(/^<!DOCTYPE html>/);
    expect(html).toContain('</html>');
  });

  test('includes ticket IDs in the table', () => {
    const html = renderHtml(snap);
    expect(html).toContain('TICKET-001');
    expect(html).toContain('REAL_BUG');
  });

  test('embeds the snapshot JSON for client filters', () => {
    const html = renderHtml(snap);
    const match = html.match(/const SNAPSHOT = (\{[\s\S]+?\});/);
    expect(match).toBeTruthy();
    expect(() => JSON.parse(match![1]!)).not.toThrow();
  });

  test('links to Playwright report when has_html_report=true', () => {
    const html = renderHtml(snap);
    expect(html).toContain('.xera/TICKET-001/runs/latest/playwright-report/index.html');
  });

  test('does NOT link when has_html_report=false', () => {
    const noReport = { ...snap, tickets: [{ ...snap.tickets[0]!, has_html_report: false }] };
    const html = renderHtml(noReport);
    expect(html).not.toContain('href=".xera/TICKET-001/runs/latest/playwright-report');
  });

  test('inlines CSS (no external stylesheets)', () => {
    const html = renderHtml(snap);
    expect(html).not.toMatch(/<link.*rel=.stylesheet/);
    expect(html).toContain('<style>');
  });
});
```

- [ ] **Step 2: Run FAIL**

- [ ] **Step 3: Implement `render-html.ts`**

This file is ~250 LOC. The structure is a single template literal with embedded snapshot JSON + inlined CSS + ~80 LOC of vanilla JS for sort/filter. See spec §7.1 for the layout.

Key implementation rules:
- Escape ticket IDs / classification strings via `escapeHtml(s)` helper (replace `&`, `<`, `>`, `"`, `'`).
- The snapshot JSON embed uses `JSON.stringify(snapshot)` — already escaped by the parser. Wrap in `<script>const SNAPSHOT = ...;</script>` not a `<template>` to keep it parseable.
- Client JS: vanilla DOM, ~80 LOC. Handles: column-sort on `<th>` click; search input filters rows by ticketId/classification/area substring; "Failing only" / "Stale only" toggle buttons.
- Per-scenario detail (locked from §12 open-q #3): when user clicks the scenarios cell, fetch `.xera/{ticketId}/runs/<latest>/normalized.json` via `fetch()` and render a `<details>` list. Only works in `--serve` mode where root-relative paths resolve.

Implementer reference: copy patterns from `packages/core/src/graph/render.ts:renderHtml` for the HTML-string-build approach (no template engine, just string concat).

- [ ] **Step 4: Run PASS**

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/dashboard/render-html.ts packages/core/test/dashboard/render-html.test.ts
git commit -m "feat(core): dashboard HTML viewer (self-contained, vanilla JS sort/filter)"
```

---

## Task 7: `dashboard/index.ts` + core re-exports

**Files:**
- Create: `packages/core/src/dashboard/index.ts`
- Modify: `packages/core/src/index.ts`

- [ ] **Step 1: Create `dashboard/index.ts`**

```ts
export { collectDashboard } from './collect';
export { renderText, type RenderTextOpts } from './render-text';
export { renderHtml } from './render-html';
export * from './types';
```

- [ ] **Step 2: Add re-exports to package root**

In `packages/core/src/index.ts`, add:

```ts
export {
  collectDashboard,
  type DashboardSnapshot,
  DashboardSnapshotSchema,
  renderHtml as renderDashboardHtml,
  renderText as renderDashboardText,
} from './dashboard';
```

- [ ] **Step 3: Verify typecheck**

```bash
npm run typecheck
```

- [ ] **Step 4: Commit**

```bash
git add packages/core/src/dashboard/index.ts packages/core/src/index.ts
git commit -m "feat(core): expose dashboard collector + renderers from @xera-ai/core"
```

---

## Task 8: Binary `dashboard.ts` + dispatch wiring

**Files:**
- Create: `packages/core/src/bin-internal/dashboard.ts`
- Modify: `packages/core/src/bin-internal/index.ts`
- Test: `packages/core/test/bin-internal/dashboard.test.ts`

- [ ] **Step 1: Write the test**

```ts
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { cpSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { dashboardCmd } from '../../src/bin-internal/dashboard';

const FIXTURE = join(__dirname, '..', '..', '..', '..', 'fixtures/golden-dashboard/5-tickets');

let dir: string;
const origCwd = process.cwd();

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'xera-dash-bin-'));
  cpSync(FIXTURE, dir, { recursive: true });
  process.chdir(dir);
});
afterEach(() => {
  process.chdir(origCwd);
  rmSync(dir, { recursive: true, force: true });
});

describe('dashboard binary', () => {
  test('text mode (default) exits 0 and prints header', async () => {
    const out: string[] = [];
    const origLog = console.log; console.log = (s?: any) => out.push(String(s));
    try { expect(await dashboardCmd([])).toBe(0); } finally { console.log = origLog; }
    expect(out.join('\n')).toContain('xera Dashboard');
  });

  test('--json prints valid DashboardSnapshot JSON', async () => {
    const out: string[] = [];
    const origLog = console.log; console.log = (s?: any) => out.push(String(s));
    try { expect(await dashboardCmd(['--json'])).toBe(0); } finally { console.log = origLog; }
    const json = JSON.parse(out.join(''));
    expect(json.totals.tickets).toBe(5);
  });

  test('--html writes file', async () => {
    const target = join(dir, 'dashboard.html');
    expect(await dashboardCmd(['--html', target])).toBe(0);
    const html = readFileSync(target, 'utf8');
    expect(html).toMatch(/^<!DOCTYPE html>/);
  });

  test('--failing-only filter is applied', async () => {
    const out: string[] = [];
    const origLog = console.log; console.log = (s?: any) => out.push(String(s));
    try { expect(await dashboardCmd(['--json', '--failing-only'])).toBe(0); } finally { console.log = origLog; }
    const json = JSON.parse(out.join(''));
    expect(json.tickets.every((t: any) => t.result === 'FAIL')).toBe(true);
  });

  test('--classification filter accepts repeat', async () => {
    const out: string[] = [];
    const origLog = console.log; console.log = (s?: any) => out.push(String(s));
    try { expect(await dashboardCmd(['--json', '--classification', 'REAL_BUG', '--classification', 'SELECTOR_DRIFT'])).toBe(0); }
    finally { console.log = origLog; }
    const json = JSON.parse(out.join(''));
    const cs = json.tickets.map((t: any) => t.classification);
    expect(cs.every((c: string | null) => c === 'REAL_BUG' || c === 'SELECTOR_DRIFT')).toBe(true);
  });

  test('invalid --since returns 1 with actionable error', async () => {
    const errs: string[] = [];
    const origErr = console.error; console.error = (...a: unknown[]) => errs.push(a.join(' '));
    try { expect(await dashboardCmd(['--since', 'foo'])).toBe(1); } finally { console.error = origErr; }
    expect(errs.join('\n')).toMatch(/since/i);
  });
});
```

- [ ] **Step 2: Run FAIL**

- [ ] **Step 3: Implement binary**

```ts
// packages/core/src/bin-internal/dashboard.ts
import { writeFileSync } from 'node:fs';
import { collectDashboard, type CollectOpts, renderHtml, renderText } from '../dashboard';

interface DashboardOpts extends CollectOpts {
  json?: boolean;
  htmlPath?: string;
}

function parseOpts(argv: string[]): DashboardOpts {
  const opts: DashboardOpts = {};
  const classifications: string[] = [];
  const areas: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    const next = argv[i + 1];
    if (a === '--json') opts.json = true;
    else if (a === '--failing-only') opts.failingOnly = true;
    else if (a === '--since' && next) { opts.since = next; i++; }
    else if (a === '--classification' && next) { classifications.push(next); i++; }
    else if (a === '--area' && next) { areas.push(next); i++; }
    else if (a === '--html' && next) { opts.htmlPath = next; i++; }
    else if (a.startsWith('--')) throw new Error(`unknown flag: ${a}`);
  }
  if (classifications.length) opts.classifications = classifications;
  if (areas.length) opts.areas = areas;
  return opts;
}

export async function dashboardCmd(argv: string[]): Promise<number> {
  let opts: DashboardOpts;
  try {
    opts = parseOpts(argv);
  } catch (e) {
    console.error(`[xera:dashboard] ${(e as Error).message}`);
    return 1;
  }
  try {
    const snap = collectDashboard(process.cwd(), opts);
    if (opts.json) {
      console.log(JSON.stringify(snap, null, 2));
      return 0;
    }
    if (opts.htmlPath) {
      writeFileSync(opts.htmlPath, renderHtml(snap));
      console.log(`[xera:dashboard] wrote ${opts.htmlPath}`);
      return 0;
    }
    console.log(renderText(snap, { color: process.stdout.isTTY }));
    return 0;
  } catch (e) {
    console.error(`[xera:dashboard] ${(e as Error).message}`);
    return 1;
  }
}
```

- [ ] **Step 4: Wire dispatch**

In `packages/core/src/bin-internal/index.ts`, add import + dispatch entry:

```ts
import { dashboardCmd } from './dashboard';
// ...
const COMMANDS: Record<string, (argv: string[]) => Promise<number>> = {
  // ...alphabetical order...
  dashboard: dashboardCmd,
  // ...
};
```

- [ ] **Step 5: Run PASS**

```bash
npx vitest run packages/core/test/bin-internal/dashboard.test.ts
```

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/bin-internal/dashboard.ts packages/core/src/bin-internal/index.ts packages/core/test/bin-internal/dashboard.test.ts
git commit -m "feat(core): xera-internal dashboard binary"
```

---

## Task 9: Extract `serveHtmlFile` from show-report

**Files:**
- Create: `packages/cli/src/serve.ts`
- Modify: `packages/cli/src/commands/show-report.ts`

- [ ] **Step 1: Read current show-report**

```bash
cat packages/cli/src/commands/show-report.ts
```

Identify the HTTP server + browser-open logic. It's around the `serveHtmlReport` or similar function (read the file to confirm name).

- [ ] **Step 2: Extract into `serve.ts`**

```ts
// packages/cli/src/serve.ts
import { createServer } from 'node:http';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';
import { exec } from 'node:child_process';
import pc from 'picocolors';

const MIME: Record<string, string> = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.txt': 'text/plain',
};

export async function serveHtmlFile(
  filePath: string,
  port: number,
  rootDir: string,
): Promise<number> {
  // Body: lift the server code from show-report verbatim, parameterized on
  // (entryFile, rootDir, port). Routes:
  //   GET / or GET /<basename(filePath)> → entryFile
  //   GET /anything → rootDir + path (with .. protection)
  // Open browser via `open` package (or `exec('open URL')`).
  // Print URL to console. Block until SIGINT.
}
```

(Implementer: read the existing `show-report.ts` server code and lift it. Keep the API stable so `show-report` becomes a thin caller.)

- [ ] **Step 3: Update show-report.ts**

Replace its server code with:

```ts
import { serveHtmlFile } from '../serve';
// ...
return serveHtmlFile(resolvedHtmlPath, port, runDir);
```

- [ ] **Step 4: Verify existing show-report still works (smoke)**

```bash
npm run typecheck
npx vitest run packages/cli/
```

Existing show-report tests must pass unchanged.

- [ ] **Step 5: Commit**

```bash
git add packages/cli/src/serve.ts packages/cli/src/commands/show-report.ts
git commit -m "refactor(cli): extract serveHtmlFile into shared module (prep for dashboard --serve)"
```

---

## Task 10: CLI `xera dashboard` command

**Files:**
- Create: `packages/cli/src/commands/dashboard.ts`
- Modify: `packages/cli/src/index.ts`
- Test: `packages/cli/test/dashboard.test.ts`

- [ ] **Step 1: Write the test**

```ts
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { cpSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const FIXTURE = join(__dirname, '..', '..', '..', 'fixtures/golden-dashboard/5-tickets');
const CLI = join(__dirname, '..', 'bin', 'xera');

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'xera-dash-cli-'));
  cpSync(FIXTURE, dir, { recursive: true });
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe('xera dashboard CLI', () => {
  test('text mode default', () => {
    const r = spawnSync('node', [CLI, 'dashboard'], { cwd: dir, encoding: 'utf8' });
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('xera Dashboard');
  });

  test('--json emits parseable JSON', () => {
    const r = spawnSync('node', [CLI, 'dashboard', '--json'], { cwd: dir, encoding: 'utf8' });
    expect(r.status).toBe(0);
    expect(() => JSON.parse(r.stdout)).not.toThrow();
  });

  test('--html writes file to default path', () => {
    const r = spawnSync('node', [CLI, 'dashboard', '--html'], { cwd: dir, encoding: 'utf8' });
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('.xera/dashboard.html');
  });
});
```

(This test requires the CLI built — already a known limitation of CLI integration tests. Run after `npm run build` in CI.)

- [ ] **Step 2: Implement command**

```ts
// packages/cli/src/commands/dashboard.ts
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { serveHtmlFile } from '../serve';

export interface DashboardOpts {
  since?: string;
  classification?: string[];
  area?: string[];
  failingOnly?: boolean;
  json?: boolean;
  html?: string | boolean;
  serve?: boolean;
  port?: string;
}

function buildBinaryArgs(opts: DashboardOpts, includeHtml: string | undefined): string[] {
  const args = ['xera-internal', 'dashboard'];
  if (opts.since) args.push('--since', opts.since);
  for (const c of opts.classification ?? []) args.push('--classification', c);
  for (const a of opts.area ?? []) args.push('--area', a);
  if (opts.failingOnly) args.push('--failing-only');
  if (opts.json) args.push('--json');
  if (includeHtml) args.push('--html', includeHtml);
  return args;
}

function spawnBinary(args: string[], cwd: string): Promise<number> {
  return new Promise(resolve => {
    const child = spawn('npx', args, { cwd, stdio: 'inherit' });
    child.on('close', code => resolve(code ?? 1));
  });
}

export async function dashboardCommand(opts: DashboardOpts, cwd = process.cwd()): Promise<number> {
  const port = opts.port ? parseInt(opts.port, 10) : 9323;

  if (opts.serve) {
    const tmpHtml = join(tmpdir(), `xera-dashboard-${Date.now()}.html`);
    const code = await spawnBinary(buildBinaryArgs(opts, tmpHtml), cwd);
    if (code !== 0) return code;
    return serveHtmlFile(tmpHtml, port, cwd);
  }

  const htmlPath = typeof opts.html === 'string' ? opts.html
    : opts.html === true ? join(cwd, '.xera', 'dashboard.html') : undefined;
  return spawnBinary(buildBinaryArgs(opts, htmlPath), cwd);
}
```

- [ ] **Step 3: Register in CLI index**

In `packages/cli/src/index.ts`, register `dashboard`:

```ts
program.command('dashboard')
  .description('Cross-ticket dashboard of latest test results')
  .option('--since <duration>', 'filter recent failures (e.g. 24h, 7d)')
  .option('--classification <class>', 'filter by classification (repeatable)', (v, prev: string[]) => { prev.push(v); return prev; }, [])
  .option('--area <slug>', 'filter to areas (repeatable)', (v, prev: string[]) => { prev.push(v); return prev; }, [])
  .option('--failing-only', 'drop PASS + NEVER_RUN')
  .option('--json', 'emit JSON to stdout')
  .option('--html [path]', 'write HTML to path (default .xera/dashboard.html)')
  .option('--serve', 'serve HTML at 127.0.0.1:9323 and open browser')
  .option('--port <port>', 'serve port (default 9323)', '9323')
  .action(async (opts) => {
    const code = await dashboardCommand(opts);
    process.exit(code);
  });
```

Verify by reading existing command registrations in the same file — match their style.

- [ ] **Step 4: Build + smoke test**

```bash
cd packages/cli && npm run build && cd -
cd /tmp/test-dashboard && npx xera dashboard --json | jq '.totals'
```

- [ ] **Step 5: Commit**

```bash
git add packages/cli/src/commands/dashboard.ts packages/cli/src/index.ts packages/cli/test/dashboard.test.ts
git commit -m "feat(cli): xera dashboard command (text/json/html/--serve)"
```

---

## Task 11: AGENTS.md.tmpl scaffold update

**Files:**
- Modify: `packages/cli/templates/AGENTS.md.tmpl`

- [ ] **Step 1: Add to scripts table**

In the conditional scripts table (after the `verify-http-auth` row from reuse-web-session work), add:

```markdown
| `npx xera dashboard` | Aggregate latest test results across all tickets (text/JSON/HTML) |
| `npx xera dashboard --serve` | Interactive HTML viewer at 127.0.0.1:9323 |
```

These should be in the unconditional scripts block (not gated on `isReuseWebSession`) so all projects see them.

- [ ] **Step 2: Smoke test**

```bash
cd packages/cli && npm run build && cd -
cd /tmp/test-agents && /Users/.../packages/cli/bin/xera init --yes --shape mixed --tracker github --gr o/r --su http://x --au http://x --hr admin
cat AGENTS.md | grep dashboard
```

- [ ] **Step 3: Commit**

```bash
git add packages/cli/templates/AGENTS.md.tmpl
git commit -m "docs(cli): scaffold AGENTS.md mentions xera dashboard commands"
```

---

## Task 12: Docs CONFIGURATION + tutorial

**Files:**
- Modify: `docs/CONFIGURATION.md`
- (Optional) Create: `docs/guides/dashboard.md`

- [ ] **Step 1: Add Dashboard section to CONFIGURATION.md**

Append a new section:

```markdown
## Dashboard

`xera dashboard` aggregates latest test results across every ticket in the project. Supports text (default), `--json` (CI integration), `--html <path>` (write file), and `--serve` (interactive HTML at 127.0.0.1:9323 with sort/filter and click-through to per-ticket Playwright reports).

### Config block (optional)

```ts
dashboard: {
  staleAfterDays: 7,        // tickets last-run older than this are flagged "stale" (default 7)
  recentFailureLimit: 10,   // how many recent failures to show in the table (default 10)
},
```

### Common usages

```bash
npx xera dashboard                                    # text terminal output
npx xera dashboard --json | jq '.totals'              # CI integration
npx xera dashboard --failing-only                     # only failing tickets
npx xera dashboard --since=24h                        # last 24h failures
npx xera dashboard --classification=REAL_BUG          # filter by classification
npx xera dashboard --area=checkout --area=auth        # filter by area
npx xera dashboard --serve                            # open HTML viewer in browser
```

The HTML viewer's ticket rows link to each ticket's Playwright report if you ran `exec --reporter=html`. Without an HTML report, the row shows status only.

📖 **Tutorial:** [docs/guides/dashboard.md](guides/dashboard.md)
```

- [ ] **Step 2: Commit**

```bash
git add docs/CONFIGURATION.md
git commit -m "docs: document dashboard command + config block"
```

---

## Task 13: Changeset

**Files:**
- Create: `.changeset/dashboard.md`

- [ ] **Step 1: Write changeset**

```markdown
---
"@xera-ai/core": minor
"@xera-ai/cli": minor
"@xera-ai/web": patch
"@xera-ai/http": patch
"@xera-ai/skills": patch
"@xera-ai/prompts": patch
---

feat: xera dashboard — cross-ticket aggregate of latest test results

New command `npx xera dashboard` aggregates `.xera/<TICKET>/status.json`
across the project. Renders text by default, with `--json`, `--html`,
and `--serve` modes. Interactive HTML viewer at 127.0.0.1:9323 with
sortable/filterable table and click-through to per-ticket Playwright
reports. New optional `dashboard: { staleAfterDays, recentFailureLimit }`
config block.

Companion to the v0.6 graph viewer (structure) and v0.8 coverage report
(AC satisfaction). Dashboard closes the "no project-level test result
view" gap surfaced by QA leads needing a daily standup readout.
```

(The auto-changeset bot will handle this on PR title, but writing one manually fixes the bump to `minor` and lets the implementer test the release flow locally.)

- [ ] **Step 2: Final regression**

```bash
npm test
npm run typecheck
npm run lint
cd packages/cli && npm run build && cd -
```

All green.

- [ ] **Step 3: Commit**

```bash
git add .changeset/dashboard.md
git commit -m "chore: changeset for dashboard"
```

---

## Self-Review Checklist

Before opening PR:

- [ ] Walk through spec §1.4 success criteria; each one has a test that locks it.
- [ ] HTML viewer renders correctly in Chrome AND Safari (open a generated file). No JS console errors.
- [ ] `--json` output validates against `DashboardSnapshotSchema` for the 5-ticket fixture.
- [ ] No new prod deps in `@xera-ai/core` (the HTML/CSS/JS is inlined into the template literal).
- [ ] `process.chdir` restored in `afterEach` for any test that touches it.
- [ ] No `arr[0]` without narrowing in new code; `exactOptionalPropertyTypes` paths use conditional spread.
- [ ] Error messages reference the next command the user should run.
- [ ] PR title is `feat:` so auto-changeset infers minor.
- [ ] Branch named `claude/dashboard-...` to fit the repo's branch naming convention.

---

## Execution Handoff

**Plan complete and saved to `docs/superpowers/plans/2026-06-06-xera-dashboard.md`. Two execution options:**

1. **Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration.
2. **Inline Execution** — Execute tasks in this session using `executing-plans`, batch execution with checkpoints.

**Which approach?**
