# xera v0.8 — Plan 01: Schema & Coverage Engine Foundation (REVISED)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **REVISION NOTE (2026-05-17):** Initial Plan 01 was based on incorrect assumptions about v0.6 internals (assumed `Graph` type with separate edge arrays; actual is `Snapshot` type with single `edges: EdgeRecord[]` filtered by `kind`). This revision uses the actual v0.6 shapes from `packages/core/src/graph/types.ts` and `store.ts`.

**Goal:** Extend v0.6 graph to support v0.8 coverage: add `'satisfies'` to `EdgeKind` union, add `ACNode` interface, extend `Snapshot` with `acNodes` + `classifications`, extend `EventPayloadMap` with `coverage.snapshot` + `ac-coverage.backfilled`, extend `ScenarioGeneratedPayload` with optional `satisfiesAcs`, wire all of these into `deriveSnapshot` + `EventSchema`, then build the pure coverage engine in a new `packages/core/src/coverage/` module, plus six golden fixtures and unit/integration tests. End state: `bun test packages/core/test/coverage/ packages/core/test/graph/` green, no user-facing surface (binary/skill is Plan 02).

**Architecture:** All graph shape changes are additive to existing `Snapshot` and `EventPayloadMap`. Satisfies edges live in the existing `edges: EdgeRecord[]` array (filtered by `kind === 'satisfies'`) — not a separate array. `classifications: Array<{ scenarioId, classification, ts }>` is a new projection on `Snapshot` so coverage can compute scenario PASSING/NOT_PASSING from `run.classified` event history without re-reading event files. Coverage engine is pure functions over `Snapshot` + `CoverageConfig`, returning structured `CoverageReport` objects. Markdown rendering is also pure.

**Tech Stack:** TypeScript (strict, `exactOptionalPropertyTypes` + `noUncheckedIndexedAccess` on), Zod for validation, `bun:test`, ESM source.

**Prereqs:** Working v0.6 graph foundation. The following exist and ARE the contract this plan extends:

- `packages/core/src/graph/types.ts` — `EdgeKind` union, `EventPayloadMap`, `Event`, `TicketNode`, `ScenarioNode`, `PomNode`, `AreaNode`, `FailureNode`, `EdgeRecord`, `Snapshot`, `SCHEMA_VERSION`, `Classification` type
- `packages/core/src/graph/schema.ts` — `EventSchema` (discriminatedUnion on `type`), payload schemas using `.passthrough()`, `safeParseEvent`
- `packages/core/src/graph/store.ts` — `deriveSnapshot(events)`, `loadAllEvents(repoRoot)`, `appendEvents(repoRoot, events, opts)`, `loadSnapshot`, `writeSnapshot`, `isSnapshotStale`, `computeEventsHash`
- `packages/core/src/graph/paths.ts` — `graphPaths(repoRoot)` returns `{ eventsDir, snapshotFile, costLog, eventsMonthDir, eventFile }`
- `packages/core/src/graph/ulid.ts` — `ulid()` (also re-exported from `graph/index.ts`)

Read these files BEFORE starting Task 1.1 if you have any ambiguity about field names, function signatures, or patterns.

**Naming conventions you MUST follow (from v0.6):**

| Concept | Name |
|---|---|
| Snapshot type | `Snapshot` (NOT `Graph`) |
| Snapshot builder | `deriveSnapshot(events)` (NOT `buildGraph`) |
| Edge model | Single `edges: EdgeRecord[]` filtered by `kind` (NO separate per-category arrays) |
| Edge fields | `{ kind, from, to, confidence?, source, discoveredAt }` (NOT `source`/`target`/`source_label`) |
| Ticket AC field | `ac: string[]` (NOT `acceptanceCriteria`) on both `TicketNode` and `TicketFetchedPayload` |
| Ticket id in event payload | `ticketId` (NOT `id`) |
| Failure map | `latest_failures: Record<string, FailureNode>` (snake_case) |
| Event discriminator | `type` (NOT `kind`) |
| TS shape style | `interface Foo` (NOT `type Foo =`) — match existing file convention |

**Plan scope:** v0.8.0 foundation only. The `coverage-prepare` binary, `/xera-coverage` skill, CLI surface, and config schema additions are in Plan 02. AC backfill orchestration flow is in Plan 03 (this plan only adds the schema + store handler for the `ac-coverage.backfilled` event so the data path is ready). HTML viewer is Plan 04. Generative is Plan 05.

---

## Phase 1 — Schema type additions

### Task 1.1: Add `'satisfies'` to `EdgeKind` union

**Files:**
- Modify: `packages/core/src/graph/types.ts` (one-line change to `EdgeKind`)
- Test: `packages/core/test/graph/types.test.ts` (create if absent)

- [ ] **Step 1: Write the failing test**

Create or append to `packages/core/test/graph/types.test.ts`:

```ts
import { describe, test, expect } from 'bun:test';
import type { EdgeKind } from '../../src/graph/types';

describe('EdgeKind union', () => {
  test('includes "satisfies"', () => {
    const kinds: EdgeKind[] = ['tests', 'uses', 'covers', 'modifies', 'jira-linked', 'similar', 'ran', 'satisfies'];
    expect(kinds).toContain('satisfies');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd packages/core && bun test test/graph/types.test.ts
```

Expected: TypeScript compile error — `'satisfies'` not assignable to `EdgeKind`.

- [ ] **Step 3: Extend `EdgeKind`**

In `packages/core/src/graph/types.ts`, change the existing `EdgeKind` declaration (currently around line 7):

```ts
export type EdgeKind = 'tests' | 'uses' | 'covers' | 'modifies' | 'jira-linked' | 'similar' | 'ran' | 'satisfies';
```

- [ ] **Step 4: Verify pass**

```bash
cd packages/core && bun test test/graph/types.test.ts
```

Expected: 1 pass.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/graph/types.ts packages/core/test/graph/types.test.ts
git commit -m "feat(core): add 'satisfies' to EdgeKind union for v0.8 coverage matrix"
```

---

### Task 1.2: Add `ACNode` interface

**Files:**
- Modify: `packages/core/src/graph/types.ts`
- Test: `packages/core/test/graph/types.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `packages/core/test/graph/types.test.ts`:

```ts
import type { ACNode } from '../../src/graph/types';

describe('ACNode', () => {
  test('shape: id = `${ticketId}#ac-${index}`, includes text + index', () => {
    const node: ACNode = {
      id: 'PROJ-105#ac-2',
      ticketId: 'PROJ-105',
      index: 2,
      text: 'Tax line item shows in cart preview',
    };
    expect(node.id).toBe(`${node.ticketId}#ac-${node.index}`);
    expect(node.index).toBe(2);
  });
});
```

- [ ] **Step 2: Verify failure**

```bash
cd packages/core && bun test test/graph/types.test.ts
```

Expected: "Cannot find name 'ACNode'".

- [ ] **Step 3: Add the interface**

In `packages/core/src/graph/types.ts`, near other Node interfaces (after `AreaNode`, before `FailureNode`):

```ts
export interface ACNode {
  id: string;        // `${ticketId}#ac-${index}` (0-based)
  ticketId: string;
  index: number;
  text: string;
}
```

- [ ] **Step 4: Verify pass**

```bash
cd packages/core && bun test test/graph/types.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/graph/types.ts packages/core/test/graph/types.test.ts
git commit -m "feat(core): add ACNode interface"
```

---

### Task 1.3: Extend `ScenarioGeneratedPayload` with optional `satisfiesAcs`

**Files:**
- Modify: `packages/core/src/graph/types.ts`
- Test: `packages/core/test/graph/types.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import type { ScenarioGeneratedPayload } from '../../src/graph/types';

describe('ScenarioGeneratedPayload', () => {
  test('accepts optional satisfiesAcs: number[]', () => {
    const withMapping: ScenarioGeneratedPayload = {
      scenarioId: 'PROJ-105#scenario-0',
      ticketId: 'PROJ-105',
      name: 'Checkout shows tax',
      gherkin: 'Given ...',
      priority: 'p1',
      featureHash: 'abc',
      generatedAt: '2026-05-17T10:00:00.000Z',
      satisfiesAcs: [0, 3],
    };
    expect(withMapping.satisfiesAcs).toEqual([0, 3]);

    const withoutMapping: ScenarioGeneratedPayload = {
      scenarioId: 'PROJ-101#scenario-0',
      ticketId: 'PROJ-101',
      name: 'Legacy scenario',
      gherkin: '...',
      priority: 'p2',
      featureHash: 'xyz',
      generatedAt: '2026-05-17T10:00:00.000Z',
    };
    expect(withoutMapping.satisfiesAcs).toBeUndefined();
  });
});
```

- [ ] **Step 2: Verify failure**

```bash
cd packages/core && bun test test/graph/types.test.ts
```

- [ ] **Step 3: Extend the interface**

In `packages/core/src/graph/types.ts`, locate `ScenarioGeneratedPayload` (around line 38) and add the field:

```ts
export interface ScenarioGeneratedPayload {
  scenarioId: string;
  ticketId: string;
  name: string;
  gherkin: string;
  priority: Priority;
  featureHash: string;
  generatedAt: string;
  satisfiesAcs?: number[];      // NEW v0.8: AC indices (0-based) this scenario asserts
}
```

Reminder: `exactOptionalPropertyTypes` is on. Consumers building this payload must assign conditionally:

```ts
const payload: ScenarioGeneratedPayload = { scenarioId, ticketId, name, gherkin, priority, featureHash, generatedAt };
if (acs.length > 0) payload.satisfiesAcs = acs;
```

- [ ] **Step 4: Verify pass**

```bash
cd packages/core && bun test test/graph/types.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/graph/types.ts packages/core/test/graph/types.test.ts
git commit -m "feat(core): add optional satisfiesAcs to ScenarioGeneratedPayload"
```

---

### Task 1.4: Add `CoverageSnapshotPayload` + `AcCoverageBackfilledPayload` to `EventPayloadMap`

**Files:**
- Modify: `packages/core/src/graph/types.ts`
- Test: `packages/core/test/graph/types.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import type {
  CoverageSnapshotPayload,
  AcCoverageBackfilledPayload,
  Event,
} from '../../src/graph/types';

describe('CoverageSnapshotPayload', () => {
  test('shape: ts, windowDays, areas[], tickets[]', () => {
    const payload: CoverageSnapshotPayload = {
      ts: '2026-05-17T10:00:00.000Z',
      windowDays: 30,
      areas: [{
        id: 'checkout', status: 'UNCOVERED', risk: 8,
        breakdown: { recentTickets: 3, recentBugs: 2, criticalBoost: 2 },
      }],
      tickets: [{
        id: 'PROJ-105', acCount: 5, satisfiedCount: 3, gapScore: 4,
      }],
    };
    expect(payload.windowDays).toBe(30);
    expect(payload.areas[0]?.status).toBe('UNCOVERED');
  });
});

describe('AcCoverageBackfilledPayload', () => {
  test('shape: ts, ticketId, mappings[]', () => {
    const payload: AcCoverageBackfilledPayload = {
      ts: '2026-05-17T10:00:00.000Z',
      ticketId: 'PROJ-105',
      mappings: [{ scenarioId: 'PROJ-105#scenario-0', satisfiesAcs: [0, 1, 3], confidence: 0.85 }],
    };
    expect(payload.ticketId).toBe('PROJ-105');
    expect(payload.mappings[0]?.satisfiesAcs).toEqual([0, 1, 3]);
  });
});

describe('Event union extended', () => {
  test('Event type discriminates coverage.snapshot', () => {
    const e: Event = {
      event_id: '01HXYZ' + '0'.repeat(20),
      schema_version: 1 as const,
      ts: '2026-05-17T10:00:00.000Z',
      actor: 'xera-coverage',
      type: 'coverage.snapshot',
      payload: {
        ts: '2026-05-17T10:00:00.000Z',
        windowDays: 30,
        areas: [],
        tickets: [],
      },
    };
    expect(e.type).toBe('coverage.snapshot');
  });

  test('Event type discriminates ac-coverage.backfilled', () => {
    const e: Event = {
      event_id: '01HXYZ' + '0'.repeat(20),
      schema_version: 1 as const,
      ts: '2026-05-17T10:00:00.000Z',
      actor: 'xera-coverage',
      type: 'ac-coverage.backfilled',
      payload: {
        ts: '2026-05-17T10:00:00.000Z',
        ticketId: 'PROJ-105',
        mappings: [],
      },
    };
    expect(e.type).toBe('ac-coverage.backfilled');
  });
});
```

- [ ] **Step 2: Verify failure**

```bash
cd packages/core && bun test test/graph/types.test.ts
```

Expected: "Cannot find name 'CoverageSnapshotPayload'".

- [ ] **Step 3: Implement payloads + extend `EventPayloadMap`**

In `packages/core/src/graph/types.ts`, after existing payload interfaces (e.g. after `EdgeDiscoveredPayload`):

```ts
export interface CoverageSnapshotPayload {
  ts: string;        // ISO8601
  windowDays: number;
  areas: Array<{
    id: string;
    status: 'UNCOVERED' | 'STALE' | 'COVERED';
    risk: number;
    breakdown: {
      recentTickets: number;
      recentBugs: number;
      criticalBoost: 1 | 2;
    };
  }>;
  tickets: Array<{
    id: string;
    acCount: number;
    satisfiedCount: number;
    gapScore: number;
  }>;
}

export interface AcCoverageBackfilledPayload {
  ts: string;
  ticketId: string;
  mappings: Array<{
    scenarioId: string;
    satisfiesAcs: number[];
    confidence: number;
  }>;
}
```

In the existing `EventPayloadMap` type (around line 105), append two members:

```ts
export type EventPayloadMap = {
  'ticket.fetched': TicketFetchedPayload;
  'ticket.enriched': TicketEnrichedPayload;
  'scenario.generated': ScenarioGeneratedPayload;
  'pom.generated': PomGeneratedPayload;
  'pom.promoted': PomPromotedPayload;
  'run.completed': RunCompletedPayload;
  'run.classified': RunClassifiedPayload;
  'classification.disputed': ClassificationDisputedPayload;
  'edge.discovered': EdgeDiscoveredPayload;
  'coverage.snapshot': CoverageSnapshotPayload;          // NEW
  'ac-coverage.backfilled': AcCoverageBackfilledPayload; // NEW
};
```

Important: the existing `Event` mapped type immediately below `EventPayloadMap` (around line 117) will automatically discriminate over the two new keys — no change needed there.

- [ ] **Step 4: Verify pass**

```bash
cd packages/core && bun test test/graph/types.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/graph/types.ts packages/core/test/graph/types.test.ts
git commit -m "feat(core): add coverage.snapshot + ac-coverage.backfilled event payloads"
```

---

### Task 1.5: Extend `Snapshot` with `acNodes` + `classifications`

**Files:**
- Modify: `packages/core/src/graph/types.ts`
- Test: `packages/core/test/graph/types.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import type { Snapshot } from '../../src/graph/types';

describe('Snapshot with v0.8 projections', () => {
  test('has acNodes: Record<string, ACNode>', () => {
    const snap: Snapshot = {
      schema_version: 1,
      generated_at: '2026-05-17T10:00:00.000Z',
      event_count: 0,
      events_hash: 'sha256:',
      tickets: {}, scenarios: {}, poms: {}, areas: {},
      edges: [], latest_failures: {},
      acNodes: {},
      classifications: [],
    };
    expect(snap.acNodes).toEqual({});
    expect(snap.classifications).toEqual([]);
  });
});
```

- [ ] **Step 2: Verify failure**

```bash
cd packages/core && bun test test/graph/types.test.ts
```

Expected: TS error — `acNodes` / `classifications` not on `Snapshot`.

- [ ] **Step 3: Extend the interface**

In `packages/core/src/graph/types.ts`, locate `Snapshot` (around line 175) and add the two fields:

```ts
export interface Snapshot {
  schema_version: typeof SCHEMA_VERSION;
  generated_at: string;
  event_count: number;
  events_hash: string;
  tickets: Record<string, TicketNode>;
  scenarios: Record<string, ScenarioNode>;
  poms: Record<string, PomNode>;
  areas: Record<string, AreaNode>;
  edges: EdgeRecord[];
  latest_failures: Record<string, FailureNode>;
  acNodes: Record<string, ACNode>;                                     // NEW v0.8
  classifications: Array<{
    scenarioId: string;
    classification: Classification;
    ts: string;
  }>;                                                                   // NEW v0.8
}
```

`Classification` is already exported from this file.

- [ ] **Step 4: Verify pass**

```bash
cd packages/core && bun test test/graph/types.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/graph/types.ts packages/core/test/graph/types.test.ts
git commit -m "feat(core): extend Snapshot with acNodes + classifications projections"
```

---

## Phase 2 — Zod schema additions

### Task 2.1: Extend `scenarioGenerated` + `edgeDiscovered` Zod schemas

**Files:**
- Modify: `packages/core/src/graph/schema.ts`
- Test: `packages/core/test/graph/schema.test.ts` (create if absent)

- [ ] **Step 1: Write the failing test**

Create or append to `packages/core/test/graph/schema.test.ts`:

```ts
import { describe, test, expect } from 'bun:test';
import { safeParseEvent } from '../../src/graph/schema';

const base = {
  event_id: '01HXYZ' + '0'.repeat(20),
  schema_version: 1,
  ts: '2026-05-17T10:00:00.000Z',
  actor: 'xera-test',
};

describe('scenarioGenerated schema with satisfiesAcs', () => {
  test('accepts optional satisfiesAcs', () => {
    const r = safeParseEvent({
      ...base,
      type: 'scenario.generated',
      payload: {
        scenarioId: 'PROJ-1#scenario-0', ticketId: 'PROJ-1',
        name: 'x', gherkin: '...', priority: 'p1',
        featureHash: 'h', generatedAt: '2026-05-17T10:00:00.000Z',
        satisfiesAcs: [0, 2],
      },
    });
    expect(r.success).toBe(true);
  });

  test('accepts payload without satisfiesAcs (legacy)', () => {
    const r = safeParseEvent({
      ...base,
      type: 'scenario.generated',
      payload: {
        scenarioId: 'PROJ-1#scenario-0', ticketId: 'PROJ-1',
        name: 'x', gherkin: '...', priority: 'p1',
        featureHash: 'h', generatedAt: '2026-05-17T10:00:00.000Z',
      },
    });
    expect(r.success).toBe(true);
  });

  test('rejects non-integer satisfiesAcs', () => {
    const r = safeParseEvent({
      ...base,
      type: 'scenario.generated',
      payload: {
        scenarioId: 'PROJ-1#scenario-0', ticketId: 'PROJ-1',
        name: 'x', gherkin: '...', priority: 'p1',
        featureHash: 'h', generatedAt: '2026-05-17T10:00:00.000Z',
        satisfiesAcs: [1.5],
      },
    });
    expect(r.success).toBe(false);
  });
});

describe('edgeDiscovered schema with satisfies kind', () => {
  test('accepts kind=satisfies', () => {
    const r = safeParseEvent({
      ...base,
      type: 'edge.discovered',
      payload: {
        kind: 'satisfies',
        from: 'PROJ-1#scenario-0',
        to: 'PROJ-1#ac-0',
        source: 'xera-script',
      },
    });
    expect(r.success).toBe(true);
  });
});
```

- [ ] **Step 2: Verify failure**

```bash
cd packages/core && bun test test/graph/schema.test.ts
```

Expected: scenarioGenerated rejects `satisfiesAcs`; edgeDiscovered rejects `'satisfies'`.

- [ ] **Step 3: Extend the schemas**

In `packages/core/src/graph/schema.ts`:

**Step 3a:** Extend `scenarioGenerated` (currently the `.passthrough()`-style object):

```ts
const scenarioGenerated = z
  .object({
    scenarioId: z.string(),
    ticketId: z.string(),
    name: z.string(),
    gherkin: z.string(),
    priority: z.enum(['p0', 'p1', 'p2']),
    featureHash: z.string(),
    generatedAt: iso,
    satisfiesAcs: z.array(z.number().int().nonnegative()).optional(),  // NEW
  })
  .passthrough();
```

**Step 3b:** Extend `edgeDiscovered` kinds enum to include `'satisfies'`:

```ts
const edgeDiscovered = z
  .object({
    kind: z.enum(['tests', 'uses', 'covers', 'modifies', 'jira-linked', 'similar', 'ran', 'satisfies']),  // 'satisfies' added
    from: z.string(),
    to: z.string(),
    confidence: z.number().min(0).max(1).optional(),
    source: z.string(),
  })
  .passthrough();
```

- [ ] **Step 4: Verify pass**

```bash
cd packages/core && bun test test/graph/schema.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/graph/schema.ts packages/core/test/graph/schema.test.ts
git commit -m "feat(core): Zod accepts satisfiesAcs + satisfies edge kind"
```

---

### Task 2.2: Add `coverageSnapshot` + `acCoverageBackfilled` payload schemas

**Files:**
- Modify: `packages/core/src/graph/schema.ts`
- Test: `packages/core/test/graph/schema.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
describe('coverage.snapshot event schema', () => {
  test('accepts valid event', () => {
    const r = safeParseEvent({
      ...base,
      type: 'coverage.snapshot',
      payload: {
        ts: '2026-05-17T10:00:00.000Z',
        windowDays: 30,
        areas: [{
          id: 'checkout', status: 'UNCOVERED', risk: 8,
          breakdown: { recentTickets: 3, recentBugs: 2, criticalBoost: 2 },
        }],
        tickets: [{ id: 'PROJ-105', acCount: 5, satisfiedCount: 3, gapScore: 4 }],
      },
    });
    expect(r.success).toBe(true);
  });

  test('rejects criticalBoost = 3', () => {
    const r = safeParseEvent({
      ...base,
      type: 'coverage.snapshot',
      payload: {
        ts: '2026-05-17T10:00:00.000Z',
        windowDays: 30,
        areas: [{
          id: 'x', status: 'UNCOVERED', risk: 0,
          breakdown: { recentTickets: 0, recentBugs: 0, criticalBoost: 3 },
        }],
        tickets: [],
      },
    });
    expect(r.success).toBe(false);
  });

  test('rejects unknown status', () => {
    const r = safeParseEvent({
      ...base,
      type: 'coverage.snapshot',
      payload: {
        ts: '2026-05-17T10:00:00.000Z',
        windowDays: 30,
        areas: [{
          id: 'x', status: 'WEIRD', risk: 0,
          breakdown: { recentTickets: 0, recentBugs: 0, criticalBoost: 1 },
        }],
        tickets: [],
      },
    });
    expect(r.success).toBe(false);
  });
});

describe('ac-coverage.backfilled event schema', () => {
  test('accepts valid event', () => {
    const r = safeParseEvent({
      ...base,
      type: 'ac-coverage.backfilled',
      payload: {
        ts: '2026-05-17T10:00:00.000Z',
        ticketId: 'PROJ-105',
        mappings: [{ scenarioId: 'PROJ-105#scenario-0', satisfiesAcs: [0, 1], confidence: 0.85 }],
      },
    });
    expect(r.success).toBe(true);
  });
});
```

- [ ] **Step 2: Verify failure**

```bash
cd packages/core && bun test test/graph/schema.test.ts
```

- [ ] **Step 3: Add payload schemas + extend `EventSchema`**

In `packages/core/src/graph/schema.ts`, BEFORE `EventSchema`:

```ts
const coverageSnapshot = z
  .object({
    ts: iso,
    windowDays: z.number().int().positive(),
    areas: z.array(z.object({
      id: z.string().regex(/^[a-z0-9-]+$/),
      status: z.enum(['UNCOVERED', 'STALE', 'COVERED']),
      risk: z.number().nonnegative(),
      breakdown: z.object({
        recentTickets: z.number().int().nonnegative(),
        recentBugs: z.number().int().nonnegative(),
        criticalBoost: z.union([z.literal(1), z.literal(2)]),
      }),
    })),
    tickets: z.array(z.object({
      id: z.string().regex(/^[A-Z][A-Z0-9]*-\d+$/),
      acCount: z.number().int().nonnegative(),
      satisfiedCount: z.number().int().nonnegative(),
      gapScore: z.number().nonnegative(),
    })),
  })
  .passthrough();

const acCoverageBackfilled = z
  .object({
    ts: iso,
    ticketId: z.string().regex(/^[A-Z][A-Z0-9]*-\d+$/),
    mappings: z.array(z.object({
      scenarioId: z.string().min(1),
      satisfiesAcs: z.array(z.number().int().nonnegative()),
      confidence: z.number().min(0).max(1),
    })),
  })
  .passthrough();
```

Then extend the `EventSchema` discriminatedUnion (currently around line 117) by appending two `z.object` members:

```ts
export const EventSchema = z.discriminatedUnion('type', [
  z.object({ ...base, type: z.literal('ticket.fetched'), payload: ticketFetched }),
  z.object({ ...base, type: z.literal('ticket.enriched'), payload: ticketEnriched }),
  z.object({ ...base, type: z.literal('scenario.generated'), payload: scenarioGenerated }),
  z.object({ ...base, type: z.literal('pom.generated'), payload: pomGenerated }),
  z.object({ ...base, type: z.literal('pom.promoted'), payload: pomPromoted }),
  z.object({ ...base, type: z.literal('run.completed'), payload: runCompleted }),
  z.object({ ...base, type: z.literal('run.classified'), payload: runClassified }),
  z.object({ ...base, type: z.literal('classification.disputed'), payload: classificationDisputed }),
  z.object({ ...base, type: z.literal('edge.discovered'), payload: edgeDiscovered }),
  z.object({ ...base, type: z.literal('coverage.snapshot'), payload: coverageSnapshot }),            // NEW
  z.object({ ...base, type: z.literal('ac-coverage.backfilled'), payload: acCoverageBackfilled }),   // NEW
]);
```

- [ ] **Step 4: Verify pass**

```bash
cd packages/core && bun test test/graph/schema.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/graph/schema.ts packages/core/test/graph/schema.test.ts
git commit -m "feat(core): add Zod schemas for coverage.snapshot + ac-coverage.backfilled"
```

---

## Phase 3 — `deriveSnapshot` extensions

### Task 3.1: Initialize `acNodes` + `classifications` in `deriveSnapshot`

**Files:**
- Modify: `packages/core/src/graph/store.ts`
- Test: `packages/core/test/graph/store.test.ts` (create or extend)

- [ ] **Step 1: Write the failing test**

```ts
import { describe, test, expect } from 'bun:test';
import { deriveSnapshot } from '../../src/graph/store';

describe('deriveSnapshot v0.8 projections', () => {
  test('empty events → snapshot has empty acNodes and classifications', () => {
    const snap = deriveSnapshot([]);
    expect(snap.acNodes).toEqual({});
    expect(snap.classifications).toEqual([]);
  });
});
```

- [ ] **Step 2: Verify failure**

```bash
cd packages/core && bun test test/graph/store.test.ts
```

Expected: `acNodes` / `classifications` not on returned snapshot.

- [ ] **Step 3: Initialize + include in return value**

In `packages/core/src/graph/store.ts`, locate `deriveSnapshot`. After the existing initializer block (around line 99):

```ts
export function deriveSnapshot(events: Event[]): Snapshot {
  const tickets: Record<string, TicketNode> = {};
  const scenarios: Record<string, ScenarioNode> = {};
  const poms: Record<string, PomNode> = {};
  const areas: Record<string, { id: string }> = {};
  const edges: EdgeRecord[] = [];
  const latestFailures: Record<string, FailureNode> = {};
  const acNodes: Record<string, ACNode> = {};                                         // NEW
  const classifications: Array<{ scenarioId: string; classification: Classification; ts: string }> = [];  // NEW

  for (const e of events) {
    switch (e.type) {
      // ... existing cases unchanged for now ...
    }
  }

  return {
    schema_version: SCHEMA_VERSION,
    generated_at: new Date().toISOString(),
    event_count: events.length,
    events_hash: computeEventsHash(events),
    tickets,
    scenarios,
    poms,
    areas,
    edges,
    latest_failures: latestFailures,
    acNodes,                  // NEW
    classifications,          // NEW
  };
}
```

Also extend the imports at the top of `store.ts`:

```ts
import type {
  ACNode,                  // NEW
  Classification,          // NEW
  EdgeRecord,
  Event,
  FailureNode,
  PomNode,
  ScenarioNode,
  Snapshot,
  TicketNode,
} from './types';
```

- [ ] **Step 4: Verify pass**

```bash
cd packages/core && bun test test/graph/store.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/graph/store.ts packages/core/test/graph/store.test.ts
git commit -m "feat(core): deriveSnapshot initializes acNodes + classifications fields"
```

---

### Task 3.2: Materialize `ACNode` entries from `ticket.fetched` events (replace on re-fetch, prune satisfies edges)

**Files:**
- Modify: `packages/core/src/graph/store.ts`
- Test: `packages/core/test/graph/store.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import type { Event } from '../../src/graph/types';

function ticketFetchedEvent(
  ticketId: string, ac: string[], ts: string, storyHash = 'h',
): Event {
  return {
    event_id: '01HXYZ' + ts.replace(/[^0-9]/g, '').padEnd(20, '0').slice(0, 20),
    schema_version: 1,
    ts,
    actor: 'xera-fetch',
    type: 'ticket.fetched',
    payload: {
      ticketId, summary: 's', ac,
      jiraLinks: [], storyHash, modifiesAreas: [],
    },
  };
}

describe('deriveSnapshot — ACNode materialization', () => {
  test('materializes one ACNode per AC from ticket.fetched', () => {
    const events: Event[] = [
      ticketFetchedEvent('PROJ-105', ['Sees subtotal', 'Sees discount', 'Sees tax line'], '2026-05-12T10:00:00.000Z'),
    ];
    const snap = deriveSnapshot(events);
    expect(Object.keys(snap.acNodes).sort()).toEqual([
      'PROJ-105#ac-0', 'PROJ-105#ac-1', 'PROJ-105#ac-2',
    ]);
    expect(snap.acNodes['PROJ-105#ac-2']).toEqual({
      id: 'PROJ-105#ac-2',
      ticketId: 'PROJ-105',
      index: 2,
      text: 'Sees tax line',
    });
  });

  test('re-fetch replaces ACNodes for that ticket', () => {
    const events: Event[] = [
      ticketFetchedEvent('PROJ-105', ['Old 0', 'Old 1', 'Old 2'], '2026-05-12T10:00:00.000Z', 'v1'),
      ticketFetchedEvent('PROJ-105', ['New 0', 'New 1'], '2026-05-15T10:00:00.000Z', 'v2'),
    ];
    const snap = deriveSnapshot(events);
    expect(Object.keys(snap.acNodes).sort()).toEqual(['PROJ-105#ac-0', 'PROJ-105#ac-1']);
    expect(snap.acNodes['PROJ-105#ac-0']?.text).toBe('New 0');
  });

  test('re-fetch prunes satisfies edges targeting removed ACs', () => {
    const events: Event[] = [
      ticketFetchedEvent('PROJ-105', ['AC 0', 'AC 1', 'AC 2'], '2026-05-12T10:00:00.000Z', 'v1'),
      {
        event_id: '01HXYZ' + '1'.repeat(20),
        schema_version: 1, ts: '2026-05-13T10:00:00.000Z', actor: 'xera-script',
        type: 'edge.discovered',
        payload: { kind: 'satisfies', from: 'PROJ-105#scenario-0', to: 'PROJ-105#ac-2', source: 'xera-script' },
      },
      ticketFetchedEvent('PROJ-105', ['AC 0', 'AC 1'], '2026-05-15T10:00:00.000Z', 'v2'),
    ];
    const snap = deriveSnapshot(events);
    const targets = snap.edges.filter((e) => e.kind === 'satisfies').map((e) => e.to);
    expect(targets).toEqual([]);   // edge to ac-2 pruned because AC 2 removed
  });
});
```

- [ ] **Step 2: Verify failure**

```bash
cd packages/core && bun test test/graph/store.test.ts
```

- [ ] **Step 3: Extend `ticket.fetched` handler**

In `packages/core/src/graph/store.ts`, locate the `case 'ticket.fetched':` block (around line 105) and append AC materialization at the end of it (before `break`):

```ts
case 'ticket.fetched': {
  tickets[e.payload.ticketId] = {
    id: e.payload.ticketId,
    summary: e.payload.summary,
    ac: e.payload.ac,
    storyHash: e.payload.storyHash,
    modifiesAreas: e.payload.modifiesAreas,
    fetchedAt: e.ts,
  };
  for (const a of e.payload.modifiesAreas) areas[a] = { id: a };
  for (const link of e.payload.jiraLinks) {
    edges.push({
      kind: 'jira-linked',
      from: e.payload.ticketId,
      to: link.ticketId,
      source: `jira:${link.relation}`,
      discoveredAt: e.ts,
    });
  }

  // NEW v0.8: drop prior ACNodes for this ticket, materialize fresh
  const tid = e.payload.ticketId;
  for (const acId of Object.keys(acNodes)) {
    if (acNodes[acId]?.ticketId === tid) delete acNodes[acId];
  }
  e.payload.ac.forEach((text, index) => {
    const acId = `${tid}#ac-${index}`;
    acNodes[acId] = { id: acId, ticketId: tid, index, text };
  });
  // Prune satisfies edges targeting removed AC IDs
  for (let i = edges.length - 1; i >= 0; i--) {
    const ed = edges[i]!;
    if (ed.kind !== 'satisfies') continue;
    if (acNodes[ed.to] === undefined) edges.splice(i, 1);
  }
  break;
}
```

- [ ] **Step 4: Verify pass**

```bash
cd packages/core && bun test test/graph/store.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/graph/store.ts packages/core/test/graph/store.test.ts
git commit -m "feat(core): materialize ACNodes from ticket.fetched + prune stale satisfies edges"
```

---

### Task 3.3: Materialize `satisfies` edges from `scenario.generated` payload (eager path)

**Files:**
- Modify: `packages/core/src/graph/store.ts`
- Test: `packages/core/test/graph/store.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
function scenarioGeneratedEvent(
  ticketId: string, scenarioId: string, ts: string,
  satisfiesAcs?: number[],
): Event {
  const payload: import('../../src/graph/types').ScenarioGeneratedPayload = {
    scenarioId, ticketId,
    name: 'n', gherkin: '...', priority: 'p1',
    featureHash: 'h', generatedAt: ts,
  };
  if (satisfiesAcs) payload.satisfiesAcs = satisfiesAcs;
  return {
    event_id: '01HXYZ' + ts.replace(/[^0-9]/g, '').padEnd(20, '0').slice(0, 20),
    schema_version: 1, ts, actor: 'xera-script',
    type: 'scenario.generated', payload,
  };
}

describe('deriveSnapshot — eager satisfies edges', () => {
  test('emits satisfies edges from scenario.generated.satisfiesAcs', () => {
    const events: Event[] = [
      ticketFetchedEvent('PROJ-105', ['AC 0', 'AC 1', 'AC 2'], '2026-05-12T10:00:00.000Z'),
      scenarioGeneratedEvent('PROJ-105', 'PROJ-105#scenario-0', '2026-05-12T11:00:00.000Z', [0, 2]),
    ];
    const snap = deriveSnapshot(events);
    const sat = snap.edges.filter((e) => e.kind === 'satisfies');
    expect(sat).toHaveLength(2);
    expect(sat.map((e) => e.to).sort()).toEqual(['PROJ-105#ac-0', 'PROJ-105#ac-2']);
    expect(sat[0]?.source).toBe('xera-script');
    expect(sat[0]?.confidence).toBe(1.0);
  });

  test('no satisfies edges when scenario.generated lacks satisfiesAcs (legacy)', () => {
    const events: Event[] = [
      ticketFetchedEvent('PROJ-1', ['AC 0'], '2026-04-01T10:00:00.000Z'),
      scenarioGeneratedEvent('PROJ-1', 'PROJ-1#scenario-0', '2026-04-01T11:00:00.000Z'),
    ];
    const snap = deriveSnapshot(events);
    expect(snap.edges.filter((e) => e.kind === 'satisfies')).toEqual([]);
  });

  test('regenerating a scenario replaces its prior eager satisfies edges', () => {
    const events: Event[] = [
      ticketFetchedEvent('PROJ-1', ['AC 0', 'AC 1', 'AC 2'], '2026-04-01T10:00:00.000Z'),
      scenarioGeneratedEvent('PROJ-1', 'PROJ-1#scenario-0', '2026-04-01T11:00:00.000Z', [0, 1]),
      scenarioGeneratedEvent('PROJ-1', 'PROJ-1#scenario-0', '2026-04-02T11:00:00.000Z', [2]),
    ];
    const snap = deriveSnapshot(events);
    const sat = snap.edges.filter((e) => e.kind === 'satisfies' && e.from === 'PROJ-1#scenario-0');
    expect(sat).toHaveLength(1);
    expect(sat[0]?.to).toBe('PROJ-1#ac-2');
  });
});
```

- [ ] **Step 2: Verify failure**

```bash
cd packages/core && bun test test/graph/store.test.ts
```

- [ ] **Step 3: Extend `scenario.generated` handler**

In `packages/core/src/graph/store.ts`, locate the existing `case 'scenario.generated':` block and append AT THE END (before `break`):

```ts
case 'scenario.generated':
  scenarios[e.payload.scenarioId] = {
    id: e.payload.scenarioId,
    ticketId: e.payload.ticketId,
    name: e.payload.name,
    gherkin: e.payload.gherkin,
    priority: e.payload.priority,
    featureHash: e.payload.featureHash,
    generatedAt: e.payload.generatedAt,
  };
  edges.push({
    kind: 'tests',
    from: e.payload.ticketId,
    to: e.payload.scenarioId,
    source: 'xera-script',
    discoveredAt: e.ts,
  });
  // NEW v0.8: drop prior eager satisfies edges for this scenario, then emit fresh
  if (e.payload.satisfiesAcs && e.payload.satisfiesAcs.length > 0) {
    for (let i = edges.length - 1; i >= 0; i--) {
      const ed = edges[i]!;
      if (ed.kind === 'satisfies' && ed.from === e.payload.scenarioId && ed.source === 'xera-script') {
        edges.splice(i, 1);
      }
    }
    for (const acIdx of e.payload.satisfiesAcs) {
      const acId = `${e.payload.ticketId}#ac-${acIdx}`;
      if (acNodes[acId] === undefined) continue;
      edges.push({
        kind: 'satisfies',
        from: e.payload.scenarioId,
        to: acId,
        confidence: 1.0,
        source: 'xera-script',
        discoveredAt: e.ts,
      });
    }
  }
  break;
```

- [ ] **Step 4: Verify pass**

```bash
cd packages/core && bun test test/graph/store.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/graph/store.ts packages/core/test/graph/store.test.ts
git commit -m "feat(core): emit eager satisfies edges from scenario.generated"
```

---

### Task 3.4: Project `run.classified` events into `Snapshot.classifications`

**Files:**
- Modify: `packages/core/src/graph/store.ts`
- Test: `packages/core/test/graph/store.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
describe('deriveSnapshot — classifications projection', () => {
  test('captures run.classified events into snapshot.classifications', () => {
    const events: Event[] = [
      {
        event_id: '01HXYZ' + '0'.repeat(20),
        schema_version: 1, ts: '2026-05-14T10:00:00.000Z', actor: 'xera-report',
        type: 'run.classified',
        payload: {
          scenarioId: 'PROJ-1#scenario-0', runId: 'r1',
          classification: 'REAL_BUG', confidence: 'high',
        },
      },
      {
        event_id: '01HXYZ' + '1'.repeat(20),
        schema_version: 1, ts: '2026-05-10T10:00:00.000Z', actor: 'xera-report',
        type: 'run.classified',
        payload: {
          scenarioId: 'PROJ-1#scenario-0', runId: 'r2',
          classification: 'PASS', confidence: 'medium',
        },
      },
    ];
    const snap = deriveSnapshot(events);
    expect(snap.classifications).toHaveLength(2);
    expect(snap.classifications[0]).toEqual({
      scenarioId: 'PROJ-1#scenario-0',
      classification: 'REAL_BUG',
      ts: '2026-05-14T10:00:00.000Z',
    });
  });
});
```

- [ ] **Step 2: Verify failure**

```bash
cd packages/core && bun test test/graph/store.test.ts
```

Expected: classifications still empty.

- [ ] **Step 3: Extend the switch — add a `case 'run.classified'` handler**

Currently `run.classified` falls through to `default: break;`. Replace that fall-through by adding an explicit case BEFORE `default`:

```ts
case 'run.classified':
  classifications.push({
    scenarioId: e.payload.scenarioId,
    classification: e.payload.classification,
    ts: e.ts,
  });
  break;
```

- [ ] **Step 4: Verify pass**

```bash
cd packages/core && bun test test/graph/store.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/graph/store.ts packages/core/test/graph/store.test.ts
git commit -m "feat(core): project run.classified events into Snapshot.classifications"
```

---

### Task 3.5: Handle `ac-coverage.backfilled` events (lazy satisfies path, idempotent per ticket)

**Files:**
- Modify: `packages/core/src/graph/store.ts`
- Test: `packages/core/test/graph/store.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
describe('deriveSnapshot — backfilled satisfies edges', () => {
  test('materializes satisfies edges from ac-coverage.backfilled', () => {
    const events: Event[] = [
      ticketFetchedEvent('PROJ-1', ['AC 0', 'AC 1', 'AC 2'], '2026-05-12T10:00:00.000Z'),
      scenarioGeneratedEvent('PROJ-1', 'PROJ-1#scenario-0', '2026-04-01T11:00:00.000Z'),  // legacy
      {
        event_id: '01HXYZ' + '5'.repeat(20),
        schema_version: 1, ts: '2026-05-17T10:00:00.000Z', actor: 'xera-coverage',
        type: 'ac-coverage.backfilled',
        payload: {
          ts: '2026-05-17T10:00:00.000Z',
          ticketId: 'PROJ-1',
          mappings: [{ scenarioId: 'PROJ-1#scenario-0', satisfiesAcs: [0, 1], confidence: 0.85 }],
        },
      },
    ];
    const snap = deriveSnapshot(events);
    const sat = snap.edges.filter((e) => e.kind === 'satisfies');
    expect(sat).toHaveLength(2);
    expect(sat[0]?.source).toBe('ac-coverage');
    expect(sat[0]?.confidence).toBe(0.85);
  });

  test('re-running backfill replaces prior backfill edges for the ticket', () => {
    const baseEvents: Event[] = [
      ticketFetchedEvent('PROJ-1', ['AC 0', 'AC 1', 'AC 2'], '2026-05-12T10:00:00.000Z'),
      scenarioGeneratedEvent('PROJ-1', 'PROJ-1#scenario-0', '2026-04-01T11:00:00.000Z'),
    ];
    const firstBackfill: Event = {
      event_id: '01HXYZ' + 'A'.repeat(20),
      schema_version: 1, ts: '2026-05-17T10:00:00.000Z', actor: 'xera-coverage',
      type: 'ac-coverage.backfilled',
      payload: {
        ts: '2026-05-17T10:00:00.000Z',
        ticketId: 'PROJ-1',
        mappings: [{ scenarioId: 'PROJ-1#scenario-0', satisfiesAcs: [0, 1], confidence: 0.8 }],
      },
    };
    const secondBackfill: Event = {
      event_id: '01HXYZ' + 'B'.repeat(20),
      schema_version: 1, ts: '2026-05-17T11:00:00.000Z', actor: 'xera-coverage',
      type: 'ac-coverage.backfilled',
      payload: {
        ts: '2026-05-17T11:00:00.000Z',
        ticketId: 'PROJ-1',
        mappings: [{ scenarioId: 'PROJ-1#scenario-0', satisfiesAcs: [2], confidence: 0.95 }],
      },
    };
    const snap = deriveSnapshot([...baseEvents, firstBackfill, secondBackfill]);
    const sat = snap.edges.filter((e) => e.kind === 'satisfies');
    expect(sat).toHaveLength(1);
    expect(sat[0]?.to).toBe('PROJ-1#ac-2');
  });

  test('coverage.snapshot events are no-op for snapshot (read-side only)', () => {
    const events: Event[] = [
      {
        event_id: '01HXYZ' + 'C'.repeat(20),
        schema_version: 1, ts: '2026-05-17T10:00:00.000Z', actor: 'xera-coverage',
        type: 'coverage.snapshot',
        payload: { ts: '2026-05-17T10:00:00.000Z', windowDays: 30, areas: [], tickets: [] },
      },
    ];
    const snap = deriveSnapshot(events);
    expect(snap.event_count).toBe(1);
    expect(snap.edges).toEqual([]);
    expect(snap.acNodes).toEqual({});
  });
});
```

- [ ] **Step 2: Verify failure**

```bash
cd packages/core && bun test test/graph/store.test.ts
```

- [ ] **Step 3: Add `ac-coverage.backfilled` and `coverage.snapshot` cases**

In `packages/core/src/graph/store.ts`, add BEFORE `default`:

```ts
case 'ac-coverage.backfilled': {
  const { ts, ticketId, mappings } = e.payload;
  // Remove prior backfill edges for this ticket (idempotent)
  for (let i = edges.length - 1; i >= 0; i--) {
    const ed = edges[i]!;
    if (ed.kind === 'satisfies' && ed.source === 'ac-coverage' && ed.to.startsWith(`${ticketId}#ac-`)) {
      edges.splice(i, 1);
    }
  }
  for (const m of mappings) {
    for (const acIdx of m.satisfiesAcs) {
      const acId = `${ticketId}#ac-${acIdx}`;
      if (acNodes[acId] === undefined) continue;
      edges.push({
        kind: 'satisfies',
        from: m.scenarioId,
        to: acId,
        confidence: m.confidence,
        source: 'ac-coverage',
        discoveredAt: ts,
      });
    }
  }
  break;
}
case 'coverage.snapshot':
  // Read-side only — Trend tab queries these events directly from JSONL.
  break;
```

- [ ] **Step 4: Verify pass**

```bash
cd packages/core && bun test test/graph/store.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/graph/store.ts packages/core/test/graph/store.test.ts
git commit -m "feat(core): handle ac-coverage.backfilled + coverage.snapshot in deriveSnapshot"
```

---

## Phase 4 — Coverage engine: types + status

### Task 4.1: `CoverageConfig` type + barrel skeleton

**Files:**
- Create: `packages/core/src/coverage/types.ts`
- Create: `packages/core/src/coverage/index.ts`
- Test: `packages/core/test/coverage/types.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, test, expect } from 'bun:test';
import type { CoverageConfig } from '../../src/coverage/types';
import { DEFAULT_COVERAGE_CONFIG } from '../../src/coverage/types';

describe('CoverageConfig defaults', () => {
  test('staleAfterDays=30, criticalAreas=[], autoSnapshotOnCoverage=true', () => {
    const cfg: CoverageConfig = DEFAULT_COVERAGE_CONFIG;
    expect(cfg.staleAfterDays).toBe(30);
    expect(cfg.criticalAreas).toEqual([]);
    expect(cfg.autoSnapshotOnCoverage).toBe(true);
  });
});
```

- [ ] **Step 2: Verify failure**

```bash
cd packages/core && bun test test/coverage/types.test.ts
```

Expected: module not found.

- [ ] **Step 3: Implement**

Create `packages/core/src/coverage/types.ts`:

```ts
export interface CoverageConfig {
  staleAfterDays: number;
  criticalAreas: string[];
  autoSnapshotOnCoverage: boolean;
}

export const DEFAULT_COVERAGE_CONFIG: CoverageConfig = {
  staleAfterDays: 30,
  criticalAreas: [],
  autoSnapshotOnCoverage: true,
};
```

Create `packages/core/src/coverage/index.ts`:

```ts
export type { CoverageConfig } from './types';
export { DEFAULT_COVERAGE_CONFIG } from './types';
```

- [ ] **Step 4: Verify pass**

```bash
cd packages/core && bun test test/coverage/types.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/coverage/ packages/core/test/coverage/types.test.ts
git commit -m "feat(core): scaffold coverage module with CoverageConfig"
```

---

### Task 4.2: `computeScenarioStatus` (uses `Snapshot.classifications`)

**Files:**
- Create: `packages/core/src/coverage/status.ts`
- Test: `packages/core/test/coverage/status.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, test, expect } from 'bun:test';
import { computeScenarioStatus } from '../../src/coverage/status';
import type { Snapshot } from '../../src/graph/types';

function emptySnap(): Snapshot {
  return {
    schema_version: 1, generated_at: '2026-05-17T10:00:00.000Z',
    event_count: 0, events_hash: 'sha256:',
    tickets: {}, scenarios: {}, poms: {}, areas: {},
    edges: [], latest_failures: {},
    acNodes: {}, classifications: [],
  };
}

describe('computeScenarioStatus', () => {
  const now = new Date('2026-05-17T10:00:00.000Z');

  test('NOT_PASSING when no classifications', () => {
    expect(computeScenarioStatus('PROJ-1#scenario-0', emptySnap(), 30, now))
      .toBe('NOT_PASSING');
  });

  test('PASSING when latest classification is PASS within window', () => {
    const snap = emptySnap();
    snap.classifications.push({
      scenarioId: 'PROJ-1#scenario-0', classification: 'PASS',
      ts: '2026-05-15T10:00:00.000Z',
    });
    expect(computeScenarioStatus('PROJ-1#scenario-0', snap, 30, now))
      .toBe('PASSING');
  });

  test('NOT_PASSING when latest PASS is older than windowDays', () => {
    const snap = emptySnap();
    snap.classifications.push({
      scenarioId: 'PROJ-1#scenario-0', classification: 'PASS',
      ts: '2026-03-01T10:00:00.000Z',
    });
    expect(computeScenarioStatus('PROJ-1#scenario-0', snap, 30, now))
      .toBe('NOT_PASSING');
  });

  test('NOT_PASSING when latest classification is REAL_BUG (most recent wins)', () => {
    const snap = emptySnap();
    snap.classifications.push(
      { scenarioId: 'PROJ-1#scenario-0', classification: 'PASS',     ts: '2026-05-10T10:00:00.000Z' },
      { scenarioId: 'PROJ-1#scenario-0', classification: 'REAL_BUG', ts: '2026-05-15T10:00:00.000Z' },
    );
    expect(computeScenarioStatus('PROJ-1#scenario-0', snap, 30, now))
      .toBe('NOT_PASSING');
  });
});
```

- [ ] **Step 2: Verify failure**

```bash
cd packages/core && bun test test/coverage/status.test.ts
```

- [ ] **Step 3: Implement**

Create `packages/core/src/coverage/status.ts`:

```ts
import type { Snapshot } from '../graph/types';

export type ScenarioStatus = 'PASSING' | 'NOT_PASSING';

function daysBetween(a: Date, b: Date): number {
  return Math.abs(a.getTime() - b.getTime()) / (1000 * 60 * 60 * 24);
}

export function computeScenarioStatus(
  scenarioId: string,
  snap: Snapshot,
  windowDays: number,
  now: Date,
): ScenarioStatus {
  // Find the most recent classification event for this scenario
  const events = snap.classifications
    .filter((c) => c.scenarioId === scenarioId)
    .sort((a, b) => (a.ts < b.ts ? 1 : a.ts > b.ts ? -1 : 0));
  const latest = events[0];
  if (!latest) return 'NOT_PASSING';
  if (latest.classification !== 'PASS') return 'NOT_PASSING';
  if (daysBetween(now, new Date(latest.ts)) > windowDays) return 'NOT_PASSING';
  return 'PASSING';
}
```

- [ ] **Step 4: Verify pass**

```bash
cd packages/core && bun test test/coverage/status.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/coverage/status.ts packages/core/test/coverage/status.test.ts
git commit -m "feat(core): add computeScenarioStatus"
```

---

### Task 4.3: `computeAreaStatus` + `computeAcStatus` + `computeTicketStatus`

**Files:**
- Modify: `packages/core/src/coverage/status.ts`
- Modify: `packages/core/test/coverage/status.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { computeAreaStatus, computeAcStatus, computeTicketStatus } from '../../src/coverage/status';

describe('computeAreaStatus', () => {
  const now = new Date('2026-05-17T10:00:00.000Z');

  test('UNCOVERED when no POM covers the area', () => {
    const snap = emptySnap();
    snap.areas['checkout'] = { id: 'checkout' };
    expect(computeAreaStatus('checkout', snap, 30, now)).toBe('UNCOVERED');
  });

  test('STALE when POM exists but no PASSING scenario in window', () => {
    const snap = emptySnap();
    snap.areas['checkout'] = { id: 'checkout' };
    snap.poms['CheckoutPage'] = {
      id: 'CheckoutPage', ticketId: 'PROJ-1', filePath: 'p.ts',
      route: '/checkout', locators: [], scope: 'local',
    };
    snap.edges.push(
      { kind: 'covers', from: 'CheckoutPage', to: 'checkout', source: 'xera-script', discoveredAt: '2026-05-01T10:00:00.000Z' },
      { kind: 'uses',   from: 'PROJ-1#scenario-0', to: 'CheckoutPage', source: 'xera-script', discoveredAt: '2026-05-01T10:00:00.000Z' },
    );
    snap.scenarios['PROJ-1#scenario-0'] = {
      id: 'PROJ-1#scenario-0', ticketId: 'PROJ-1', name: 's',
      gherkin: '...', priority: 'p1', featureHash: 'h',
      generatedAt: '2026-05-01T10:00:00.000Z',
    };
    expect(computeAreaStatus('checkout', snap, 30, now)).toBe('STALE');
  });

  test('COVERED when ≥1 scenario in area is PASSING', () => {
    const snap = emptySnap();
    snap.areas['checkout'] = { id: 'checkout' };
    snap.poms['CheckoutPage'] = {
      id: 'CheckoutPage', ticketId: 'PROJ-1', filePath: 'p.ts',
      route: '/checkout', locators: [], scope: 'local',
    };
    snap.edges.push(
      { kind: 'covers', from: 'CheckoutPage', to: 'checkout', source: 'xera-script', discoveredAt: '2026-05-01T10:00:00.000Z' },
      { kind: 'uses',   from: 'PROJ-1#scenario-0', to: 'CheckoutPage', source: 'xera-script', discoveredAt: '2026-05-01T10:00:00.000Z' },
    );
    snap.scenarios['PROJ-1#scenario-0'] = {
      id: 'PROJ-1#scenario-0', ticketId: 'PROJ-1', name: 's',
      gherkin: '...', priority: 'p1', featureHash: 'h',
      generatedAt: '2026-05-01T10:00:00.000Z',
    };
    snap.classifications.push({
      scenarioId: 'PROJ-1#scenario-0', classification: 'PASS',
      ts: '2026-05-15T10:00:00.000Z',
    });
    expect(computeAreaStatus('checkout', snap, 30, now)).toBe('COVERED');
  });
});

describe('computeAcStatus', () => {
  const now = new Date('2026-05-17T10:00:00.000Z');

  test('UNSATISFIED when no satisfies edges', () => {
    const snap = emptySnap();
    snap.acNodes['PROJ-1#ac-0'] = { id: 'PROJ-1#ac-0', ticketId: 'PROJ-1', index: 0, text: 'x' };
    expect(computeAcStatus('PROJ-1#ac-0', snap, 30, now)).toBe('UNSATISFIED');
  });

  test('SATISFIED when ≥1 satisfying scenario is PASSING', () => {
    const snap = emptySnap();
    snap.acNodes['PROJ-1#ac-0'] = { id: 'PROJ-1#ac-0', ticketId: 'PROJ-1', index: 0, text: 'x' };
    snap.edges.push({
      kind: 'satisfies', from: 'PROJ-1#scenario-0', to: 'PROJ-1#ac-0',
      confidence: 1.0, source: 'xera-script', discoveredAt: '2026-05-01T10:00:00.000Z',
    });
    snap.classifications.push({
      scenarioId: 'PROJ-1#scenario-0', classification: 'PASS',
      ts: '2026-05-15T10:00:00.000Z',
    });
    expect(computeAcStatus('PROJ-1#ac-0', snap, 30, now)).toBe('SATISFIED');
  });

  test('UNSATISFIED when satisfying scenario is NOT_PASSING (stale)', () => {
    const snap = emptySnap();
    snap.acNodes['PROJ-1#ac-0'] = { id: 'PROJ-1#ac-0', ticketId: 'PROJ-1', index: 0, text: 'x' };
    snap.edges.push({
      kind: 'satisfies', from: 'PROJ-1#scenario-0', to: 'PROJ-1#ac-0',
      confidence: 1.0, source: 'xera-script', discoveredAt: '2026-05-01T10:00:00.000Z',
    });
    snap.classifications.push({
      scenarioId: 'PROJ-1#scenario-0', classification: 'PASS',
      ts: '2026-03-01T10:00:00.000Z',   // > 30d
    });
    expect(computeAcStatus('PROJ-1#ac-0', snap, 30, now)).toBe('UNSATISFIED');
  });
});

describe('computeTicketStatus', () => {
  const now = new Date('2026-05-17T10:00:00.000Z');

  test('COMPLETE vacuously when no ACs', () => {
    const snap = emptySnap();
    snap.tickets['PROJ-1'] = {
      id: 'PROJ-1', summary: 's', ac: [],
      storyHash: 'h', modifiesAreas: [], fetchedAt: '2026-05-01T10:00:00.000Z',
    };
    expect(computeTicketStatus('PROJ-1', snap, 30, now)).toBe('COMPLETE');
  });

  test('INCOMPLETE when ≥1 AC UNSATISFIED', () => {
    const snap = emptySnap();
    snap.tickets['PROJ-1'] = {
      id: 'PROJ-1', summary: 's', ac: ['x', 'y'],
      storyHash: 'h', modifiesAreas: [], fetchedAt: '2026-05-01T10:00:00.000Z',
    };
    snap.acNodes['PROJ-1#ac-0'] = { id: 'PROJ-1#ac-0', ticketId: 'PROJ-1', index: 0, text: 'x' };
    snap.acNodes['PROJ-1#ac-1'] = { id: 'PROJ-1#ac-1', ticketId: 'PROJ-1', index: 1, text: 'y' };
    expect(computeTicketStatus('PROJ-1', snap, 30, now)).toBe('INCOMPLETE');
  });
});
```

- [ ] **Step 2: Verify failure**

```bash
cd packages/core && bun test test/coverage/status.test.ts
```

- [ ] **Step 3: Implement**

Append to `packages/core/src/coverage/status.ts`:

```ts
export type AreaStatus = 'UNCOVERED' | 'STALE' | 'COVERED';
export type AcStatus = 'SATISFIED' | 'UNSATISFIED';
export type TicketStatus = 'COMPLETE' | 'INCOMPLETE';

export function computeAreaStatus(
  areaId: string,
  snap: Snapshot,
  windowDays: number,
  now: Date,
): AreaStatus {
  const coveringPoms = snap.edges
    .filter((e) => e.kind === 'covers' && e.to === areaId)
    .map((e) => e.from);
  if (coveringPoms.length === 0) return 'UNCOVERED';

  const scenariosInArea = snap.edges
    .filter((e) => e.kind === 'uses' && coveringPoms.includes(e.to))
    .map((e) => e.from);
  const anyPassing = scenariosInArea.some(
    (sid) => computeScenarioStatus(sid, snap, windowDays, now) === 'PASSING',
  );
  return anyPassing ? 'COVERED' : 'STALE';
}

export function computeAcStatus(
  acId: string,
  snap: Snapshot,
  windowDays: number,
  now: Date,
): AcStatus {
  const edges = snap.edges.filter((e) => e.kind === 'satisfies' && e.to === acId);
  if (edges.length === 0) return 'UNSATISFIED';
  const anyPassing = edges.some(
    (e) => computeScenarioStatus(e.from, snap, windowDays, now) === 'PASSING',
  );
  return anyPassing ? 'SATISFIED' : 'UNSATISFIED';
}

export function computeTicketStatus(
  ticketId: string,
  snap: Snapshot,
  windowDays: number,
  now: Date,
): TicketStatus {
  const acIds = Object.values(snap.acNodes)
    .filter((ac) => ac.ticketId === ticketId)
    .map((ac) => ac.id);
  if (acIds.length === 0) return 'COMPLETE';
  const allSatisfied = acIds.every(
    (acId) => computeAcStatus(acId, snap, windowDays, now) === 'SATISFIED',
  );
  return allSatisfied ? 'COMPLETE' : 'INCOMPLETE';
}
```

- [ ] **Step 4: Verify pass**

```bash
cd packages/core && bun test test/coverage/status.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/coverage/status.ts packages/core/test/coverage/status.test.ts
git commit -m "feat(core): add computeAreaStatus + computeAcStatus + computeTicketStatus"
```

---

## Phase 5 — Risk + AC gap score

### Task 5.1: `computeAreaRisk` + `RISK_WEIGHTS`

**Files:**
- Create: `packages/core/src/coverage/risk.ts`
- Test: `packages/core/test/coverage/risk.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, test, expect } from 'bun:test';
import { computeAreaRisk, RISK_WEIGHTS } from '../../src/coverage/risk';
import { DEFAULT_COVERAGE_CONFIG } from '../../src/coverage/types';
import type { Snapshot } from '../../src/graph/types';

function emptySnap(): Snapshot {
  return {
    schema_version: 1, generated_at: '2026-05-17T10:00:00.000Z',
    event_count: 0, events_hash: 'sha256:',
    tickets: {}, scenarios: {}, poms: {}, areas: {},
    edges: [], latest_failures: {},
    acNodes: {}, classifications: [],
  };
}

const cfg = (overrides?: Partial<typeof DEFAULT_COVERAGE_CONFIG>) => ({
  ...DEFAULT_COVERAGE_CONFIG, ...overrides,
});

describe('computeAreaRisk', () => {
  const now = new Date('2026-05-17T10:00:00.000Z');

  test('zero when no tickets, no bugs', () => {
    const snap = emptySnap();
    snap.areas['x'] = { id: 'x' };
    expect(computeAreaRisk('x', snap, cfg(), now)).toBe(0);
  });

  test('counts recent_tickets within windowDays', () => {
    const snap = emptySnap();
    snap.areas['checkout'] = { id: 'checkout' };
    snap.tickets['PROJ-1'] = {
      id: 'PROJ-1', summary: 's', ac: [], storyHash: 'h',
      modifiesAreas: ['checkout'], fetchedAt: '2026-05-15T10:00:00.000Z',
    };
    snap.tickets['PROJ-2'] = {
      id: 'PROJ-2', summary: 's', ac: [], storyHash: 'h',
      modifiesAreas: ['checkout'], fetchedAt: '2026-03-01T10:00:00.000Z',  // 77d
    };
    snap.edges.push(
      { kind: 'modifies', from: 'PROJ-1', to: 'checkout', source: 'xera-fetch', discoveredAt: '2026-05-15T10:00:00.000Z' },
      { kind: 'modifies', from: 'PROJ-2', to: 'checkout', source: 'xera-fetch', discoveredAt: '2026-03-01T10:00:00.000Z' },
    );
    expect(computeAreaRisk('checkout', snap, cfg(), now)).toBe(1);
  });

  test('critical boost ×2 on recent_tickets', () => {
    const snap = emptySnap();
    snap.areas['checkout'] = { id: 'checkout' };
    snap.tickets['PROJ-1'] = {
      id: 'PROJ-1', summary: 's', ac: [], storyHash: 'h',
      modifiesAreas: ['checkout'], fetchedAt: '2026-05-15T10:00:00.000Z',
    };
    snap.edges.push({
      kind: 'modifies', from: 'PROJ-1', to: 'checkout',
      source: 'xera-fetch', discoveredAt: '2026-05-15T10:00:00.000Z',
    });
    expect(computeAreaRisk('checkout', snap, cfg({ criticalAreas: ['checkout'] }), now)).toBe(2);
  });

  test('adds recent_bugs (REAL_BUG + TEST_OUTDATED only, in window)', () => {
    const snap = emptySnap();
    snap.areas['checkout'] = { id: 'checkout' };
    snap.poms['CheckoutPage'] = {
      id: 'CheckoutPage', ticketId: 'PROJ-1', filePath: 'p.ts',
      route: '/checkout', locators: [], scope: 'local',
    };
    snap.edges.push(
      { kind: 'covers', from: 'CheckoutPage', to: 'checkout', source: 'xera-script', discoveredAt: '2026-05-01T10:00:00.000Z' },
      { kind: 'uses',   from: 'PROJ-1#scenario-0', to: 'CheckoutPage', source: 'xera-script', discoveredAt: '2026-05-01T10:00:00.000Z' },
    );
    snap.scenarios['PROJ-1#scenario-0'] = {
      id: 'PROJ-1#scenario-0', ticketId: 'PROJ-1', name: 's',
      gherkin: '...', priority: 'p1', featureHash: 'h',
      generatedAt: '2026-05-01T10:00:00.000Z',
    };
    snap.classifications.push(
      { scenarioId: 'PROJ-1#scenario-0', classification: 'REAL_BUG',       ts: '2026-05-15T10:00:00.000Z' },
      { scenarioId: 'PROJ-1#scenario-0', classification: 'TEST_OUTDATED',  ts: '2026-05-10T10:00:00.000Z' },
      { scenarioId: 'PROJ-1#scenario-0', classification: 'SELECTOR_DRIFT', ts: '2026-05-12T10:00:00.000Z' },  // excluded
      { scenarioId: 'PROJ-1#scenario-0', classification: 'REAL_BUG',       ts: '2026-03-01T10:00:00.000Z' },  // out of window
    );
    expect(computeAreaRisk('checkout', snap, cfg(), now)).toBe(2);
  });

  test('RISK_WEIGHTS exports stable constants', () => {
    expect(RISK_WEIGHTS.criticalBoost).toBe(2);
    expect(RISK_WEIGHTS.bugClassifications.has('REAL_BUG')).toBe(true);
    expect(RISK_WEIGHTS.bugClassifications.has('TEST_OUTDATED')).toBe(true);
    expect(RISK_WEIGHTS.bugClassifications.has('SELECTOR_DRIFT')).toBe(false);
  });
});
```

- [ ] **Step 2: Verify failure**

```bash
cd packages/core && bun test test/coverage/risk.test.ts
```

- [ ] **Step 3: Implement**

Create `packages/core/src/coverage/risk.ts`:

```ts
import type { Snapshot } from '../graph/types';
import type { CoverageConfig } from './types';

export const RISK_WEIGHTS = {
  criticalBoost: 2,
  bugClassifications: new Set<string>(['REAL_BUG', 'TEST_OUTDATED']),
  recencyBoosts: { recent: 2.0, withinWindow: 1.0, older: 0.5 },
  recencyThresholdDays: 7,
} as const;

function daysBetween(a: Date, b: Date): number {
  return Math.abs(a.getTime() - b.getTime()) / (1000 * 60 * 60 * 24);
}

export function computeAreaRisk(
  areaId: string,
  snap: Snapshot,
  config: CoverageConfig,
  now: Date,
): number {
  const recentTickets = snap.edges
    .filter((e) => e.kind === 'modifies' && e.to === areaId)
    .map((e) => snap.tickets[e.from])
    .filter((t): t is NonNullable<typeof t> => t !== undefined)
    .filter((t) => daysBetween(now, new Date(t.fetchedAt)) <= config.staleAfterDays)
    .length;

  const pomsInArea = snap.edges
    .filter((e) => e.kind === 'covers' && e.to === areaId)
    .map((e) => e.from);
  const scenariosInArea = new Set(
    snap.edges
      .filter((e) => e.kind === 'uses' && pomsInArea.includes(e.to))
      .map((e) => e.from),
  );
  const recentBugs = snap.classifications
    .filter((c) => scenariosInArea.has(c.scenarioId))
    .filter((c) => RISK_WEIGHTS.bugClassifications.has(c.classification))
    .filter((c) => daysBetween(now, new Date(c.ts)) <= config.staleAfterDays)
    .length;

  const criticalBoost = config.criticalAreas.includes(areaId)
    ? RISK_WEIGHTS.criticalBoost
    : 1;

  return recentTickets * criticalBoost + recentBugs;
}
```

- [ ] **Step 4: Verify pass**

```bash
cd packages/core && bun test test/coverage/risk.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/coverage/risk.ts packages/core/test/coverage/risk.test.ts
git commit -m "feat(core): add computeAreaRisk with RISK_WEIGHTS constants"
```

---

### Task 5.2: `computeAcGapScore`

**Files:**
- Modify: `packages/core/src/coverage/risk.ts`
- Modify: `packages/core/test/coverage/risk.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { computeAcGapScore } from '../../src/coverage/risk';

describe('computeAcGapScore', () => {
  const now = new Date('2026-05-17T10:00:00.000Z');

  test('zero when ticket has no unsatisfied ACs', () => {
    const snap = emptySnap();
    snap.tickets['PROJ-1'] = {
      id: 'PROJ-1', summary: 's', ac: [], storyHash: 'h',
      modifiesAreas: [], fetchedAt: '2026-05-15T10:00:00.000Z',
    };
    expect(computeAcGapScore('PROJ-1', snap, cfg(), now)).toBe(0);
  });

  test('×2.0 boost when fetched ≤ 7d ago', () => {
    const snap = emptySnap();
    snap.tickets['PROJ-1'] = {
      id: 'PROJ-1', summary: 's', ac: ['a', 'b'], storyHash: 'h',
      modifiesAreas: [], fetchedAt: '2026-05-15T10:00:00.000Z',  // 2d
    };
    snap.acNodes['PROJ-1#ac-0'] = { id: 'PROJ-1#ac-0', ticketId: 'PROJ-1', index: 0, text: 'a' };
    snap.acNodes['PROJ-1#ac-1'] = { id: 'PROJ-1#ac-1', ticketId: 'PROJ-1', index: 1, text: 'b' };
    expect(computeAcGapScore('PROJ-1', snap, cfg(), now)).toBe(4);
  });

  test('×1.0 boost when fetched 8-30d ago', () => {
    const snap = emptySnap();
    snap.tickets['PROJ-1'] = {
      id: 'PROJ-1', summary: 's', ac: ['a'], storyHash: 'h',
      modifiesAreas: [], fetchedAt: '2026-05-01T10:00:00.000Z',  // 16d
    };
    snap.acNodes['PROJ-1#ac-0'] = { id: 'PROJ-1#ac-0', ticketId: 'PROJ-1', index: 0, text: 'a' };
    expect(computeAcGapScore('PROJ-1', snap, cfg(), now)).toBe(1);
  });

  test('×0.5 boost when fetched > 30d ago', () => {
    const snap = emptySnap();
    snap.tickets['PROJ-1'] = {
      id: 'PROJ-1', summary: 's', ac: ['a', 'b'], storyHash: 'h',
      modifiesAreas: [], fetchedAt: '2026-02-01T10:00:00.000Z',  // 105d
    };
    snap.acNodes['PROJ-1#ac-0'] = { id: 'PROJ-1#ac-0', ticketId: 'PROJ-1', index: 0, text: 'a' };
    snap.acNodes['PROJ-1#ac-1'] = { id: 'PROJ-1#ac-1', ticketId: 'PROJ-1', index: 1, text: 'b' };
    expect(computeAcGapScore('PROJ-1', snap, cfg(), now)).toBe(1);
  });
});
```

- [ ] **Step 2: Verify failure**

```bash
cd packages/core && bun test test/coverage/risk.test.ts
```

- [ ] **Step 3: Implement**

Append to `packages/core/src/coverage/risk.ts`:

```ts
import { computeAcStatus } from './status';

export function computeAcGapScore(
  ticketId: string,
  snap: Snapshot,
  config: CoverageConfig,
  now: Date,
): number {
  const ticket = snap.tickets[ticketId];
  if (!ticket) return 0;

  const acs = Object.values(snap.acNodes).filter((ac) => ac.ticketId === ticketId);
  const unsatisfied = acs.filter(
    (ac) => computeAcStatus(ac.id, snap, config.staleAfterDays, now) === 'UNSATISFIED',
  ).length;
  if (unsatisfied === 0) return 0;

  const days = daysBetween(now, new Date(ticket.fetchedAt));
  let boost: number;
  if (days <= RISK_WEIGHTS.recencyThresholdDays) boost = RISK_WEIGHTS.recencyBoosts.recent;
  else if (days <= config.staleAfterDays) boost = RISK_WEIGHTS.recencyBoosts.withinWindow;
  else boost = RISK_WEIGHTS.recencyBoosts.older;
  return unsatisfied * boost;
}
```

- [ ] **Step 4: Verify pass**

```bash
cd packages/core && bun test test/coverage/risk.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/coverage/risk.ts packages/core/test/coverage/risk.test.ts
git commit -m "feat(core): add computeAcGapScore"
```

---

## Phase 6 — Report builders

### Task 6.1: `buildCoverageReport`

**Files:**
- Create: `packages/core/src/coverage/report.ts`
- Test: `packages/core/test/coverage/report.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, test, expect } from 'bun:test';
import { buildCoverageReport } from '../../src/coverage/report';
import { DEFAULT_COVERAGE_CONFIG } from '../../src/coverage/types';
import type { Snapshot } from '../../src/graph/types';

function emptySnap(): Snapshot {
  return {
    schema_version: 1, generated_at: '2026-05-17T10:00:00.000Z',
    event_count: 0, events_hash: 'sha256:',
    tickets: {}, scenarios: {}, poms: {}, areas: {},
    edges: [], latest_failures: {},
    acNodes: {}, classifications: [],
  };
}

describe('buildCoverageReport', () => {
  const now = new Date('2026-05-17T10:00:00.000Z');

  test('empty snapshot → empty report with metadata', () => {
    const report = buildCoverageReport(emptySnap(), DEFAULT_COVERAGE_CONFIG, now);
    expect(report.generatedAt).toBe('2026-05-17T10:00:00.000Z');
    expect(report.windowDays).toBe(30);
    expect(report.areas).toEqual([]);
    expect(report.tickets).toEqual([]);
    expect(report.acBackfillNeeded).toBe(false);
  });

  test('sorts UNCOVERED first by risk desc, deterministic tie-break by id', () => {
    const snap = emptySnap();
    snap.areas['admin'] = { id: 'admin' };
    snap.areas['profile'] = { id: 'profile' };
    snap.areas['checkout'] = { id: 'checkout' };
    snap.tickets['PROJ-101'] = {
      id: 'PROJ-101', summary: 's', ac: [], storyHash: 'h',
      modifiesAreas: ['checkout'], fetchedAt: '2026-05-15T10:00:00.000Z',
    };
    snap.tickets['PROJ-102'] = {
      id: 'PROJ-102', summary: 's', ac: [], storyHash: 'h',
      modifiesAreas: ['profile'], fetchedAt: '2026-05-12T10:00:00.000Z',
    };
    snap.edges.push(
      { kind: 'modifies', from: 'PROJ-101', to: 'checkout', source: 'xera-fetch', discoveredAt: '2026-05-15T10:00:00.000Z' },
      { kind: 'modifies', from: 'PROJ-102', to: 'profile',  source: 'xera-fetch', discoveredAt: '2026-05-12T10:00:00.000Z' },
    );
    const r = buildCoverageReport(snap, DEFAULT_COVERAGE_CONFIG, now);
    // checkout and profile: risk 1 each. admin: risk 0. Tie-break alpha.
    expect(r.areas.map((a) => a.id)).toEqual(['checkout', 'profile', 'admin']);
  });

  test('acBackfillNeeded = true when ticket has ACs + scenarios but no satisfies edges', () => {
    const snap = emptySnap();
    snap.tickets['PROJ-1'] = {
      id: 'PROJ-1', summary: 's', ac: ['x', 'y'], storyHash: 'h',
      modifiesAreas: [], fetchedAt: '2026-05-01T10:00:00.000Z',
    };
    snap.acNodes['PROJ-1#ac-0'] = { id: 'PROJ-1#ac-0', ticketId: 'PROJ-1', index: 0, text: 'x' };
    snap.acNodes['PROJ-1#ac-1'] = { id: 'PROJ-1#ac-1', ticketId: 'PROJ-1', index: 1, text: 'y' };
    snap.scenarios['PROJ-1#scenario-0'] = {
      id: 'PROJ-1#scenario-0', ticketId: 'PROJ-1', name: 's',
      gherkin: '...', priority: 'p1', featureHash: 'h',
      generatedAt: '2026-04-01T11:00:00.000Z',
    };
    const r = buildCoverageReport(snap, DEFAULT_COVERAGE_CONFIG, now);
    expect(r.acBackfillNeeded).toBe(true);
  });
});
```

- [ ] **Step 2: Verify failure**

```bash
cd packages/core && bun test test/coverage/report.test.ts
```

- [ ] **Step 3: Implement**

Create `packages/core/src/coverage/report.ts`:

```ts
import type { Snapshot } from '../graph/types';
import type { CoverageConfig } from './types';
import {
  computeAreaStatus, computeAcStatus, computeTicketStatus,
  type AreaStatus,
} from './status';
import { computeAreaRisk, computeAcGapScore, RISK_WEIGHTS } from './risk';

export interface AreaReportRow {
  id: string;
  status: AreaStatus;
  risk: number;
  breakdown: {
    recentTickets: number;
    recentBugs: number;
    criticalBoost: 1 | 2;
  };
}

export interface TicketReportRow {
  id: string;
  summary: string;
  acCount: number;
  satisfiedCount: number;
  gapScore: number;
  unsatisfiedAcs: Array<{ index: number; text: string }>;
}

export interface CoverageReport {
  generatedAt: string;
  windowDays: number;
  areas: AreaReportRow[];
  tickets: TicketReportRow[];
  acBackfillNeeded: boolean;
}

const STATUS_RANK: Record<AreaStatus, number> = {
  UNCOVERED: 0, STALE: 1, COVERED: 2,
};

function daysBetween(a: Date, b: Date): number {
  return Math.abs(a.getTime() - b.getTime()) / (1000 * 60 * 60 * 24);
}

export function buildCoverageReport(
  snap: Snapshot,
  config: CoverageConfig,
  now: Date,
): CoverageReport {
  const areas: AreaReportRow[] = Object.keys(snap.areas).map((areaId) => {
    const status = computeAreaStatus(areaId, snap, config.staleAfterDays, now);
    const risk = computeAreaRisk(areaId, snap, config, now);

    const recentTickets = snap.edges
      .filter((e) => e.kind === 'modifies' && e.to === areaId)
      .map((e) => snap.tickets[e.from])
      .filter((t): t is NonNullable<typeof t> => t !== undefined)
      .filter((t) => daysBetween(now, new Date(t.fetchedAt)) <= config.staleAfterDays)
      .length;
    const pomsInArea = snap.edges
      .filter((e) => e.kind === 'covers' && e.to === areaId)
      .map((e) => e.from);
    const scenariosInArea = new Set(
      snap.edges
        .filter((e) => e.kind === 'uses' && pomsInArea.includes(e.to))
        .map((e) => e.from),
    );
    const recentBugs = snap.classifications
      .filter((c) => scenariosInArea.has(c.scenarioId))
      .filter((c) => RISK_WEIGHTS.bugClassifications.has(c.classification))
      .filter((c) => daysBetween(now, new Date(c.ts)) <= config.staleAfterDays)
      .length;
    const criticalBoost: 1 | 2 = config.criticalAreas.includes(areaId) ? 2 : 1;

    return {
      id: areaId, status, risk,
      breakdown: { recentTickets, recentBugs, criticalBoost },
    };
  });

  areas.sort((a, b) => {
    if (STATUS_RANK[a.status] !== STATUS_RANK[b.status]) {
      return STATUS_RANK[a.status] - STATUS_RANK[b.status];
    }
    if (a.status === 'COVERED') return a.id.localeCompare(b.id);
    if (b.risk !== a.risk) return b.risk - a.risk;
    return a.id.localeCompare(b.id);
  });

  const tickets: TicketReportRow[] = Object.values(snap.tickets)
    .filter((t) => computeTicketStatus(t.id, snap, config.staleAfterDays, now) === 'INCOMPLETE')
    .map((t) => {
      const acs = Object.values(snap.acNodes)
        .filter((ac) => ac.ticketId === t.id)
        .sort((a, b) => a.index - b.index);
      const unsatisfiedAcs = acs
        .filter((ac) => computeAcStatus(ac.id, snap, config.staleAfterDays, now) === 'UNSATISFIED')
        .map((ac) => ({ index: ac.index, text: ac.text }));
      return {
        id: t.id, summary: t.summary,
        acCount: acs.length,
        satisfiedCount: acs.length - unsatisfiedAcs.length,
        gapScore: computeAcGapScore(t.id, snap, config, now),
        unsatisfiedAcs,
      };
    })
    .sort((a, b) => b.gapScore - a.gapScore || a.id.localeCompare(b.id));

  return {
    generatedAt: now.toISOString(),
    windowDays: config.staleAfterDays,
    areas, tickets,
    acBackfillNeeded: needsBackfill(snap),
  };
}

function needsBackfill(snap: Snapshot): boolean {
  for (const ticket of Object.values(snap.tickets)) {
    const acsForTicket = Object.values(snap.acNodes).filter((ac) => ac.ticketId === ticket.id);
    if (acsForTicket.length === 0) continue;
    const scenariosForTicket = Object.values(snap.scenarios).filter((s) => s.ticketId === ticket.id);
    if (scenariosForTicket.length === 0) continue;
    const hasAnyEdge = snap.edges.some(
      (e) => e.kind === 'satisfies' && acsForTicket.some((ac) => ac.id === e.to),
    );
    if (!hasAnyEdge) return true;
  }
  return false;
}
```

- [ ] **Step 4: Verify pass**

```bash
cd packages/core && bun test test/coverage/report.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/coverage/report.ts packages/core/test/coverage/report.test.ts
git commit -m "feat(core): add buildCoverageReport"
```

---

### Task 6.2: `renderMarkdown(report, options?)`

**Files:**
- Modify: `packages/core/src/coverage/report.ts`
- Modify: `packages/core/test/coverage/report.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { renderMarkdown } from '../../src/coverage/report';

describe('renderMarkdown', () => {
  test('renders header + window line', () => {
    const md = renderMarkdown({
      generatedAt: '2026-05-17T10:00:00.000Z',
      windowDays: 30,
      areas: [], tickets: [], acBackfillNeeded: false,
    });
    expect(md).toContain('Coverage report');
    expect(md).toContain('window 30d');
    expect(md).toContain('2026-05-17');
  });

  test('renders UNCOVERED row with risk + breakdown line', () => {
    const md = renderMarkdown({
      generatedAt: '2026-05-17T10:00:00.000Z',
      windowDays: 30,
      areas: [{
        id: 'checkout', status: 'UNCOVERED', risk: 8,
        breakdown: { recentTickets: 3, recentBugs: 2, criticalBoost: 2 },
      }],
      tickets: [], acBackfillNeeded: false,
    });
    expect(md).toContain('UNCOVERED');
    expect(md).toContain('checkout');
    expect(md).toContain('risk 8');
    expect(md).toContain('3 tickets');
    expect(md).toContain('2 bugs');
    expect(md).toContain('critical ×2');
  });

  test('renders AC GAPS rows with ✗ markers', () => {
    const md = renderMarkdown({
      generatedAt: '2026-05-17T10:00:00.000Z',
      windowDays: 30,
      areas: [], acBackfillNeeded: false,
      tickets: [{
        id: 'PROJ-105', summary: 'x',
        acCount: 5, satisfiedCount: 3, gapScore: 4,
        unsatisfiedAcs: [
          { index: 2, text: 'Tax line shows' },
          { index: 4, text: 'Receipt email' },
        ],
      }],
    });
    expect(md).toContain('AC GAPS');
    expect(md).toContain('PROJ-105');
    expect(md).toContain('3/5 ACs covered');
    expect(md).toContain('gap_score 4');
    expect(md).toContain('✗ AC-2  Tax line shows');
    expect(md).toContain('✗ AC-4  Receipt email');
  });

  test('default omits COVERED rows, shows count line with hint', () => {
    const md = renderMarkdown({
      generatedAt: '2026-05-17T10:00:00.000Z',
      windowDays: 30,
      areas: [{
        id: 'login', status: 'COVERED', risk: 0,
        breakdown: { recentTickets: 0, recentBugs: 0, criticalBoost: 1 },
      }],
      tickets: [], acBackfillNeeded: false,
    });
    expect(md).toContain('COVERED — 1 area');
    expect(md).toContain('show with --all');
  });

  test('includeCovered: true shows COVERED rows', () => {
    const md = renderMarkdown({
      generatedAt: '2026-05-17T10:00:00.000Z',
      windowDays: 30,
      areas: [{
        id: 'login', status: 'COVERED', risk: 0,
        breakdown: { recentTickets: 0, recentBugs: 0, criticalBoost: 1 },
      }],
      tickets: [], acBackfillNeeded: false,
    }, { includeCovered: true });
    expect(md).toMatch(/#1\s+login/);
  });
});
```

- [ ] **Step 2: Verify failure**

```bash
cd packages/core && bun test test/coverage/report.test.ts
```

- [ ] **Step 3: Implement**

Append to `packages/core/src/coverage/report.ts`:

```ts
export interface RenderOptions {
  includeCovered?: boolean;
}

function pad(s: string, n: number): string {
  return s.length >= n ? s : s + ' '.repeat(n - s.length);
}

export function renderMarkdown(report: CoverageReport, options: RenderOptions = {}): string {
  const lines: string[] = [];
  const dateOnly = report.generatedAt.slice(0, 10);
  lines.push('', `Coverage report — generated ${dateOnly} · window ${report.windowDays}d`, '');

  const uncovered = report.areas.filter((a) => a.status === 'UNCOVERED');
  if (uncovered.length > 0) {
    lines.push(`UNCOVERED — ${uncovered.length} area${uncovered.length === 1 ? '' : 's'}, sorted by risk`);
    lines.push('');
    uncovered.forEach((a, i) => {
      const parts: string[] = [`${a.breakdown.recentTickets} tickets`];
      if (a.breakdown.recentBugs > 0) parts.push(`${a.breakdown.recentBugs} bugs`);
      if (a.breakdown.criticalBoost === 2) parts.push('critical ×2');
      lines.push(`  #${i + 1}  ${pad(a.id, 10)} risk ${a.risk}    ${parts.join(' · ')}`);
    });
    lines.push('');
  }

  const stale = report.areas.filter((a) => a.status === 'STALE');
  if (stale.length > 0) {
    lines.push(`STALE — ${stale.length} area${stale.length === 1 ? '' : 's'}, has tests but no PASS in ${report.windowDays}d`);
    lines.push('');
    stale.forEach((a, i) => {
      lines.push(`  #${i + 1}  ${pad(a.id, 10)} (see --why ${a.id} for details)`);
    });
    lines.push('');
  }

  if (report.tickets.length > 0) {
    lines.push(`AC GAPS — ${report.tickets.length} ticket${report.tickets.length === 1 ? '' : 's'} with unsatisfied acceptance criteria`);
    lines.push('');
    for (const t of report.tickets) {
      lines.push(`  ${t.id}  ${t.satisfiedCount}/${t.acCount} ACs covered · gap_score ${t.gapScore}`);
      for (const ac of t.unsatisfiedAcs) {
        lines.push(`    ✗ AC-${ac.index}  ${ac.text}`);
      }
      lines.push('');
    }
  }

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

- [ ] **Step 4: Verify pass**

```bash
cd packages/core && bun test test/coverage/report.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/coverage/report.ts packages/core/test/coverage/report.test.ts
git commit -m "feat(core): add renderMarkdown with RenderOptions includeCovered"
```

---

## Phase 7 — `why` drill-down builders

### Task 7.1: `buildWhyArea`

**Files:**
- Create: `packages/core/src/coverage/why.ts`
- Test: `packages/core/test/coverage/why.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, test, expect } from 'bun:test';
import { buildWhyArea } from '../../src/coverage/why';
import { DEFAULT_COVERAGE_CONFIG } from '../../src/coverage/types';
import type { Snapshot } from '../../src/graph/types';

function emptySnap(): Snapshot {
  return {
    schema_version: 1, generated_at: '2026-05-17T10:00:00.000Z',
    event_count: 0, events_hash: 'sha256:',
    tickets: {}, scenarios: {}, poms: {}, areas: {},
    edges: [], latest_failures: {},
    acNodes: {}, classifications: [],
  };
}

describe('buildWhyArea', () => {
  const now = new Date('2026-05-17T10:00:00.000Z');

  test('returns formula expansion + contributing tickets', () => {
    const snap = emptySnap();
    snap.areas['checkout'] = { id: 'checkout' };
    snap.tickets['PROJ-101'] = {
      id: 'PROJ-101', summary: 'Add Apple Pay to checkout', ac: [],
      storyHash: 'h', modifiesAreas: ['checkout'],
      fetchedAt: '2026-05-15T10:00:00.000Z',
    };
    snap.edges.push({
      kind: 'modifies', from: 'PROJ-101', to: 'checkout',
      source: 'xera-fetch', discoveredAt: '2026-05-15T10:00:00.000Z',
    });
    const out = buildWhyArea('checkout', snap, DEFAULT_COVERAGE_CONFIG, now);
    expect(out).toContain('Area: checkout');
    expect(out).toContain('UNCOVERED');
    expect(out).toContain('Risk score: 1');
    expect(out).toContain('1 × 1 + 0');
    expect(out).toContain('PROJ-101');
    expect(out).toContain('Add Apple Pay');
  });

  test('shows "critical" + ×2 when area is critical', () => {
    const snap = emptySnap();
    snap.areas['checkout'] = { id: 'checkout' };
    const out = buildWhyArea(
      'checkout', snap,
      { ...DEFAULT_COVERAGE_CONFIG, criticalAreas: ['checkout'] }, now,
    );
    expect(out).toContain('UNCOVERED, critical');
    expect(out).toContain('× 2');
  });

  test('errors gracefully if area unknown', () => {
    const out = buildWhyArea('missing', emptySnap(), DEFAULT_COVERAGE_CONFIG, now);
    expect(out).toContain('Unknown area');
  });
});
```

- [ ] **Step 2: Verify failure**

```bash
cd packages/core && bun test test/coverage/why.test.ts
```

- [ ] **Step 3: Implement**

Create `packages/core/src/coverage/why.ts`:

```ts
import type { Snapshot } from '../graph/types';
import type { CoverageConfig } from './types';
import { computeAreaStatus } from './status';
import { computeAreaRisk, RISK_WEIGHTS } from './risk';

function daysBetween(a: Date, b: Date): number {
  return Math.abs(a.getTime() - b.getTime()) / (1000 * 60 * 60 * 24);
}

function pad(s: string, n: number): string {
  return s.length >= n ? s : s + ' '.repeat(n - s.length);
}

export function buildWhyArea(
  areaId: string,
  snap: Snapshot,
  config: CoverageConfig,
  now: Date,
): string {
  if (snap.areas[areaId] === undefined) return `Unknown area: ${areaId}\n`;

  const status = computeAreaStatus(areaId, snap, config.staleAfterDays, now);
  const isCritical = config.criticalAreas.includes(areaId);
  const heading = isCritical ? `${status}, critical` : status;

  const risk = computeAreaRisk(areaId, snap, config, now);
  const recentTickets = snap.edges
    .filter((e) => e.kind === 'modifies' && e.to === areaId)
    .map((e) => snap.tickets[e.from])
    .filter((t): t is NonNullable<typeof t> => t !== undefined)
    .filter((t) => daysBetween(now, new Date(t.fetchedAt)) <= config.staleAfterDays);
  const pomsInArea = snap.edges
    .filter((e) => e.kind === 'covers' && e.to === areaId).map((e) => e.from);
  const scenariosInArea = new Set(
    snap.edges
      .filter((e) => e.kind === 'uses' && pomsInArea.includes(e.to)).map((e) => e.from),
  );
  const recentBugs = snap.classifications
    .filter((c) => scenariosInArea.has(c.scenarioId))
    .filter((c) => RISK_WEIGHTS.bugClassifications.has(c.classification))
    .filter((c) => daysBetween(now, new Date(c.ts)) <= config.staleAfterDays);
  const boost = isCritical ? 2 : 1;

  const lines: string[] = [
    '',
    `Area: ${areaId} (${heading})`,
    '',
    `Risk score: ${risk}`,
    '  recent_tickets × critical_boost + recent_bugs',
    `  = ${recentTickets.length} × ${boost} + ${recentBugs.length} = ${risk}`,
    '',
    `Recent tickets (${recentTickets.length}, last ${config.staleAfterDays}d):`,
  ];
  for (const t of recentTickets) {
    lines.push(`  ${t.id}  ${t.fetchedAt.slice(0, 10)}  ${t.summary}`);
  }
  if (recentTickets.length === 0) lines.push('  (none)');
  lines.push('');
  if (recentBugs.length > 0) {
    lines.push(`Recent bugs (${recentBugs.length}, last ${config.staleAfterDays}d):`);
    for (const b of recentBugs) {
      lines.push(`  ${b.ts.slice(0, 10)}  ${pad(b.classification, 14)} scenario ${b.scenarioId}`);
    }
    lines.push('');
  }
  if (status === 'UNCOVERED') {
    lines.push('No POM covers this area. To draft scenarios:');
    lines.push(`  /xera-fill-gap ${areaId}`);
  }
  return lines.join('\n') + '\n';
}
```

- [ ] **Step 4: Verify pass**

```bash
cd packages/core && bun test test/coverage/why.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/coverage/why.ts packages/core/test/coverage/why.test.ts
git commit -m "feat(core): add buildWhyArea drill-down builder"
```

---

### Task 7.2: `buildWhyTicket`

**Files:**
- Modify: `packages/core/src/coverage/why.ts`
- Modify: `packages/core/test/coverage/why.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { buildWhyTicket } from '../../src/coverage/why';

describe('buildWhyTicket', () => {
  const now = new Date('2026-05-17T10:00:00.000Z');

  test('returns AC list with ✓/✗ markers and gap score breakdown', () => {
    const snap = emptySnap();
    snap.tickets['PROJ-105'] = {
      id: 'PROJ-105', summary: 'Add tax', ac: ['Subtotal', 'Tax', 'Total'],
      storyHash: 'h', modifiesAreas: [], fetchedAt: '2026-05-12T10:00:00.000Z',
    };
    snap.acNodes['PROJ-105#ac-0'] = { id: 'PROJ-105#ac-0', ticketId: 'PROJ-105', index: 0, text: 'Subtotal' };
    snap.acNodes['PROJ-105#ac-1'] = { id: 'PROJ-105#ac-1', ticketId: 'PROJ-105', index: 1, text: 'Tax' };
    snap.acNodes['PROJ-105#ac-2'] = { id: 'PROJ-105#ac-2', ticketId: 'PROJ-105', index: 2, text: 'Total' };
    snap.edges.push({
      kind: 'satisfies', from: 'PROJ-105#scenario-0', to: 'PROJ-105#ac-0',
      confidence: 1.0, source: 'xera-script', discoveredAt: '2026-05-12T11:00:00.000Z',
    });
    snap.classifications.push({
      scenarioId: 'PROJ-105#scenario-0', classification: 'PASS',
      ts: '2026-05-15T10:00:00.000Z',
    });
    const out = buildWhyTicket('PROJ-105', snap, DEFAULT_COVERAGE_CONFIG, now);
    expect(out).toContain('Ticket: PROJ-105');
    expect(out).toContain('INCOMPLETE');
    expect(out).toContain('1/3 ACs covered');
    expect(out).toContain('Add tax');
    expect(out).toContain('Fetched: 2026-05-12');
    expect(out).toContain('recency boost ×1.0');
    expect(out).toContain('AC gap score: 2');
    expect(out).toContain('✓ AC-0');
    expect(out).toContain('✗ AC-1');
    expect(out).toContain('✗ AC-2');
    expect(out).toContain('/xera-fill-gap --ticket PROJ-105');
  });

  test('errors gracefully if ticket unknown', () => {
    const out = buildWhyTicket('PROJ-999', emptySnap(), DEFAULT_COVERAGE_CONFIG, now);
    expect(out).toContain('Unknown ticket');
  });
});
```

- [ ] **Step 2: Verify failure**

```bash
cd packages/core && bun test test/coverage/why.test.ts
```

- [ ] **Step 3: Implement**

Append to `packages/core/src/coverage/why.ts`:

```ts
import { computeAcStatus, computeTicketStatus } from './status';
import { computeAcGapScore } from './risk';

export function buildWhyTicket(
  ticketId: string,
  snap: Snapshot,
  config: CoverageConfig,
  now: Date,
): string {
  const ticket = snap.tickets[ticketId];
  if (!ticket) return `Unknown ticket: ${ticketId}\n`;

  const status = computeTicketStatus(ticketId, snap, config.staleAfterDays, now);
  const acs = Object.values(snap.acNodes)
    .filter((ac) => ac.ticketId === ticketId)
    .sort((a, b) => a.index - b.index);
  const satisfiedCount = acs.filter(
    (ac) => computeAcStatus(ac.id, snap, config.staleAfterDays, now) === 'SATISFIED',
  ).length;
  const gapScore = computeAcGapScore(ticketId, snap, config, now);

  const days = daysBetween(now, new Date(ticket.fetchedAt));
  let boostLabel: string;
  if (days <= RISK_WEIGHTS.recencyThresholdDays) boostLabel = '×2.0';
  else if (days <= config.staleAfterDays) boostLabel = '×1.0';
  else boostLabel = '×0.5';

  const lines: string[] = [
    '',
    `Ticket: ${ticketId} (${status}, ${satisfiedCount}/${acs.length} ACs covered)`,
    `  Title: ${ticket.summary}`,
    `  Fetched: ${ticket.fetchedAt.slice(0, 10)} (${Math.floor(days)}d ago, recency boost ${boostLabel})`,
    `  AC gap score: ${gapScore}`,
    '',
    'Acceptance Criteria:',
  ];
  for (const ac of acs) {
    const acStatus = computeAcStatus(ac.id, snap, config.staleAfterDays, now);
    const marker = acStatus === 'SATISFIED' ? '✓' : '✗';
    const satisfyingScenarios = snap.edges
      .filter((e) => e.kind === 'satisfies' && e.to === ac.id)
      .map((e) => e.from);
    const scenarioRef = satisfyingScenarios.length > 0
      ? ` — scenario "${satisfyingScenarios[0]}"`
      : '';
    lines.push(`  ${marker} AC-${ac.index}  ${ac.text}${scenarioRef}`);
  }
  lines.push('');
  if (status === 'INCOMPLETE') {
    lines.push('To draft scenarios for unsatisfied ACs:');
    lines.push(`  /xera-fill-gap --ticket ${ticketId}`);
  }
  return lines.join('\n') + '\n';
}
```

- [ ] **Step 4: Verify pass**

```bash
cd packages/core && bun test test/coverage/why.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/coverage/why.ts packages/core/test/coverage/why.test.ts
git commit -m "feat(core): add buildWhyTicket drill-down builder"
```

---

## Phase 8 — Barrel exports

### Task 8.1: Update `packages/core/src/coverage/index.ts`

**Files:**
- Modify: `packages/core/src/coverage/index.ts`

- [ ] **Step 1: Replace contents**

```ts
export type { CoverageConfig } from './types';
export { DEFAULT_COVERAGE_CONFIG } from './types';
export {
  computeScenarioStatus,
  computeAreaStatus,
  computeAcStatus,
  computeTicketStatus,
  type ScenarioStatus,
  type AreaStatus,
  type AcStatus,
  type TicketStatus,
} from './status';
export {
  computeAreaRisk,
  computeAcGapScore,
  RISK_WEIGHTS,
} from './risk';
export {
  buildCoverageReport,
  renderMarkdown,
  type CoverageReport,
  type AreaReportRow,
  type TicketReportRow,
  type RenderOptions,
} from './report';
export {
  buildWhyArea,
  buildWhyTicket,
} from './why';
```

- [ ] **Step 2: Workspace typecheck**

```bash
cd /home/user/xera && bun run typecheck
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add packages/core/src/coverage/index.ts
git commit -m "feat(core): export coverage barrel"
```

---

## Phase 9 — Golden fixtures

Each fixture is a `Snapshot` JSON file plus an `.expected.json` of the asserted `buildCoverageReport` output at `now = 2026-05-17T10:00:00.000Z` with `DEFAULT_COVERAGE_CONFIG` (unless noted).

Shared test scaffolding goes in `fixtures/golden-coverage/_helpers.ts`.

### Task 9.1: `uncovered-only.json` + shared helpers

**Files:**
- Create: `fixtures/golden-coverage/_helpers.ts`
- Create: `fixtures/golden-coverage/uncovered-only.json`
- Create: `fixtures/golden-coverage/uncovered-only.expected.json`
- Test: `packages/core/test/coverage/fixtures.test.ts`

- [ ] **Step 1: Write `_helpers.ts`**

```ts
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

export function loadSnap(name: string): unknown {
  return JSON.parse(readFileSync(join(here, `${name}.json`), 'utf8'));
}
export function loadExpected(name: string): unknown {
  return JSON.parse(readFileSync(join(here, `${name}.expected.json`), 'utf8'));
}
```

- [ ] **Step 2: Write `uncovered-only.json`**

```json
{
  "schema_version": 1,
  "generated_at": "2026-05-17T10:00:00.000Z",
  "event_count": 0,
  "events_hash": "sha256:",
  "tickets": {
    "PROJ-101": {
      "id": "PROJ-101", "summary": "Add Apple Pay to checkout",
      "ac": [], "storyHash": "h1",
      "modifiesAreas": ["checkout"], "fetchedAt": "2026-05-15T10:00:00.000Z"
    },
    "PROJ-105": {
      "id": "PROJ-105", "summary": "Profile settings",
      "ac": [], "storyHash": "h2",
      "modifiesAreas": ["profile"], "fetchedAt": "2026-05-12T10:00:00.000Z"
    }
  },
  "scenarios": {}, "poms": {},
  "areas": {
    "checkout": { "id": "checkout" },
    "profile": { "id": "profile" }
  },
  "edges": [
    { "kind": "modifies", "from": "PROJ-101", "to": "checkout", "source": "xera-fetch", "discoveredAt": "2026-05-15T10:00:00.000Z" },
    { "kind": "modifies", "from": "PROJ-105", "to": "profile",  "source": "xera-fetch", "discoveredAt": "2026-05-12T10:00:00.000Z" }
  ],
  "latest_failures": {},
  "acNodes": {},
  "classifications": []
}
```

- [ ] **Step 3: Write `uncovered-only.expected.json`**

```json
{
  "generatedAt": "2026-05-17T10:00:00.000Z",
  "windowDays": 30,
  "areas": [
    { "id": "checkout", "status": "UNCOVERED", "risk": 1,
      "breakdown": { "recentTickets": 1, "recentBugs": 0, "criticalBoost": 1 } },
    { "id": "profile",  "status": "UNCOVERED", "risk": 1,
      "breakdown": { "recentTickets": 1, "recentBugs": 0, "criticalBoost": 1 } }
  ],
  "tickets": [],
  "acBackfillNeeded": false
}
```

- [ ] **Step 4: Write fixture test**

`packages/core/test/coverage/fixtures.test.ts`:

```ts
import { describe, test, expect } from 'bun:test';
import { buildCoverageReport } from '../../src/coverage/report';
import { DEFAULT_COVERAGE_CONFIG } from '../../src/coverage/types';
import { loadSnap, loadExpected } from '../../../../fixtures/golden-coverage/_helpers';
import type { Snapshot } from '../../src/graph/types';

const now = new Date('2026-05-17T10:00:00.000Z');

describe('golden-coverage fixtures', () => {
  test('uncovered-only', () => {
    const snap = loadSnap('uncovered-only') as Snapshot;
    const expected = loadExpected('uncovered-only');
    const r = buildCoverageReport(snap, DEFAULT_COVERAGE_CONFIG, now);
    expect(r).toEqual(expected as ReturnType<typeof buildCoverageReport>);
  });
});
```

- [ ] **Step 5: Run + commit**

```bash
cd packages/core && bun test test/coverage/fixtures.test.ts
git add fixtures/golden-coverage/ packages/core/test/coverage/fixtures.test.ts
git commit -m "test(coverage): add uncovered-only golden fixture + helper"
```

---

### Task 9.2: `mixed.json` (all 3 statuses + AC gap)

**Files:**
- Create: `fixtures/golden-coverage/mixed.json` + `mixed.expected.json`
- Modify: `packages/core/test/coverage/fixtures.test.ts`

- [ ] **Step 1: Write `mixed.json`**

Areas: `checkout` (UNCOVERED — only ticket, no POM), `search` (STALE — POM + scenario, no PASS in window), `login` (COVERED — POM + scenario + recent PASS). Plus AC gap on PROJ-101.

```json
{
  "schema_version": 1, "generated_at": "2026-05-17T10:00:00.000Z",
  "event_count": 0, "events_hash": "sha256:",
  "tickets": {
    "PROJ-101": {
      "id": "PROJ-101", "summary": "Add Apple Pay to checkout",
      "ac": ["User selects Apple Pay", "Order confirms"],
      "storyHash": "h1", "modifiesAreas": ["checkout"],
      "fetchedAt": "2026-05-15T10:00:00.000Z"
    },
    "PROJ-200": {
      "id": "PROJ-200", "summary": "Search pagination",
      "ac": [], "storyHash": "h2",
      "modifiesAreas": ["search"], "fetchedAt": "2026-04-10T10:00:00.000Z"
    },
    "PROJ-300": {
      "id": "PROJ-300", "summary": "Login redirect fix",
      "ac": [], "storyHash": "h3",
      "modifiesAreas": ["login"], "fetchedAt": "2026-05-10T10:00:00.000Z"
    }
  },
  "scenarios": {
    "PROJ-200#scenario-0": {
      "id": "PROJ-200#scenario-0", "ticketId": "PROJ-200", "name": "Search shows next page",
      "gherkin": "...", "priority": "p1", "featureHash": "fh1",
      "generatedAt": "2026-04-10T11:00:00.000Z"
    },
    "PROJ-300#scenario-0": {
      "id": "PROJ-300#scenario-0", "ticketId": "PROJ-300", "name": "User logs in",
      "gherkin": "...", "priority": "p0", "featureHash": "fh2",
      "generatedAt": "2026-05-10T11:00:00.000Z"
    }
  },
  "poms": {
    "SearchPage": {
      "id": "SearchPage", "ticketId": "PROJ-200",
      "filePath": "pages/SearchPage.ts", "route": "/search",
      "locators": [], "scope": "local"
    },
    "LoginPage": {
      "id": "LoginPage", "ticketId": "PROJ-300",
      "filePath": "pages/LoginPage.ts", "route": "/login",
      "locators": [], "scope": "local"
    }
  },
  "areas": {
    "checkout": { "id": "checkout" },
    "search":   { "id": "search" },
    "login":    { "id": "login" }
  },
  "edges": [
    { "kind": "modifies", "from": "PROJ-101", "to": "checkout", "source": "xera-fetch", "discoveredAt": "2026-05-15T10:00:00.000Z" },
    { "kind": "modifies", "from": "PROJ-200", "to": "search",   "source": "xera-fetch", "discoveredAt": "2026-04-10T10:00:00.000Z" },
    { "kind": "modifies", "from": "PROJ-300", "to": "login",    "source": "xera-fetch", "discoveredAt": "2026-05-10T10:00:00.000Z" },
    { "kind": "tests",  "from": "PROJ-200", "to": "PROJ-200#scenario-0", "source": "xera-script", "discoveredAt": "2026-04-10T11:00:00.000Z" },
    { "kind": "tests",  "from": "PROJ-300", "to": "PROJ-300#scenario-0", "source": "xera-script", "discoveredAt": "2026-05-10T11:00:00.000Z" },
    { "kind": "uses",   "from": "PROJ-200#scenario-0", "to": "SearchPage", "source": "xera-script", "discoveredAt": "2026-04-10T11:00:00.000Z" },
    { "kind": "uses",   "from": "PROJ-300#scenario-0", "to": "LoginPage",  "source": "xera-script", "discoveredAt": "2026-05-10T11:00:00.000Z" },
    { "kind": "covers", "from": "SearchPage", "to": "search", "source": "xera-script", "discoveredAt": "2026-04-10T11:00:00.000Z" },
    { "kind": "covers", "from": "LoginPage",  "to": "login",  "source": "xera-script", "discoveredAt": "2026-05-10T11:00:00.000Z" }
  ],
  "latest_failures": {},
  "acNodes": {
    "PROJ-101#ac-0": { "id": "PROJ-101#ac-0", "ticketId": "PROJ-101", "index": 0, "text": "User selects Apple Pay" },
    "PROJ-101#ac-1": { "id": "PROJ-101#ac-1", "ticketId": "PROJ-101", "index": 1, "text": "Order confirms" }
  },
  "classifications": [
    { "scenarioId": "PROJ-300#scenario-0", "classification": "PASS", "ts": "2026-05-15T10:00:00.000Z" }
  ]
}
```

- [ ] **Step 2: Trace expected output**

Now = 2026-05-17, windowDays = 30 (cutoff 2026-04-17).

Areas:
- `checkout`: no POM → UNCOVERED. recentTickets = 1 (PROJ-101 2d old). recentBugs = 0. risk = 1.
- `search`: POM SearchPage, scenario PROJ-200#scenario-0. classifications has no PASS for it → NOT_PASSING → STALE. recentTickets = 0 (PROJ-200 37d old). recentBugs = 0. risk = 0.
- `login`: POM LoginPage, scenario PROJ-300#scenario-0. classifications has PASS at 2d ago → PASSING → COVERED. recentTickets = 1. risk = 1.

Sort: UNCOVERED first (checkout risk 1), then STALE (search risk 0), then COVERED (login).

Tickets: PROJ-101 has 2 ACs both UNSATISFIED → INCOMPLETE. fetchedAt 2d ago → ×2.0. gap_score = 2 × 2.0 = 4.

- [ ] **Step 3: Write `mixed.expected.json`**

```json
{
  "generatedAt": "2026-05-17T10:00:00.000Z",
  "windowDays": 30,
  "areas": [
    { "id": "checkout", "status": "UNCOVERED", "risk": 1,
      "breakdown": { "recentTickets": 1, "recentBugs": 0, "criticalBoost": 1 } },
    { "id": "search",   "status": "STALE",     "risk": 0,
      "breakdown": { "recentTickets": 0, "recentBugs": 0, "criticalBoost": 1 } },
    { "id": "login",    "status": "COVERED",   "risk": 1,
      "breakdown": { "recentTickets": 1, "recentBugs": 0, "criticalBoost": 1 } }
  ],
  "tickets": [
    {
      "id": "PROJ-101", "summary": "Add Apple Pay to checkout",
      "acCount": 2, "satisfiedCount": 0, "gapScore": 4,
      "unsatisfiedAcs": [
        { "index": 0, "text": "User selects Apple Pay" },
        { "index": 1, "text": "Order confirms" }
      ]
    }
  ],
  "acBackfillNeeded": false
}
```

- [ ] **Step 4: Add test + run**

In `fixtures.test.ts`:

```ts
test('mixed', () => {
  const snap = loadSnap('mixed') as Snapshot;
  const expected = loadExpected('mixed');
  const r = buildCoverageReport(snap, DEFAULT_COVERAGE_CONFIG, now);
  expect(r).toEqual(expected as ReturnType<typeof buildCoverageReport>);
});
```

```bash
cd packages/core && bun test test/coverage/fixtures.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add fixtures/golden-coverage/mixed.json fixtures/golden-coverage/mixed.expected.json packages/core/test/coverage/fixtures.test.ts
git commit -m "test(coverage): add mixed-status golden fixture"
```

---

### Task 9.3: `critical-boost.json`

**Files:**
- Create: `fixtures/golden-coverage/critical-boost.json` + `.expected.json`
- Modify: `fixtures.test.ts`

- [ ] **Step 1: Write `critical-boost.json`** — two areas (checkout, admin), identical signals, but checkout is critical.

```json
{
  "schema_version": 1, "generated_at": "2026-05-17T10:00:00.000Z",
  "event_count": 0, "events_hash": "sha256:",
  "tickets": {
    "PROJ-A": { "id": "PROJ-A", "summary": "x", "ac": [], "storyHash": "h",
      "modifiesAreas": ["checkout"], "fetchedAt": "2026-05-15T10:00:00.000Z" },
    "PROJ-B": { "id": "PROJ-B", "summary": "y", "ac": [], "storyHash": "h",
      "modifiesAreas": ["admin"],    "fetchedAt": "2026-05-15T10:00:00.000Z" }
  },
  "scenarios": {}, "poms": {},
  "areas": { "checkout": { "id": "checkout" }, "admin": { "id": "admin" } },
  "edges": [
    { "kind": "modifies", "from": "PROJ-A", "to": "checkout", "source": "xera-fetch", "discoveredAt": "2026-05-15T10:00:00.000Z" },
    { "kind": "modifies", "from": "PROJ-B", "to": "admin",    "source": "xera-fetch", "discoveredAt": "2026-05-15T10:00:00.000Z" }
  ],
  "latest_failures": {}, "acNodes": {}, "classifications": []
}
```

- [ ] **Step 2: Write `critical-boost.expected.json`** — checkout risk 2 (×2 boost), admin risk 1.

```json
{
  "generatedAt": "2026-05-17T10:00:00.000Z",
  "windowDays": 30,
  "areas": [
    { "id": "checkout", "status": "UNCOVERED", "risk": 2,
      "breakdown": { "recentTickets": 1, "recentBugs": 0, "criticalBoost": 2 } },
    { "id": "admin",    "status": "UNCOVERED", "risk": 1,
      "breakdown": { "recentTickets": 1, "recentBugs": 0, "criticalBoost": 1 } }
  ],
  "tickets": [], "acBackfillNeeded": false
}
```

- [ ] **Step 3: Add test (uses custom config)**

```ts
test('critical-boost', () => {
  const snap = loadSnap('critical-boost') as Snapshot;
  const expected = loadExpected('critical-boost');
  const config = { ...DEFAULT_COVERAGE_CONFIG, criticalAreas: ['checkout'] };
  const r = buildCoverageReport(snap, config, now);
  expect(r).toEqual(expected as ReturnType<typeof buildCoverageReport>);
});
```

- [ ] **Step 4: Run + commit**

```bash
cd packages/core && bun test test/coverage/fixtures.test.ts
git add fixtures/golden-coverage/critical-boost.json fixtures/golden-coverage/critical-boost.expected.json packages/core/test/coverage/fixtures.test.ts
git commit -m "test(coverage): add critical-boost golden fixture"
```

---

### Task 9.4: `bug-history.json`

**Files:**
- Create: `fixtures/golden-coverage/bug-history.json` + `.expected.json`
- Modify: `fixtures.test.ts`

- [ ] **Step 1: Write `bug-history.json`** — one area with POM/scenario, ticket out-of-window, multiple classifications testing in-window + out-of-window + bug-set membership.

```json
{
  "schema_version": 1, "generated_at": "2026-05-17T10:00:00.000Z",
  "event_count": 0, "events_hash": "sha256:",
  "tickets": {
    "PROJ-AUTH": {
      "id": "PROJ-AUTH", "summary": "Refactor auth", "ac": [], "storyHash": "h",
      "modifiesAreas": ["auth"], "fetchedAt": "2026-02-06T10:00:00.000Z"
    }
  },
  "scenarios": {
    "PROJ-AUTH#scenario-0": {
      "id": "PROJ-AUTH#scenario-0", "ticketId": "PROJ-AUTH", "name": "Login",
      "gherkin": "...", "priority": "p1", "featureHash": "fh",
      "generatedAt": "2026-02-06T11:00:00.000Z"
    }
  },
  "poms": {
    "LoginPage": { "id": "LoginPage", "ticketId": "PROJ-AUTH",
      "filePath": "pages/LoginPage.ts", "route": "/login",
      "locators": [], "scope": "local" }
  },
  "areas": { "auth": { "id": "auth" } },
  "edges": [
    { "kind": "modifies", "from": "PROJ-AUTH", "to": "auth", "source": "xera-fetch", "discoveredAt": "2026-02-06T10:00:00.000Z" },
    { "kind": "tests",  "from": "PROJ-AUTH", "to": "PROJ-AUTH#scenario-0", "source": "xera-script", "discoveredAt": "2026-02-06T11:00:00.000Z" },
    { "kind": "uses",   "from": "PROJ-AUTH#scenario-0", "to": "LoginPage", "source": "xera-script", "discoveredAt": "2026-02-06T11:00:00.000Z" },
    { "kind": "covers", "from": "LoginPage", "to": "auth", "source": "xera-script", "discoveredAt": "2026-02-06T11:00:00.000Z" }
  ],
  "latest_failures": {},
  "acNodes": {},
  "classifications": [
    { "scenarioId": "PROJ-AUTH#scenario-0", "classification": "REAL_BUG",      "ts": "2026-05-14T10:00:00.000Z" },
    { "scenarioId": "PROJ-AUTH#scenario-0", "classification": "REAL_BUG",      "ts": "2026-05-10T10:00:00.000Z" },
    { "scenarioId": "PROJ-AUTH#scenario-0", "classification": "TEST_OUTDATED", "ts": "2026-05-08T10:00:00.000Z" },
    { "scenarioId": "PROJ-AUTH#scenario-0", "classification": "SELECTOR_DRIFT","ts": "2026-05-12T10:00:00.000Z" },
    { "scenarioId": "PROJ-AUTH#scenario-0", "classification": "REAL_BUG",      "ts": "2026-03-01T10:00:00.000Z" }
  ]
}
```

- [ ] **Step 2: Write `bug-history.expected.json`** — area STALE (no PASS in window), risk 0+3=3.

```json
{
  "generatedAt": "2026-05-17T10:00:00.000Z",
  "windowDays": 30,
  "areas": [
    { "id": "auth", "status": "STALE", "risk": 3,
      "breakdown": { "recentTickets": 0, "recentBugs": 3, "criticalBoost": 1 } }
  ],
  "tickets": [], "acBackfillNeeded": false
}
```

- [ ] **Step 3-5: add test, run, commit**

```ts
test('bug-history', () => {
  const snap = loadSnap('bug-history') as Snapshot;
  const expected = loadExpected('bug-history');
  const r = buildCoverageReport(snap, DEFAULT_COVERAGE_CONFIG, now);
  expect(r).toEqual(expected as ReturnType<typeof buildCoverageReport>);
});
```

```bash
cd packages/core && bun test test/coverage/fixtures.test.ts
git add fixtures/golden-coverage/bug-history.json fixtures/golden-coverage/bug-history.expected.json packages/core/test/coverage/fixtures.test.ts
git commit -m "test(coverage): add bug-history golden fixture"
```

---

### Task 9.5: `stale-only.json`

**Files:**
- Create: `fixtures/golden-coverage/stale-only.json` + `.expected.json`
- Modify: `fixtures.test.ts`

- [ ] **Step 1: Write `stale-only.json`** — two POM-covered areas, both with PASS classifications > 30d old.

```json
{
  "schema_version": 1, "generated_at": "2026-05-17T10:00:00.000Z",
  "event_count": 0, "events_hash": "sha256:",
  "tickets": {
    "PROJ-B": { "id": "PROJ-B", "summary": "Billing v1", "ac": [], "storyHash": "h",
      "modifiesAreas": ["billing"], "fetchedAt": "2026-02-01T10:00:00.000Z" },
    "PROJ-S": { "id": "PROJ-S", "summary": "Search v1",  "ac": [], "storyHash": "h",
      "modifiesAreas": ["search"],  "fetchedAt": "2026-02-01T10:00:00.000Z" }
  },
  "scenarios": {
    "PROJ-B#scenario-0": { "id": "PROJ-B#scenario-0", "ticketId": "PROJ-B", "name": "Bill",
      "gherkin": "...", "priority": "p1", "featureHash": "fh", "generatedAt": "2026-02-01T11:00:00.000Z" },
    "PROJ-S#scenario-0": { "id": "PROJ-S#scenario-0", "ticketId": "PROJ-S", "name": "Search",
      "gherkin": "...", "priority": "p1", "featureHash": "fh", "generatedAt": "2026-02-01T11:00:00.000Z" }
  },
  "poms": {
    "BillingPage": { "id": "BillingPage", "ticketId": "PROJ-B",
      "filePath": "p.ts", "route": "/billing", "locators": [], "scope": "local" },
    "SearchPage": { "id": "SearchPage", "ticketId": "PROJ-S",
      "filePath": "p.ts", "route": "/search", "locators": [], "scope": "local" }
  },
  "areas": { "billing": { "id": "billing" }, "search": { "id": "search" } },
  "edges": [
    { "kind": "modifies", "from": "PROJ-B", "to": "billing", "source": "xera-fetch", "discoveredAt": "2026-02-01T10:00:00.000Z" },
    { "kind": "modifies", "from": "PROJ-S", "to": "search",  "source": "xera-fetch", "discoveredAt": "2026-02-01T10:00:00.000Z" },
    { "kind": "uses",   "from": "PROJ-B#scenario-0", "to": "BillingPage", "source": "xera-script", "discoveredAt": "2026-02-01T11:00:00.000Z" },
    { "kind": "uses",   "from": "PROJ-S#scenario-0", "to": "SearchPage",  "source": "xera-script", "discoveredAt": "2026-02-01T11:00:00.000Z" },
    { "kind": "covers", "from": "BillingPage", "to": "billing", "source": "xera-script", "discoveredAt": "2026-02-01T11:00:00.000Z" },
    { "kind": "covers", "from": "SearchPage",  "to": "search",  "source": "xera-script", "discoveredAt": "2026-02-01T11:00:00.000Z" }
  ],
  "latest_failures": {},
  "acNodes": {},
  "classifications": [
    { "scenarioId": "PROJ-B#scenario-0", "classification": "PASS", "ts": "2026-03-31T10:00:00.000Z" },
    { "scenarioId": "PROJ-S#scenario-0", "classification": "PASS", "ts": "2026-04-15T10:00:00.000Z" }
  ]
}
```

- [ ] **Step 2: Write `stale-only.expected.json`** — both STALE risk 0, alpha tie-break.

```json
{
  "generatedAt": "2026-05-17T10:00:00.000Z",
  "windowDays": 30,
  "areas": [
    { "id": "billing", "status": "STALE", "risk": 0,
      "breakdown": { "recentTickets": 0, "recentBugs": 0, "criticalBoost": 1 } },
    { "id": "search",  "status": "STALE", "risk": 0,
      "breakdown": { "recentTickets": 0, "recentBugs": 0, "criticalBoost": 1 } }
  ],
  "tickets": [], "acBackfillNeeded": false
}
```

- [ ] **Step 3-5: add test, run, commit**

```ts
test('stale-only', () => {
  const snap = loadSnap('stale-only') as Snapshot;
  const expected = loadExpected('stale-only');
  const r = buildCoverageReport(snap, DEFAULT_COVERAGE_CONFIG, now);
  expect(r).toEqual(expected as ReturnType<typeof buildCoverageReport>);
});
```

```bash
cd packages/core && bun test test/coverage/fixtures.test.ts
git add fixtures/golden-coverage/stale-only.json fixtures/golden-coverage/stale-only.expected.json packages/core/test/coverage/fixtures.test.ts
git commit -m "test(coverage): add stale-only golden fixture"
```

---

### Task 9.6: `ac-gap.json`

**Files:**
- Create: `fixtures/golden-coverage/ac-gap.json` + `.expected.json`
- Modify: `fixtures.test.ts`

- [ ] **Step 1: Write `ac-gap.json`** — one ticket PROJ-X with 5 ACs, fetched 5d ago. Three scenarios; satisfies edges target ACs 0/1/3 (ACs 2 and 4 unsatisfied). All three scenarios have PASS classifications in window.

```json
{
  "schema_version": 1, "generated_at": "2026-05-17T10:00:00.000Z",
  "event_count": 0, "events_hash": "sha256:",
  "tickets": {
    "PROJ-X": {
      "id": "PROJ-X", "summary": "Cart features",
      "ac": [
        "User sees subtotal",
        "User sees discount line",
        "Tax line item shows in cart preview",
        "Total includes tax",
        "Receipt email includes order summary"
      ],
      "storyHash": "h", "modifiesAreas": [],
      "fetchedAt": "2026-05-12T10:00:00.000Z"
    }
  },
  "scenarios": {
    "PROJ-X#scenario-0": { "id": "PROJ-X#scenario-0", "ticketId": "PROJ-X", "name": "Subtotal",
      "gherkin": "...", "priority": "p1", "featureHash": "fh", "generatedAt": "2026-05-12T11:00:00.000Z" },
    "PROJ-X#scenario-1": { "id": "PROJ-X#scenario-1", "ticketId": "PROJ-X", "name": "Discount",
      "gherkin": "...", "priority": "p1", "featureHash": "fh", "generatedAt": "2026-05-12T11:00:00.000Z" },
    "PROJ-X#scenario-2": { "id": "PROJ-X#scenario-2", "ticketId": "PROJ-X", "name": "Total",
      "gherkin": "...", "priority": "p1", "featureHash": "fh", "generatedAt": "2026-05-12T11:00:00.000Z" }
  },
  "poms": {}, "areas": {},
  "edges": [
    { "kind": "tests", "from": "PROJ-X", "to": "PROJ-X#scenario-0", "source": "xera-script", "discoveredAt": "2026-05-12T11:00:00.000Z" },
    { "kind": "tests", "from": "PROJ-X", "to": "PROJ-X#scenario-1", "source": "xera-script", "discoveredAt": "2026-05-12T11:00:00.000Z" },
    { "kind": "tests", "from": "PROJ-X", "to": "PROJ-X#scenario-2", "source": "xera-script", "discoveredAt": "2026-05-12T11:00:00.000Z" },
    { "kind": "satisfies", "from": "PROJ-X#scenario-0", "to": "PROJ-X#ac-0", "confidence": 1.0, "source": "xera-script", "discoveredAt": "2026-05-12T11:00:00.000Z" },
    { "kind": "satisfies", "from": "PROJ-X#scenario-1", "to": "PROJ-X#ac-1", "confidence": 1.0, "source": "xera-script", "discoveredAt": "2026-05-12T11:00:00.000Z" },
    { "kind": "satisfies", "from": "PROJ-X#scenario-2", "to": "PROJ-X#ac-3", "confidence": 1.0, "source": "xera-script", "discoveredAt": "2026-05-12T11:00:00.000Z" }
  ],
  "latest_failures": {},
  "acNodes": {
    "PROJ-X#ac-0": { "id": "PROJ-X#ac-0", "ticketId": "PROJ-X", "index": 0, "text": "User sees subtotal" },
    "PROJ-X#ac-1": { "id": "PROJ-X#ac-1", "ticketId": "PROJ-X", "index": 1, "text": "User sees discount line" },
    "PROJ-X#ac-2": { "id": "PROJ-X#ac-2", "ticketId": "PROJ-X", "index": 2, "text": "Tax line item shows in cart preview" },
    "PROJ-X#ac-3": { "id": "PROJ-X#ac-3", "ticketId": "PROJ-X", "index": 3, "text": "Total includes tax" },
    "PROJ-X#ac-4": { "id": "PROJ-X#ac-4", "ticketId": "PROJ-X", "index": 4, "text": "Receipt email includes order summary" }
  },
  "classifications": [
    { "scenarioId": "PROJ-X#scenario-0", "classification": "PASS", "ts": "2026-05-15T10:00:00.000Z" },
    { "scenarioId": "PROJ-X#scenario-1", "classification": "PASS", "ts": "2026-05-15T10:00:00.000Z" },
    { "scenarioId": "PROJ-X#scenario-2", "classification": "PASS", "ts": "2026-05-15T10:00:00.000Z" }
  ]
}
```

- [ ] **Step 2: Write `ac-gap.expected.json`** — no areas; ticket PROJ-X INCOMPLETE, 3/5 covered, gap 2 ACs × 2.0 = 4.

```json
{
  "generatedAt": "2026-05-17T10:00:00.000Z",
  "windowDays": 30,
  "areas": [],
  "tickets": [
    { "id": "PROJ-X", "summary": "Cart features",
      "acCount": 5, "satisfiedCount": 3, "gapScore": 4,
      "unsatisfiedAcs": [
        { "index": 2, "text": "Tax line item shows in cart preview" },
        { "index": 4, "text": "Receipt email includes order summary" }
      ] }
  ],
  "acBackfillNeeded": false
}
```

- [ ] **Step 3-5: add test, run, commit**

```ts
test('ac-gap', () => {
  const snap = loadSnap('ac-gap') as Snapshot;
  const expected = loadExpected('ac-gap');
  const r = buildCoverageReport(snap, DEFAULT_COVERAGE_CONFIG, now);
  expect(r).toEqual(expected as ReturnType<typeof buildCoverageReport>);
});
```

```bash
cd packages/core && bun test test/coverage/fixtures.test.ts
git add fixtures/golden-coverage/ac-gap.json fixtures/golden-coverage/ac-gap.expected.json packages/core/test/coverage/fixtures.test.ts
git commit -m "test(coverage): add ac-gap golden fixture"
```

---

## Phase 10 — Workspace verification

### Task 10.1: Full workspace check

- [ ] **Step 1: Typecheck**

```bash
cd /home/user/xera && bun run typecheck
```

Expected: no errors.

- [ ] **Step 2: Full test suite**

```bash
cd /home/user/xera && bun test
```

Expected: all green — Plan 01 tests + no v0.6/v0.7 regressions.

- [ ] **Step 3: Confirm no untracked artifacts**

```bash
git status
```

Expected: clean. If anything new, commit:

```bash
git commit -am "chore(core): typecheck fix-ups after coverage foundation"
```

---

## Done

End state of Plan 01 (revised):

- `packages/core/src/graph/types.ts` — `EdgeKind` includes `'satisfies'`; new `ACNode`, `CoverageSnapshotPayload`, `AcCoverageBackfilledPayload`; `ScenarioGeneratedPayload` has optional `satisfiesAcs`; `EventPayloadMap` has two new keys; `Snapshot` has `acNodes` + `classifications`
- `packages/core/src/graph/schema.ts` — Zod schemas for the new payloads + new edge kind; `EventSchema` discriminatedUnion extended
- `packages/core/src/graph/store.ts` — `deriveSnapshot` now: initializes new fields, materializes ACNodes on `ticket.fetched` (with re-fetch replace + satisfies-edge pruning), emits eager satisfies edges on `scenario.generated`, projects `run.classified` into `classifications`, handles `ac-coverage.backfilled` (idempotent per ticket), no-ops `coverage.snapshot`
- `packages/core/src/coverage/` — new module: `types.ts` (CoverageConfig), `status.ts` (computeScenarioStatus + Area/Ac/Ticket status), `risk.ts` (computeAreaRisk + computeAcGapScore + RISK_WEIGHTS), `report.ts` (buildCoverageReport + renderMarkdown), `why.ts` (buildWhyArea + buildWhyTicket), `index.ts` (barrel)
- `fixtures/golden-coverage/` — six fixtures (uncovered-only, mixed, critical-boost, bug-history, stale-only, ac-gap) + `.expected.json` siblings + `_helpers.ts`
- `packages/core/test/coverage/` — unit + integration tests for every public function and fixture
- `packages/core/test/graph/` — extended types/schema/store tests for the new graph features

What works after Plan 01: all coverage engine functions pure, validated against fixtures. No user-facing surface. Plans 02-05 to follow.
