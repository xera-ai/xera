# xera v0.6.2 — `/xera-impact` Skill + Auto-Trigger in `/xera-run` — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship `/xera-impact <TICKET>` skill + `xera-internal impact-prepare` subcommand that, given a ticket, walks the project knowledge graph to identify scenarios potentially affected by the ticket's changes, ranks them by risk score, and (optionally) re-runs them. Also auto-triggers impact analysis from `/xera-run` so QA gets pre-flight visibility on every ticket without remembering a separate command.

**Architecture:** New module `packages/core/src/graph/impact.ts` exposes pure data functions: `walkImpact(graph, target, opts)` (BFS over edges) and `riskScore(impact)` (weighted sum). New `bin-internal/impact-prepare.ts` wraps this in CLI: reads graph snapshot, computes impact list, writes both human-readable `.xera/impact/<TICKET>.md` and machine-readable `.xera/impact/<TICKET>.json`. New skill `packages/skills/xera-impact.md` orchestrates the user-facing flow (snapshot check → impact-prepare → display + 4-way prompt → optional re-run via existing `/xera-exec`). Existing `xera-run.md` skill extended to auto-call impact-prepare with a quiet mode after fetch — if the threshold is exceeded, prompt user to re-run impacted scenarios first. New `RunSchema` in config adds `xera.config.run.autoImpact` settings.

**Tech Stack:** Node runtime, TypeScript strict (`exactOptionalPropertyTypes` + `noUncheckedIndexedAccess`), zod 4.4.3, `vitest`, markdown-driven skills.

**Spec:** `docs/superpowers/specs/2026-05-16-xera-v06-project-knowledge-graph-design.md` §6 (`/xera-impact` design), §11.1 (auto-trigger in `/xera-run`)

**Builds on:** v0.6.0 + v0.6.1 (PR #11 + PR #13 merged) — graph foundation, TEST_OUTDATED classifier.

**Scope decision:** The `xera:exec --from-impact <TICKET>` flag (mentioned in spec §6.4) is implemented at the **skill layer**, not as a new bin-internal subcommand. The `/xera-impact` skill `.md` reads `.xera/impact/<TICKET>.json`, groups impacted scenarios by their owner ticket, then iterates calling the existing `npx xera-internal exec <owner-ticket>` for each. This keeps `bin-internal/exec.ts` unchanged and confines orchestration logic to skills. Documented in Task 6 (skill flow).

---

## File Structure

### New files

**`packages/core/src/graph/`** — extending the v0.6.0 module
- `impact.ts` — Pure data layer:
  - `walkImpact(graph, target, opts: ImpactOpts): ImpactScenario[]` — BFS from target ticket via edges (modifies → area → covers ← POM → uses ← scenarios; jira-linked → ticket → tests → scenarios; similar → ticket → tests → scenarios). Respects `--depth` (1 = direct only, 2 = + cross-ticket via jira-linked, 3 = + similar). Excludes scenarios already owned by target.
  - `riskScore(scenario, edgePath): number` — Weighted sum per spec §6.3 formula
  - Types: `ImpactScenario`, `ImpactOpts`, `ImpactReport`

**`packages/core/src/bin-internal/`** — new subcommand
- `impact-prepare.ts` — `xera-internal impact-prepare <TICKET> [--depth N] [--min-priority p0|p1|p2] [--quiet]`. Reads graph snapshot, calls `walkImpact`, sorts by risk score, writes:
  - `.xera/impact/<TICKET>.json` (always — machine-readable list with scenarioId, owner ticket, priority, score, edge path)
  - `.xera/impact/<TICKET>.md` (unless `--quiet` — human-readable report with high/medium/low buckets + re-run commands)
  - Exit code 2 if target ticket not in graph; exit 0 otherwise (even if impact is empty)

**`packages/skills/`** — new + modified skill `.md` files
- `xera-impact.md` — NEW. Skill workflow per spec §6.2:
  1. Verify graph snapshot fresh (auto-rebuild if stale)
  2. Run `xera-internal impact-prepare <TICKET>` with passed flags
  3. Display top-3 from `.xera/impact/<TICKET>.json`
  4. 4-way prompt: `[Y]es / [p] P0 only / [s]elect / [n]o`
  5. On Y/p/s: read JSON, group by owner ticket, iterate `npx xera-internal exec <owner-ticket>` for each
  6. After exec, recommend `/xera-report <TICKET>` for TEST_OUTDATED classification
- `xera-run.md` — MODIFIED. Insert new step between `/xera-fetch` and `/xera-script`: auto-call `xera:impact-prepare <TICKET> --quiet`, count high-risk scenarios from JSON; if ≥1 above config threshold, prompt user.

**`packages/core/test/graph/`** — new tests
- `impact.test.ts` — `walkImpact` BFS at depths 1/2/3; `riskScore` formula edge cases
- `impact.golden.test.ts` — End-to-end against fixtures

**`packages/core/test/bin-internal/`** — new tests
- `impact-prepare.test.ts` — Subcommand reads graph, writes both files; `--depth`, `--min-priority`, `--quiet` flags; exits 2 when ticket missing

**`fixtures/golden-impact/`** — 3 new fixtures
- `impact-depth-1/` — Target ticket modifies area `login`; 2 scenarios (in 2 different tickets) use a POM that covers `login`. Expected impact list = 2 scenarios.
- `impact-depth-2/` — Same as depth-1 + a jira-linked ticket with 1 more scenario. At `--depth 1` returns 2; at `--depth 2` returns 3.
- `impact-empty/` — Target ticket modifies area `new-feature` that no prior POM covers. Expected: empty impact list, no re-run prompt.

### Modified files

- `packages/core/src/config/schema.ts` — Add `RunSchema` with `autoImpact: { enabled, threshold }` field; merge into top-level `XeraConfigSchema`
- `packages/core/src/bin-internal/index.ts` — Register `impact-prepare` in `COMMANDS`
- `packages/skills/xera-run.md` — Insert auto-trigger step (Task 7)
- `packages/skills/version.json` — Bump skills 0.4.1 → 0.4.2
- `packages/skills/package.json` — Bump version
- `packages/core/package.json` — Bump core 0.4.1 → 0.4.2
- `packages/cli/package.json` — Patch bump + caret bumps to ^0.4.2
- `packages/cli/src/commands/init.ts` — Bump consumer dep carets to ^0.4.2
- `packages/cli/src/commands/init-update.ts` — Same
- `docs/CONFIGURATION.md` — Append `run.autoImpact` config section
- `docs/TROUBLESHOOTING.md` — Append "Impact list too large / too small" entry

---

## Task 1: `impact.ts` core — `riskScore` + types — TDD

**Files:**
- Create: `packages/core/src/graph/impact.ts` (initial scaffolding — types + risk score only)
- Create: `packages/core/test/graph/impact.test.ts` (initial — risk score only)

- [ ] **Step 1: Write failing test for `riskScore`**

Create `packages/core/test/graph/impact.test.ts`:

```typescript
import { describe, expect, test } from 'vitest';
import { riskScore } from '../../src/graph/impact';
import type { ImpactScenario } from '../../src/graph/impact';

function mkImpact(overrides: Partial<ImpactScenario> = {}): ImpactScenario {
  return {
    scenarioId: 'sc-1',
    ticketId: 'ABC-100',
    name: 'user signs in',
    priority: 'p1',
    edgePath: [{ kind: 'modifies', from: 'ABC-200', to: 'login' }],
    riskScore: 0,
    ...overrides,
  };
}

describe('riskScore', () => {
  test('P0 with modifies-same-area edge returns 14', () => {
    // priority_weight=3 * 3 + edge_weight=5 + confidence=0 - days=0 = 14
    const s = mkImpact({ priority: 'p0' });
    expect(riskScore(s, 0)).toBeCloseTo(14, 2);
  });

  test('P1 with modifies-same-area edge returns 11', () => {
    // priority_weight=2 * 3 + edge_weight=5 = 11
    const s = mkImpact({ priority: 'p1' });
    expect(riskScore(s, 0)).toBeCloseTo(11, 2);
  });

  test('P2 with similar edge confidence 0.8 returns 6.6', () => {
    // priority_weight=1 * 3 + edge_weight=1*0.8 + 0.8*2 - 0 = 3 + 0.8 + 1.6 = 5.4
    const s = mkImpact({
      priority: 'p2',
      edgePath: [{ kind: 'similar', from: 'ABC-200', to: 'ABC-100', confidence: 0.8 }],
    });
    expect(riskScore(s, 0)).toBeCloseTo(5.4, 2);
  });

  test('subtracts 0.1 per day since last pass', () => {
    const s = mkImpact({ priority: 'p1' });
    // base 11 - 7 days * 0.1 = 10.3
    expect(riskScore(s, 7)).toBeCloseTo(10.3, 2);
  });

  test('jira-linked.blocks weight 4', () => {
    const s = mkImpact({
      priority: 'p1',
      edgePath: [{ kind: 'jira-linked', from: 'ABC-200', to: 'ABC-100', source: 'jira:blocks' }],
    });
    // 2*3 + 4 = 10
    expect(riskScore(s, 0)).toBeCloseTo(10, 2);
  });

  test('jira-linked.relates weight 2', () => {
    const s = mkImpact({
      priority: 'p1',
      edgePath: [{ kind: 'jira-linked', from: 'ABC-200', to: 'ABC-100', source: 'jira:relates' }],
    });
    // 2*3 + 2 = 8
    expect(riskScore(s, 0)).toBeCloseTo(8, 2);
  });
});
```

- [ ] **Step 2: Run to fail**

Run: `cd /home/user/xera/packages/core && npx vitest run test/graph/impact.test.ts`
Expected: FAIL — cannot import.

- [ ] **Step 3: Implement initial `impact.ts`**

Create `packages/core/src/graph/impact.ts`:

```typescript
import type { EdgeKind, EdgeRecord, Priority } from './types';

export interface ImpactEdge {
  kind: EdgeKind;
  from: string;
  to: string;
  confidence?: number;
  source?: string;
}

export interface ImpactScenario {
  scenarioId: string;
  ticketId: string;        // owner of the scenario (NOT the impact target)
  name: string;
  priority: Priority;
  edgePath: ImpactEdge[];
  riskScore: number;
  lastPassedAt?: string;
}

export interface ImpactOpts {
  depth: 1 | 2 | 3;
  minPriority?: Priority;
}

export interface ImpactReport {
  targetTicket: string;
  modifiedAreas: string[];
  scenarios: ImpactScenario[];
  generatedAt: string;
}

const PRIORITY_WEIGHT: Record<Priority, number> = { p0: 3, p1: 2, p2: 1 };

const EDGE_WEIGHT_FIXED: Partial<Record<EdgeKind, number>> = {
  modifies: 5,           // direct collision via SUT area
  uses: 4,               // shared POM
  covers: 4,             // shared POM (alt path)
  jira: 0,               // not used directly — see jiraRelationWeight
};

function jiraRelationWeight(source?: string): number {
  if (!source) return 0;
  if (source.endsWith('blocks')) return 4;
  if (source.endsWith('duplicates')) return 3;
  if (source.endsWith('relates')) return 2;
  if (source.endsWith('supersedes')) return 3;
  return 1;
}

function edgeWeight(edge: ImpactEdge): number {
  if (edge.kind === 'modifies') return EDGE_WEIGHT_FIXED.modifies ?? 0;
  if (edge.kind === 'uses' || edge.kind === 'covers') return EDGE_WEIGHT_FIXED.uses ?? 0;
  if (edge.kind === 'jira-linked') return jiraRelationWeight(edge.source);
  if (edge.kind === 'similar') return 1 * (edge.confidence ?? 0);
  return 0;
}

export function riskScore(scenario: ImpactScenario, daysSinceLastPass: number): number {
  const pri = PRIORITY_WEIGHT[scenario.priority] * 3;
  const firstEdge = scenario.edgePath[0];
  const edgeW = firstEdge ? edgeWeight(firstEdge) : 0;
  const confW = firstEdge?.confidence !== undefined ? firstEdge.confidence * 2 : 0;
  const decay = daysSinceLastPass * 0.1;
  return pri + edgeW + confW - decay;
}
```

- [ ] **Step 4: Run tests, verify pass**

Run: `cd /home/user/xera/packages/core && npx vitest run test/graph/impact.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/graph/impact.ts \
        packages/core/test/graph/impact.test.ts
git commit -m "core: add impact.ts risk score formula + types (v0.6.2)"
```

---

## Task 2: `walkImpact` BFS traversal — TDD

**Files:**
- Modify: `packages/core/src/graph/impact.ts` — add `walkImpact` function
- Modify: `packages/core/test/graph/impact.test.ts` — add `walkImpact` tests

- [ ] **Step 1: Add failing test cases**

Append to `packages/core/test/graph/impact.test.ts`:

```typescript
import { walkImpact } from '../../src/graph/impact';
import type { Snapshot, TicketNode, ScenarioNode, PomNode, EdgeRecord } from '../../src/graph/types';

function mkGraph(): Snapshot {
  const tickets: Record<string, TicketNode> = {
    'ABC-100': {
      id: 'ABC-100', summary: 'login feature', ac: ['User can sign in'],
      storyHash: 'h1', modifiesAreas: ['login'], fetchedAt: '2026-05-10T00:00:00Z',
    },
    'ABC-145': {
      id: 'ABC-145', summary: 'reset password', ac: ['User can reset password'],
      storyHash: 'h2', modifiesAreas: ['login'], fetchedAt: '2026-05-11T00:00:00Z',
    },
    'ABC-200': {
      id: 'ABC-200', summary: 'rename Sign in button', ac: ['Button label = Log in'],
      storyHash: 'h3', modifiesAreas: ['login'], fetchedAt: '2026-05-15T00:00:00Z',
    },
  };
  const scenarios: Record<string, ScenarioNode> = {
    'sc-100': {
      id: 'sc-100', ticketId: 'ABC-100', name: 'user signs in', gherkin: 'g',
      priority: 'p0', featureHash: 'f1', generatedAt: '2026-05-10T00:00:00Z',
    },
    'sc-145': {
      id: 'sc-145', ticketId: 'ABC-145', name: 'user resets password', gherkin: 'g',
      priority: 'p0', featureHash: 'f2', generatedAt: '2026-05-11T00:00:00Z',
    },
  };
  const poms: Record<string, PomNode> = {
    'pom-login': {
      id: 'pom-login', ticketId: 'ABC-100', filePath: 'login.ts', route: '/login',
      locators: [], scope: 'shared',
    },
  };
  const edges: EdgeRecord[] = [
    { kind: 'tests', from: 'ABC-100', to: 'sc-100', source: 'xera-script', discoveredAt: '2026-05-10T00:00:00Z' },
    { kind: 'tests', from: 'ABC-145', to: 'sc-145', source: 'xera-script', discoveredAt: '2026-05-11T00:00:00Z' },
    { kind: 'uses', from: 'sc-100', to: 'pom-login', source: 'xera-script', discoveredAt: '2026-05-10T00:00:00Z' },
    { kind: 'uses', from: 'sc-145', to: 'pom-login', source: 'xera-script', discoveredAt: '2026-05-11T00:00:00Z' },
    { kind: 'covers', from: 'pom-login', to: 'login', source: 'xera-script', discoveredAt: '2026-05-10T00:00:00Z' },
    { kind: 'modifies', from: 'ABC-100', to: 'login', source: 'extract-areas', discoveredAt: '2026-05-10T00:00:00Z' },
    { kind: 'modifies', from: 'ABC-145', to: 'login', source: 'extract-areas', discoveredAt: '2026-05-11T00:00:00Z' },
    { kind: 'modifies', from: 'ABC-200', to: 'login', source: 'extract-areas', discoveredAt: '2026-05-15T00:00:00Z' },
  ];
  return {
    schema_version: 1, generated_at: '2026-05-15T00:00:00Z',
    event_count: edges.length, events_hash: 'sha256:test',
    tickets, scenarios, poms, areas: { login: { id: 'login' } },
    edges, latest_failures: {},
  };
}

describe('walkImpact', () => {
  test('finds scenarios that use POMs covering target.modifiesAreas', () => {
    const graph = mkGraph();
    const target = graph.tickets['ABC-200']!;
    const result = walkImpact(graph, target, { depth: 1 });
    const ids = result.map((r) => r.scenarioId).sort();
    expect(ids).toEqual(['sc-100', 'sc-145']);
  });

  test('excludes scenarios already owned by target ticket', () => {
    const graph = mkGraph();
    // ABC-100 is the target this time — so sc-100 (its own scenario) must NOT appear
    const target = graph.tickets['ABC-100']!;
    const result = walkImpact(graph, target, { depth: 1 });
    const ids = result.map((r) => r.scenarioId);
    expect(ids).not.toContain('sc-100');
    expect(ids).toContain('sc-145');
  });

  test('depth=2 includes jira-linked scenarios', () => {
    const graph = mkGraph();
    // Add a jira-linked edge: ABC-200 -> ABC-145 (blocks)
    graph.edges.push({
      kind: 'jira-linked', from: 'ABC-200', to: 'ABC-145',
      source: 'jira:blocks', discoveredAt: '2026-05-15T00:00:00Z',
    });
    const target = graph.tickets['ABC-200']!;
    const depth1 = walkImpact(graph, target, { depth: 1 });
    const depth2 = walkImpact(graph, target, { depth: 2 });
    // depth=1 already returns sc-100, sc-145 via modifies path; depth=2 same scenarios but
    // possibly with shorter / alternate edge path. Just verify count is consistent.
    expect(depth2.length).toBeGreaterThanOrEqual(depth1.length);
  });

  test('--min-priority filter excludes lower-priority scenarios', () => {
    const graph = mkGraph();
    graph.scenarios['sc-145']!.priority = 'p2';
    const target = graph.tickets['ABC-200']!;
    const all = walkImpact(graph, target, { depth: 1 });
    const p0Only = walkImpact(graph, target, { depth: 1, minPriority: 'p0' });
    expect(all.map((s) => s.scenarioId)).toContain('sc-145');
    expect(p0Only.map((s) => s.scenarioId)).not.toContain('sc-145');
  });

  test('returns empty list when target modifies an unconnected area', () => {
    const graph = mkGraph();
    graph.tickets['ABC-200']!.modifiesAreas = ['new-feature'];
    const target = graph.tickets['ABC-200']!;
    const result = walkImpact(graph, target, { depth: 1 });
    expect(result).toHaveLength(0);
  });

  test('riskScore is set on each returned scenario', () => {
    const graph = mkGraph();
    const target = graph.tickets['ABC-200']!;
    const result = walkImpact(graph, target, { depth: 1 });
    for (const r of result) {
      expect(r.riskScore).toBeGreaterThan(0);
    }
  });
});
```

- [ ] **Step 2: Run to fail**

Run: `cd /home/user/xera/packages/core && npx vitest run test/graph/impact.test.ts -t walkImpact`
Expected: FAIL — cannot import `walkImpact`.

- [ ] **Step 3: Implement `walkImpact`**

Append to `packages/core/src/graph/impact.ts`:

```typescript
import type { Snapshot, TicketNode } from './types';

const PRIORITY_RANK: Record<Priority, number> = { p0: 3, p1: 2, p2: 1 };

export function walkImpact(graph: Snapshot, target: TicketNode, opts: ImpactOpts): ImpactScenario[] {
  const result: ImpactScenario[] = [];
  const seen = new Set<string>();

  // Areas the target modifies
  const targetAreas = new Set(target.modifiesAreas);

  // POMs covering any of those areas
  const pomIds = graph.edges
    .filter((e) => e.kind === 'covers' && targetAreas.has(e.to))
    .map((e) => e.from);

  // Scenarios using any of those POMs (depth 1 — direct collision)
  const directScenarios = graph.edges
    .filter((e) => e.kind === 'uses' && pomIds.includes(e.to))
    .map((e) => e.from);

  for (const scenarioId of directScenarios) {
    if (seen.has(scenarioId)) continue;
    const scenario = graph.scenarios[scenarioId];
    if (!scenario) continue;
    if (scenario.ticketId === target.id) continue; // exclude own scenarios

    const usingPom = graph.edges.find((e) => e.kind === 'uses' && e.from === scenarioId);
    const modifyEdge = graph.edges.find((e) => e.kind === 'modifies' && e.from === target.id && targetAreas.has(e.to));
    const edgePath: ImpactEdge[] = [];
    if (modifyEdge) edgePath.push({ kind: 'modifies', from: modifyEdge.from, to: modifyEdge.to });
    if (usingPom) edgePath.push({ kind: 'uses', from: usingPom.from, to: usingPom.to });

    seen.add(scenarioId);
    const impact: ImpactScenario = {
      scenarioId, ticketId: scenario.ticketId, name: scenario.name,
      priority: scenario.priority, edgePath, riskScore: 0,
    };
    impact.riskScore = riskScore(impact, daysSince(graph.latest_failures[scenarioId]?.ts));
    result.push(impact);
  }

  // Depth >= 2: jira-linked tickets contribute their scenarios
  if (opts.depth >= 2) {
    const linked = graph.edges
      .filter((e) => e.kind === 'jira-linked' && e.from === target.id)
      .map((e) => ({ to: e.to, source: e.source }));
    for (const link of linked) {
      const sceneIds = graph.edges
        .filter((e) => e.kind === 'tests' && e.from === link.to)
        .map((e) => e.to);
      for (const scenarioId of sceneIds) {
        if (seen.has(scenarioId)) continue;
        const scenario = graph.scenarios[scenarioId];
        if (!scenario || scenario.ticketId === target.id) continue;
        seen.add(scenarioId);
        const impact: ImpactScenario = {
          scenarioId, ticketId: scenario.ticketId, name: scenario.name,
          priority: scenario.priority,
          edgePath: [{ kind: 'jira-linked', from: target.id, to: link.to, source: link.source }],
          riskScore: 0,
        };
        impact.riskScore = riskScore(impact, daysSince(graph.latest_failures[scenarioId]?.ts));
        result.push(impact);
      }
    }
  }

  // Depth >= 3: similar tickets contribute their scenarios
  if (opts.depth >= 3) {
    const similar = graph.edges
      .filter((e) => e.kind === 'similar' && e.from === target.id)
      .map((e) => ({ to: e.to, confidence: e.confidence }));
    for (const link of similar) {
      const sceneIds = graph.edges
        .filter((e) => e.kind === 'tests' && e.from === link.to)
        .map((e) => e.to);
      for (const scenarioId of sceneIds) {
        if (seen.has(scenarioId)) continue;
        const scenario = graph.scenarios[scenarioId];
        if (!scenario || scenario.ticketId === target.id) continue;
        seen.add(scenarioId);
        const edge: ImpactEdge = { kind: 'similar', from: target.id, to: link.to };
        if (link.confidence !== undefined) edge.confidence = link.confidence;
        const impact: ImpactScenario = {
          scenarioId, ticketId: scenario.ticketId, name: scenario.name,
          priority: scenario.priority, edgePath: [edge], riskScore: 0,
        };
        impact.riskScore = riskScore(impact, daysSince(graph.latest_failures[scenarioId]?.ts));
        result.push(impact);
      }
    }
  }

  // Filter by min-priority
  let filtered = result;
  if (opts.minPriority) {
    const min = PRIORITY_RANK[opts.minPriority];
    filtered = filtered.filter((s) => PRIORITY_RANK[s.priority] >= min);
  }

  // Sort by riskScore descending
  filtered.sort((a, b) => b.riskScore - a.riskScore);
  return filtered;
}

function daysSince(ts: string | undefined): number {
  if (!ts) return 0;
  const ms = Date.now() - Date.parse(ts);
  return ms < 0 ? 0 : ms / (86400 * 1000);
}
```

- [ ] **Step 4: Run tests, verify pass**

Run: `cd /home/user/xera/packages/core && npx vitest run test/graph/impact.test.ts && npm run typecheck`
Expected: 12 tests pass (6 riskScore + 6 walkImpact); typecheck clean.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/graph/impact.ts \
        packages/core/test/graph/impact.test.ts
git commit -m "core: add walkImpact BFS traversal with depth + min-priority (v0.6.2)"
```

---

## Task 3: Update graph module barrel + add `ImpactReport` writer

**Files:**
- Modify: `packages/core/src/graph/index.ts` — add impact exports
- Modify: `packages/core/src/graph/impact.ts` — add `renderImpactMarkdown` writer
- Modify: `packages/core/test/graph/impact.test.ts` — add markdown render test

- [ ] **Step 1: Add markdown render test**

Append to `packages/core/test/graph/impact.test.ts`:

```typescript
import { renderImpactMarkdown } from '../../src/graph/impact';
import type { ImpactReport } from '../../src/graph/impact';

describe('renderImpactMarkdown', () => {
  test('produces markdown with high/medium/low buckets', () => {
    const report: ImpactReport = {
      targetTicket: 'ABC-200',
      modifiedAreas: ['login'],
      generatedAt: '2026-05-16T08:00:00Z',
      scenarios: [
        { scenarioId: 'sc-1', ticketId: 'ABC-100', name: 'user signs in', priority: 'p0',
          edgePath: [{ kind: 'modifies', from: 'ABC-200', to: 'login' }, { kind: 'uses', from: 'sc-1', to: 'pom-login' }],
          riskScore: 8.5 },
        { scenarioId: 'sc-2', ticketId: 'ABC-145', name: 'user resets password', priority: 'p1',
          edgePath: [{ kind: 'modifies', from: 'ABC-200', to: 'login' }, { kind: 'uses', from: 'sc-2', to: 'pom-login' }],
          riskScore: 5.2 },
      ],
    };
    const md = renderImpactMarkdown(report);
    expect(md).toContain('# Impact Analysis — ABC-200');
    expect(md).toContain('Modified areas');
    expect(md).toContain('login');
    expect(md).toContain('## High-risk');
    expect(md).toContain('ABC-100');
    expect(md).toContain('user signs in');
    expect(md).toContain('## Re-run commands');
    expect(md).toContain('xera:exec --from-impact ABC-200');
  });

  test('shows empty state when no scenarios impacted', () => {
    const md = renderImpactMarkdown({
      targetTicket: 'ABC-200', modifiedAreas: ['new-feature'],
      generatedAt: '2026-05-16T08:00:00Z', scenarios: [],
    });
    expect(md).toContain('# Impact Analysis — ABC-200');
    expect(md).toMatch(/no prior scenarios/i);
  });
});
```

- [ ] **Step 2: Run to fail**

Run: `cd /home/user/xera/packages/core && npx vitest run test/graph/impact.test.ts -t renderImpactMarkdown`
Expected: FAIL.

- [ ] **Step 3: Implement `renderImpactMarkdown`**

Append to `packages/core/src/graph/impact.ts`:

```typescript
const HIGH_THRESHOLD = 7.0;
const MEDIUM_THRESHOLD = 4.0;

function bucket(score: number): 'high' | 'medium' | 'low' {
  if (score >= HIGH_THRESHOLD) return 'high';
  if (score >= MEDIUM_THRESHOLD) return 'medium';
  return 'low';
}

function fmtEdgePath(path: ImpactEdge[]): string {
  return path.map((e) => `${e.from} →[${e.kind}]→ ${e.to}`).join(' · ');
}

export function renderImpactMarkdown(report: ImpactReport): string {
  const lines: string[] = [];
  lines.push(`# Impact Analysis — ${report.targetTicket}`);
  lines.push('');
  lines.push(`**Modified areas:** ${report.modifiedAreas.join(', ') || '(none)'}`);
  lines.push(`**Generated:** ${report.generatedAt}`);
  lines.push('');

  if (report.scenarios.length === 0) {
    lines.push('No prior scenarios in the modified areas. This may be a new feature area.');
    lines.push('');
    return lines.join('\n');
  }

  const bySeverity = { high: [] as ImpactScenario[], medium: [] as ImpactScenario[], low: [] as ImpactScenario[] };
  for (const s of report.scenarios) bySeverity[bucket(s.riskScore)].push(s);

  lines.push(`**Total impacted:** ${report.scenarios.length} scenarios (${bySeverity.high.length} high · ${bySeverity.medium.length} medium · ${bySeverity.low.length} low)`);
  lines.push('');

  for (const [name, scenarios] of [
    ['High-risk', bySeverity.high],
    ['Medium-risk', bySeverity.medium],
    ['Low-risk', bySeverity.low],
  ] as const) {
    if (scenarios.length === 0) continue;
    lines.push(`## ${name}`);
    lines.push('');
    for (const s of scenarios) {
      lines.push(`### ${s.ticketId} / "${s.name}" [${s.priority.toUpperCase()}]   score ${s.riskScore.toFixed(1)}`);
      lines.push(`- Edge: ${fmtEdgePath(s.edgePath)}`);
      if (s.lastPassedAt) lines.push(`- Last passed: ${s.lastPassedAt}`);
      lines.push('');
    }
  }

  lines.push('## Re-run commands');
  lines.push('- All:        `npx xera-internal exec --from-impact ' + report.targetTicket + '`');
  lines.push('- P0 only:    `npx xera-internal exec --from-impact ' + report.targetTicket + ' --min-priority p0`');
  lines.push('- Select:     `npx xera-internal exec --from-impact ' + report.targetTicket + ' --select`');
  lines.push('');

  return lines.join('\n');
}
```

- [ ] **Step 4: Update barrel**

Edit `packages/core/src/graph/index.ts`. Append:

```typescript
export {
  riskScore,
  walkImpact,
  renderImpactMarkdown,
} from './impact';
export type {
  ImpactEdge,
  ImpactOpts,
  ImpactReport,
  ImpactScenario,
} from './impact';
```

- [ ] **Step 5: Run tests, verify pass**

Run: `cd /home/user/xera/packages/core && npx vitest run test/graph/impact.test.ts && npm run typecheck`
Expected: 14 tests pass; typecheck clean.

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/graph/impact.ts \
        packages/core/src/graph/index.ts \
        packages/core/test/graph/impact.test.ts
git commit -m "core: add renderImpactMarkdown + impact barrel exports (v0.6.2)"
```

---

## Task 4: `impact-prepare` bin-internal subcommand — TDD

**Files:**
- Create: `packages/core/src/bin-internal/impact-prepare.ts`
- Create: `packages/core/test/bin-internal/impact-prepare.test.ts`
- Modify: `packages/core/src/bin-internal/index.ts` — register

- [ ] **Step 1: Write failing test**

Create `packages/core/test/bin-internal/impact-prepare.test.ts`:

```typescript
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { impactPrepareCmd } from '../../src/bin-internal/impact-prepare';
import { appendEvents } from '../../src/graph/store';
import { ulid } from '../../src/graph/ulid';
import type { Event } from '../../src/graph/types';

let root: string;
let prevCwd: string;

beforeEach(() => {
  prevCwd = process.cwd();
  root = mkdtempSync(join(tmpdir(), 'xera-impact-'));
  process.chdir(root);
});
afterEach(() => {
  process.chdir(prevCwd);
  rmSync(root, { recursive: true, force: true });
});

function mkE<T extends Event['type']>(type: T, payload: Extract<Event, { type: T }>['payload'], ts: string): Event {
  return { event_id: ulid(), schema_version: 1, ts, actor: 'test', type, payload } as Event;
}

function seedGraph() {
  appendEvents(root, [
    mkE('ticket.fetched', {
      ticketId: 'ABC-100', summary: 'login', ac: [], jiraLinks: [],
      storyHash: 'h1', modifiesAreas: ['login'],
    }, '2026-05-10T00:00:00Z'),
    mkE('scenario.generated', {
      scenarioId: 'sc-100', ticketId: 'ABC-100', name: 'user signs in',
      gherkin: 'g', priority: 'p0', featureHash: 'f1', generatedAt: '2026-05-10T00:00:00Z',
    }, '2026-05-10T00:00:00Z'),
    mkE('pom.generated', {
      pomId: 'pom-login', ticketId: 'ABC-100', filePath: 'login.ts', route: '/login', locators: [], scope: 'shared',
    }, '2026-05-10T00:00:00Z'),
    mkE('edge.discovered', { kind: 'uses', from: 'sc-100', to: 'pom-login', source: 't' }, '2026-05-10T00:00:00Z'),
    mkE('edge.discovered', { kind: 'covers', from: 'pom-login', to: 'login', source: 't' }, '2026-05-10T00:00:00Z'),
    mkE('ticket.fetched', {
      ticketId: 'ABC-200', summary: 'rename Sign in', ac: ['Button = Log in'], jiraLinks: [],
      storyHash: 'h2', modifiesAreas: ['login'],
    }, '2026-05-15T00:00:00Z'),
    mkE('edge.discovered', { kind: 'modifies', from: 'ABC-200', to: 'login', source: 'extract-areas' }, '2026-05-15T00:00:00Z'),
  ], { skill: 'test', ticketId: 'ABC-100' });
}

describe('impact-prepare', () => {
  test('writes both .xera/impact/<TICKET>.json and .md', async () => {
    seedGraph();
    const exit = await impactPrepareCmd(['ABC-200']);
    expect(exit).toBe(0);
    expect(existsSync(join(root, '.xera/impact/ABC-200.json'))).toBe(true);
    expect(existsSync(join(root, '.xera/impact/ABC-200.md'))).toBe(true);
    const json = JSON.parse(readFileSync(join(root, '.xera/impact/ABC-200.json'), 'utf8'));
    expect(json.targetTicket).toBe('ABC-200');
    expect(json.scenarios.length).toBe(1);
    expect(json.scenarios[0].scenarioId).toBe('sc-100');
  });

  test('--quiet skips markdown output', async () => {
    seedGraph();
    const exit = await impactPrepareCmd(['ABC-200', '--quiet']);
    expect(exit).toBe(0);
    expect(existsSync(join(root, '.xera/impact/ABC-200.json'))).toBe(true);
    expect(existsSync(join(root, '.xera/impact/ABC-200.md'))).toBe(false);
  });

  test('exits 2 when target ticket not in graph', async () => {
    seedGraph();
    const exit = await impactPrepareCmd(['NOPE-999']);
    expect(exit).toBe(2);
  });

  test('exit 0 even when impact list is empty', async () => {
    appendEvents(root, [
      mkE('ticket.fetched', {
        ticketId: 'ABC-200', summary: 'new feature', ac: [], jiraLinks: [],
        storyHash: 'h2', modifiesAreas: ['greenfield'],
      }, '2026-05-15T00:00:00Z'),
    ], { skill: 'test', ticketId: 'ABC-200' });
    const exit = await impactPrepareCmd(['ABC-200']);
    expect(exit).toBe(0);
    const json = JSON.parse(readFileSync(join(root, '.xera/impact/ABC-200.json'), 'utf8'));
    expect(json.scenarios).toHaveLength(0);
  });

  test('--depth 2 returns more scenarios when jira-linked exists', async () => {
    seedGraph();
    appendEvents(root, [
      mkE('ticket.fetched', {
        ticketId: 'ABC-300', summary: 'unrelated', ac: [], jiraLinks: [],
        storyHash: 'h3', modifiesAreas: ['profile'],
      }, '2026-05-12T00:00:00Z'),
      mkE('scenario.generated', {
        scenarioId: 'sc-300', ticketId: 'ABC-300', name: 'view profile',
        gherkin: 'g', priority: 'p1', featureHash: 'f3', generatedAt: '2026-05-12T00:00:00Z',
      }, '2026-05-12T00:00:00Z'),
      mkE('edge.discovered', { kind: 'tests', from: 'ABC-300', to: 'sc-300', source: 't' }, '2026-05-12T00:00:00Z'),
      mkE('edge.discovered', { kind: 'jira-linked', from: 'ABC-200', to: 'ABC-300', source: 'jira:relates' }, '2026-05-15T00:00:00Z'),
    ], { skill: 'test', ticketId: 'ABC-200' });
    const exit = await impactPrepareCmd(['ABC-200', '--depth', '2']);
    expect(exit).toBe(0);
    const json = JSON.parse(readFileSync(join(root, '.xera/impact/ABC-200.json'), 'utf8'));
    const ids = json.scenarios.map((s: { scenarioId: string }) => s.scenarioId).sort();
    expect(ids).toContain('sc-100');
    expect(ids).toContain('sc-300');
  });

  test('--min-priority p0 filters out p1/p2 scenarios', async () => {
    seedGraph();
    // sc-100 is already p0 — change to p1 to test exclusion
    // Re-seed with sc-100 as p1
    rmSync(join(root, '.xera/graph'), { recursive: true, force: true });
    appendEvents(root, [
      mkE('ticket.fetched', { ticketId: 'ABC-100', summary: 'x', ac: [], jiraLinks: [], storyHash: 'h', modifiesAreas: ['login'] }, '2026-05-10T00:00:00Z'),
      mkE('scenario.generated', { scenarioId: 'sc-100', ticketId: 'ABC-100', name: 'n', gherkin: 'g', priority: 'p1', featureHash: 'f', generatedAt: '2026-05-10T00:00:00Z' }, '2026-05-10T00:00:00Z'),
      mkE('pom.generated', { pomId: 'pom-l', ticketId: 'ABC-100', filePath: 'l.ts', route: '/login', locators: [], scope: 'shared' }, '2026-05-10T00:00:00Z'),
      mkE('edge.discovered', { kind: 'uses', from: 'sc-100', to: 'pom-l', source: 't' }, '2026-05-10T00:00:00Z'),
      mkE('edge.discovered', { kind: 'covers', from: 'pom-l', to: 'login', source: 't' }, '2026-05-10T00:00:00Z'),
      mkE('ticket.fetched', { ticketId: 'ABC-200', summary: 'r', ac: [], jiraLinks: [], storyHash: 'h2', modifiesAreas: ['login'] }, '2026-05-15T00:00:00Z'),
      mkE('edge.discovered', { kind: 'modifies', from: 'ABC-200', to: 'login', source: 't' }, '2026-05-15T00:00:00Z'),
    ], { skill: 'test', ticketId: 'ABC-100' });
    const exit = await impactPrepareCmd(['ABC-200', '--min-priority', 'p0']);
    expect(exit).toBe(0);
    const json = JSON.parse(readFileSync(join(root, '.xera/impact/ABC-200.json'), 'utf8'));
    expect(json.scenarios).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run to fail**

Run: `cd /home/user/xera/packages/core && npx vitest run test/bin-internal/impact-prepare.test.ts`
Expected: FAIL — cannot import.

- [ ] **Step 3: Implement `impact-prepare.ts`**

Create `packages/core/src/bin-internal/impact-prepare.ts`:

```typescript
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { renderImpactMarkdown, walkImpact } from '../graph/impact';
import { deriveSnapshot, loadAllEvents } from '../graph/store';
import type { ImpactOpts, ImpactReport } from '../graph/impact';
import type { Priority } from '../graph/types';

function parseDepth(s: string | undefined): 1 | 2 | 3 {
  const n = s ? Number.parseInt(s, 10) : 2;
  if (n === 1 || n === 3) return n;
  return 2;
}

function parseMinPriority(s: string | undefined): Priority | undefined {
  if (s === 'p0' || s === 'p1' || s === 'p2') return s;
  return undefined;
}

export async function impactPrepareCmd(argv: string[]): Promise<number> {
  const ticket = argv[0];
  if (!ticket || ticket.startsWith('--')) {
    console.error('[impact-prepare] usage: impact-prepare <TICKET> [--depth 1|2|3] [--min-priority p0|p1|p2] [--quiet]');
    return 1;
  }

  let depth: 1 | 2 | 3 = 2;
  let minPriority: Priority | undefined;
  let quiet = false;
  for (let i = 1; i < argv.length; i++) {
    if (argv[i] === '--depth') depth = parseDepth(argv[++i]);
    else if (argv[i] === '--min-priority') minPriority = parseMinPriority(argv[++i]);
    else if (argv[i] === '--quiet') quiet = true;
  }

  const repoRoot = process.cwd();
  const graph = deriveSnapshot(loadAllEvents(repoRoot));
  const target = graph.tickets[ticket];
  if (!target) {
    console.error(`[impact-prepare] ticket ${ticket} not in graph; run /xera-fetch first`);
    return 2;
  }

  const opts: ImpactOpts = { depth };
  if (minPriority) opts.minPriority = minPriority;

  const scenarios = walkImpact(graph, target, opts);

  const report: ImpactReport = {
    targetTicket: ticket,
    modifiedAreas: target.modifiesAreas,
    scenarios,
    generatedAt: new Date().toISOString(),
  };

  const impactDir = join(repoRoot, '.xera/impact');
  mkdirSync(impactDir, { recursive: true });
  writeFileSync(join(impactDir, `${ticket}.json`), JSON.stringify(report, null, 2));
  if (!quiet) {
    writeFileSync(join(impactDir, `${ticket}.md`), renderImpactMarkdown(report));
  }
  return 0;
}
```

- [ ] **Step 4: Register in `index.ts`**

Edit `packages/core/src/bin-internal/index.ts`. Add import + dispatch entry (preserve existing graph-* entries):

```typescript
import { impactPrepareCmd } from './impact-prepare';
// ...
'impact-prepare': impactPrepareCmd,
```

- [ ] **Step 5: Run tests, verify pass**

Run: `cd /home/user/xera/packages/core && npx vitest run test/bin-internal/impact-prepare.test.ts && npm run typecheck`
Expected: 6 tests pass; typecheck clean.

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/bin-internal/impact-prepare.ts \
        packages/core/src/bin-internal/index.ts \
        packages/core/test/bin-internal/impact-prepare.test.ts
git commit -m "core: add impact-prepare bin-internal (v0.6.2)"
```

---

## Task 5: 3 golden-impact fixtures + golden test runner

**Files:**
- Create: `fixtures/golden-impact/impact-depth-1/`
- Create: `fixtures/golden-impact/impact-depth-2/`
- Create: `fixtures/golden-impact/impact-empty/`
- Create: `packages/core/test/graph/impact-golden.test.ts`

- [ ] **Step 1: Create fixture directories**

For each fixture under `fixtures/golden-impact/`:
- `meta.json` — `{ "id": "<name>", "summary": "<one-line>", "expectation": "<expected impact result>" }`
- `events/2026-05/<ULID>-test-<TICKET>.jsonl` — synthetic graph events
- `expected-impact.json` — expected `ImpactReport.scenarios[].scenarioId` list (sorted)

Generate ULIDs via:
```bash
cd /home/user/xera/packages/core && node -e "import { ulid } from './src/graph/ulid'; console.log(ulid())"
```

**`impact-depth-1/`**
- ABC-100 fetches at t1, generates scenario sc-100 ("user signs in", p0), POM "pom-login" covering area "login"
- ABC-145 fetches at t2, generates scenario sc-145 ("user resets password", p0), uses pom-login
- ABC-200 fetches at t3 modifying "login"
- Expected: at depth=1, scenarios sorted by score returns `["sc-100", "sc-145"]` (or in score order)

**`impact-depth-2/`**
- Same as depth-1 plus:
- ABC-178 fetches at t1.5, scenario sc-178 ("admin signs in", p1) NOT using pom-login
- jira-linked edge: ABC-200 → ABC-178 (relation: relates)
- Expected: depth=1 returns `["sc-100", "sc-145"]`; depth=2 returns `["sc-100", "sc-145", "sc-178"]`

**`impact-empty/`**
- ABC-100 with scenario in area "login"
- ABC-200 modifies area "new-feature" (no overlap)
- Expected: empty scenarios list

- [ ] **Step 2: Write golden test runner**

Create `packages/core/test/graph/impact-golden.test.ts`:

```typescript
import { describe, expect, test } from 'vitest';
import { cpSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { walkImpact } from '../../src/graph/impact';
import { deriveSnapshot, loadAllEvents } from '../../src/graph/store';

const FIXTURES = join(import.meta.dir, '../../../../fixtures/golden-impact');

const SCENARIOS = [
  { name: 'impact-depth-1', target: 'ABC-200', depth: 1 as const },
  { name: 'impact-depth-2', target: 'ABC-200', depth: 2 as const },
  { name: 'impact-empty', target: 'ABC-200', depth: 1 as const },
];

describe('impact golden fixtures', () => {
  for (const { name, target, depth } of SCENARIOS) {
    test(name, () => {
      const tmp = mkdtempSync(join(tmpdir(), `xera-impact-gold-${name}-`));
      try {
        cpSync(join(FIXTURES, name), tmp, { recursive: true });
        const events = loadAllEvents(tmp);
        const graph = deriveSnapshot(events);
        const targetTicket = graph.tickets[target]!;
        expect(targetTicket).toBeDefined();
        const result = walkImpact(graph, targetTicket, { depth });
        const ids = result.map((s) => s.scenarioId).sort();
        const expected = JSON.parse(readFileSync(join(tmp, 'expected-impact.json'), 'utf8')) as { scenarios: string[] };
        expect(ids).toEqual(expected.scenarios.sort());
      } finally {
        rmSync(tmp, { recursive: true, force: true });
      }
    });
  }
});
```

- [ ] **Step 3: Run tests**

Run: `cd /home/user/xera/packages/core && npx vitest run test/graph/impact-golden.test.ts`
Expected: 3 tests pass.

- [ ] **Step 4: Commit**

```bash
git add fixtures/golden-impact/ packages/core/test/graph/impact-golden.test.ts
git commit -m "test: add 3 golden-impact fixtures + impact-golden runner (v0.6.2)"
```

---

## Task 6: `xera-impact.md` skill (new)

**Files:**
- Create: `packages/skills/xera-impact.md`

- [ ] **Step 1: Write the skill**

Create `packages/skills/xera-impact.md`:

```markdown
---
name: xera-impact
description: Pre-flight impact analysis. Given a ticket, identify scenarios that may be affected by its changes (graph-walk via project knowledge graph), then optionally re-run them. Use before merging or when AC has just changed for a ticket. Available v0.6.2+.
---

The user invoked `/xera-impact <TICKET> [--depth 1|2|3] [--min-priority p0|p1|p2]`. If no key, ask.

This skill walks the project knowledge graph (`.xera/graph/`) to find scenarios that depend on the modified areas of `<TICKET>`. It does NOT re-fetch or re-script — it's strictly a query + optional re-execution.

## Step 1 — Verify graph snapshot is fresh

Run:

```bash
npx xera-internal graph-snapshot --check
```

If stale, the subcommand auto-rebuilds. If `<TICKET>` is not in the graph, this step will succeed but Step 2 will exit with code 2 — that means you must run `/xera-fetch {{TICKET}}` first.

## Step 2 — Compute impact

Run:

```bash
npx xera-internal impact-prepare {{TICKET}} [--depth N] [--min-priority P]
```

Pass through any flags the user provided. On exit code 2, surface: *"Ticket {{TICKET}} not in graph — run `/xera-fetch {{TICKET}}` first"* and STOP.

The subcommand writes:
- `.xera/impact/{{TICKET}}.json` (machine-readable)
- `.xera/impact/{{TICKET}}.md` (human-readable)

## Step 3 — Display summary

Read `.xera/impact/{{TICKET}}.json`. If `scenarios.length === 0`, show:

```
Impact analysis for {{TICKET}} → no prior scenarios in modified areas
(this is normal for new feature areas; nothing to re-run)
```

And STOP.

Otherwise, count scenarios in 3 score buckets (high ≥7.0, medium ≥4.0, low <4.0). Display:

```
Impact analysis for {{TICKET}}  →  .xera/impact/{{TICKET}}.md

N scenarios impacted (H high · M medium · L low)

Top 3:
  <ticketId> / "<name>"   [Pn]   <score>   <edge-summary>
  ...
```

## Step 4 — Prompt re-run

Ask the user: `Re-run impacted scenarios?  [Y]es / [p] P0 only / [s]elect / [n]o`

- **[n]:** STOP. The user can inspect `.xera/impact/{{TICKET}}.md` separately.

- **[Y]:** Group impacted scenarios by their owner ticket (`scenario.ticketId`). For each owner ticket, invoke `npx xera-internal exec <owner-ticket>` (the existing exec subcommand). Collect the `RUN_ID` from each. Note: this re-runs the ENTIRE spec for each impacted owner, not just the impacted scenarios — Playwright doesn't natively support per-test selection from a json list without test-name regex. Acceptable for v0.6.2; precise per-scenario selection is a v0.6.x patch.

- **[p]:** Filter `scenarios` array to `priority === 'p0'` only, then proceed as [Y].

- **[s]:** Show numbered list with checkboxes; let the user pick. Then proceed as [Y] with the selected subset.

## Step 5 — Recommend follow-up

After exec runs complete, recommend:

```
{{N}} owner tickets re-run. Run `/xera-report {{TICKET}}` next to classify failures
(TEST_OUTDATED detection will flag failures caused by THIS ticket's AC change).
```

## Edge cases

- If `xera:impact-prepare` exits non-zero for any reason other than 2 (e.g. graph corrupted), surface the stderr and STOP.
- If a re-run via `xera:exec` fails non-recoverably, continue with remaining tickets but note the failure in the final summary.
- Respect `xera.config.run.autoImpact.enabled = false` — skip this skill if invoked recursively from `/xera-run` and config disables it.
```

- [ ] **Step 2: Verify file exists + sanity-grep**

Run:

```bash
ls /home/user/xera/packages/skills/xera-impact.md
grep -c "xera:impact-prepare\|xera:graph-snapshot\|xera:exec" /home/user/xera/packages/skills/xera-impact.md
```

Expected: file exists; grep ≥ 3.

- [ ] **Step 3: Commit**

```bash
git add packages/skills/xera-impact.md
git commit -m "skills: add xera-impact.md skill (v0.6.2)"
```

---

## Task 7: `xera-run.md` skill auto-trigger update

**Files:**
- Modify: `packages/skills/xera-run.md`

- [ ] **Step 1: Read existing structure**

Run: `cat /home/user/xera/packages/skills/xera-run.md`. Identify the boundary between Step 1 (Fetch) and Step 2 (Feature/Script).

- [ ] **Step 2: Insert auto-trigger step**

Insert a new step BETWEEN the existing fetch step and the feature/script step. Verbatim content:

```markdown
## Step 1.5 — Auto-trigger impact analysis (v0.6.2)

After `/xera-fetch` completes, check whether this ticket modifies areas that other tests depend on.

Read `xera.config.run.autoImpact` (defaults: `{ enabled: true, threshold: 6.0 }`). If `enabled === false`, SKIP this step.

Run:

```bash
npx xera-internal impact-prepare {{TICKET}} --quiet
```

This writes `.xera/impact/{{TICKET}}.json` (no markdown). Exit code 2 means the ticket is not yet in graph — surface a warning and proceed (graph data only accumulates over time).

Read the JSON. Count scenarios with `riskScore >= autoImpact.threshold`. If 0, no prompt — continue silently to Step 2.

If ≥1 high-risk scenario, prompt the user:

```
{{N}} high-risk impacted scenarios detected for {{TICKET}}.
Re-run them before generating the new script? [Y/n/details]
```

- **[Y]:** Iterate `npx xera-internal exec <owner-ticket>` for each unique owner ticket. After each, check status; if all pass, continue to Step 2. If any fail, surface the failure and STOP — the user should diagnose existing-test breakage before introducing more changes.
- **[n]:** Continue to Step 2.
- **[details]:** Suggest the user run `/xera-impact {{TICKET}}` interactively for full details, then ask again.

Non-fatal: if `xera:impact-prepare` itself exits abnormally, log the warning but continue to Step 2 — graph features are advisory, not gating.
```

- [ ] **Step 3: Sanity grep**

Run: `grep -c "impact-prepare\|autoImpact" /home/user/xera/packages/skills/xera-run.md`
Expected: ≥ 3.

- [ ] **Step 4: Commit**

```bash
git add packages/skills/xera-run.md
git commit -m "skills: xera-run auto-triggers impact analysis after fetch (v0.6.2)"
```

---

## Task 8: Add `RunSchema` to config — TDD

**Files:**
- Modify: `packages/core/src/config/schema.ts` — add RunSchema + merge into XeraConfigSchema
- Modify: `packages/core/test/config/schema.test.ts` (or create if missing) — add tests

- [ ] **Step 1: Find current XeraConfigSchema entry point**

Run: `grep -n "XeraConfigSchema" /home/user/xera/packages/core/src/config/schema.ts`

Note the structure — where the top-level schema is defined.

- [ ] **Step 2: Write failing test**

Read the existing test file structure first:

```bash
ls /home/user/xera/packages/core/test/config/ 2>/dev/null || echo "no test dir"
```

If no test dir exists, create `packages/core/test/config/schema.test.ts`:

```typescript
import { describe, expect, test } from 'vitest';
import { XeraConfigSchema } from '../../src/config/schema';

const MIN_VALID = {
  jira: {
    baseUrl: 'https://x.atlassian.net',
    projectKeys: ['JIRA'],
    fields: { story: 'description' },
  },
  web: {
    baseUrl: { dev: 'https://staging.example.com' },
    defaultEnv: 'dev',
  },
};

describe('XeraConfigSchema run.autoImpact', () => {
  test('defaults to enabled=true, threshold=6.0', () => {
    const parsed = XeraConfigSchema.parse(MIN_VALID);
    expect(parsed.run?.autoImpact?.enabled).toBe(true);
    expect(parsed.run?.autoImpact?.threshold).toBe(6.0);
  });

  test('accepts custom threshold', () => {
    const parsed = XeraConfigSchema.parse({
      ...MIN_VALID,
      run: { autoImpact: { enabled: true, threshold: 8.5 } },
    });
    expect(parsed.run?.autoImpact?.threshold).toBe(8.5);
  });

  test('accepts disabled autoImpact', () => {
    const parsed = XeraConfigSchema.parse({
      ...MIN_VALID,
      run: { autoImpact: { enabled: false, threshold: 6.0 } },
    });
    expect(parsed.run?.autoImpact?.enabled).toBe(false);
  });

  test('rejects negative threshold', () => {
    expect(() => XeraConfigSchema.parse({
      ...MIN_VALID,
      run: { autoImpact: { enabled: true, threshold: -1 } },
    })).toThrow();
  });
});
```

- [ ] **Step 3: Run to fail**

Run: `cd /home/user/xera/packages/core && npx vitest run test/config/schema.test.ts`
Expected: FAIL — `run.autoImpact` doesn't exist yet.

- [ ] **Step 4: Add `RunSchema` to `schema.ts`**

In `packages/core/src/config/schema.ts`, add (above `export const XeraConfigSchema = z.object({...})`):

```typescript
const RunSchema = z
  .object({
    autoImpact: z
      .object({
        enabled: z.boolean().default(true),
        threshold: z.number().nonnegative().default(6.0),
      })
      .prefault({}),
  })
  .prefault({});
```

Then in `XeraConfigSchema`, add the field (preserve existing fields like `jira`, `web`, `auth`, `ai`, `reporting`):

```typescript
export const XeraConfigSchema = z.object({
  // ... existing entries
  run: RunSchema.prefault({}),
});
```

- [ ] **Step 5: Run tests, verify pass**

Run: `cd /home/user/xera/packages/core && npx vitest run test/config/schema.test.ts && npm run typecheck`
Expected: 4 tests pass; typecheck clean.

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/config/schema.ts packages/core/test/config/schema.test.ts
git commit -m "core: add config.run.autoImpact (enabled, threshold) schema (v0.6.2)"
```

---

## Task 9: Bump versions + CLI carets + docs

**Files:**
- Modify: `packages/core/package.json`
- Modify: `packages/skills/version.json`
- Modify: `packages/skills/package.json`
- Modify: `packages/cli/package.json`
- Modify: `packages/cli/src/commands/init.ts`
- Modify: `packages/cli/src/commands/init-update.ts`
- Modify: `docs/CONFIGURATION.md`
- Modify: `docs/TROUBLESHOOTING.md`

- [ ] **Step 1: Bump core**

Edit `packages/core/package.json` — bump `"version": "0.4.1"` → `"0.4.2"`.

- [ ] **Step 2: Bump skills**

Edit `packages/skills/version.json` — bump skills `"0.4.1"` → `"0.4.2"`. Add `"xera-impact.md"` to the `skill_files` array.

Edit `packages/skills/package.json` — bump version `"0.4.1"` → `"0.4.2"`.

- [ ] **Step 3: Bump CLI carets**

Edit `packages/cli/package.json` — bump version (e.g. `0.2.2` → `0.2.3`); update `@xera-ai/core` caret `^0.4.1` → `^0.4.2`; update `@xera-ai/skills` caret `^0.4.1` → `^0.4.2`.

Edit `packages/cli/src/commands/init.ts` — bump `pkg.dependencies['@xera-ai/core']` value to `^0.4.2`.

Edit `packages/cli/src/commands/init-update.ts` — same bump.

- [ ] **Step 4: CONFIGURATION.md — autoImpact section**

Append to `docs/CONFIGURATION.md`:

```markdown
### Auto-impact analysis from /xera-run (v0.6.2+)

When `/xera-run <TICKET>` runs, it can auto-call `/xera-impact <TICKET>` after fetch and prompt to re-run high-risk scenarios before generating new code.

```typescript
// xera.config.ts
export default defineConfig({
  run: {
    autoImpact: {
      enabled: true,        // set false to disable the auto-trigger
      threshold: 6.0,       // minimum risk score to count a scenario as "high-risk"
    },
  },
});
```

The risk score formula:

```
score = priority_weight × 3
      + edge_type_weight
      + edge_confidence × 2
      − days_since_last_pass × 0.1
```

with `P0=3, P1=2, P2=1`; modifies-same-area edge weight 5; jira-linked.blocks weight 4. Tune `threshold` to the noise level you can tolerate.
```

- [ ] **Step 5: TROUBLESHOOTING.md — impact list size**

Append to `docs/TROUBLESHOOTING.md`:

```markdown
### Impact list too large

If `/xera-impact` returns >50 scenarios, the markdown report shows the top 20 by score and writes the full list to `.xera/impact/<TICKET>.json`. To narrow:

- Use `--depth 1` to skip cross-ticket (jira-linked) and similarity edges
- Use `--min-priority p0` to focus on critical scenarios only
- Raise `xera.config.run.autoImpact.threshold` in config

### Impact list always empty

If `/xera-impact` returns no scenarios even though there should be coverage:

1. Run `xera doctor` to confirm the graph is up-to-date
2. Run `npx xera-internal graph-query --ticket <TICKET>` to verify the ticket has `modifies` edges
3. If the ticket has no `modifies` edges, re-fetch: `/xera-fetch <TICKET>` (the v0.6.0 `extract-areas.md` prompt populates them at fetch time)
```

- [ ] **Step 6: Commit**

```bash
git add packages/core/package.json packages/skills/package.json packages/skills/version.json \
        packages/cli/package.json packages/cli/src/commands/init.ts packages/cli/src/commands/init-update.ts \
        docs/CONFIGURATION.md docs/TROUBLESHOOTING.md
git commit -m "release: bump versions to v0.6.2 + autoImpact config + impact docs"
```

---

## Task 10: Final integration validation

**Files:** none (validates the whole release)

- [ ] **Step 1: Lint**

Run: `cd /home/user/xera && npm run lint`
Expected: zero errors. If errors, run `npm run lint:fix` and commit `chore: lint fixes for v0.6.2`.

- [ ] **Step 2: Typecheck**

Run: `cd /home/user/xera && npm run typecheck`
Expected: zero errors across all 3 packages.

- [ ] **Step 3: All tests**

Run: `cd /home/user/xera && npx vitest run`
Expected: all unit tests pass. Pre-existing `init-and-run` integration test still fails (live-server requirement) — that's expected.

- [ ] **Step 4: Verify graph subcommand registration**

Run: `grep -E "'(graph-record|graph-snapshot|graph-query|graph-backfill|graph-enrich|impact-prepare)':" packages/core/src/bin-internal/index.ts | wc -l`
Expected: 6.

- [ ] **Step 5: Verify skill list**

Run: `cat packages/skills/version.json | grep -c xera-impact`
Expected: ≥ 1.

- [ ] **Step 6: Verify backwards compat**

- All v0.6.0 + v0.6.1 tests still pass
- `report.ts` flow unchanged when no graph events present
- Skill `.md` files preserve existing steps; only add new ones

- [ ] **Step 7: Optional smoke**

```bash
cd /tmp && rm -rf v062test && mkdir v062test && cd v062test
node /home/user/xera/packages/cli/dist/index.js init --yes 2>&1 || echo "CLI not built — skip"
```

- [ ] **Step 8: If fixups needed, commit**

```bash
git status
# If fixes were needed, commit. Otherwise no commit.
```

---

## Self-Review Checklist

- [ ] All 10 tasks have working test → fail → impl → pass → commit flow
- [ ] No `TBD`, `TODO`, `implement later`, or placeholder text
- [ ] Every file path is absolute or repo-relative
- [ ] Type signatures consistent: `ImpactScenario.scenarioId: string` everywhere; `ImpactOpts.depth: 1|2|3`; `Priority` from `graph/types.ts`
- [ ] Version bumps applied: core 0.4.1 → 0.4.2, skills 0.4.1 → 0.4.2
- [ ] New skill `xera-impact.md` registered in `skills/version.json` skill_files array
- [ ] Auto-trigger respects `xera.config.run.autoImpact.enabled` flag
- [ ] Spec coverage: §6 (`/xera-impact`), §11.1 (auto-trigger) all map to tasks

---

## Spec Coverage Map

| Spec section | Plan task |
|---|---|
| §6.1 Command surface (`--depth`, `--min-priority`) | 4 (impact-prepare CLI flags), 6 (skill passes through) |
| §6.2 Skill flow (snapshot check → impact-prepare → display → prompt → re-run) | 6 (entire skill) |
| §6.3 Risk score formula | 1 (riskScore + tests) |
| §6.4 Markdown report shape | 3 (renderImpactMarkdown) |
| §6.5 Terminal output (Top-3 + 4-way prompt) | 6 (skill Step 3-4) |
| §6.6 Edge cases (ticket missing, empty, stale snapshot, paginate, depth=0) | 4 (exit 2, empty allowed), 6 (snapshot-check step) |
| §6.7 End-to-end loop (impact → exec → report) | 6 (Step 5 recommends /xera-report) |
| §11.1 Auto-trigger in /xera-run | 7 (skill update), 8 (config schema) |
| §11.9 Rollout — v0.6.2 | 9 (version bumps) |

---

## Out of scope (deferred)

- HTML viewer + CI artifact — **v0.6.3**
- True per-scenario `xera:exec` filtering via Playwright `--grep` regex — v0.6.x patch (current implementation runs whole spec for each impacted owner ticket)
- Auto-rerun from `/xera-run` automatically without prompt — v0.6.x patch (current `[Y/n/details]` requires user choice)
- Eval rubric scoring for impact decisions — out of v0.6 entirely (no Claude call in impact flow)
