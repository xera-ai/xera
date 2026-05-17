# xera v0.8 — Plan 01: Schema & Coverage Engine Foundation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the `ACNode`, `SatisfiesEdge`, and `CoverageSnapshotPayload` schema additions to `@xera-ai/core`, extend the graph snapshot rebuild to materialize them from existing events, and build the deterministic coverage engine (`computeAreaStatus`, `computeAreaRisk`, `computeAcStatus`, `computeTicketStatus`, `computeAcGapScore`, `buildCoverageReport`, `buildWhyArea`, `buildWhyTicket`) as pure functions, plus six golden fixtures. End state: `bun test packages/core/test/coverage/` all green, no user-facing surface yet.

**Architecture:** All work lives under `packages/core/src/graph/` (schema/store extensions) and a new `packages/core/src/coverage/` directory (pure functions, no I/O). Functions take a `Graph` snapshot + `CoverageConfig` and return structured `CoverageReport` objects. Markdown rendering is also pure (string in, string out). Snapshot rebuild changes are additive: existing graphs continue to work unchanged; new fields default to empty.

**Tech Stack:** TypeScript (strict, `exactOptionalPropertyTypes` + `noUncheckedIndexedAccess` on), Zod for validation, `bun:test`, ESM source.

**Prereqs:** Working v0.6 graph foundation (Graph snapshot, events JSONL, types.ts/schema.ts/store.ts already present).

**Plan scope:** v0.8.0 foundation only. The `coverage-prepare` binary, `/xera-coverage` skill, CLI surface, and config schema additions are in Plan 02. AC backfill flow is in Plan 03. HTML viewer is Plan 04. Generative is Plan 05.

---

## Phase 1 — Schema types

### Task 1.1: Add `ACNode` type

**Files:**
- Modify: `packages/core/src/graph/types.ts`
- Test: `packages/core/test/graph/types.test.ts` (extend existing file)

- [ ] **Step 1: Write the failing test**

Add to `packages/core/test/graph/types.test.ts`:

```ts
import { describe, test, expect } from 'bun:test';
import type { ACNode } from '../../src/graph/types';

describe('ACNode', () => {
  test('shape: id = `${ticketId}#ac-${index}`, includes text + index', () => {
    const node: ACNode = {
      kind: 'AC',
      id: 'PROJ-105#ac-2',
      ticketId: 'PROJ-105',
      index: 2,
      text: 'Tax line item shows in cart preview',
    };
    expect(node.kind).toBe('AC');
    expect(node.id).toBe(`${node.ticketId}#ac-${node.index}`);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd packages/core && bun test test/graph/types.test.ts
```

Expected: TypeScript compile error / "Cannot find name 'ACNode'".

- [ ] **Step 3: Implement minimal type**

Add to `packages/core/src/graph/types.ts` (near other Node type definitions):

```ts
export type ACNode = {
  kind: 'AC';
  id: string;        // `${ticketId}#ac-${index}` (0-based index)
  ticketId: string;
  index: number;
  text: string;
};
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd packages/core && bun test test/graph/types.test.ts
```

Expected: 1 pass.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/graph/types.ts packages/core/test/graph/types.test.ts
git commit -m "feat(core): add ACNode type for v0.8 coverage matrix"
```

---

### Task 1.2: Add `SatisfiesEdge` type

**Files:**
- Modify: `packages/core/src/graph/types.ts`
- Test: `packages/core/test/graph/types.test.ts`

- [ ] **Step 1: Write the failing test**

Add to `packages/core/test/graph/types.test.ts`:

```ts
import type { SatisfiesEdge } from '../../src/graph/types';

describe('SatisfiesEdge', () => {
  test('shape: kind, source (scenario), target (AC), confidence, source_label', () => {
    const edge: SatisfiesEdge = {
      kind: 'satisfies',
      source: 'PROJ-105#scenario-0',
      target: 'PROJ-105#ac-2',
      confidence: 0.9,
      discoveredAt: '2026-05-17T10:00:00.000Z',
      source_label: 'eager',
    };
    expect(edge.kind).toBe('satisfies');
    expect(edge.confidence).toBeGreaterThanOrEqual(0);
    expect(edge.confidence).toBeLessThanOrEqual(1);
    expect(['eager', 'backfill']).toContain(edge.source_label);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd packages/core && bun test test/graph/types.test.ts
```

Expected: "Cannot find name 'SatisfiesEdge'".

- [ ] **Step 3: Implement minimal type**

Add to `packages/core/src/graph/types.ts`:

```ts
export type SatisfiesEdge = {
  kind: 'satisfies';
  source: string;        // ScenarioNode.id
  target: string;        // ACNode.id
  confidence: number;    // [0, 1]
  discoveredAt: string;  // ISO8601
  source_label: 'eager' | 'backfill';
};
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd packages/core && bun test test/graph/types.test.ts
```

Expected: 2 passes.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/graph/types.ts packages/core/test/graph/types.test.ts
git commit -m "feat(core): add SatisfiesEdge type for v0.8 coverage matrix"
```

---

### Task 1.3: Add `CoverageSnapshotPayload` + extend GraphEvent union

**Files:**
- Modify: `packages/core/src/graph/types.ts`
- Test: `packages/core/test/graph/types.test.ts`

- [ ] **Step 1: Write the failing test**

Add to `packages/core/test/graph/types.test.ts`:

```ts
import type { CoverageSnapshotPayload, GraphEvent } from '../../src/graph/types';

describe('CoverageSnapshotPayload', () => {
  test('shape: ts, windowDays, areas[], tickets[]', () => {
    const payload: CoverageSnapshotPayload = {
      ts: '2026-05-17T10:00:00.000Z',
      windowDays: 30,
      areas: [
        {
          id: 'checkout',
          status: 'UNCOVERED',
          risk: 8,
          breakdown: { recentTickets: 3, recentBugs: 2, criticalBoost: 2 },
        },
      ],
      tickets: [
        { id: 'PROJ-105', acCount: 5, satisfiedCount: 3, gapScore: 4 },
      ],
    };
    expect(payload.windowDays).toBe(30);
    expect(payload.areas[0]?.status).toBe('UNCOVERED');
  });

  test('GraphEvent union includes coverage.snapshot', () => {
    const event: GraphEvent = {
      kind: 'coverage.snapshot',
      payload: {
        ts: '2026-05-17T10:00:00.000Z',
        windowDays: 30,
        areas: [],
        tickets: [],
      },
    };
    expect(event.kind).toBe('coverage.snapshot');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd packages/core && bun test test/graph/types.test.ts
```

Expected: "Cannot find name 'CoverageSnapshotPayload'".

- [ ] **Step 3: Implement payload + extend union**

Add to `packages/core/src/graph/types.ts`:

```ts
export type CoverageSnapshotPayload = {
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
};

export type CoverageSnapshotEvent = {
  kind: 'coverage.snapshot';
  payload: CoverageSnapshotPayload;
};

// Extend the existing GraphEvent union — append CoverageSnapshotEvent
// (locate the GraphEvent union in types.ts and add `| CoverageSnapshotEvent`)
```

Edit the existing `GraphEvent` union (do not re-define it, just extend the trailing `|` list):

```ts
export type GraphEvent =
  | TicketFetchedEvent
  | ScenarioGeneratedEvent
  | PomEmittedEvent
  | RunCompletedEvent
  | RunClassifiedEvent
  | EnrichmentEvent
  | CoverageSnapshotEvent;       // NEW
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd packages/core && bun test test/graph/types.test.ts
```

Expected: 4 passes.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/graph/types.ts packages/core/test/graph/types.test.ts
git commit -m "feat(core): add CoverageSnapshotPayload + extend GraphEvent union"
```

---

### Task 1.4: Add `AcCoverageBackfilledPayload` event (sub-event of backfill flow)

**Files:**
- Modify: `packages/core/src/graph/types.ts`
- Test: `packages/core/test/graph/types.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import type { AcCoverageBackfilledPayload, AcCoverageBackfilledEvent } from '../../src/graph/types';

describe('AcCoverageBackfilledEvent', () => {
  test('payload carries ticketId + mappings array', () => {
    const event: AcCoverageBackfilledEvent = {
      kind: 'ac-coverage.backfilled',
      payload: {
        ts: '2026-05-17T10:00:00.000Z',
        ticketId: 'PROJ-105',
        mappings: [
          { scenarioId: 'PROJ-105#scenario-0', satisfiesAcs: [0, 1, 3], confidence: 0.85 },
        ],
      },
    };
    expect(event.payload.ticketId).toBe('PROJ-105');
    expect(event.payload.mappings[0]?.satisfiesAcs).toEqual([0, 1, 3]);
  });
});
```

- [ ] **Step 2: Verify failure**

```bash
cd packages/core && bun test test/graph/types.test.ts
```

Expected: "Cannot find name 'AcCoverageBackfilledEvent'".

- [ ] **Step 3: Implement**

Add to `packages/core/src/graph/types.ts`:

```ts
export type AcCoverageBackfilledPayload = {
  ts: string;
  ticketId: string;
  mappings: Array<{
    scenarioId: string;
    satisfiesAcs: number[];
    confidence: number;
  }>;
};

export type AcCoverageBackfilledEvent = {
  kind: 'ac-coverage.backfilled';
  payload: AcCoverageBackfilledPayload;
};
```

Extend the `GraphEvent` union further:

```ts
export type GraphEvent =
  | TicketFetchedEvent
  | ScenarioGeneratedEvent
  | PomEmittedEvent
  | RunCompletedEvent
  | RunClassifiedEvent
  | EnrichmentEvent
  | CoverageSnapshotEvent
  | AcCoverageBackfilledEvent;   // NEW
```

- [ ] **Step 4: Verify pass**

```bash
cd packages/core && bun test test/graph/types.test.ts
```

Expected: 5 passes.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/graph/types.ts packages/core/test/graph/types.test.ts
git commit -m "feat(core): add AcCoverageBackfilledEvent for backfill flow"
```

---

### Task 1.5: Extend `ScenarioGeneratedPayload` with `satisfiesAcs`

**Files:**
- Modify: `packages/core/src/graph/types.ts`
- Test: `packages/core/test/graph/types.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import type { ScenarioGeneratedPayload } from '../../src/graph/types';

describe('ScenarioGeneratedPayload', () => {
  test('payload carries optional satisfiesAcs: number[]', () => {
    const withMapping: ScenarioGeneratedPayload = {
      ticketId: 'PROJ-105',
      scenarioId: 'PROJ-105#scenario-0',
      name: 'Checkout shows tax',
      gherkin: 'Given ...',
      priority: 'p1',
      featureHash: 'abc',
      generatedAt: '2026-05-17T10:00:00.000Z',
      satisfiesAcs: [0, 3],
    };
    expect(withMapping.satisfiesAcs).toEqual([0, 3]);

    const withoutMapping: ScenarioGeneratedPayload = {
      ticketId: 'PROJ-101',
      scenarioId: 'PROJ-101#scenario-0',
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

Expected: TypeScript error on `satisfiesAcs`.

- [ ] **Step 3: Extend the type**

Locate `ScenarioGeneratedPayload` in `packages/core/src/graph/types.ts`. Add optional field:

```ts
export type ScenarioGeneratedPayload = {
  // ... existing fields unchanged ...
  satisfiesAcs?: number[];   // NEW: AC indices (0-based) this scenario satisfies
};
```

Important: use optional (`?:`) — legacy events won't carry this. `exactOptionalPropertyTypes` is on; consumers must build the object conditionally:

```ts
const payload: ScenarioGeneratedPayload = { ticketId, scenarioId, /* ... */ };
if (acs.length > 0) payload.satisfiesAcs = acs;
```

- [ ] **Step 4: Verify pass**

```bash
cd packages/core && bun test test/graph/types.test.ts
```

Expected: 6 passes.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/graph/types.ts packages/core/test/graph/types.test.ts
git commit -m "feat(core): extend ScenarioGeneratedPayload with optional satisfiesAcs"
```

---

## Phase 2 — Zod validators

### Task 2.1: `ACNodeSchema`

**Files:**
- Modify: `packages/core/src/graph/schema.ts`
- Test: `packages/core/test/graph/schema.test.ts`

- [ ] **Step 1: Write the failing test**

Add to `packages/core/test/graph/schema.test.ts`:

```ts
import { describe, test, expect } from 'bun:test';
import { ACNodeSchema } from '../../src/graph/schema';

describe('ACNodeSchema', () => {
  test('accepts valid AC node', () => {
    expect(() =>
      ACNodeSchema.parse({
        kind: 'AC',
        id: 'PROJ-105#ac-2',
        ticketId: 'PROJ-105',
        index: 2,
        text: 'Tax line item shows in cart preview',
      }),
    ).not.toThrow();
  });

  test('rejects id that does not match `${ticketId}#ac-${index}`', () => {
    expect(() =>
      ACNodeSchema.parse({
        kind: 'AC',
        id: 'PROJ-105#wrong-2',
        ticketId: 'PROJ-105',
        index: 2,
        text: 'x',
      }),
    ).toThrow();
  });

  test('rejects negative index', () => {
    expect(() =>
      ACNodeSchema.parse({
        kind: 'AC',
        id: 'PROJ-105#ac--1',
        ticketId: 'PROJ-105',
        index: -1,
        text: 'x',
      }),
    ).toThrow();
  });
});
```

- [ ] **Step 2: Verify failure**

```bash
cd packages/core && bun test test/graph/schema.test.ts
```

Expected: "Cannot find name 'ACNodeSchema'".

- [ ] **Step 3: Implement schema**

Add to `packages/core/src/graph/schema.ts`:

```ts
import { z } from 'zod';

export const ACNodeSchema = z.object({
  kind: z.literal('AC'),
  id: z.string(),
  ticketId: z.string().regex(/^[A-Z][A-Z0-9_]*-\d+$/),
  index: z.number().int().nonnegative(),
  text: z.string().min(1),
}).refine(
  (n) => n.id === `${n.ticketId}#ac-${n.index}`,
  { message: 'AC id must equal `${ticketId}#ac-${index}`' },
);
```

- [ ] **Step 4: Verify pass**

```bash
cd packages/core && bun test test/graph/schema.test.ts
```

Expected: 3 passes (existing schema tests + 3 new).

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/graph/schema.ts packages/core/test/graph/schema.test.ts
git commit -m "feat(core): add ACNodeSchema Zod validator"
```

---

### Task 2.2: `SatisfiesEdgeSchema`

**Files:**
- Modify: `packages/core/src/graph/schema.ts`
- Test: `packages/core/test/graph/schema.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { SatisfiesEdgeSchema } from '../../src/graph/schema';

describe('SatisfiesEdgeSchema', () => {
  test('accepts valid edge', () => {
    expect(() =>
      SatisfiesEdgeSchema.parse({
        kind: 'satisfies',
        source: 'PROJ-105#scenario-0',
        target: 'PROJ-105#ac-2',
        confidence: 0.9,
        discoveredAt: '2026-05-17T10:00:00.000Z',
        source_label: 'eager',
      }),
    ).not.toThrow();
  });

  test('rejects confidence out of [0, 1]', () => {
    expect(() =>
      SatisfiesEdgeSchema.parse({
        kind: 'satisfies',
        source: 'x',
        target: 'y',
        confidence: 1.5,
        discoveredAt: '2026-05-17T10:00:00.000Z',
        source_label: 'eager',
      }),
    ).toThrow();
  });

  test('rejects unknown source_label', () => {
    expect(() =>
      SatisfiesEdgeSchema.parse({
        kind: 'satisfies',
        source: 'x',
        target: 'y',
        confidence: 0.5,
        discoveredAt: '2026-05-17T10:00:00.000Z',
        source_label: 'made-up',
      }),
    ).toThrow();
  });
});
```

- [ ] **Step 2: Verify failure**

```bash
cd packages/core && bun test test/graph/schema.test.ts
```

Expected: "Cannot find name 'SatisfiesEdgeSchema'".

- [ ] **Step 3: Implement schema**

Add to `packages/core/src/graph/schema.ts`:

```ts
export const SatisfiesEdgeSchema = z.object({
  kind: z.literal('satisfies'),
  source: z.string().min(1),
  target: z.string().min(1),
  confidence: z.number().min(0).max(1),
  discoveredAt: z.string().datetime(),
  source_label: z.enum(['eager', 'backfill']),
});
```

- [ ] **Step 4: Verify pass**

```bash
cd packages/core && bun test test/graph/schema.test.ts
```

Expected: 6 passes.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/graph/schema.ts packages/core/test/graph/schema.test.ts
git commit -m "feat(core): add SatisfiesEdgeSchema Zod validator"
```

---

### Task 2.3: `CoverageSnapshotPayloadSchema` + `AcCoverageBackfilledPayloadSchema`

**Files:**
- Modify: `packages/core/src/graph/schema.ts`
- Test: `packages/core/test/graph/schema.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { CoverageSnapshotPayloadSchema, AcCoverageBackfilledPayloadSchema } from '../../src/graph/schema';

describe('CoverageSnapshotPayloadSchema', () => {
  test('accepts valid payload', () => {
    expect(() =>
      CoverageSnapshotPayloadSchema.parse({
        ts: '2026-05-17T10:00:00.000Z',
        windowDays: 30,
        areas: [
          { id: 'checkout', status: 'UNCOVERED', risk: 8,
            breakdown: { recentTickets: 3, recentBugs: 2, criticalBoost: 2 } },
        ],
        tickets: [
          { id: 'PROJ-105', acCount: 5, satisfiedCount: 3, gapScore: 4 },
        ],
      }),
    ).not.toThrow();
  });

  test('rejects unknown status', () => {
    expect(() =>
      CoverageSnapshotPayloadSchema.parse({
        ts: '2026-05-17T10:00:00.000Z',
        windowDays: 30,
        areas: [{ id: 'x', status: 'WEIRD', risk: 0,
                  breakdown: { recentTickets: 0, recentBugs: 0, criticalBoost: 1 } }],
        tickets: [],
      }),
    ).toThrow();
  });

  test('rejects criticalBoost other than 1 or 2', () => {
    expect(() =>
      CoverageSnapshotPayloadSchema.parse({
        ts: '2026-05-17T10:00:00.000Z',
        windowDays: 30,
        areas: [{ id: 'x', status: 'UNCOVERED', risk: 0,
                  breakdown: { recentTickets: 0, recentBugs: 0, criticalBoost: 3 } }],
        tickets: [],
      }),
    ).toThrow();
  });
});

describe('AcCoverageBackfilledPayloadSchema', () => {
  test('accepts valid payload', () => {
    expect(() =>
      AcCoverageBackfilledPayloadSchema.parse({
        ts: '2026-05-17T10:00:00.000Z',
        ticketId: 'PROJ-105',
        mappings: [
          { scenarioId: 'PROJ-105#scenario-0', satisfiesAcs: [0, 1, 3], confidence: 0.85 },
        ],
      }),
    ).not.toThrow();
  });
});
```

- [ ] **Step 2: Verify failure**

```bash
cd packages/core && bun test test/graph/schema.test.ts
```

Expected: "Cannot find name 'CoverageSnapshotPayloadSchema'".

- [ ] **Step 3: Implement schemas**

Add to `packages/core/src/graph/schema.ts`:

```ts
const StatusEnum = z.enum(['UNCOVERED', 'STALE', 'COVERED']);

export const CoverageSnapshotPayloadSchema = z.object({
  ts: z.string().datetime(),
  windowDays: z.number().int().positive(),
  areas: z.array(z.object({
    id: z.string().regex(/^[a-z0-9-]+$/),
    status: StatusEnum,
    risk: z.number().nonnegative(),
    breakdown: z.object({
      recentTickets: z.number().int().nonnegative(),
      recentBugs: z.number().int().nonnegative(),
      criticalBoost: z.union([z.literal(1), z.literal(2)]),
    }),
  })),
  tickets: z.array(z.object({
    id: z.string().regex(/^[A-Z][A-Z0-9_]*-\d+$/),
    acCount: z.number().int().nonnegative(),
    satisfiedCount: z.number().int().nonnegative(),
    gapScore: z.number().nonnegative(),
  })),
});

export const AcCoverageBackfilledPayloadSchema = z.object({
  ts: z.string().datetime(),
  ticketId: z.string().regex(/^[A-Z][A-Z0-9_]*-\d+$/),
  mappings: z.array(z.object({
    scenarioId: z.string().min(1),
    satisfiesAcs: z.array(z.number().int().nonnegative()),
    confidence: z.number().min(0).max(1),
  })),
});
```

- [ ] **Step 4: Verify pass**

```bash
cd packages/core && bun test test/graph/schema.test.ts
```

Expected: 10 passes (existing + 4 new).

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/graph/schema.ts packages/core/test/graph/schema.test.ts
git commit -m "feat(core): add CoverageSnapshotPayload + AcCoverageBackfilled schemas"
```

---

### Task 2.4: Extend `GraphEventSchema` discriminated union

**Files:**
- Modify: `packages/core/src/graph/schema.ts`
- Test: `packages/core/test/graph/schema.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { GraphEventSchema } from '../../src/graph/schema';

describe('GraphEventSchema with new events', () => {
  test('accepts coverage.snapshot event', () => {
    expect(() =>
      GraphEventSchema.parse({
        kind: 'coverage.snapshot',
        payload: {
          ts: '2026-05-17T10:00:00.000Z',
          windowDays: 30,
          areas: [],
          tickets: [],
        },
      }),
    ).not.toThrow();
  });

  test('accepts ac-coverage.backfilled event', () => {
    expect(() =>
      GraphEventSchema.parse({
        kind: 'ac-coverage.backfilled',
        payload: {
          ts: '2026-05-17T10:00:00.000Z',
          ticketId: 'PROJ-105',
          mappings: [],
        },
      }),
    ).not.toThrow();
  });

  test('accepts scenario.generated event with satisfiesAcs', () => {
    expect(() =>
      GraphEventSchema.parse({
        kind: 'scenario.generated',
        payload: {
          ticketId: 'PROJ-105',
          scenarioId: 'PROJ-105#scenario-0',
          name: 'Customer pays with card',
          gherkin: 'Given ...',
          priority: 'p1',
          featureHash: 'abc123',
          generatedAt: '2026-05-17T10:00:00.000Z',
          satisfiesAcs: [0, 2],
        },
      }),
    ).not.toThrow();
  });
});
```

- [ ] **Step 2: Verify failure**

```bash
cd packages/core && bun test test/graph/schema.test.ts
```

Expected: GraphEventSchema rejects new kinds.

- [ ] **Step 3: Extend the union + ScenarioGeneratedPayloadSchema**

Locate `GraphEventSchema` in `packages/core/src/graph/schema.ts`. Append two members to its `z.discriminatedUnion('kind', [...])` list:

```ts
export const CoverageSnapshotEventSchema = z.object({
  kind: z.literal('coverage.snapshot'),
  payload: CoverageSnapshotPayloadSchema,
});

export const AcCoverageBackfilledEventSchema = z.object({
  kind: z.literal('ac-coverage.backfilled'),
  payload: AcCoverageBackfilledPayloadSchema,
});

export const GraphEventSchema = z.discriminatedUnion('kind', [
  TicketFetchedEventSchema,
  ScenarioGeneratedEventSchema,    // ← extend this one too (next step)
  PomEmittedEventSchema,
  RunCompletedEventSchema,
  RunClassifiedEventSchema,
  EnrichmentEventSchema,
  CoverageSnapshotEventSchema,        // NEW
  AcCoverageBackfilledEventSchema,    // NEW
]);
```

Also locate `ScenarioGeneratedPayloadSchema` and extend with optional `satisfiesAcs`:

```ts
export const ScenarioGeneratedPayloadSchema = z.object({
  // ... existing fields ...
  satisfiesAcs: z.array(z.number().int().nonnegative()).optional(),
});
```

- [ ] **Step 4: Verify pass**

```bash
cd packages/core && bun test test/graph/schema.test.ts
```

Expected: 13 passes.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/graph/schema.ts packages/core/test/graph/schema.test.ts
git commit -m "feat(core): extend GraphEventSchema with coverage + backfill events"
```

---

## Phase 3 — Graph store rebuild

### Task 3.1: Extend `Graph` shape with `acNodes` + `satisfiesEdges`

**Files:**
- Modify: `packages/core/src/graph/store.ts`
- Test: `packages/core/test/graph/store.test.ts`

- [ ] **Step 1: Write the failing test**

Add to `packages/core/test/graph/store.test.ts`:

```ts
import { describe, test, expect } from 'bun:test';
import { buildGraph } from '../../src/graph/store';
import type { GraphEvent } from '../../src/graph/types';

describe('Graph shape with v0.8 fields', () => {
  test('empty graph has empty acNodes and satisfiesEdges', () => {
    const graph = buildGraph([]);
    expect(graph.acNodes).toEqual({});
    expect(graph.satisfiesEdges).toEqual([]);
  });

  test('legacy graph (no coverage events) still loads', () => {
    const events: GraphEvent[] = [
      {
        kind: 'ticket.fetched',
        payload: {
          id: 'PROJ-001',
          summary: 'Legacy ticket',
          acceptanceCriteria: ['User can log in'],
          fetchedAt: '2026-05-01T10:00:00.000Z',
          storyHash: 'abc',
          modifiesAreas: ['login'],
        },
      },
    ];
    const graph = buildGraph(events);
    expect(graph.tickets['PROJ-001']).toBeDefined();
  });
});
```

- [ ] **Step 2: Verify failure**

```bash
cd packages/core && bun test test/graph/store.test.ts
```

Expected: `acNodes` / `satisfiesEdges` not on Graph type.

- [ ] **Step 3: Extend Graph type + initialize empty fields in buildGraph**

Locate the `Graph` type in `packages/core/src/graph/store.ts`. Add:

```ts
export type Graph = {
  // ... existing fields ...
  acNodes: Record<string, ACNode>;
  satisfiesEdges: SatisfiesEdge[];
};
```

In `buildGraph`, initialize the new fields:

```ts
export function buildGraph(events: GraphEvent[]): Graph {
  const graph: Graph = {
    // ... existing initializers ...
    acNodes: {},
    satisfiesEdges: [],
  };

  for (const event of events) {
    // ... existing event handlers ...
  }

  return graph;
}
```

- [ ] **Step 4: Verify pass**

```bash
cd packages/core && bun test test/graph/store.test.ts
```

Expected: existing tests still pass + 2 new pass.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/graph/store.ts packages/core/test/graph/store.test.ts
git commit -m "feat(core): extend Graph shape with acNodes + satisfiesEdges"
```

---

### Task 3.2: Materialize `ACNode` entries from `ticket.fetched` events

**Files:**
- Modify: `packages/core/src/graph/store.ts`
- Test: `packages/core/test/graph/store.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
test('materializes ACNode per AC from ticket.fetched event', () => {
  const events: GraphEvent[] = [
    {
      kind: 'ticket.fetched',
      payload: {
        id: 'PROJ-105',
        summary: 'Add tax',
        acceptanceCriteria: ['Sees subtotal', 'Sees discount', 'Sees tax line'],
        fetchedAt: '2026-05-12T10:00:00.000Z',
        storyHash: 'xyz',
        modifiesAreas: ['checkout'],
      },
    },
  ];
  const graph = buildGraph(events);

  expect(Object.keys(graph.acNodes)).toEqual([
    'PROJ-105#ac-0',
    'PROJ-105#ac-1',
    'PROJ-105#ac-2',
  ]);
  expect(graph.acNodes['PROJ-105#ac-2']).toEqual({
    kind: 'AC',
    id: 'PROJ-105#ac-2',
    ticketId: 'PROJ-105',
    index: 2,
    text: 'Sees tax line',
  });
});

test('re-fetching ticket replaces ACNodes (story_hash drift)', () => {
  const events: GraphEvent[] = [
    {
      kind: 'ticket.fetched',
      payload: {
        id: 'PROJ-105',
        summary: 'Add tax',
        acceptanceCriteria: ['Old AC 0', 'Old AC 1', 'Old AC 2'],
        fetchedAt: '2026-05-12T10:00:00.000Z',
        storyHash: 'v1',
        modifiesAreas: ['checkout'],
      },
    },
    {
      kind: 'ticket.fetched',
      payload: {
        id: 'PROJ-105',
        summary: 'Add tax (updated)',
        acceptanceCriteria: ['New AC 0', 'New AC 1'],
        fetchedAt: '2026-05-15T10:00:00.000Z',
        storyHash: 'v2',
        modifiesAreas: ['checkout'],
      },
    },
  ];
  const graph = buildGraph(events);
  expect(Object.keys(graph.acNodes)).toEqual(['PROJ-105#ac-0', 'PROJ-105#ac-1']);
  expect(graph.acNodes['PROJ-105#ac-0']?.text).toBe('New AC 0');
});
```

- [ ] **Step 2: Verify failure**

```bash
cd packages/core && bun test test/graph/store.test.ts
```

Expected: acNodes still empty.

- [ ] **Step 3: Implement AC materialization in `ticket.fetched` handler**

In `buildGraph`'s event-handler loop, locate the `case 'ticket.fetched'` (or equivalent) block. Add ACNode materialization (replacing on re-fetch):

```ts
case 'ticket.fetched': {
  const { id, acceptanceCriteria } = event.payload;
  // ... existing ticket-node materialization ...

  // Remove previous ACNodes for this ticket (story_hash drift handling)
  for (const acId of Object.keys(graph.acNodes)) {
    if (graph.acNodes[acId]?.ticketId === id) {
      delete graph.acNodes[acId];
    }
  }

  // Materialize fresh ACNodes
  acceptanceCriteria.forEach((text, index) => {
    const acId = `${id}#ac-${index}`;
    graph.acNodes[acId] = {
      kind: 'AC',
      id: acId,
      ticketId: id,
      index,
      text,
    };
  });
  break;
}
```

- [ ] **Step 4: Verify pass**

```bash
cd packages/core && bun test test/graph/store.test.ts
```

Expected: existing + 2 new pass.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/graph/store.ts packages/core/test/graph/store.test.ts
git commit -m "feat(core): materialize ACNode entries from ticket.fetched events"
```

---

### Task 3.3: Also drop `satisfies` edges that target removed ACNodes on re-fetch

**Files:**
- Modify: `packages/core/src/graph/store.ts`
- Test: `packages/core/test/graph/store.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
test('re-fetching ticket invalidates satisfies edges targeting removed ACNodes', () => {
  const events: GraphEvent[] = [
    {
      kind: 'ticket.fetched',
      payload: {
        id: 'PROJ-105',
        summary: 'Add tax',
        acceptanceCriteria: ['AC 0', 'AC 1', 'AC 2'],
        fetchedAt: '2026-05-12T10:00:00.000Z',
        storyHash: 'v1',
        modifiesAreas: ['checkout'],
      },
    },
    {
      kind: 'ac-coverage.backfilled',
      payload: {
        ts: '2026-05-12T11:00:00.000Z',
        ticketId: 'PROJ-105',
        mappings: [
          { scenarioId: 'PROJ-105#scenario-0', satisfiesAcs: [0, 2], confidence: 0.9 },
        ],
      },
    },
    // Re-fetch shrinks AC list to 2 items: AC 2 is gone
    {
      kind: 'ticket.fetched',
      payload: {
        id: 'PROJ-105',
        summary: 'Add tax (smaller)',
        acceptanceCriteria: ['AC 0', 'AC 1'],
        fetchedAt: '2026-05-15T10:00:00.000Z',
        storyHash: 'v2',
        modifiesAreas: ['checkout'],
      },
    },
  ];
  const graph = buildGraph(events);
  // Edge targeting PROJ-105#ac-2 must be gone; edge targeting PROJ-105#ac-0 must remain
  const targets = graph.satisfiesEdges.map((e) => e.target);
  expect(targets).toEqual(['PROJ-105#ac-0']);
});
```

- [ ] **Step 2: Verify failure**

```bash
cd packages/core && bun test test/graph/store.test.ts
```

Expected: edge targeting `PROJ-105#ac-2` still present.

- [ ] **Step 3: After AC removal in `ticket.fetched` handler, prune satisfies edges**

Extend the `ticket.fetched` handler in `buildGraph`:

```ts
case 'ticket.fetched': {
  const { id, acceptanceCriteria } = event.payload;
  // ... existing ticket-node materialization ...

  // Remove previous ACNodes for this ticket
  for (const acId of Object.keys(graph.acNodes)) {
    if (graph.acNodes[acId]?.ticketId === id) {
      delete graph.acNodes[acId];
    }
  }

  // Materialize fresh ACNodes (as in Task 3.2)
  acceptanceCriteria.forEach((text, index) => {
    const acId = `${id}#ac-${index}`;
    graph.acNodes[acId] = { kind: 'AC', id: acId, ticketId: id, index, text };
  });

  // Prune satisfies edges that target ACNodes no longer present
  graph.satisfiesEdges = graph.satisfiesEdges.filter(
    (e) => graph.acNodes[e.target] !== undefined,
  );
  break;
}
```

- [ ] **Step 4: Verify pass**

```bash
cd packages/core && bun test test/graph/store.test.ts
```

Expected: all existing + new pass.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/graph/store.ts packages/core/test/graph/store.test.ts
git commit -m "fix(core): prune stale satisfies edges on ticket re-fetch"
```

---

### Task 3.4: Materialize `satisfies` edges from `scenario.generated` events (eager path)

**Files:**
- Modify: `packages/core/src/graph/store.ts`
- Test: `packages/core/test/graph/store.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
test('materializes satisfies edges from scenario.generated.satisfiesAcs', () => {
  const events: GraphEvent[] = [
    {
      kind: 'ticket.fetched',
      payload: {
        id: 'PROJ-105',
        summary: 'Add tax',
        acceptanceCriteria: ['AC 0', 'AC 1', 'AC 2'],
        fetchedAt: '2026-05-12T10:00:00.000Z',
        storyHash: 'v1',
        modifiesAreas: ['checkout'],
      },
    },
    {
      kind: 'scenario.generated',
      payload: {
        ticketId: 'PROJ-105',
        scenarioId: 'PROJ-105#scenario-0',
        name: 'tests AC 0 and 2',
        gherkin: '...',
        priority: 'p1',
        featureHash: 'h1',
        generatedAt: '2026-05-12T11:00:00.000Z',
        satisfiesAcs: [0, 2],
      },
    },
  ];
  const graph = buildGraph(events);
  expect(graph.satisfiesEdges).toHaveLength(2);
  expect(graph.satisfiesEdges[0]).toMatchObject({
    kind: 'satisfies',
    source: 'PROJ-105#scenario-0',
    target: 'PROJ-105#ac-0',
    source_label: 'eager',
    confidence: 1.0,
  });
});

test('no satisfies edges emitted when scenario.generated lacks satisfiesAcs (legacy)', () => {
  const events: GraphEvent[] = [
    {
      kind: 'ticket.fetched',
      payload: {
        id: 'PROJ-101',
        summary: 'Legacy',
        acceptanceCriteria: ['AC 0'],
        fetchedAt: '2026-04-01T10:00:00.000Z',
        storyHash: 'leg',
        modifiesAreas: [],
      },
    },
    {
      kind: 'scenario.generated',
      payload: {
        ticketId: 'PROJ-101',
        scenarioId: 'PROJ-101#scenario-0',
        name: 'legacy',
        gherkin: '...',
        priority: 'p2',
        featureHash: 'h0',
        generatedAt: '2026-04-01T11:00:00.000Z',
        // No satisfiesAcs — legacy event
      },
    },
  ];
  const graph = buildGraph(events);
  expect(graph.satisfiesEdges).toEqual([]);
});
```

- [ ] **Step 2: Verify failure**

```bash
cd packages/core && bun test test/graph/store.test.ts
```

Expected: edges still empty after scenario.generated.

- [ ] **Step 3: Extend `scenario.generated` handler**

In `buildGraph`, locate the `case 'scenario.generated'` block. After the existing scenario-node materialization, add:

```ts
case 'scenario.generated': {
  const { ticketId, scenarioId, generatedAt, satisfiesAcs } = event.payload;
  // ... existing scenario-node materialization ...

  if (satisfiesAcs && satisfiesAcs.length > 0) {
    // Remove any prior eager edges for this scenario (regeneration case)
    graph.satisfiesEdges = graph.satisfiesEdges.filter(
      (e) => !(e.source === scenarioId && e.source_label === 'eager'),
    );

    for (const acIdx of satisfiesAcs) {
      const acId = `${ticketId}#ac-${acIdx}`;
      if (graph.acNodes[acId] === undefined) continue;  // skip unknown ACs
      graph.satisfiesEdges.push({
        kind: 'satisfies',
        source: scenarioId,
        target: acId,
        confidence: 1.0,
        discoveredAt: generatedAt,
        source_label: 'eager',
      });
    }
  }
  break;
}
```

- [ ] **Step 4: Verify pass**

```bash
cd packages/core && bun test test/graph/store.test.ts
```

Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/graph/store.ts packages/core/test/graph/store.test.ts
git commit -m "feat(core): materialize eager satisfies edges from scenario.generated"
```

---

### Task 3.5: Materialize `satisfies` edges from `ac-coverage.backfilled` events (lazy path)

**Files:**
- Modify: `packages/core/src/graph/store.ts`
- Test: `packages/core/test/graph/store.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
test('materializes satisfies edges from ac-coverage.backfilled (lazy)', () => {
  const events: GraphEvent[] = [
    {
      kind: 'ticket.fetched',
      payload: {
        id: 'PROJ-105',
        summary: 'Add tax',
        acceptanceCriteria: ['AC 0', 'AC 1', 'AC 2'],
        fetchedAt: '2026-05-12T10:00:00.000Z',
        storyHash: 'v1',
        modifiesAreas: ['checkout'],
      },
    },
    {
      kind: 'scenario.generated',
      payload: {
        ticketId: 'PROJ-105',
        scenarioId: 'PROJ-105#scenario-0',
        name: 'legacy',
        gherkin: '...',
        priority: 'p1',
        featureHash: 'h1',
        generatedAt: '2026-04-01T11:00:00.000Z',
        // No satisfiesAcs — legacy
      },
    },
    {
      kind: 'ac-coverage.backfilled',
      payload: {
        ts: '2026-05-17T10:00:00.000Z',
        ticketId: 'PROJ-105',
        mappings: [
          { scenarioId: 'PROJ-105#scenario-0', satisfiesAcs: [0, 1], confidence: 0.8 },
        ],
      },
    },
  ];
  const graph = buildGraph(events);
  expect(graph.satisfiesEdges).toHaveLength(2);
  expect(graph.satisfiesEdges[0]?.source_label).toBe('backfill');
  expect(graph.satisfiesEdges[0]?.confidence).toBe(0.8);
});

test('backfill is idempotent (re-running overwrites previous backfill edges)', () => {
  const baseEvents: GraphEvent[] = [
    {
      kind: 'ticket.fetched',
      payload: {
        id: 'PROJ-105', summary: 'x',
        acceptanceCriteria: ['AC 0', 'AC 1', 'AC 2'],
        fetchedAt: '2026-05-12T10:00:00.000Z',
        storyHash: 'v1', modifiesAreas: [],
      },
    },
    {
      kind: 'scenario.generated',
      payload: {
        ticketId: 'PROJ-105', scenarioId: 'PROJ-105#scenario-0',
        name: 'x', gherkin: '...', priority: 'p1',
        featureHash: 'h1', generatedAt: '2026-04-01T11:00:00.000Z',
      },
    },
  ];
  const firstBackfill: GraphEvent = {
    kind: 'ac-coverage.backfilled',
    payload: {
      ts: '2026-05-17T10:00:00.000Z',
      ticketId: 'PROJ-105',
      mappings: [{ scenarioId: 'PROJ-105#scenario-0', satisfiesAcs: [0, 1], confidence: 0.8 }],
    },
  };
  const secondBackfill: GraphEvent = {
    kind: 'ac-coverage.backfilled',
    payload: {
      ts: '2026-05-17T11:00:00.000Z',
      ticketId: 'PROJ-105',
      mappings: [{ scenarioId: 'PROJ-105#scenario-0', satisfiesAcs: [2], confidence: 0.95 }],
    },
  };
  const graph = buildGraph([...baseEvents, firstBackfill, secondBackfill]);
  // First backfill's edges to AC 0 and AC 1 should be removed; only AC 2 from second backfill remains
  expect(graph.satisfiesEdges).toHaveLength(1);
  expect(graph.satisfiesEdges[0]?.target).toBe('PROJ-105#ac-2');
});
```

- [ ] **Step 2: Verify failure**

```bash
cd packages/core && bun test test/graph/store.test.ts
```

Expected: no backfill handler.

- [ ] **Step 3: Implement handler**

Add to `buildGraph`'s event-handler loop:

```ts
case 'ac-coverage.backfilled': {
  const { ts, ticketId, mappings } = event.payload;

  // Remove all prior backfill edges for this ticket (idempotent re-run)
  graph.satisfiesEdges = graph.satisfiesEdges.filter((e) => {
    if (e.source_label !== 'backfill') return true;
    // Edge target id starts with ticketId#ac-
    return !e.target.startsWith(`${ticketId}#ac-`);
  });

  for (const m of mappings) {
    for (const acIdx of m.satisfiesAcs) {
      const acId = `${ticketId}#ac-${acIdx}`;
      if (graph.acNodes[acId] === undefined) continue;
      graph.satisfiesEdges.push({
        kind: 'satisfies',
        source: m.scenarioId,
        target: acId,
        confidence: m.confidence,
        discoveredAt: ts,
        source_label: 'backfill',
      });
    }
  }
  break;
}
```

- [ ] **Step 4: Verify pass**

```bash
cd packages/core && bun test test/graph/store.test.ts
```

Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/graph/store.ts packages/core/test/graph/store.test.ts
git commit -m "feat(core): materialize lazy satisfies edges from ac-coverage.backfilled"
```

---

### Task 3.6: Ignore `coverage.snapshot` events in `buildGraph` (they don't mutate snapshot)

**Files:**
- Modify: `packages/core/src/graph/store.ts`
- Test: `packages/core/test/graph/store.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
test('coverage.snapshot events do not mutate the graph (read-side only)', () => {
  const events: GraphEvent[] = [
    {
      kind: 'coverage.snapshot',
      payload: {
        ts: '2026-05-17T10:00:00.000Z',
        windowDays: 30,
        areas: [{ id: 'checkout', status: 'UNCOVERED', risk: 8,
                  breakdown: { recentTickets: 3, recentBugs: 2, criticalBoost: 2 } }],
        tickets: [],
      },
    },
  ];
  // Should not throw — handler must exist (even if no-op)
  const graph = buildGraph(events);
  expect(graph.tickets).toEqual({});
  expect(graph.satisfiesEdges).toEqual([]);
});
```

- [ ] **Step 2: Verify failure**

```bash
cd packages/core && bun test test/graph/store.test.ts
```

Expected: switch falls through to `default` (or exhaustiveness check fails).

- [ ] **Step 3: Add no-op handler**

In `buildGraph`'s switch:

```ts
case 'coverage.snapshot': {
  // Read-side only — Trend tab queries these events directly from JSONL.
  // Snapshot does not store them; this case exists for switch exhaustiveness.
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
git commit -m "feat(core): no-op handler for coverage.snapshot events in buildGraph"
```

---

## Phase 4 — Coverage engine: status functions

### Task 4.1: `CoverageConfig` type + module skeleton

**Files:**
- Create: `packages/core/src/coverage/types.ts`
- Create: `packages/core/src/coverage/index.ts`
- Test: `packages/core/test/coverage/types.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, test, expect } from 'bun:test';
import type { CoverageConfig } from '../../src/coverage/types';
import { DEFAULT_COVERAGE_CONFIG } from '../../src/coverage/types';

describe('CoverageConfig', () => {
  test('defaults: staleAfterDays=30, criticalAreas=[], autoSnapshotOnCoverage=true', () => {
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

- [ ] **Step 3: Implement skeleton**

Create `packages/core/src/coverage/types.ts`:

```ts
export type CoverageConfig = {
  staleAfterDays: number;
  criticalAreas: string[];
  autoSnapshotOnCoverage: boolean;
};

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

### Task 4.2: `computeScenarioStatus` helper

**Files:**
- Create: `packages/core/src/coverage/status.ts`
- Test: `packages/core/test/coverage/status.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, test, expect } from 'bun:test';
import { computeScenarioStatus } from '../../src/coverage/status';
import type { Graph } from '../../src/graph/store';

const emptyGraph = (): Graph => ({
  tickets: {}, scenarios: {}, poms: {}, areas: {},
  ticketEdges: [], scenarioPomEdges: [], pomAreaEdges: [],
  ticketAreaEdges: [], jiraLinkEdges: [], similarEdges: [],
  failureEdges: [], latestFailures: {},
  acNodes: {}, satisfiesEdges: [],
});

describe('computeScenarioStatus', () => {
  const now = new Date('2026-05-17T10:00:00.000Z');

  test('NOT_PASSING when no run history', () => {
    const graph = emptyGraph();
    expect(computeScenarioStatus('PROJ-1#scenario-0', graph, 30, now))
      .toBe('NOT_PASSING');
  });

  test('PASSING when latest run is PASS within windowDays and no bad classification', () => {
    const graph = emptyGraph();
    graph.latestFailures['PROJ-1#scenario-0'] = {
      kind: 'Failure', scenarioId: 'PROJ-1#scenario-0',
      runId: 'r1', ts: '2026-05-15T10:00:00.000Z',
      latestStatus: 'pass', latestClassification: 'PASS',
    };
    expect(computeScenarioStatus('PROJ-1#scenario-0', graph, 30, now))
      .toBe('PASSING');
  });

  test('NOT_PASSING when latest run is PASS but stale (>windowDays old)', () => {
    const graph = emptyGraph();
    graph.latestFailures['PROJ-1#scenario-0'] = {
      kind: 'Failure', scenarioId: 'PROJ-1#scenario-0',
      runId: 'r1', ts: '2026-03-01T10:00:00.000Z',
      latestStatus: 'pass', latestClassification: 'PASS',
    };
    expect(computeScenarioStatus('PROJ-1#scenario-0', graph, 30, now))
      .toBe('NOT_PASSING');
  });

  test('NOT_PASSING when outstanding REAL_BUG classification', () => {
    const graph = emptyGraph();
    graph.latestFailures['PROJ-1#scenario-0'] = {
      kind: 'Failure', scenarioId: 'PROJ-1#scenario-0',
      runId: 'r1', ts: '2026-05-15T10:00:00.000Z',
      latestStatus: 'fail', latestClassification: 'REAL_BUG',
    };
    expect(computeScenarioStatus('PROJ-1#scenario-0', graph, 30, now))
      .toBe('NOT_PASSING');
  });
});
```

Note: this test assumes a `latestFailures` map shape with `latestStatus` + `latestClassification` fields. If the existing v0.6 shape is different, adjust the test to the real shape — but the function must read whatever signal indicates last-PASS recency and classification.

- [ ] **Step 2: Verify failure**

```bash
cd packages/core && bun test test/coverage/status.test.ts
```

Expected: module not found.

- [ ] **Step 3: Implement**

Create `packages/core/src/coverage/status.ts`:

```ts
import type { Graph } from '../graph/store';

export type ScenarioStatus = 'PASSING' | 'NOT_PASSING';

const BAD_CLASSIFICATIONS = new Set([
  'REAL_BUG', 'SELECTOR_DRIFT', 'TEST_OUTDATED',
]);

function daysBetween(a: Date, b: Date): number {
  return Math.abs(a.getTime() - b.getTime()) / (1000 * 60 * 60 * 24);
}

export function computeScenarioStatus(
  scenarioId: string,
  graph: Graph,
  windowDays: number,
  now: Date,
): ScenarioStatus {
  const latest = graph.latestFailures[scenarioId];
  if (!latest) return 'NOT_PASSING';
  if (latest.latestClassification && BAD_CLASSIFICATIONS.has(latest.latestClassification)) {
    return 'NOT_PASSING';
  }
  if (latest.latestStatus !== 'pass') return 'NOT_PASSING';
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
git commit -m "feat(core): add computeScenarioStatus helper"
```

---

### Task 4.3: `computeAreaStatus`

**Files:**
- Modify: `packages/core/src/coverage/status.ts`
- Test: `packages/core/test/coverage/status.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { computeAreaStatus } from '../../src/coverage/status';

describe('computeAreaStatus', () => {
  const now = new Date('2026-05-17T10:00:00.000Z');

  test('UNCOVERED when no POM covers the area', () => {
    const graph = emptyGraph();
    graph.areas['checkout'] = { kind: 'Area', id: 'checkout' };
    expect(computeAreaStatus('checkout', graph, 30, now)).toBe('UNCOVERED');
  });

  test('STALE when POM exists but no PASSING scenario in window', () => {
    const graph = emptyGraph();
    graph.areas['checkout'] = { kind: 'Area', id: 'checkout' };
    graph.poms['CheckoutPage'] = {
      kind: 'POM', id: 'CheckoutPage', ticketId: 'PROJ-1',
      filePath: 'pages/CheckoutPage.ts', route: '/checkout',
      locators: [], scope: 'local',
    };
    graph.scenarios['PROJ-1#scenario-0'] = {
      kind: 'Scenario', id: 'PROJ-1#scenario-0', ticketId: 'PROJ-1',
      name: 's', gherkin: '...', priority: 'p1', featureHash: 'h',
      generatedAt: '2026-05-01T10:00:00.000Z',
    };
    graph.pomAreaEdges.push({
      kind: 'covers', source: 'CheckoutPage', target: 'checkout',
      discoveredAt: '2026-05-01T10:00:00.000Z', source_label: 'extract',
    });
    graph.scenarioPomEdges.push({
      kind: 'uses', source: 'PROJ-1#scenario-0', target: 'CheckoutPage',
      discoveredAt: '2026-05-01T10:00:00.000Z', source_label: 'extract',
    });
    // No latestFailures → scenario is NOT_PASSING → area is STALE
    expect(computeAreaStatus('checkout', graph, 30, now)).toBe('STALE');
  });

  test('COVERED when ≥1 scenario in area is PASSING', () => {
    const graph = emptyGraph();
    graph.areas['checkout'] = { kind: 'Area', id: 'checkout' };
    graph.poms['CheckoutPage'] = {
      kind: 'POM', id: 'CheckoutPage', ticketId: 'PROJ-1',
      filePath: 'p.ts', route: '/checkout', locators: [], scope: 'local',
    };
    graph.scenarios['PROJ-1#scenario-0'] = {
      kind: 'Scenario', id: 'PROJ-1#scenario-0', ticketId: 'PROJ-1',
      name: 's', gherkin: '...', priority: 'p1', featureHash: 'h',
      generatedAt: '2026-05-01T10:00:00.000Z',
    };
    graph.pomAreaEdges.push({
      kind: 'covers', source: 'CheckoutPage', target: 'checkout',
      discoveredAt: '2026-05-01T10:00:00.000Z', source_label: 'extract',
    });
    graph.scenarioPomEdges.push({
      kind: 'uses', source: 'PROJ-1#scenario-0', target: 'CheckoutPage',
      discoveredAt: '2026-05-01T10:00:00.000Z', source_label: 'extract',
    });
    graph.latestFailures['PROJ-1#scenario-0'] = {
      kind: 'Failure', scenarioId: 'PROJ-1#scenario-0',
      runId: 'r1', ts: '2026-05-15T10:00:00.000Z',
      latestStatus: 'pass', latestClassification: 'PASS',
    };
    expect(computeAreaStatus('checkout', graph, 30, now)).toBe('COVERED');
  });
});
```

- [ ] **Step 2: Verify failure**

```bash
cd packages/core && bun test test/coverage/status.test.ts
```

- [ ] **Step 3: Implement**

Add to `packages/core/src/coverage/status.ts`:

```ts
export type AreaStatus = 'UNCOVERED' | 'STALE' | 'COVERED';

export function computeAreaStatus(
  areaId: string,
  graph: Graph,
  windowDays: number,
  now: Date,
): AreaStatus {
  const coveringPoms = graph.pomAreaEdges
    .filter((e) => e.target === areaId)
    .map((e) => e.source);
  if (coveringPoms.length === 0) return 'UNCOVERED';

  const scenariosInArea = graph.scenarioPomEdges
    .filter((e) => coveringPoms.includes(e.target))
    .map((e) => e.source);

  const anyPassing = scenariosInArea.some(
    (sid) => computeScenarioStatus(sid, graph, windowDays, now) === 'PASSING',
  );
  return anyPassing ? 'COVERED' : 'STALE';
}
```

- [ ] **Step 4: Verify pass**

```bash
cd packages/core && bun test test/coverage/status.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/coverage/status.ts packages/core/test/coverage/status.test.ts
git commit -m "feat(core): add computeAreaStatus (UNCOVERED/STALE/COVERED)"
```

---

### Task 4.4: `computeAcStatus` + `computeTicketStatus`

**Files:**
- Modify: `packages/core/src/coverage/status.ts`
- Test: `packages/core/test/coverage/status.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { computeAcStatus, computeTicketStatus } from '../../src/coverage/status';

describe('computeAcStatus + computeTicketStatus', () => {
  const now = new Date('2026-05-17T10:00:00.000Z');

  test('AC UNSATISFIED when no satisfies edges', () => {
    const graph = emptyGraph();
    graph.acNodes['PROJ-1#ac-0'] = {
      kind: 'AC', id: 'PROJ-1#ac-0', ticketId: 'PROJ-1', index: 0, text: 'x',
    };
    expect(computeAcStatus('PROJ-1#ac-0', graph, 30, now)).toBe('UNSATISFIED');
  });

  test('AC SATISFIED when ≥1 satisfying scenario is PASSING', () => {
    const graph = emptyGraph();
    graph.acNodes['PROJ-1#ac-0'] = {
      kind: 'AC', id: 'PROJ-1#ac-0', ticketId: 'PROJ-1', index: 0, text: 'x',
    };
    graph.satisfiesEdges.push({
      kind: 'satisfies', source: 'PROJ-1#scenario-0', target: 'PROJ-1#ac-0',
      confidence: 1.0, discoveredAt: '2026-05-01T10:00:00.000Z', source_label: 'eager',
    });
    graph.latestFailures['PROJ-1#scenario-0'] = {
      kind: 'Failure', scenarioId: 'PROJ-1#scenario-0',
      runId: 'r1', ts: '2026-05-15T10:00:00.000Z',
      latestStatus: 'pass', latestClassification: 'PASS',
    };
    expect(computeAcStatus('PROJ-1#ac-0', graph, 30, now)).toBe('SATISFIED');
  });

  test('AC UNSATISFIED when satisfying scenario is NOT_PASSING (stale)', () => {
    const graph = emptyGraph();
    graph.acNodes['PROJ-1#ac-0'] = {
      kind: 'AC', id: 'PROJ-1#ac-0', ticketId: 'PROJ-1', index: 0, text: 'x',
    };
    graph.satisfiesEdges.push({
      kind: 'satisfies', source: 'PROJ-1#scenario-0', target: 'PROJ-1#ac-0',
      confidence: 1.0, discoveredAt: '2026-05-01T10:00:00.000Z', source_label: 'eager',
    });
    graph.latestFailures['PROJ-1#scenario-0'] = {
      kind: 'Failure', scenarioId: 'PROJ-1#scenario-0',
      runId: 'r1', ts: '2026-03-01T10:00:00.000Z',
      latestStatus: 'pass', latestClassification: 'PASS',
    };
    expect(computeAcStatus('PROJ-1#ac-0', graph, 30, now)).toBe('UNSATISFIED');
  });

  test('Ticket COMPLETE when all ACs SATISFIED', () => {
    const graph = emptyGraph();
    graph.tickets['PROJ-1'] = {
      kind: 'Ticket', id: 'PROJ-1', summary: 's',
      acceptanceCriteria: ['x'],
      storyHash: 'h', modifiesAreas: [],
      fetchedAt: '2026-05-01T10:00:00.000Z',
    };
    graph.acNodes['PROJ-1#ac-0'] = {
      kind: 'AC', id: 'PROJ-1#ac-0', ticketId: 'PROJ-1', index: 0, text: 'x',
    };
    graph.satisfiesEdges.push({
      kind: 'satisfies', source: 'PROJ-1#scenario-0', target: 'PROJ-1#ac-0',
      confidence: 1.0, discoveredAt: '2026-05-01T10:00:00.000Z', source_label: 'eager',
    });
    graph.latestFailures['PROJ-1#scenario-0'] = {
      kind: 'Failure', scenarioId: 'PROJ-1#scenario-0',
      runId: 'r1', ts: '2026-05-15T10:00:00.000Z',
      latestStatus: 'pass', latestClassification: 'PASS',
    };
    expect(computeTicketStatus('PROJ-1', graph, 30, now)).toBe('COMPLETE');
  });

  test('Ticket INCOMPLETE when ≥1 AC UNSATISFIED', () => {
    const graph = emptyGraph();
    graph.tickets['PROJ-1'] = {
      kind: 'Ticket', id: 'PROJ-1', summary: 's',
      acceptanceCriteria: ['x', 'y'],
      storyHash: 'h', modifiesAreas: [],
      fetchedAt: '2026-05-01T10:00:00.000Z',
    };
    graph.acNodes['PROJ-1#ac-0'] = {
      kind: 'AC', id: 'PROJ-1#ac-0', ticketId: 'PROJ-1', index: 0, text: 'x',
    };
    graph.acNodes['PROJ-1#ac-1'] = {
      kind: 'AC', id: 'PROJ-1#ac-1', ticketId: 'PROJ-1', index: 1, text: 'y',
    };
    // No satisfies edges at all
    expect(computeTicketStatus('PROJ-1', graph, 30, now)).toBe('INCOMPLETE');
  });

  test('Ticket COMPLETE vacuously when no ACs', () => {
    const graph = emptyGraph();
    graph.tickets['PROJ-1'] = {
      kind: 'Ticket', id: 'PROJ-1', summary: 's',
      acceptanceCriteria: [],
      storyHash: 'h', modifiesAreas: [],
      fetchedAt: '2026-05-01T10:00:00.000Z',
    };
    expect(computeTicketStatus('PROJ-1', graph, 30, now)).toBe('COMPLETE');
  });
});
```

- [ ] **Step 2: Verify failure**

```bash
cd packages/core && bun test test/coverage/status.test.ts
```

- [ ] **Step 3: Implement**

Add to `packages/core/src/coverage/status.ts`:

```ts
export type AcStatus = 'SATISFIED' | 'UNSATISFIED';
export type TicketStatus = 'COMPLETE' | 'INCOMPLETE';

export function computeAcStatus(
  acId: string,
  graph: Graph,
  windowDays: number,
  now: Date,
): AcStatus {
  const edges = graph.satisfiesEdges.filter((e) => e.target === acId);
  if (edges.length === 0) return 'UNSATISFIED';
  const anyPassing = edges.some(
    (e) => computeScenarioStatus(e.source, graph, windowDays, now) === 'PASSING',
  );
  return anyPassing ? 'SATISFIED' : 'UNSATISFIED';
}

export function computeTicketStatus(
  ticketId: string,
  graph: Graph,
  windowDays: number,
  now: Date,
): TicketStatus {
  const acIds = Object.values(graph.acNodes)
    .filter((ac) => ac.ticketId === ticketId)
    .map((ac) => ac.id);
  if (acIds.length === 0) return 'COMPLETE';
  const allSatisfied = acIds.every(
    (acId) => computeAcStatus(acId, graph, windowDays, now) === 'SATISFIED',
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
git commit -m "feat(core): add computeAcStatus + computeTicketStatus"
```

---

## Phase 5 — Coverage engine: risk + gap score

### Task 5.1: `computeAreaRisk` + `RISK_WEIGHTS` constants

**Files:**
- Create: `packages/core/src/coverage/risk.ts`
- Test: `packages/core/test/coverage/risk.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, test, expect } from 'bun:test';
import { computeAreaRisk, RISK_WEIGHTS } from '../../src/coverage/risk';
import type { Graph } from '../../src/graph/store';
import type { CoverageConfig } from '../../src/coverage/types';

const emptyGraph = (): Graph => ({
  tickets: {}, scenarios: {}, poms: {}, areas: {},
  ticketEdges: [], scenarioPomEdges: [], pomAreaEdges: [],
  ticketAreaEdges: [], jiraLinkEdges: [], similarEdges: [],
  failureEdges: [], latestFailures: {},
  acNodes: {}, satisfiesEdges: [],
  classificationEvents: [],   // see note below
});

const cfg = (overrides?: Partial<CoverageConfig>): CoverageConfig => ({
  staleAfterDays: 30, criticalAreas: [], autoSnapshotOnCoverage: true,
  ...overrides,
});

describe('computeAreaRisk', () => {
  const now = new Date('2026-05-17T10:00:00.000Z');

  test('zero when no tickets, no bugs', () => {
    const graph = emptyGraph();
    graph.areas['x'] = { kind: 'Area', id: 'x' };
    expect(computeAreaRisk('x', graph, cfg(), now)).toBe(0);
  });

  test('counts recent_tickets within windowDays', () => {
    const graph = emptyGraph();
    graph.areas['checkout'] = { kind: 'Area', id: 'checkout' };
    graph.tickets['PROJ-1'] = {
      kind: 'Ticket', id: 'PROJ-1', summary: 's',
      acceptanceCriteria: [], storyHash: 'h',
      modifiesAreas: ['checkout'],
      fetchedAt: '2026-05-15T10:00:00.000Z',  // 2d ago
    };
    graph.tickets['PROJ-2'] = {
      kind: 'Ticket', id: 'PROJ-2', summary: 's',
      acceptanceCriteria: [], storyHash: 'h',
      modifiesAreas: ['checkout'],
      fetchedAt: '2026-03-01T10:00:00.000Z',  // 77d ago — outside window
    };
    graph.ticketAreaEdges.push(
      { kind: 'modifies', source: 'PROJ-1', target: 'checkout',
        discoveredAt: '2026-05-15T10:00:00.000Z', source_label: 'extract' },
      { kind: 'modifies', source: 'PROJ-2', target: 'checkout',
        discoveredAt: '2026-03-01T10:00:00.000Z', source_label: 'extract' },
    );
    expect(computeAreaRisk('checkout', graph, cfg(), now)).toBe(1);
  });

  test('critical boost = ×2 multiplier on recent_tickets', () => {
    const graph = emptyGraph();
    graph.areas['checkout'] = { kind: 'Area', id: 'checkout' };
    graph.tickets['PROJ-1'] = {
      kind: 'Ticket', id: 'PROJ-1', summary: 's',
      acceptanceCriteria: [], storyHash: 'h', modifiesAreas: ['checkout'],
      fetchedAt: '2026-05-15T10:00:00.000Z',
    };
    graph.ticketAreaEdges.push({
      kind: 'modifies', source: 'PROJ-1', target: 'checkout',
      discoveredAt: '2026-05-15T10:00:00.000Z', source_label: 'extract',
    });
    expect(computeAreaRisk('checkout', graph, cfg({ criticalAreas: ['checkout'] }), now))
      .toBe(2);
  });

  test('adds recent_bugs (REAL_BUG + TEST_OUTDATED only)', () => {
    const graph = emptyGraph();
    graph.areas['checkout'] = { kind: 'Area', id: 'checkout' };
    graph.poms['CheckoutPage'] = {
      kind: 'POM', id: 'CheckoutPage', ticketId: 'PROJ-1',
      filePath: 'p.ts', route: '/checkout', locators: [], scope: 'local',
    };
    graph.scenarios['PROJ-1#scenario-0'] = {
      kind: 'Scenario', id: 'PROJ-1#scenario-0', ticketId: 'PROJ-1',
      name: 's', gherkin: '...', priority: 'p1', featureHash: 'h',
      generatedAt: '2026-05-01T10:00:00.000Z',
    };
    graph.pomAreaEdges.push({
      kind: 'covers', source: 'CheckoutPage', target: 'checkout',
      discoveredAt: '2026-05-01T10:00:00.000Z', source_label: 'extract',
    });
    graph.scenarioPomEdges.push({
      kind: 'uses', source: 'PROJ-1#scenario-0', target: 'CheckoutPage',
      discoveredAt: '2026-05-01T10:00:00.000Z', source_label: 'extract',
    });
    graph.classificationEvents.push(
      { scenarioId: 'PROJ-1#scenario-0', classification: 'REAL_BUG',
        ts: '2026-05-15T10:00:00.000Z' },
      { scenarioId: 'PROJ-1#scenario-0', classification: 'TEST_OUTDATED',
        ts: '2026-05-10T10:00:00.000Z' },
      { scenarioId: 'PROJ-1#scenario-0', classification: 'SELECTOR_DRIFT',
        ts: '2026-05-12T10:00:00.000Z' },  // not counted
      { scenarioId: 'PROJ-1#scenario-0', classification: 'REAL_BUG',
        ts: '2026-03-01T10:00:00.000Z' },  // outside window
    );
    // No tickets in window → base 0. Only bugs in window count.
    expect(computeAreaRisk('checkout', graph, cfg(), now)).toBe(2);
  });

  test('worked example: checkout 3 tickets × 2 + 2 bugs = 8', () => {
    const graph = emptyGraph();
    graph.areas['checkout'] = { kind: 'Area', id: 'checkout' };
    graph.poms['CheckoutPage'] = {
      kind: 'POM', id: 'CheckoutPage', ticketId: 'PROJ-101',
      filePath: 'p.ts', route: '/checkout', locators: [], scope: 'local',
    };
    graph.scenarios['PROJ-101#scenario-0'] = {
      kind: 'Scenario', id: 'PROJ-101#scenario-0', ticketId: 'PROJ-101',
      name: 's', gherkin: '...', priority: 'p1', featureHash: 'h',
      generatedAt: '2026-05-01T10:00:00.000Z',
    };
    graph.pomAreaEdges.push({
      kind: 'covers', source: 'CheckoutPage', target: 'checkout',
      discoveredAt: '2026-05-01T10:00:00.000Z', source_label: 'extract',
    });
    graph.scenarioPomEdges.push({
      kind: 'uses', source: 'PROJ-101#scenario-0', target: 'CheckoutPage',
      discoveredAt: '2026-05-01T10:00:00.000Z', source_label: 'extract',
    });
    for (const [id, fetchedAt] of [
      ['PROJ-101', '2026-05-15T10:00:00.000Z'],
      ['PROJ-102', '2026-05-10T10:00:00.000Z'],
      ['PROJ-103', '2026-04-20T10:00:00.000Z'],
    ] as const) {
      graph.tickets[id] = {
        kind: 'Ticket', id, summary: 's', acceptanceCriteria: [],
        storyHash: 'h', modifiesAreas: ['checkout'], fetchedAt,
      };
      graph.ticketAreaEdges.push({
        kind: 'modifies', source: id, target: 'checkout',
        discoveredAt: fetchedAt, source_label: 'extract',
      });
    }
    graph.classificationEvents.push(
      { scenarioId: 'PROJ-101#scenario-0', classification: 'REAL_BUG',
        ts: '2026-05-14T10:00:00.000Z' },
      { scenarioId: 'PROJ-101#scenario-0', classification: 'TEST_OUTDATED',
        ts: '2026-05-09T10:00:00.000Z' },
    );
    const result = computeAreaRisk(
      'checkout', graph, cfg({ criticalAreas: ['checkout'] }), now,
    );
    expect(result).toBe(8);
  });

  test('RISK_WEIGHTS exports stable constants', () => {
    expect(RISK_WEIGHTS.criticalBoost).toBe(2);
    expect(RISK_WEIGHTS.bugClassifications.has('REAL_BUG')).toBe(true);
    expect(RISK_WEIGHTS.bugClassifications.has('TEST_OUTDATED')).toBe(true);
    expect(RISK_WEIGHTS.bugClassifications.has('SELECTOR_DRIFT')).toBe(false);
  });
});
```

Note: this test assumes the Graph type carries a `classificationEvents` array (a flat list of `{ scenarioId, classification, ts }` projected from `run.classified` events at snapshot rebuild time). If v0.6 store doesn't already expose this projection, add a small sub-task to extend `buildGraph` to track it before implementing `computeAreaRisk`.

- [ ] **Step 2: Verify failure**

```bash
cd packages/core && bun test test/coverage/risk.test.ts
```

Expected: module not found.

- [ ] **Step 3: Implement (extend store first if classificationEvents missing)**

First, if `Graph` lacks `classificationEvents`, extend it minimally in `store.ts`:

```ts
// In Graph type:
classificationEvents: Array<{ scenarioId: string; classification: string; ts: string }>;

// In buildGraph initializer:
const graph: Graph = { /* ... */, classificationEvents: [] };

// In switch on 'run.classified' handler — append to classificationEvents
case 'run.classified': {
  const { scenarioId, classification, ts } = event.payload; // verify field name
  graph.classificationEvents.push({ scenarioId, classification, ts });
  // ... existing handler logic ...
  break;
}
```

Then create `packages/core/src/coverage/risk.ts`:

```ts
import type { Graph } from '../graph/store';
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
  graph: Graph,
  config: CoverageConfig,
  now: Date,
): number {
  // recent_tickets: count tickets modifying area, fetched within windowDays
  const recentTickets = graph.ticketAreaEdges
    .filter((e) => e.target === areaId)
    .map((e) => graph.tickets[e.source])
    .filter((t): t is NonNullable<typeof t> => t !== undefined)
    .filter((t) => daysBetween(now, new Date(t.fetchedAt)) <= config.staleAfterDays)
    .length;

  // recent_bugs: count REAL_BUG + TEST_OUTDATED events on scenarios in this area, within windowDays
  const pomsInArea = graph.pomAreaEdges
    .filter((e) => e.target === areaId)
    .map((e) => e.source);
  const scenariosInArea = new Set(
    graph.scenarioPomEdges
      .filter((e) => pomsInArea.includes(e.target))
      .map((e) => e.source),
  );
  const recentBugs = graph.classificationEvents
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
git add packages/core/src/coverage/risk.ts packages/core/src/graph/store.ts packages/core/test/coverage/risk.test.ts packages/core/test/graph/store.test.ts
git commit -m "feat(core): add computeAreaRisk + classificationEvents projection"
```

---

### Task 5.2: `computeAcGapScore`

**Files:**
- Modify: `packages/core/src/coverage/risk.ts`
- Test: `packages/core/test/coverage/risk.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { computeAcGapScore } from '../../src/coverage/risk';

describe('computeAcGapScore', () => {
  const now = new Date('2026-05-17T10:00:00.000Z');

  test('zero when ticket has no unsatisfied ACs', () => {
    const graph = emptyGraph();
    graph.tickets['PROJ-1'] = {
      kind: 'Ticket', id: 'PROJ-1', summary: 's',
      acceptanceCriteria: [],
      storyHash: 'h', modifiesAreas: [],
      fetchedAt: '2026-05-15T10:00:00.000Z',
    };
    expect(computeAcGapScore('PROJ-1', graph, cfg(), now)).toBe(0);
  });

  test('recency boost ×2.0 when fetched ≤ 7d ago', () => {
    const graph = emptyGraph();
    graph.tickets['PROJ-1'] = {
      kind: 'Ticket', id: 'PROJ-1', summary: 's',
      acceptanceCriteria: ['a', 'b'],
      storyHash: 'h', modifiesAreas: [],
      fetchedAt: '2026-05-15T10:00:00.000Z',  // 2d ago
    };
    graph.acNodes['PROJ-1#ac-0'] = {
      kind: 'AC', id: 'PROJ-1#ac-0', ticketId: 'PROJ-1', index: 0, text: 'a',
    };
    graph.acNodes['PROJ-1#ac-1'] = {
      kind: 'AC', id: 'PROJ-1#ac-1', ticketId: 'PROJ-1', index: 1, text: 'b',
    };
    // 2 unsatisfied × 2.0 = 4
    expect(computeAcGapScore('PROJ-1', graph, cfg(), now)).toBe(4);
  });

  test('recency boost ×1.0 when fetched 8-30d ago', () => {
    const graph = emptyGraph();
    graph.tickets['PROJ-1'] = {
      kind: 'Ticket', id: 'PROJ-1', summary: 's',
      acceptanceCriteria: ['a'],
      storyHash: 'h', modifiesAreas: [],
      fetchedAt: '2026-05-01T10:00:00.000Z',  // 16d ago
    };
    graph.acNodes['PROJ-1#ac-0'] = {
      kind: 'AC', id: 'PROJ-1#ac-0', ticketId: 'PROJ-1', index: 0, text: 'a',
    };
    expect(computeAcGapScore('PROJ-1', graph, cfg(), now)).toBe(1);
  });

  test('recency boost ×0.5 when fetched > 30d ago', () => {
    const graph = emptyGraph();
    graph.tickets['PROJ-1'] = {
      kind: 'Ticket', id: 'PROJ-1', summary: 's',
      acceptanceCriteria: ['a', 'b'],
      storyHash: 'h', modifiesAreas: [],
      fetchedAt: '2026-02-01T10:00:00.000Z',  // 105d ago
    };
    graph.acNodes['PROJ-1#ac-0'] = {
      kind: 'AC', id: 'PROJ-1#ac-0', ticketId: 'PROJ-1', index: 0, text: 'a',
    };
    graph.acNodes['PROJ-1#ac-1'] = {
      kind: 'AC', id: 'PROJ-1#ac-1', ticketId: 'PROJ-1', index: 1, text: 'b',
    };
    // 2 unsatisfied × 0.5 = 1
    expect(computeAcGapScore('PROJ-1', graph, cfg(), now)).toBe(1);
  });
});
```

- [ ] **Step 2: Verify failure**

```bash
cd packages/core && bun test test/coverage/risk.test.ts
```

- [ ] **Step 3: Implement**

Add to `packages/core/src/coverage/risk.ts`:

```ts
import { computeAcStatus } from './status';

export function computeAcGapScore(
  ticketId: string,
  graph: Graph,
  config: CoverageConfig,
  now: Date,
): number {
  const ticket = graph.tickets[ticketId];
  if (!ticket) return 0;

  const acs = Object.values(graph.acNodes).filter((ac) => ac.ticketId === ticketId);
  const unsatisfied = acs.filter(
    (ac) => computeAcStatus(ac.id, graph, config.staleAfterDays, now) === 'UNSATISFIED',
  ).length;
  if (unsatisfied === 0) return 0;

  const days = daysBetween(now, new Date(ticket.fetchedAt));
  let boost: number;
  if (days <= RISK_WEIGHTS.recencyThresholdDays) {
    boost = RISK_WEIGHTS.recencyBoosts.recent;
  } else if (days <= config.staleAfterDays) {
    boost = RISK_WEIGHTS.recencyBoosts.withinWindow;
  } else {
    boost = RISK_WEIGHTS.recencyBoosts.older;
  }
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

## Phase 6 — Coverage engine: report builders

### Task 6.1: `buildCoverageReport` (JSON shape)

**Files:**
- Create: `packages/core/src/coverage/report.ts`
- Test: `packages/core/test/coverage/report.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, test, expect } from 'bun:test';
import { buildCoverageReport } from '../../src/coverage/report';
import type { CoverageReport } from '../../src/coverage/report';
import { DEFAULT_COVERAGE_CONFIG } from '../../src/coverage/types';
// Reuse emptyGraph() helper — import or redefine
import type { Graph } from '../../src/graph/store';

const emptyGraph = (): Graph => ({
  tickets: {}, scenarios: {}, poms: {}, areas: {},
  ticketEdges: [], scenarioPomEdges: [], pomAreaEdges: [],
  ticketAreaEdges: [], jiraLinkEdges: [], similarEdges: [],
  failureEdges: [], latestFailures: {},
  acNodes: {}, satisfiesEdges: [], classificationEvents: [],
});

describe('buildCoverageReport', () => {
  const now = new Date('2026-05-17T10:00:00.000Z');

  test('empty graph → empty report with metadata', () => {
    const graph = emptyGraph();
    const report = buildCoverageReport(graph, DEFAULT_COVERAGE_CONFIG, now);
    expect(report.generatedAt).toBe('2026-05-17T10:00:00.000Z');
    expect(report.windowDays).toBe(30);
    expect(report.areas).toEqual([]);
    expect(report.tickets).toEqual([]);
    expect(report.acBackfillNeeded).toBe(false);
  });

  test('sorts UNCOVERED then STALE by risk desc; COVERED last', () => {
    const graph = emptyGraph();
    graph.areas['admin'] = { kind: 'Area', id: 'admin' };
    graph.areas['profile'] = { kind: 'Area', id: 'profile' };
    graph.areas['checkout'] = { kind: 'Area', id: 'checkout' };
    graph.tickets['PROJ-101'] = {
      kind: 'Ticket', id: 'PROJ-101', summary: 's',
      acceptanceCriteria: [], storyHash: 'h',
      modifiesAreas: ['checkout'], fetchedAt: '2026-05-15T10:00:00.000Z',
    };
    graph.tickets['PROJ-102'] = {
      kind: 'Ticket', id: 'PROJ-102', summary: 's',
      acceptanceCriteria: [], storyHash: 'h',
      modifiesAreas: ['profile'], fetchedAt: '2026-05-12T10:00:00.000Z',
    };
    graph.ticketAreaEdges.push(
      { kind: 'modifies', source: 'PROJ-101', target: 'checkout',
        discoveredAt: '2026-05-15T10:00:00.000Z', source_label: 'extract' },
      { kind: 'modifies', source: 'PROJ-102', target: 'profile',
        discoveredAt: '2026-05-12T10:00:00.000Z', source_label: 'extract' },
    );
    const report = buildCoverageReport(graph, DEFAULT_COVERAGE_CONFIG, now);
    // checkout: risk 1, profile: risk 1, admin: risk 0 — all UNCOVERED
    expect(report.areas.map((a) => a.id)).toEqual(['checkout', 'profile', 'admin']);
    expect(report.areas[0]?.status).toBe('UNCOVERED');
  });

  test('flags acBackfillNeeded when legacy scenarios exist without satisfies edges', () => {
    const graph = emptyGraph();
    graph.tickets['PROJ-1'] = {
      kind: 'Ticket', id: 'PROJ-1', summary: 's',
      acceptanceCriteria: ['x', 'y'],
      storyHash: 'h', modifiesAreas: [],
      fetchedAt: '2026-05-01T10:00:00.000Z',
    };
    graph.acNodes['PROJ-1#ac-0'] = {
      kind: 'AC', id: 'PROJ-1#ac-0', ticketId: 'PROJ-1', index: 0, text: 'x',
    };
    graph.acNodes['PROJ-1#ac-1'] = {
      kind: 'AC', id: 'PROJ-1#ac-1', ticketId: 'PROJ-1', index: 1, text: 'y',
    };
    graph.scenarios['PROJ-1#scenario-0'] = {
      kind: 'Scenario', id: 'PROJ-1#scenario-0', ticketId: 'PROJ-1',
      name: 's', gherkin: '...', priority: 'p1', featureHash: 'h',
      generatedAt: '2026-04-01T11:00:00.000Z',
    };
    // No satisfies edges → backfill needed
    const report = buildCoverageReport(graph, DEFAULT_COVERAGE_CONFIG, now);
    expect(report.acBackfillNeeded).toBe(true);
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
import type { Graph } from '../graph/store';
import type { CoverageConfig } from './types';
import {
  computeAreaStatus, computeAcStatus, computeTicketStatus,
  type AreaStatus,
} from './status';
import { computeAreaRisk, computeAcGapScore } from './risk';

export type AreaReportRow = {
  id: string;
  status: AreaStatus;
  risk: number;
  breakdown: {
    recentTickets: number;
    recentBugs: number;
    criticalBoost: 1 | 2;
  };
  // For STALE/COVERED:
  lastPassAgo?: number | undefined;          // days since most recent PASS
  outstandingClassifications?: string[];     // e.g. ['REAL_BUG']
};

export type TicketReportRow = {
  id: string;
  summary: string;
  acCount: number;
  satisfiedCount: number;
  gapScore: number;
  unsatisfiedAcs: Array<{ index: number; text: string }>;
};

export type CoverageReport = {
  generatedAt: string;          // ISO8601
  windowDays: number;
  areas: AreaReportRow[];
  tickets: TicketReportRow[];   // INCOMPLETE tickets only
  acBackfillNeeded: boolean;
};

const STATUS_RANK: Record<AreaStatus, number> = {
  UNCOVERED: 0, STALE: 1, COVERED: 2,
};

export function buildCoverageReport(
  graph: Graph,
  config: CoverageConfig,
  now: Date,
): CoverageReport {
  const areas: AreaReportRow[] = Object.keys(graph.areas).map((areaId) => {
    const status = computeAreaStatus(areaId, graph, config.staleAfterDays, now);
    const risk = computeAreaRisk(areaId, graph, config, now);

    // Build breakdown (same arithmetic as computeAreaRisk for transparency)
    const recentTickets = graph.ticketAreaEdges
      .filter((e) => e.target === areaId)
      .map((e) => graph.tickets[e.source])
      .filter((t): t is NonNullable<typeof t> => t !== undefined)
      .filter((t) => daysBetween(now, new Date(t.fetchedAt)) <= config.staleAfterDays)
      .length;
    const pomsInArea = graph.pomAreaEdges
      .filter((e) => e.target === areaId).map((e) => e.source);
    const scenariosInArea = new Set(
      graph.scenarioPomEdges
        .filter((e) => pomsInArea.includes(e.target)).map((e) => e.source),
    );
    const recentBugs = graph.classificationEvents
      .filter((c) => scenariosInArea.has(c.scenarioId))
      .filter((c) => c.classification === 'REAL_BUG' || c.classification === 'TEST_OUTDATED')
      .filter((c) => daysBetween(now, new Date(c.ts)) <= config.staleAfterDays)
      .length;
    const criticalBoost: 1 | 2 = config.criticalAreas.includes(areaId) ? 2 : 1;

    const row: AreaReportRow = {
      id: areaId, status, risk,
      breakdown: { recentTickets, recentBugs, criticalBoost },
    };
    return row;
  });

  // Sort: UNCOVERED first (by risk desc), STALE next (by risk desc), COVERED last (alpha)
  areas.sort((a, b) => {
    if (STATUS_RANK[a.status] !== STATUS_RANK[b.status]) {
      return STATUS_RANK[a.status] - STATUS_RANK[b.status];
    }
    if (a.status === 'COVERED') return a.id.localeCompare(b.id);
    return b.risk - a.risk;
  });

  // Tickets: only INCOMPLETE, sorted by gapScore desc
  const tickets: TicketReportRow[] = Object.values(graph.tickets)
    .filter((t) => computeTicketStatus(t.id, graph, config.staleAfterDays, now) === 'INCOMPLETE')
    .map((t) => {
      const acs = Object.values(graph.acNodes).filter((ac) => ac.ticketId === t.id);
      const unsatisfiedAcs = acs
        .filter((ac) => computeAcStatus(ac.id, graph, config.staleAfterDays, now) === 'UNSATISFIED')
        .map((ac) => ({ index: ac.index, text: ac.text }));
      return {
        id: t.id, summary: t.summary,
        acCount: acs.length,
        satisfiedCount: acs.length - unsatisfiedAcs.length,
        gapScore: computeAcGapScore(t.id, graph, config, now),
        unsatisfiedAcs,
      };
    })
    .sort((a, b) => b.gapScore - a.gapScore);

  const acBackfillNeeded = needsBackfill(graph);

  return {
    generatedAt: now.toISOString(),
    windowDays: config.staleAfterDays,
    areas, tickets, acBackfillNeeded,
  };
}

function needsBackfill(graph: Graph): boolean {
  // Backfill needed when: a ticket has ≥1 AC AND ≥1 scenario AND no satisfies edges for that ticket
  for (const ticket of Object.values(graph.tickets)) {
    const acsForTicket = Object.values(graph.acNodes).filter((ac) => ac.ticketId === ticket.id);
    if (acsForTicket.length === 0) continue;
    const scenariosForTicket = Object.values(graph.scenarios)
      .filter((s) => s.ticketId === ticket.id);
    if (scenariosForTicket.length === 0) continue;
    const hasAnyEdge = graph.satisfiesEdges.some(
      (e) => acsForTicket.some((ac) => ac.id === e.target),
    );
    if (!hasAnyEdge) return true;
  }
  return false;
}

function daysBetween(a: Date, b: Date): number {
  return Math.abs(a.getTime() - b.getTime()) / (1000 * 60 * 60 * 24);
}
```

- [ ] **Step 4: Verify pass**

```bash
cd packages/core && bun test test/coverage/report.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/coverage/report.ts packages/core/test/coverage/report.test.ts
git commit -m "feat(core): add buildCoverageReport with sort + backfill detection"
```

---

### Task 6.2: `renderMarkdown(report)` for CLI output

**Files:**
- Modify: `packages/core/src/coverage/report.ts`
- Test: `packages/core/test/coverage/report.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { renderMarkdown } from '../../src/coverage/report';

describe('renderMarkdown', () => {
  const now = new Date('2026-05-17T10:00:00.000Z');

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

  test('renders UNCOVERED section with risk and breakdown line', () => {
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

  test('renders AC GAPS section per INCOMPLETE ticket', () => {
    const md = renderMarkdown({
      generatedAt: '2026-05-17T10:00:00.000Z',
      windowDays: 30,
      areas: [], acBackfillNeeded: false,
      tickets: [{
        id: 'PROJ-105', summary: 'Add tax',
        acCount: 5, satisfiedCount: 3, gapScore: 4,
        unsatisfiedAcs: [
          { index: 2, text: 'Tax line item shows in cart preview' },
          { index: 4, text: 'Receipt email includes order summary' },
        ],
      }],
    });
    expect(md).toContain('AC GAPS');
    expect(md).toContain('PROJ-105');
    expect(md).toContain('3/5 ACs covered');
    expect(md).toContain('gap_score 4');
    expect(md).toContain('✗ AC-2  Tax line item shows in cart preview');
    expect(md).toContain('✗ AC-4  Receipt email includes order summary');
  });
});
```

- [ ] **Step 2: Verify failure**

```bash
cd packages/core && bun test test/coverage/report.test.ts
```

- [ ] **Step 3: Implement**

Add to `packages/core/src/coverage/report.ts`:

```ts
export function renderMarkdown(report: CoverageReport): string {
  const lines: string[] = [];
  const dateOnly = report.generatedAt.slice(0, 10);
  lines.push('');
  lines.push(`Coverage report — generated ${dateOnly} · window ${report.windowDays}d`);
  lines.push('');

  const uncovered = report.areas.filter((a) => a.status === 'UNCOVERED');
  if (uncovered.length > 0) {
    lines.push(`UNCOVERED — ${uncovered.length} areas, sorted by risk`);
    lines.push('');
    uncovered.forEach((a, i) => {
      const parts: string[] = [];
      parts.push(`${a.breakdown.recentTickets} tickets`);
      if (a.breakdown.recentBugs > 0) parts.push(`${a.breakdown.recentBugs} bugs`);
      if (a.breakdown.criticalBoost === 2) parts.push('critical ×2');
      lines.push(`  #${i + 1}  ${pad(a.id, 10)} risk ${a.risk}    ${parts.join(' · ')}`);
    });
    lines.push('');
  }

  const stale = report.areas.filter((a) => a.status === 'STALE');
  if (stale.length > 0) {
    lines.push(`STALE — ${stale.length} areas, has tests but no PASS in ${report.windowDays}d`);
    lines.push('');
    stale.forEach((a, i) => {
      lines.push(`  #${i + 1}  ${pad(a.id, 10)} (see --why ${a.id} for details)`);
    });
    lines.push('');
  }

  if (report.tickets.length > 0) {
    lines.push(`AC GAPS — ${report.tickets.length} tickets with unsatisfied acceptance criteria`);
    lines.push('');
    for (const t of report.tickets) {
      lines.push(`  ${t.id}  ${t.satisfiedCount}/${t.acCount} ACs covered · gap_score ${t.gapScore}`);
      for (const ac of t.unsatisfiedAcs) {
        lines.push(`    ✗ AC-${ac.index}  ${ac.text}`);
      }
      lines.push('');
    }
  }

  return lines.join('\n');
}

function pad(s: string, n: number): string {
  return s.length >= n ? s : s + ' '.repeat(n - s.length);
}
```

- [ ] **Step 4: Verify pass**

```bash
cd packages/core && bun test test/coverage/report.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/coverage/report.ts packages/core/test/coverage/report.test.ts
git commit -m "feat(core): add renderMarkdown for coverage CLI output"
```

---

## Phase 7 — Drill-down (`why`) builders

### Task 7.1: `buildWhyArea`

**Files:**
- Create: `packages/core/src/coverage/why.ts`
- Test: `packages/core/test/coverage/why.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, test, expect } from 'bun:test';
import { buildWhyArea } from '../../src/coverage/why';
import { DEFAULT_COVERAGE_CONFIG } from '../../src/coverage/types';
// reuse emptyGraph helper as before

describe('buildWhyArea', () => {
  const now = new Date('2026-05-17T10:00:00.000Z');

  test('returns formula expansion and contributing tickets', () => {
    const graph = emptyGraph();
    graph.areas['checkout'] = { kind: 'Area', id: 'checkout' };
    graph.tickets['PROJ-101'] = {
      kind: 'Ticket', id: 'PROJ-101', summary: 'Add Apple Pay to checkout',
      acceptanceCriteria: [], storyHash: 'h', modifiesAreas: ['checkout'],
      fetchedAt: '2026-05-15T10:00:00.000Z',
    };
    graph.ticketAreaEdges.push({
      kind: 'modifies', source: 'PROJ-101', target: 'checkout',
      discoveredAt: '2026-05-15T10:00:00.000Z', source_label: 'extract',
    });
    const out = buildWhyArea('checkout', graph, DEFAULT_COVERAGE_CONFIG, now);
    expect(out).toContain('Area: checkout');
    expect(out).toContain('UNCOVERED');
    expect(out).toContain('Risk score: 1');
    expect(out).toContain('1 × 1 + 0');
    expect(out).toContain('Recent tickets (1');
    expect(out).toContain('PROJ-101');
    expect(out).toContain('Add Apple Pay to checkout');
  });

  test('shows "critical" tag in heading and ×2 in formula', () => {
    const graph = emptyGraph();
    graph.areas['checkout'] = { kind: 'Area', id: 'checkout' };
    const cfg = { ...DEFAULT_COVERAGE_CONFIG, criticalAreas: ['checkout'] };
    const out = buildWhyArea('checkout', graph, cfg, now);
    expect(out).toContain('UNCOVERED, critical');
    expect(out).toContain('× 2');
  });

  test('errors gracefully if area unknown', () => {
    const graph = emptyGraph();
    const out = buildWhyArea('does-not-exist', graph, DEFAULT_COVERAGE_CONFIG, now);
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
import type { Graph } from '../graph/store';
import type { CoverageConfig } from './types';
import { computeAreaStatus } from './status';
import { computeAreaRisk } from './risk';

export function buildWhyArea(
  areaId: string,
  graph: Graph,
  config: CoverageConfig,
  now: Date,
): string {
  if (graph.areas[areaId] === undefined) {
    return `Unknown area: ${areaId}\n`;
  }

  const status = computeAreaStatus(areaId, graph, config.staleAfterDays, now);
  const isCritical = config.criticalAreas.includes(areaId);
  const heading = isCritical ? `${status}, critical` : status;

  const risk = computeAreaRisk(areaId, graph, config, now);
  const recentTickets = graph.ticketAreaEdges
    .filter((e) => e.target === areaId)
    .map((e) => graph.tickets[e.source])
    .filter((t): t is NonNullable<typeof t> => t !== undefined)
    .filter((t) => daysBetween(now, new Date(t.fetchedAt)) <= config.staleAfterDays);
  const pomsInArea = graph.pomAreaEdges
    .filter((e) => e.target === areaId).map((e) => e.source);
  const scenariosInArea = new Set(
    graph.scenarioPomEdges
      .filter((e) => pomsInArea.includes(e.target)).map((e) => e.source),
  );
  const recentBugs = graph.classificationEvents
    .filter((c) => scenariosInArea.has(c.scenarioId))
    .filter((c) => c.classification === 'REAL_BUG' || c.classification === 'TEST_OUTDATED')
    .filter((c) => daysBetween(now, new Date(c.ts)) <= config.staleAfterDays);

  const boost = isCritical ? 2 : 1;
  const lines: string[] = [];
  lines.push('');
  lines.push(`Area: ${areaId} (${heading})`);
  lines.push('');
  lines.push(`Risk score: ${risk}`);
  lines.push('  recent_tickets × critical_boost + recent_bugs');
  lines.push(`  = ${recentTickets.length} × ${boost} + ${recentBugs.length} = ${risk}`);
  lines.push('');
  lines.push(`Recent tickets (${recentTickets.length}, last ${config.staleAfterDays}d):`);
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

function pad(s: string, n: number): string {
  return s.length >= n ? s : s + ' '.repeat(n - s.length);
}

function daysBetween(a: Date, b: Date): number {
  return Math.abs(a.getTime() - b.getTime()) / (1000 * 60 * 60 * 24);
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
- Test: `packages/core/test/coverage/why.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { buildWhyTicket } from '../../src/coverage/why';

describe('buildWhyTicket', () => {
  const now = new Date('2026-05-17T10:00:00.000Z');

  test('returns AC list with ✓/✗ markers and gap_score breakdown', () => {
    const graph = emptyGraph();
    graph.tickets['PROJ-105'] = {
      kind: 'Ticket', id: 'PROJ-105', summary: 'Add tax line item to checkout',
      acceptanceCriteria: ['User sees subtotal', 'Tax line shows', 'Total includes tax'],
      storyHash: 'h', modifiesAreas: ['checkout'],
      fetchedAt: '2026-05-12T10:00:00.000Z',
    };
    graph.acNodes['PROJ-105#ac-0'] = {
      kind: 'AC', id: 'PROJ-105#ac-0', ticketId: 'PROJ-105', index: 0,
      text: 'User sees subtotal',
    };
    graph.acNodes['PROJ-105#ac-1'] = {
      kind: 'AC', id: 'PROJ-105#ac-1', ticketId: 'PROJ-105', index: 1,
      text: 'Tax line shows',
    };
    graph.acNodes['PROJ-105#ac-2'] = {
      kind: 'AC', id: 'PROJ-105#ac-2', ticketId: 'PROJ-105', index: 2,
      text: 'Total includes tax',
    };
    graph.satisfiesEdges.push({
      kind: 'satisfies', source: 'PROJ-105#scenario-0', target: 'PROJ-105#ac-0',
      confidence: 1.0, discoveredAt: '2026-05-12T10:00:00.000Z', source_label: 'eager',
    });
    graph.latestFailures['PROJ-105#scenario-0'] = {
      kind: 'Failure', scenarioId: 'PROJ-105#scenario-0',
      runId: 'r1', ts: '2026-05-15T10:00:00.000Z',
      latestStatus: 'pass', latestClassification: 'PASS',
    };
    const out = buildWhyTicket('PROJ-105', graph, DEFAULT_COVERAGE_CONFIG, now);
    expect(out).toContain('Ticket: PROJ-105');
    expect(out).toContain('INCOMPLETE');
    expect(out).toContain('1/3 ACs covered');
    expect(out).toContain('Add tax line item to checkout');
    expect(out).toContain('Fetched: 2026-05-12');
    expect(out).toContain('recency boost ×1.0');
    expect(out).toContain('AC gap score: 2');
    expect(out).toContain('✓ AC-0');
    expect(out).toContain('✗ AC-1');
    expect(out).toContain('✗ AC-2');
    expect(out).toContain('/xera-fill-gap --ticket PROJ-105');
  });

  test('errors gracefully if ticket unknown', () => {
    const graph = emptyGraph();
    const out = buildWhyTicket('PROJ-999', graph, DEFAULT_COVERAGE_CONFIG, now);
    expect(out).toContain('Unknown ticket');
  });
});
```

- [ ] **Step 2: Verify failure**

```bash
cd packages/core && bun test test/coverage/why.test.ts
```

- [ ] **Step 3: Implement**

Add to `packages/core/src/coverage/why.ts`:

```ts
import { computeAcStatus, computeTicketStatus } from './status';
import { computeAcGapScore, RISK_WEIGHTS } from './risk';

export function buildWhyTicket(
  ticketId: string,
  graph: Graph,
  config: CoverageConfig,
  now: Date,
): string {
  const ticket = graph.tickets[ticketId];
  if (!ticket) return `Unknown ticket: ${ticketId}\n`;

  const status = computeTicketStatus(ticketId, graph, config.staleAfterDays, now);
  const acs = Object.values(graph.acNodes)
    .filter((ac) => ac.ticketId === ticketId)
    .sort((a, b) => a.index - b.index);
  const satisfiedCount = acs.filter(
    (ac) => computeAcStatus(ac.id, graph, config.staleAfterDays, now) === 'SATISFIED',
  ).length;
  const gapScore = computeAcGapScore(ticketId, graph, config, now);

  const days = daysBetween(now, new Date(ticket.fetchedAt));
  let boostLabel: string;
  if (days <= RISK_WEIGHTS.recencyThresholdDays) boostLabel = '×2.0';
  else if (days <= config.staleAfterDays) boostLabel = '×1.0';
  else boostLabel = '×0.5';

  const lines: string[] = [];
  lines.push('');
  lines.push(`Ticket: ${ticketId} (${status}, ${satisfiedCount}/${acs.length} ACs covered)`);
  lines.push(`  Title: ${ticket.summary}`);
  lines.push(`  Fetched: ${ticket.fetchedAt.slice(0, 10)} (${Math.floor(days)}d ago, recency boost ${boostLabel})`);
  lines.push(`  AC gap score: ${gapScore}`);
  lines.push('');
  lines.push('Acceptance Criteria:');
  for (const ac of acs) {
    const acStatus = computeAcStatus(ac.id, graph, config.staleAfterDays, now);
    const marker = acStatus === 'SATISFIED' ? '✓' : '✗';
    const satisfyingScenarios = graph.satisfiesEdges
      .filter((e) => e.target === ac.id).map((e) => e.source);
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

## Phase 8 — Re-exports + module barrel

### Task 8.1: Update `packages/core/src/coverage/index.ts` barrel

**Files:**
- Modify: `packages/core/src/coverage/index.ts`

- [ ] **Step 1: Edit barrel**

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
} from './report';
export {
  buildWhyArea,
  buildWhyTicket,
} from './why';
```

- [ ] **Step 2: Verify it imports cleanly**

```bash
cd packages/core && bun run typecheck
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add packages/core/src/coverage/index.ts
git commit -m "feat(core): export coverage barrel"
```

---

## Phase 9 — Golden fixtures

### Task 9.1: `fixtures/golden-coverage/uncovered-only.json`

**Files:**
- Create: `fixtures/golden-coverage/uncovered-only.json`
- Create: `fixtures/golden-coverage/uncovered-only.expected.json`
- Create: `fixtures/golden-coverage/_helpers.ts` (shared graph loader for tests)
- Test: `packages/core/test/coverage/fixtures.test.ts`

- [ ] **Step 1: Write `_helpers.ts`**

```ts
// fixtures/golden-coverage/_helpers.ts
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Graph } from '@xera-ai/core/graph/store';

const here = dirname(fileURLToPath(import.meta.url));

export function loadGraph(name: string): Graph {
  const raw = readFileSync(join(here, `${name}.json`), 'utf8');
  return JSON.parse(raw) as Graph;
}

export function loadExpected(name: string): unknown {
  const raw = readFileSync(join(here, `${name}.expected.json`), 'utf8');
  return JSON.parse(raw);
}
```

- [ ] **Step 2: Write `uncovered-only.json`**

```json
{
  "tickets": {
    "PROJ-101": {
      "kind": "Ticket",
      "id": "PROJ-101",
      "summary": "Add Apple Pay to checkout",
      "acceptanceCriteria": [],
      "storyHash": "h1",
      "modifiesAreas": ["checkout"],
      "fetchedAt": "2026-05-15T10:00:00.000Z"
    },
    "PROJ-105": {
      "kind": "Ticket",
      "id": "PROJ-105",
      "summary": "Profile settings",
      "acceptanceCriteria": [],
      "storyHash": "h2",
      "modifiesAreas": ["profile"],
      "fetchedAt": "2026-05-12T10:00:00.000Z"
    }
  },
  "scenarios": {},
  "poms": {},
  "areas": {
    "checkout": { "kind": "Area", "id": "checkout" },
    "profile": { "kind": "Area", "id": "profile" }
  },
  "ticketEdges": [],
  "scenarioPomEdges": [],
  "pomAreaEdges": [],
  "ticketAreaEdges": [
    { "kind": "modifies", "source": "PROJ-101", "target": "checkout", "discoveredAt": "2026-05-15T10:00:00.000Z", "source_label": "extract" },
    { "kind": "modifies", "source": "PROJ-105", "target": "profile", "discoveredAt": "2026-05-12T10:00:00.000Z", "source_label": "extract" }
  ],
  "jiraLinkEdges": [],
  "similarEdges": [],
  "failureEdges": [],
  "latestFailures": {},
  "acNodes": {},
  "satisfiesEdges": [],
  "classificationEvents": []
}
```

- [ ] **Step 3: Write `uncovered-only.expected.json`** (asserted report at ts=2026-05-17T10:00:00.000Z, default config)

```json
{
  "generatedAt": "2026-05-17T10:00:00.000Z",
  "windowDays": 30,
  "areas": [
    {
      "id": "checkout",
      "status": "UNCOVERED",
      "risk": 1,
      "breakdown": { "recentTickets": 1, "recentBugs": 0, "criticalBoost": 1 }
    },
    {
      "id": "profile",
      "status": "UNCOVERED",
      "risk": 1,
      "breakdown": { "recentTickets": 1, "recentBugs": 0, "criticalBoost": 1 }
    }
  ],
  "tickets": [],
  "acBackfillNeeded": false
}
```

- [ ] **Step 4: Write integration test that asserts equality**

`packages/core/test/coverage/fixtures.test.ts`:

```ts
import { describe, test, expect } from 'bun:test';
import { buildCoverageReport } from '../../src/coverage/report';
import { DEFAULT_COVERAGE_CONFIG } from '../../src/coverage/types';
import { loadGraph, loadExpected } from '../../../../fixtures/golden-coverage/_helpers';

describe('golden-coverage fixtures', () => {
  const now = new Date('2026-05-17T10:00:00.000Z');

  test('uncovered-only', () => {
    const graph = loadGraph('uncovered-only');
    const expected = loadExpected('uncovered-only');
    const report = buildCoverageReport(graph, DEFAULT_COVERAGE_CONFIG, now);
    expect(report).toEqual(expected as any);
  });
});
```

- [ ] **Step 5: Run + commit**

```bash
cd packages/core && bun test test/coverage/fixtures.test.ts
```

Expected: 1 pass.

```bash
git add fixtures/golden-coverage/ packages/core/test/coverage/fixtures.test.ts
git commit -m "test(coverage): add uncovered-only golden fixture + integration test"
```

---

### Task 9.2: `mixed.json` (all 3 statuses + AC gaps)

**Files:**
- Create: `fixtures/golden-coverage/mixed.json`
- Create: `fixtures/golden-coverage/mixed.expected.json`
- Modify: `packages/core/test/coverage/fixtures.test.ts`

- [ ] **Step 1: Write `mixed.json`**

```json
{
  "tickets": {
    "PROJ-101": {
      "kind": "Ticket", "id": "PROJ-101",
      "summary": "Add Apple Pay to checkout",
      "acceptanceCriteria": ["User selects Apple Pay", "Order confirms"],
      "storyHash": "h1", "modifiesAreas": ["checkout"],
      "fetchedAt": "2026-05-15T10:00:00.000Z"
    },
    "PROJ-200": {
      "kind": "Ticket", "id": "PROJ-200",
      "summary": "Search pagination",
      "acceptanceCriteria": [],
      "storyHash": "h2", "modifiesAreas": ["search"],
      "fetchedAt": "2026-04-10T10:00:00.000Z"
    },
    "PROJ-300": {
      "kind": "Ticket", "id": "PROJ-300",
      "summary": "Login redirect fix",
      "acceptanceCriteria": [],
      "storyHash": "h3", "modifiesAreas": ["login"],
      "fetchedAt": "2026-05-10T10:00:00.000Z"
    }
  },
  "scenarios": {
    "PROJ-200#scenario-0": {
      "kind": "Scenario", "id": "PROJ-200#scenario-0", "ticketId": "PROJ-200",
      "name": "Search shows next page",
      "gherkin": "...", "priority": "p1", "featureHash": "fh1",
      "generatedAt": "2026-04-10T11:00:00.000Z"
    },
    "PROJ-300#scenario-0": {
      "kind": "Scenario", "id": "PROJ-300#scenario-0", "ticketId": "PROJ-300",
      "name": "User logs in successfully",
      "gherkin": "...", "priority": "p0", "featureHash": "fh2",
      "generatedAt": "2026-05-10T11:00:00.000Z"
    }
  },
  "poms": {
    "SearchPage": {
      "kind": "POM", "id": "SearchPage", "ticketId": "PROJ-200",
      "filePath": "pages/SearchPage.ts", "route": "/search",
      "locators": [], "scope": "local"
    },
    "LoginPage": {
      "kind": "POM", "id": "LoginPage", "ticketId": "PROJ-300",
      "filePath": "pages/LoginPage.ts", "route": "/login",
      "locators": [], "scope": "local"
    }
  },
  "areas": {
    "checkout": { "kind": "Area", "id": "checkout" },
    "search": { "kind": "Area", "id": "search" },
    "login": { "kind": "Area", "id": "login" }
  },
  "ticketEdges": [
    { "kind": "tests", "source": "PROJ-200", "target": "PROJ-200#scenario-0", "discoveredAt": "2026-04-10T11:00:00.000Z", "source_label": "extract" },
    { "kind": "tests", "source": "PROJ-300", "target": "PROJ-300#scenario-0", "discoveredAt": "2026-05-10T11:00:00.000Z", "source_label": "extract" }
  ],
  "scenarioPomEdges": [
    { "kind": "uses", "source": "PROJ-200#scenario-0", "target": "SearchPage", "discoveredAt": "2026-04-10T11:00:00.000Z", "source_label": "extract" },
    { "kind": "uses", "source": "PROJ-300#scenario-0", "target": "LoginPage", "discoveredAt": "2026-05-10T11:00:00.000Z", "source_label": "extract" }
  ],
  "pomAreaEdges": [
    { "kind": "covers", "source": "SearchPage", "target": "search", "discoveredAt": "2026-04-10T11:00:00.000Z", "source_label": "extract" },
    { "kind": "covers", "source": "LoginPage", "target": "login", "discoveredAt": "2026-05-10T11:00:00.000Z", "source_label": "extract" }
  ],
  "ticketAreaEdges": [
    { "kind": "modifies", "source": "PROJ-101", "target": "checkout", "discoveredAt": "2026-05-15T10:00:00.000Z", "source_label": "extract" },
    { "kind": "modifies", "source": "PROJ-200", "target": "search", "discoveredAt": "2026-04-10T10:00:00.000Z", "source_label": "extract" },
    { "kind": "modifies", "source": "PROJ-300", "target": "login", "discoveredAt": "2026-05-10T10:00:00.000Z", "source_label": "extract" }
  ],
  "jiraLinkEdges": [],
  "similarEdges": [],
  "failureEdges": [],
  "latestFailures": {
    "PROJ-300#scenario-0": {
      "kind": "Failure", "scenarioId": "PROJ-300#scenario-0",
      "runId": "r1", "ts": "2026-05-15T10:00:00.000Z",
      "latestStatus": "pass", "latestClassification": "PASS"
    }
  },
  "acNodes": {
    "PROJ-101#ac-0": { "kind": "AC", "id": "PROJ-101#ac-0", "ticketId": "PROJ-101", "index": 0, "text": "User selects Apple Pay" },
    "PROJ-101#ac-1": { "kind": "AC", "id": "PROJ-101#ac-1", "ticketId": "PROJ-101", "index": 1, "text": "Order confirms" }
  },
  "satisfiesEdges": [],
  "classificationEvents": []
}
```

- [ ] **Step 2: Manually trace expected output**

`now = 2026-05-17`, window 30d (fetched/classified after 2026-04-17).

Areas:
- `checkout`: no POM → UNCOVERED. 1 ticket in window (PROJ-101, 2d ago). 0 bugs. risk = 1.
- `search`: POM exists. Scenario PROJ-200#scenario-0 has no failure entry → NOT_PASSING → STALE. 0 tickets in window (PROJ-200 is 37d ago). 0 bugs. risk = 0.
- `login`: POM exists. Scenario PROJ-300#scenario-0 has PASS on 2026-05-15 (2d ago, within window) → PASSING → COVERED. 1 ticket in window. 0 bugs. risk = 1.

Sort: UNCOVERED first (checkout risk 1), then STALE (search risk 0), then COVERED (login alpha).

Tickets: PROJ-101 has 2 ACs, both UNSATISFIED → INCOMPLETE. gap_score = 2 × 1.0 = 2 (fetched 2d ago = recent, ×2.0 → 2 × 2.0 = 4). Wait: recencyThresholdDays = 7, fetched 2d ago → ×2.0. So gap_score = 2 × 2.0 = 4.

Other tickets (PROJ-200, PROJ-300): no ACs → COMPLETE → not in tickets[].

- [ ] **Step 3: Write `mixed.expected.json`**

```json
{
  "generatedAt": "2026-05-17T10:00:00.000Z",
  "windowDays": 30,
  "areas": [
    {
      "id": "checkout",
      "status": "UNCOVERED",
      "risk": 1,
      "breakdown": { "recentTickets": 1, "recentBugs": 0, "criticalBoost": 1 }
    },
    {
      "id": "search",
      "status": "STALE",
      "risk": 0,
      "breakdown": { "recentTickets": 0, "recentBugs": 0, "criticalBoost": 1 }
    },
    {
      "id": "login",
      "status": "COVERED",
      "risk": 1,
      "breakdown": { "recentTickets": 1, "recentBugs": 0, "criticalBoost": 1 }
    }
  ],
  "tickets": [
    {
      "id": "PROJ-101",
      "summary": "Add Apple Pay to checkout",
      "acCount": 2,
      "satisfiedCount": 0,
      "gapScore": 4,
      "unsatisfiedAcs": [
        { "index": 0, "text": "User selects Apple Pay" },
        { "index": 1, "text": "Order confirms" }
      ]
    }
  ],
  "acBackfillNeeded": false
}
```

- [ ] **Step 4: Add to fixtures.test.ts and run**

```ts
test('mixed', () => {
  const graph = loadGraph('mixed');
  const expected = loadExpected('mixed');
  const report = buildCoverageReport(graph, DEFAULT_COVERAGE_CONFIG, now);
  expect(report).toEqual(expected as any);
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
- Modify: `packages/core/test/coverage/fixtures.test.ts`

- [ ] **Step 1: Write fixture (two areas, same signals, one critical)**

```json
{
  "tickets": {
    "PROJ-A": {
      "kind": "Ticket", "id": "PROJ-A", "summary": "x",
      "acceptanceCriteria": [], "storyHash": "h",
      "modifiesAreas": ["checkout"], "fetchedAt": "2026-05-15T10:00:00.000Z"
    },
    "PROJ-B": {
      "kind": "Ticket", "id": "PROJ-B", "summary": "y",
      "acceptanceCriteria": [], "storyHash": "h",
      "modifiesAreas": ["admin"], "fetchedAt": "2026-05-15T10:00:00.000Z"
    }
  },
  "scenarios": {}, "poms": {},
  "areas": {
    "checkout": { "kind": "Area", "id": "checkout" },
    "admin": { "kind": "Area", "id": "admin" }
  },
  "ticketEdges": [], "scenarioPomEdges": [], "pomAreaEdges": [],
  "ticketAreaEdges": [
    { "kind": "modifies", "source": "PROJ-A", "target": "checkout", "discoveredAt": "2026-05-15T10:00:00.000Z", "source_label": "extract" },
    { "kind": "modifies", "source": "PROJ-B", "target": "admin", "discoveredAt": "2026-05-15T10:00:00.000Z", "source_label": "extract" }
  ],
  "jiraLinkEdges": [], "similarEdges": [],
  "failureEdges": [], "latestFailures": {},
  "acNodes": {}, "satisfiesEdges": [], "classificationEvents": []
}
```

- [ ] **Step 2: Write expected output (config has `criticalAreas: ['checkout']`)**

```json
{
  "generatedAt": "2026-05-17T10:00:00.000Z",
  "windowDays": 30,
  "areas": [
    {
      "id": "checkout", "status": "UNCOVERED", "risk": 2,
      "breakdown": { "recentTickets": 1, "recentBugs": 0, "criticalBoost": 2 }
    },
    {
      "id": "admin", "status": "UNCOVERED", "risk": 1,
      "breakdown": { "recentTickets": 1, "recentBugs": 0, "criticalBoost": 1 }
    }
  ],
  "tickets": [],
  "acBackfillNeeded": false
}
```

- [ ] **Step 3: Add test (note: this test uses non-default config)**

```ts
test('critical-boost (criticalAreas: ["checkout"])', () => {
  const graph = loadGraph('critical-boost');
  const expected = loadExpected('critical-boost');
  const config = { ...DEFAULT_COVERAGE_CONFIG, criticalAreas: ['checkout'] };
  const report = buildCoverageReport(graph, config, now);
  expect(report).toEqual(expected as any);
});
```

- [ ] **Step 4: Run + commit**

```bash
cd packages/core && bun test test/coverage/fixtures.test.ts
```

```bash
git add fixtures/golden-coverage/critical-boost.json fixtures/golden-coverage/critical-boost.expected.json packages/core/test/coverage/fixtures.test.ts
git commit -m "test(coverage): add critical-boost golden fixture"
```

---

### Task 9.4: `bug-history.json`

**Files:**
- Create: `fixtures/golden-coverage/bug-history.json` + `.expected.json`
- Modify: `packages/core/test/coverage/fixtures.test.ts`

- [ ] **Step 1: Write `bug-history.json`** — exercises bug_history additivity. One area `auth` with POM + scenario. Ticket modifying `auth` fetched 100d ago (outside window, contributes 0 to recent_tickets). Five classification events: 3 in window (2 REAL_BUG + 1 TEST_OUTDATED, total 3), 1 SELECTOR_DRIFT in window (excluded, not in bug set), 1 REAL_BUG outside window. `latestFailures` reflects most-recent REAL_BUG so scenario is NOT_PASSING.

```json
{
  "tickets": {
    "PROJ-AUTH": {
      "kind": "Ticket", "id": "PROJ-AUTH", "summary": "Refactor auth",
      "acceptanceCriteria": [], "storyHash": "h",
      "modifiesAreas": ["auth"],
      "fetchedAt": "2026-02-06T10:00:00.000Z"
    }
  },
  "scenarios": {
    "PROJ-AUTH#scenario-0": {
      "kind": "Scenario", "id": "PROJ-AUTH#scenario-0", "ticketId": "PROJ-AUTH",
      "name": "Login success", "gherkin": "...", "priority": "p1",
      "featureHash": "fh", "generatedAt": "2026-02-06T11:00:00.000Z"
    }
  },
  "poms": {
    "LoginPage": {
      "kind": "POM", "id": "LoginPage", "ticketId": "PROJ-AUTH",
      "filePath": "pages/LoginPage.ts", "route": "/login",
      "locators": [], "scope": "local"
    }
  },
  "areas": {
    "auth": { "kind": "Area", "id": "auth" }
  },
  "ticketEdges": [],
  "scenarioPomEdges": [
    { "kind": "uses", "source": "PROJ-AUTH#scenario-0", "target": "LoginPage",
      "discoveredAt": "2026-02-06T11:00:00.000Z", "source_label": "extract" }
  ],
  "pomAreaEdges": [
    { "kind": "covers", "source": "LoginPage", "target": "auth",
      "discoveredAt": "2026-02-06T11:00:00.000Z", "source_label": "extract" }
  ],
  "ticketAreaEdges": [
    { "kind": "modifies", "source": "PROJ-AUTH", "target": "auth",
      "discoveredAt": "2026-02-06T10:00:00.000Z", "source_label": "extract" }
  ],
  "jiraLinkEdges": [], "similarEdges": [], "failureEdges": [],
  "latestFailures": {
    "PROJ-AUTH#scenario-0": {
      "kind": "Failure", "scenarioId": "PROJ-AUTH#scenario-0",
      "runId": "r5", "ts": "2026-05-14T10:00:00.000Z",
      "latestStatus": "fail", "latestClassification": "REAL_BUG"
    }
  },
  "acNodes": {}, "satisfiesEdges": [],
  "classificationEvents": [
    { "scenarioId": "PROJ-AUTH#scenario-0", "classification": "REAL_BUG",      "ts": "2026-05-14T10:00:00.000Z" },
    { "scenarioId": "PROJ-AUTH#scenario-0", "classification": "REAL_BUG",      "ts": "2026-05-10T10:00:00.000Z" },
    { "scenarioId": "PROJ-AUTH#scenario-0", "classification": "TEST_OUTDATED", "ts": "2026-05-08T10:00:00.000Z" },
    { "scenarioId": "PROJ-AUTH#scenario-0", "classification": "SELECTOR_DRIFT","ts": "2026-05-12T10:00:00.000Z" },
    { "scenarioId": "PROJ-AUTH#scenario-0", "classification": "REAL_BUG",      "ts": "2026-03-01T10:00:00.000Z" }
  ]
}
```

- [ ] **Step 2: Write `bug-history.expected.json`** — area `auth` is STALE (POM exists, scenario is NOT_PASSING because latest classification is REAL_BUG). recent_tickets = 0 (PROJ-AUTH > 30d old). recent_bugs = 3 (2 REAL_BUG + 1 TEST_OUTDATED in window; SELECTOR_DRIFT excluded; out-of-window REAL_BUG excluded). criticalBoost = 1. risk = 0 × 1 + 3 = 3.

```json
{
  "generatedAt": "2026-05-17T10:00:00.000Z",
  "windowDays": 30,
  "areas": [
    {
      "id": "auth",
      "status": "STALE",
      "risk": 3,
      "breakdown": { "recentTickets": 0, "recentBugs": 3, "criticalBoost": 1 }
    }
  ],
  "tickets": [],
  "acBackfillNeeded": false
}
```

- [ ] **Step 3: Add to `fixtures.test.ts`**

```ts
test('bug-history', () => {
  const graph = loadGraph('bug-history');
  const expected = loadExpected('bug-history');
  const report = buildCoverageReport(graph, DEFAULT_COVERAGE_CONFIG, now);
  expect(report).toEqual(expected as any);
});
```

- [ ] **Step 4: Run**

```bash
cd packages/core && bun test test/coverage/fixtures.test.ts
```

Expected: 4 passes (uncovered-only, mixed, critical-boost, bug-history).

- [ ] **Step 5: Commit**

```bash
git add fixtures/golden-coverage/bug-history.json fixtures/golden-coverage/bug-history.expected.json packages/core/test/coverage/fixtures.test.ts
git commit -m "test(coverage): add bug-history golden fixture"
```

---

### Task 9.5: `stale-only.json`

**Files:**
- Create: `fixtures/golden-coverage/stale-only.json` + `.expected.json`
- Modify: `packages/core/test/coverage/fixtures.test.ts`

- [ ] **Step 1: Write `stale-only.json`** — two areas (`billing`, `search`), each with POM + scenario. Tickets fetched > 30d ago (no recent activity). `latestFailures` show last PASS > 30d ago for each scenario (stale, NOT_PASSING).

```json
{
  "tickets": {
    "PROJ-B": {
      "kind": "Ticket", "id": "PROJ-B", "summary": "Billing v1",
      "acceptanceCriteria": [], "storyHash": "h",
      "modifiesAreas": ["billing"],
      "fetchedAt": "2026-02-01T10:00:00.000Z"
    },
    "PROJ-S": {
      "kind": "Ticket", "id": "PROJ-S", "summary": "Search v1",
      "acceptanceCriteria": [], "storyHash": "h",
      "modifiesAreas": ["search"],
      "fetchedAt": "2026-02-01T10:00:00.000Z"
    }
  },
  "scenarios": {
    "PROJ-B#scenario-0": {
      "kind": "Scenario", "id": "PROJ-B#scenario-0", "ticketId": "PROJ-B",
      "name": "Bill issued", "gherkin": "...", "priority": "p1",
      "featureHash": "fh", "generatedAt": "2026-02-01T11:00:00.000Z"
    },
    "PROJ-S#scenario-0": {
      "kind": "Scenario", "id": "PROJ-S#scenario-0", "ticketId": "PROJ-S",
      "name": "Basic search", "gherkin": "...", "priority": "p1",
      "featureHash": "fh", "generatedAt": "2026-02-01T11:00:00.000Z"
    }
  },
  "poms": {
    "BillingPage": {
      "kind": "POM", "id": "BillingPage", "ticketId": "PROJ-B",
      "filePath": "pages/BillingPage.ts", "route": "/billing",
      "locators": [], "scope": "local"
    },
    "SearchPage": {
      "kind": "POM", "id": "SearchPage", "ticketId": "PROJ-S",
      "filePath": "pages/SearchPage.ts", "route": "/search",
      "locators": [], "scope": "local"
    }
  },
  "areas": {
    "billing": { "kind": "Area", "id": "billing" },
    "search": { "kind": "Area", "id": "search" }
  },
  "ticketEdges": [],
  "scenarioPomEdges": [
    { "kind": "uses", "source": "PROJ-B#scenario-0", "target": "BillingPage",
      "discoveredAt": "2026-02-01T11:00:00.000Z", "source_label": "extract" },
    { "kind": "uses", "source": "PROJ-S#scenario-0", "target": "SearchPage",
      "discoveredAt": "2026-02-01T11:00:00.000Z", "source_label": "extract" }
  ],
  "pomAreaEdges": [
    { "kind": "covers", "source": "BillingPage", "target": "billing",
      "discoveredAt": "2026-02-01T11:00:00.000Z", "source_label": "extract" },
    { "kind": "covers", "source": "SearchPage", "target": "search",
      "discoveredAt": "2026-02-01T11:00:00.000Z", "source_label": "extract" }
  ],
  "ticketAreaEdges": [
    { "kind": "modifies", "source": "PROJ-B", "target": "billing",
      "discoveredAt": "2026-02-01T10:00:00.000Z", "source_label": "extract" },
    { "kind": "modifies", "source": "PROJ-S", "target": "search",
      "discoveredAt": "2026-02-01T10:00:00.000Z", "source_label": "extract" }
  ],
  "jiraLinkEdges": [], "similarEdges": [], "failureEdges": [],
  "latestFailures": {
    "PROJ-B#scenario-0": {
      "kind": "Failure", "scenarioId": "PROJ-B#scenario-0",
      "runId": "r1", "ts": "2026-03-31T10:00:00.000Z",
      "latestStatus": "pass", "latestClassification": "PASS"
    },
    "PROJ-S#scenario-0": {
      "kind": "Failure", "scenarioId": "PROJ-S#scenario-0",
      "runId": "r2", "ts": "2026-04-15T10:00:00.000Z",
      "latestStatus": "pass", "latestClassification": "PASS"
    }
  },
  "acNodes": {}, "satisfiesEdges": [], "classificationEvents": []
}
```

- [ ] **Step 2: Write `stale-only.expected.json`** — both areas STALE. recent_tickets = 0 (tickets > 30d ago). recent_bugs = 0. risk = 0. Sort within STALE: by risk desc; tie → both 0 → preserve insertion order from `Object.keys(graph.areas)` which is iteration-order of map entries.

```json
{
  "generatedAt": "2026-05-17T10:00:00.000Z",
  "windowDays": 30,
  "areas": [
    {
      "id": "billing", "status": "STALE", "risk": 0,
      "breakdown": { "recentTickets": 0, "recentBugs": 0, "criticalBoost": 1 }
    },
    {
      "id": "search", "status": "STALE", "risk": 0,
      "breakdown": { "recentTickets": 0, "recentBugs": 0, "criticalBoost": 1 }
    }
  ],
  "tickets": [],
  "acBackfillNeeded": false
}
```

Note: if `Array.prototype.sort` is not stable in some bun version, sort tie-break must be made deterministic. Add a final `.localeCompare` tie-breaker in `buildCoverageReport`'s area sort to guarantee `billing` before `search`. If the test fails here, update the sort in report.ts:

```ts
areas.sort((a, b) => {
  if (STATUS_RANK[a.status] !== STATUS_RANK[b.status]) {
    return STATUS_RANK[a.status] - STATUS_RANK[b.status];
  }
  if (a.status === 'COVERED') return a.id.localeCompare(b.id);
  if (b.risk !== a.risk) return b.risk - a.risk;
  return a.id.localeCompare(b.id);   // deterministic tie-break
});
```

- [ ] **Step 3: Add test**

```ts
test('stale-only', () => {
  const graph = loadGraph('stale-only');
  const expected = loadExpected('stale-only');
  const report = buildCoverageReport(graph, DEFAULT_COVERAGE_CONFIG, now);
  expect(report).toEqual(expected as any);
});
```

- [ ] **Step 4: Run**

```bash
cd packages/core && bun test test/coverage/fixtures.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add fixtures/golden-coverage/stale-only.json fixtures/golden-coverage/stale-only.expected.json packages/core/test/coverage/fixtures.test.ts packages/core/src/coverage/report.ts
git commit -m "test(coverage): add stale-only golden fixture + deterministic sort tie-break"
```

---

### Task 9.6: `ac-gap.json`

**Files:**
- Create: `fixtures/golden-coverage/ac-gap.json` + `.expected.json`
- Modify: `packages/core/test/coverage/fixtures.test.ts`

- [ ] **Step 1: Write `ac-gap.json`** — one ticket PROJ-X with 5 ACs, fetched 5d ago (recent → ×2.0 boost). Three scenarios; satisfies edges from scenarios → ACs 0/1/3. All three scenarios are PASSING (latestFailures with recent PASS). ACs 2 and 4 are unsatisfied. No POMs/areas needed — focuses on AC matrix only.

```json
{
  "tickets": {
    "PROJ-X": {
      "kind": "Ticket", "id": "PROJ-X", "summary": "Cart features",
      "acceptanceCriteria": [
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
    "PROJ-X#scenario-0": {
      "kind": "Scenario", "id": "PROJ-X#scenario-0", "ticketId": "PROJ-X",
      "name": "Cart shows subtotal", "gherkin": "...", "priority": "p1",
      "featureHash": "fh", "generatedAt": "2026-05-12T11:00:00.000Z"
    },
    "PROJ-X#scenario-1": {
      "kind": "Scenario", "id": "PROJ-X#scenario-1", "ticketId": "PROJ-X",
      "name": "Cart shows discount", "gherkin": "...", "priority": "p1",
      "featureHash": "fh", "generatedAt": "2026-05-12T11:00:00.000Z"
    },
    "PROJ-X#scenario-2": {
      "kind": "Scenario", "id": "PROJ-X#scenario-2", "ticketId": "PROJ-X",
      "name": "Total includes tax", "gherkin": "...", "priority": "p1",
      "featureHash": "fh", "generatedAt": "2026-05-12T11:00:00.000Z"
    }
  },
  "poms": {}, "areas": {},
  "ticketEdges": [], "scenarioPomEdges": [], "pomAreaEdges": [],
  "ticketAreaEdges": [], "jiraLinkEdges": [], "similarEdges": [],
  "failureEdges": [],
  "latestFailures": {
    "PROJ-X#scenario-0": {
      "kind": "Failure", "scenarioId": "PROJ-X#scenario-0",
      "runId": "r1", "ts": "2026-05-15T10:00:00.000Z",
      "latestStatus": "pass", "latestClassification": "PASS"
    },
    "PROJ-X#scenario-1": {
      "kind": "Failure", "scenarioId": "PROJ-X#scenario-1",
      "runId": "r2", "ts": "2026-05-15T10:00:00.000Z",
      "latestStatus": "pass", "latestClassification": "PASS"
    },
    "PROJ-X#scenario-2": {
      "kind": "Failure", "scenarioId": "PROJ-X#scenario-2",
      "runId": "r3", "ts": "2026-05-15T10:00:00.000Z",
      "latestStatus": "pass", "latestClassification": "PASS"
    }
  },
  "acNodes": {
    "PROJ-X#ac-0": { "kind": "AC", "id": "PROJ-X#ac-0", "ticketId": "PROJ-X", "index": 0, "text": "User sees subtotal" },
    "PROJ-X#ac-1": { "kind": "AC", "id": "PROJ-X#ac-1", "ticketId": "PROJ-X", "index": 1, "text": "User sees discount line" },
    "PROJ-X#ac-2": { "kind": "AC", "id": "PROJ-X#ac-2", "ticketId": "PROJ-X", "index": 2, "text": "Tax line item shows in cart preview" },
    "PROJ-X#ac-3": { "kind": "AC", "id": "PROJ-X#ac-3", "ticketId": "PROJ-X", "index": 3, "text": "Total includes tax" },
    "PROJ-X#ac-4": { "kind": "AC", "id": "PROJ-X#ac-4", "ticketId": "PROJ-X", "index": 4, "text": "Receipt email includes order summary" }
  },
  "satisfiesEdges": [
    { "kind": "satisfies", "source": "PROJ-X#scenario-0", "target": "PROJ-X#ac-0",
      "confidence": 1.0, "discoveredAt": "2026-05-12T11:00:00.000Z", "source_label": "eager" },
    { "kind": "satisfies", "source": "PROJ-X#scenario-1", "target": "PROJ-X#ac-1",
      "confidence": 1.0, "discoveredAt": "2026-05-12T11:00:00.000Z", "source_label": "eager" },
    { "kind": "satisfies", "source": "PROJ-X#scenario-2", "target": "PROJ-X#ac-3",
      "confidence": 1.0, "discoveredAt": "2026-05-12T11:00:00.000Z", "source_label": "eager" }
  ],
  "classificationEvents": []
}
```

- [ ] **Step 2: Write `ac-gap.expected.json`** — areas[] empty. tickets[] has PROJ-X: acCount=5, satisfiedCount=3, unsatisfied ACs are indices 2 and 4. gap_score = 2 × 2.0 = 4 (fetched 5d ago ≤ 7d threshold). acBackfillNeeded = false (satisfies edges already exist).

```json
{
  "generatedAt": "2026-05-17T10:00:00.000Z",
  "windowDays": 30,
  "areas": [],
  "tickets": [
    {
      "id": "PROJ-X",
      "summary": "Cart features",
      "acCount": 5,
      "satisfiedCount": 3,
      "gapScore": 4,
      "unsatisfiedAcs": [
        { "index": 2, "text": "Tax line item shows in cart preview" },
        { "index": 4, "text": "Receipt email includes order summary" }
      ]
    }
  ],
  "acBackfillNeeded": false
}
```

- [ ] **Step 3: Add test**

```ts
test('ac-gap', () => {
  const graph = loadGraph('ac-gap');
  const expected = loadExpected('ac-gap');
  const report = buildCoverageReport(graph, DEFAULT_COVERAGE_CONFIG, now);
  expect(report).toEqual(expected as any);
});
```

- [ ] **Step 4: Run**

```bash
cd packages/core && bun test test/coverage/fixtures.test.ts
```

Expected: 6 passes total across all golden fixtures.

- [ ] **Step 5: Commit**

```bash
git add fixtures/golden-coverage/ac-gap.json fixtures/golden-coverage/ac-gap.expected.json packages/core/test/coverage/fixtures.test.ts
git commit -m "test(coverage): add ac-gap golden fixture"
```

---

## Phase 10 — Final type-check + checkpoint commit

### Task 10.1: Whole-workspace typecheck

- [ ] **Step 1: Run typecheck**

```bash
cd /home/user/xera && bun run typecheck
```

Expected: no errors across the workspace. If errors appear in `packages/web/` or `packages/http/` because they import `@xera-ai/core` types and one of the new types is referenced indirectly, address them in this task before moving on.

- [ ] **Step 2: Run all coverage tests**

```bash
cd packages/core && bun test test/coverage/ test/graph/
```

Expected: all pass.

- [ ] **Step 3: Run full test suite**

```bash
cd /home/user/xera && bun test
```

Expected: all pass (no regressions in v0.6/v0.7 functionality).

- [ ] **Step 4: Checkpoint commit (no-op if nothing new)**

```bash
git status   # should be clean
```

If there were small typecheck fix-ups, commit them as:

```bash
git commit -am "chore(core): typecheck fix-ups after coverage foundation"
```

---

## Done

End state of Plan 01:

- `packages/core/src/graph/types.ts` — adds ACNode, SatisfiesEdge, CoverageSnapshotPayload, AcCoverageBackfilledPayload, plus optional `satisfiesAcs` on ScenarioGeneratedPayload
- `packages/core/src/graph/schema.ts` — adds Zod schemas for all new types + extends discriminated union
- `packages/core/src/graph/store.ts` — Graph snapshot type extended with `acNodes`, `satisfiesEdges`, `classificationEvents`; rebuild handlers materialize ACNodes (with story-hash drift handling) and satisfies edges (eager + lazy paths, both idempotent)
- `packages/core/src/coverage/` — new directory with `types.ts`, `status.ts`, `risk.ts`, `report.ts`, `why.ts`, `index.ts` barrel; all pure functions, no I/O
- `fixtures/golden-coverage/` — six fixtures with expected JSON outputs
- `packages/core/test/coverage/` — unit + integration tests for every public function

No user-facing surface yet — `coverage-prepare` binary, `/xera-coverage` skill, CLI surface, and config schema additions land in Plan 02. AC backfill flow lands in Plan 03. HTML viewer is Plan 04. Generative `/xera-fill-gap` is Plan 05.

After execution: spec §1.5 success criterion #1 (`bun install && bun run typecheck && bun test`) is met. Other criteria require plans 02–05.
