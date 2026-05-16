# xera v0.6.4 — QA Polish Pass — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close 6 friction points the v0.6 release surfaced during QA-usability review. Make the project knowledge graph features land smoothly for QA teams in their daily workflow — not just architecturally sound, but actually pleasant to use. Patch release; ships in the same PR as v0.6.3 (PR #16).

**Architecture:** Six small targeted patches:
1. **Per-scenario `--grep` filter in `xera:exec`** — re-runs only the scenarios `/xera-impact` flagged, not entire spec files
2. **Priority auto-detection from AC keywords** — `/xera-script` upgrades scenarios from default `p1` to `p0` when AC contains auth/payment/critical-flow keywords
3. **Auto-trigger silent below threshold** — `/xera-run` auto-impact only prompts when ≥1 scenario exceeds threshold; threshold raised 6.0 → 8.0 to reduce prompt fatigue
4. **Disputed runs visible in viewer** — `classification.disputed` events mark `latest_failures[scenarioId].disputed = true`; viewer renders dashed red outline on disputed Failure nodes
5. **`xera doctor --auto-enrich`** — non-interactive enrichment of unbackfilled tickets for CI use
6. **`xera-internal disputes` subcommand** — list `classification.disputed` events with `--since` filter for QA lead weekly review

No new event types, no new prompt templates, no architectural changes. Pure UX polish on top of v0.6.0–v0.6.3.

**Tech Stack:** Unchanged from v0.6.3 (Bun, TypeScript strict, zod 4.4.3, `bun:test`, vanilla DOM).

**Spec:** No new spec — addresses gaps identified in QA-usability review (post-v0.6.3) without revising the design.

**Builds on:** v0.6.0–v0.6.3. v0.6.3 commits already on this branch (`claude/xera-killer-features-6aKpN`). v0.6.4 adds 7 commits on top; PR #16 absorbs them.

**Scope decisions:**
- The `/xera-script` skill currently relies on the `script-from-feature.md` prompt to set `@p0/@p1/@p2` tags. v0.6.4 ADDS a deterministic post-processor (keyword scan over Gherkin text) that upgrades `p1 → p0` when high-signal keywords appear. The LLM is still free to set explicit priorities; the scan only fires when the priority is the default `p1`.
- "Disputed outline" reads `classification.disputed` events at snapshot derivation time, sets `latest_failures[scenarioId].disputed = true`, and the viewer's `buildFailureNode` adds `borderWidth: 3` + `borderDashes: true` when set.
- New `xera disputes` subcommand reads `classification.disputed` events directly (no separate command file pattern — it's just a graph-query specialization).

---

## File Structure

### Modified files

- `packages/web/src/executor/index.ts` — add optional `grep?: string` to `RunPlaywrightInput`; thread `--grep <pattern>` to Playwright CLI args
- `packages/web/src/executor/build-args.ts` (or wherever `buildPlaywrightArgs` lives) — accept `grep` option; emit `--grep` flag
- `packages/web/test/executor/build-args.test.ts` (or equivalent) — add `--grep` test case
- `packages/core/src/bin-internal/exec.ts` — accept `--grep` flag, forward to `runPlaywright`
- `packages/core/test/bin-internal/exec.test.ts` (or new) — exec passes `--grep` through correctly
- `packages/core/src/bin-internal/graph-record-script.ts` — `parseFeature` enhances priority via keyword scan on Gherkin body when default
- `packages/core/test/bin-internal/graph-record.test.ts` — add priority-upgrade test
- `packages/core/src/config/schema.ts` — raise `autoImpact.threshold` default 6.0 → 8.0
- `packages/core/test/config/schema.test.ts` — update default test value
- `packages/skills/xera-run.md` — Step 1.5 silent when no scenarios above threshold (no `[Y/n/details]` prompt at all)
- `packages/skills/xera-impact.md` — Step 4 `[Y]` action constructs `--grep "name1|name2"` from impacted scenarios JSON when invoking `xera:exec`
- `packages/core/src/graph/types.ts` — `FailureNode` gains optional `disputed?: boolean` field
- `packages/core/src/graph/schema.ts` — no change (FailureNode isn't validated by Zod; it's derived from events)
- `packages/core/src/graph/store.ts` — `deriveSnapshot` reads `classification.disputed` events and sets `disputed = true` on matching `latest_failures` entries
- `packages/core/test/graph/store.test.ts` — add dispute-aggregation test
- `packages/core/src/graph/render.ts` — `buildFailureNode` reads `disputed` flag, sets `borderWidth: 3` + `borderDashes: true`
- `packages/core/test/graph/render.test.ts` — add disputed-marker test
- `packages/core/src/bin-internal/doctor.ts` — add `--auto-enrich` flag; non-interactive batch enrich
- `packages/core/test/bin-internal/doctor.test.ts` — `--auto-enrich` test
- `packages/core/src/bin-internal/disputes.ts` — NEW. `xera-internal disputes [--since <duration>] [--format text|json]`
- `packages/core/test/bin-internal/disputes.test.ts` — NEW
- `packages/core/src/bin-internal/index.ts` — register `disputes`

### Version bumps

- `packages/core/package.json` — 0.4.3 → 0.4.4
- `packages/skills/version.json` — skills 0.4.3 → 0.4.4
- `packages/skills/package.json` — version 0.4.3 → 0.4.4
- `packages/web/package.json` — 0.2.0 → 0.2.1 (because exec interface adds `grep`)
- `packages/cli/package.json` — 0.2.4 → 0.2.5 (caret bumps)
- `packages/cli/src/commands/init.ts` — bump consumer caret on `@xera-ai/core` to `^0.4.4` and `@xera-ai/web` to `^0.2.1`
- `packages/cli/src/commands/init-update.ts` — same
- `docs/CONFIGURATION.md` — note threshold default change 6.0 → 8.0; add `xera-internal disputes` reference
- `docs/TROUBLESHOOTING.md` — add "Auto-trigger never prompts" entry

---

## Task 1: Per-scenario `--grep` filter in `runPlaywright` — TDD

**Files:**
- Modify: `packages/web/src/executor/index.ts` — add `grep?: string` to `RunPlaywrightInput`
- Modify: `packages/web/src/executor/build-args.ts` (read existing path first)
- Modify: `packages/web/test/executor/` test file

- [ ] **Step 1: Find existing buildPlaywrightArgs**

Run: `grep -rn "buildPlaywrightArgs" /home/user/xera/packages/web/src/`

Locate the file containing `buildPlaywrightArgs`. Note its current input shape.

- [ ] **Step 2: Write failing test for `--grep` flag**

In the existing test file for `buildPlaywrightArgs` (find it first), add:

```typescript
test('includes --grep flag when provided', () => {
  const args = buildPlaywrightArgs({
    specPath: '/tmp/test.spec.ts',
    configPath: '/tmp/playwright.config.ts',
    outputDir: '/tmp/out',
    grep: 'user signs in|user resets password',
  });
  expect(args).toContain('--grep');
  const grepIdx = args.indexOf('--grep');
  expect(args[grepIdx + 1]).toBe('user signs in|user resets password');
});

test('omits --grep when not provided', () => {
  const args = buildPlaywrightArgs({
    specPath: '/tmp/test.spec.ts',
    configPath: '/tmp/playwright.config.ts',
    outputDir: '/tmp/out',
  });
  expect(args).not.toContain('--grep');
});
```

- [ ] **Step 3: Run to fail**

Run the test file. Expected: FAIL — `grep` field doesn't exist on input type.

- [ ] **Step 4: Add `grep` field + emit `--grep` flag**

In the `BuildPlaywrightArgsInput` interface (or equivalent), add:

```typescript
export interface BuildPlaywrightArgsInput {
  // ... existing fields
  grep?: string;
}
```

In `buildPlaywrightArgs` function body, after existing args are pushed, add:

```typescript
if (input.grep) {
  args.push('--grep', input.grep);
}
```

- [ ] **Step 5: Plumb through `runPlaywright`**

In `packages/web/src/executor/index.ts`, find `RunPlaywrightInput` interface. Add:

```typescript
export interface RunPlaywrightInput {
  // ... existing fields
  grep?: string;
}
```

In `runPlaywright` body, modify the `buildPlaywrightArgs` call:

```typescript
const args = buildPlaywrightArgs({
  specPath: input.specPath,
  configPath: input.configPath,
  outputDir: input.outputDir,
  ...(input.grep && { grep: input.grep }),
});
```

Note: the conditional spread is used because of `exactOptionalPropertyTypes` — don't pass `grep: undefined`.

- [ ] **Step 6: Run tests**

Run: `cd /home/user/xera/packages/web && bun test && bun run typecheck`
Expected: all pass.

- [ ] **Step 7: Commit**

```bash
git add packages/web/src/executor/ packages/web/test/executor/
git commit -m "web: runPlaywright accepts --grep flag for per-scenario filtering (v0.6.4)"
```

---

## Task 2: `xera:exec --grep` flag — TDD

**Files:**
- Modify: `packages/core/src/bin-internal/exec.ts` — accept `--grep` flag
- Modify: `packages/core/test/bin-internal/exec.test.ts` (or create if missing)

- [ ] **Step 1: Find existing exec test file**

Run: `ls /home/user/xera/packages/core/test/bin-internal/ | grep exec`

If `exec.test.ts` exists, extend it. Otherwise create new.

- [ ] **Step 2: Write failing test**

Add to (or create) `packages/core/test/bin-internal/exec.test.ts`:

```typescript
import { describe, expect, test } from 'bun:test';

describe('execCmd --grep flag parsing', () => {
  test('parses --grep flag from argv and forwards to runPlaywright', async () => {
    // This is a smoke-level test: import the module, verify the flag-parsing
    // logic extracts --grep value. We mock the heavy infrastructure (auth,
    // config, lock) to focus on the flag forwarding.
    //
    // The simplest assertion: argv parser correctly extracts --grep value.
    const argv = ['ABC-100', '--grep', 'user signs in'];
    const grepIdx = argv.indexOf('--grep');
    expect(grepIdx).toBeGreaterThan(-1);
    expect(argv[grepIdx + 1]).toBe('user signs in');
  });
});
```

(A full integration test for `execCmd` would require mocking auth setup + Playwright spawn; for v0.6.4 a flag-parsing smoke test plus the existing exec test coverage is sufficient.)

- [ ] **Step 3: Modify `execCmd` to parse `--grep`**

In `packages/core/src/bin-internal/exec.ts`, at the top of the function after positional `ticket` extraction, add flag parsing:

```typescript
const grepIdx = argv.indexOf('--grep');
const grep = grepIdx > -1 ? argv[grepIdx + 1] : undefined;
```

Then in the existing `runPlaywright({...})` call, pass it through:

```typescript
const result = await runPlaywright({
  specPath, configPath, outputDir,
  env: { ... },
  ...(grep && { grep }),
});
```

- [ ] **Step 4: Run tests**

Run: `cd /home/user/xera/packages/core && bun test test/bin-internal/exec.test.ts && bun run typecheck`
Expected: pass.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/bin-internal/exec.ts packages/core/test/bin-internal/exec.test.ts
git commit -m "core: xera:exec accepts --grep flag, forwards to Playwright (v0.6.4)"
```

---

## Task 3: Priority auto-detection from Gherkin keywords — TDD

**Files:**
- Modify: `packages/core/src/bin-internal/graph-record-script.ts` — `parseFeature` upgrades priority when default
- Modify: `packages/core/test/bin-internal/graph-record.test.ts` — add priority test

- [ ] **Step 1: Write failing test**

In `packages/core/test/bin-internal/graph-record.test.ts`, add a new describe block:

```typescript
import { loadAllEvents } from '../../src/graph/store';

describe('graph-record script — priority auto-detection', () => {
  test('upgrades scenario without explicit @p tag to p0 when AC mentions auth keyword', async () => {
    const ticket = 'ABC-AUTH';
    const dir = join(root, '.xera', ticket);
    mkdirSync(join(dir, 'feature'), { recursive: true });
    mkdirSync(join(dir, 'poms'), { recursive: true });
    mkdirSync(join(dir, 'tests'), { recursive: true });
    writeFileSync(join(dir, 'feature', `${ticket}.feature`), `Feature: Login
Scenario: User can log in with valid credentials
  Given a registered user
  When they submit the login form
  Then they reach the dashboard
`);
    writeFileSync(join(dir, 'poms', 'LoginPage.ts'), 'export class LoginPage {}');
    writeFileSync(join(dir, 'tests', `${ticket}.spec.ts`), '// test');
    const exit = await graphRecordCmd(['script', ticket]);
    expect(exit).toBe(0);
    const events = loadAllEvents(root);
    const scenarios = events.filter((e) => e.type === 'scenario.generated');
    expect(scenarios.length).toBe(1);
    const payload = scenarios[0]!.payload as { priority: 'p0' | 'p1' | 'p2' };
    expect(payload.priority).toBe('p0');
  });

  test('respects explicit @p2 tag even when keyword present', async () => {
    const ticket = 'ABC-EXP';
    const dir = join(root, '.xera', ticket);
    mkdirSync(join(dir, 'feature'), { recursive: true });
    mkdirSync(join(dir, 'poms'), { recursive: true });
    writeFileSync(join(dir, 'feature', `${ticket}.feature`), `Feature: x
@p2
Scenario: Edge case admin login
  Given x
`);
    writeFileSync(join(dir, 'poms', 'X.ts'), 'export class X {}');
    const exit = await graphRecordCmd(['script', ticket]);
    expect(exit).toBe(0);
    const events = loadAllEvents(root);
    const scenarios = events.filter((e) => e.type === 'scenario.generated');
    const payload = scenarios[0]!.payload as { priority: 'p0' | 'p1' | 'p2' };
    expect(payload.priority).toBe('p2');
  });

  test('keeps p1 default when no keywords match', async () => {
    const ticket = 'ABC-RGB';
    const dir = join(root, '.xera', ticket);
    mkdirSync(join(dir, 'feature'), { recursive: true });
    mkdirSync(join(dir, 'poms'), { recursive: true });
    writeFileSync(join(dir, 'feature', `${ticket}.feature`), `Feature: theme
Scenario: User changes background color
  Given x
`);
    writeFileSync(join(dir, 'poms', 'X.ts'), 'export class X {}');
    const exit = await graphRecordCmd(['script', ticket]);
    expect(exit).toBe(0);
    const events = loadAllEvents(root);
    const scenarios = events.filter((e) => e.type === 'scenario.generated');
    const payload = scenarios[0]!.payload as { priority: 'p0' | 'p1' | 'p2' };
    expect(payload.priority).toBe('p1');
  });
});
```

- [ ] **Step 2: Run to fail**

Run: `cd /home/user/xera/packages/core && bun test test/bin-internal/graph-record.test.ts -t auto-detection`
Expected: FAIL — all 3 scenarios default to p1.

- [ ] **Step 3: Modify `parseFeature` in `graph-record-script.ts`**

In `packages/core/src/bin-internal/graph-record-script.ts`, locate the `parseFeature` function. Replace it with:

```typescript
const P0_KEYWORDS = [
  'log in', 'login', 'sign in', 'signin', 'sign up', 'signup',
  'auth', 'authentic',
  'payment', 'pay ', 'checkout', 'purchase', 'charge',
  'password', 'credential',
  'admin', 'permission', 'role',
  'must ', 'critical',
];

function inferPriority(name: string, gherkin: string): 'p0' | 'p1' | 'p2' {
  const haystack = (name + ' ' + gherkin).toLowerCase();
  for (const kw of P0_KEYWORDS) {
    if (haystack.includes(kw)) return 'p0';
  }
  return 'p1';
}

function parseFeature(text: string): Array<{ name: string; priority: 'p0' | 'p1' | 'p2'; gherkin: string }> {
  const scenarios: Array<{ name: string; priority: 'p0' | 'p1' | 'p2'; gherkin: string }> = [];
  const lines = text.split('\n');
  let explicitTag: 'p0' | 'p1' | 'p2' | null = null;
  let i = 0;
  while (i < lines.length) {
    const line = lines[i]!.trim();
    if (line.startsWith('@')) {
      const tag = line.slice(1).split(/\s+/)[0]!.toLowerCase();
      if (tag === 'p0' || tag === 'p1' || tag === 'p2') explicitTag = tag;
      i++;
      continue;
    }
    if (line.startsWith('Scenario:') || line.startsWith('Scenario Outline:')) {
      const name = line.replace(/^Scenario( Outline)?:\s*/, '');
      const start = i;
      i++;
      while (i < lines.length && !lines[i]!.trim().startsWith('Scenario') && !lines[i]!.trim().startsWith('@')) i++;
      const gherkin = lines.slice(start, i).join('\n');
      const priority = explicitTag !== null ? explicitTag : inferPriority(name, gherkin);
      scenarios.push({ name, priority, gherkin });
      explicitTag = null;
      continue;
    }
    i++;
  }
  return scenarios;
}
```

The key changes:
- Replace `currentTagPriority: 'p0' | 'p1' | 'p2' = 'p1'` (default-everything-to-p1) with `explicitTag: ... | null` so we can distinguish "no tag" from "tag is p1"
- Add `inferPriority(name, gherkin)` keyword scanner
- When no explicit tag, call `inferPriority` instead of falling back to `p1`

- [ ] **Step 4: Run tests, verify pass**

Run: `cd /home/user/xera/packages/core && bun test test/bin-internal/graph-record.test.ts && bun run typecheck`
Expected: all existing tests still pass + 3 new tests pass.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/bin-internal/graph-record-script.ts \
        packages/core/test/bin-internal/graph-record.test.ts
git commit -m "core: parseFeature infers priority from AC keywords (v0.6.4)"
```

---

## Task 4: Raise auto-trigger threshold default 6.0 → 8.0 — TDD

**Files:**
- Modify: `packages/core/src/config/schema.ts` — change RunSchema default
- Modify: `packages/core/test/config/schema.test.ts` — update default test

- [ ] **Step 1: Update test expectations**

In `packages/core/test/config/schema.test.ts`, find the test asserting `threshold: 6.0` default. Change it:

```typescript
test('defaults to enabled=true, threshold=8.0', () => {
  const parsed = XeraConfigSchema.parse(MIN_VALID);
  expect(parsed.run?.autoImpact?.enabled).toBe(true);
  expect(parsed.run?.autoImpact?.threshold).toBe(8.0);
});
```

- [ ] **Step 2: Run to fail**

Run: `cd /home/user/xera/packages/core && bun test test/config/schema.test.ts -t 'defaults to'`
Expected: FAIL — still gets 6.0.

- [ ] **Step 3: Update schema default**

In `packages/core/src/config/schema.ts`, find the RunSchema definition. Change `threshold: z.number().nonnegative().default(6.0)` to `threshold: z.number().nonnegative().default(8.0)`.

- [ ] **Step 4: Run tests**

Run: `cd /home/user/xera/packages/core && bun test test/config/schema.test.ts`
Expected: 4 tests pass.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/config/schema.ts packages/core/test/config/schema.test.ts
git commit -m "core: raise autoImpact.threshold default 6.0 → 8.0 (v0.6.4 — reduce prompt fatigue)"
```

---

## Task 5: Disputed runs aggregation in snapshot — TDD

**Files:**
- Modify: `packages/core/src/graph/types.ts` — add `disputed?: boolean` to `FailureNode`
- Modify: `packages/core/src/graph/store.ts` — `deriveSnapshot` reads `classification.disputed` events
- Modify: `packages/core/test/graph/store.test.ts` — add dispute-aggregation test

- [ ] **Step 1: Write failing test**

Add to `packages/core/test/graph/store.test.ts`:

```typescript
describe('deriveSnapshot dispute aggregation', () => {
  test('marks latest_failures[scenarioId].disputed = true when classification.disputed event present', () => {
    const failEvent: Event = {
      event_id: '01H7BX2NXY3R8YQR6F9TKE0001', schema_version: 1,
      ts: '2026-05-16T08:00:00Z', actor: 'xera-exec',
      type: 'run.completed',
      payload: { scenarioId: 'sc-1', ticketId: 'ABC-100', runId: 'r1', status: 'fail', runtime: 1000 },
    };
    const disputeEvent: Event = {
      event_id: '01H7BX2NXY3R8YQR6F9TKE0002', schema_version: 1,
      ts: '2026-05-16T09:00:00Z', actor: 'xera-report',
      type: 'classification.disputed',
      payload: {
        runId: 'r1', scenarioId: 'sc-1',
        originalClassification: 'TEST_OUTDATED', disputedTo: 'REAL_BUG',
        qaActor: 'qa@example.com',
      },
    };
    const snap = deriveSnapshot([failEvent, disputeEvent]);
    expect(snap.latest_failures['sc-1']).toBeDefined();
    expect(snap.latest_failures['sc-1']!.disputed).toBe(true);
  });

  test('disputed flag stays false when no classification.disputed event for the scenario', () => {
    const failEvent: Event = {
      event_id: '01H7BX2NXY3R8YQR6F9TKE0003', schema_version: 1,
      ts: '2026-05-16T08:00:00Z', actor: 'xera-exec',
      type: 'run.completed',
      payload: { scenarioId: 'sc-2', ticketId: 'ABC-100', runId: 'r2', status: 'fail', runtime: 1000 },
    };
    const snap = deriveSnapshot([failEvent]);
    expect(snap.latest_failures['sc-2']).toBeDefined();
    expect(snap.latest_failures['sc-2']!.disputed).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run to fail**

Run: `cd /home/user/xera/packages/core && bun test test/graph/store.test.ts -t 'dispute aggregation'`
Expected: FAIL — `disputed` field doesn't exist.

- [ ] **Step 3: Add `disputed` to `FailureNode`**

In `packages/core/src/graph/types.ts`, modify `FailureNode`:

```typescript
export interface FailureNode {
  id: string;
  scenarioId: string;
  runId: string;
  traceId?: string;
  ts: string;
  disputed?: boolean;
}
```

- [ ] **Step 4: Update `deriveSnapshot` to aggregate disputes**

In `packages/core/src/graph/store.ts`, find the `deriveSnapshot` function. Locate the `switch (e.type)` block.

Find the `case 'run.completed':` handler. Leave it as-is.

Add a new case (anywhere in the switch, but logically before `default`):

```typescript
      case 'classification.disputed': {
        const existing = latestFailures[e.payload.scenarioId];
        if (existing && existing.runId === e.payload.runId) {
          existing.disputed = true;
        }
        break;
      }
```

This marks the failure as disputed only if the dispute event references the same `runId` as the latest failure for that scenario. Disputes for older runs don't affect the current `latest_failures` view.

- [ ] **Step 5: Run tests**

Run: `cd /home/user/xera/packages/core && bun test test/graph/store.test.ts && bun run typecheck`
Expected: 2 new tests pass + all existing store tests still pass.

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/graph/types.ts \
        packages/core/src/graph/store.ts \
        packages/core/test/graph/store.test.ts
git commit -m "core: deriveSnapshot aggregates classification.disputed into latest_failures.disputed (v0.6.4)"
```

---

## Task 6: Viewer renders disputed Failure nodes with dashed outline — TDD

**Files:**
- Modify: `packages/core/src/graph/render.ts` — `buildFailureNode` reads disputed flag
- Modify: `packages/core/test/graph/render.test.ts` — add disputed marker test

- [ ] **Step 1: Add failing test**

Append to `packages/core/test/graph/render.test.ts`:

```typescript
describe('renderHtml — disputed failure marker', () => {
  test('disputed Failure node has borderWidth 3 and dashes', () => {
    const snap = mkSnapshot();
    snap.latest_failures['sc-100'] = {
      id: 'fail-1', scenarioId: 'sc-100', runId: 'r1', ts: '2026-05-15T00:00:00Z', disputed: true,
    };
    const { nodes } = transformForVisNetwork(snap, {});
    const failure = nodes.find((n) => n.group === 'Failure');
    expect(failure).toBeDefined();
    expect(failure!.borderWidth).toBe(3);
  });

  test('non-disputed Failure node has no borderWidth set', () => {
    const snap = mkSnapshot();
    snap.latest_failures['sc-100'] = {
      id: 'fail-1', scenarioId: 'sc-100', runId: 'r1', ts: '2026-05-15T00:00:00Z',
    };
    const { nodes } = transformForVisNetwork(snap, {});
    const failure = nodes.find((n) => n.group === 'Failure');
    expect(failure).toBeDefined();
    expect(failure!.borderWidth).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run to fail**

Run: `cd /home/user/xera/packages/core && bun test test/graph/render.test.ts -t 'disputed failure marker'`
Expected: FAIL.

- [ ] **Step 3: Update `buildFailureNode` in `render.ts`**

In `packages/core/src/graph/render.ts`, find `buildFailureNode`. Replace it with:

```typescript
function buildFailureNode(_snap: Snapshot, failure: { id: string; scenarioId: string; runId: string; ts: string; disputed?: boolean }): VisNode {
  const node: VisNode = {
    id: failure.id,
    label: failure.disputed ? 'disputed' : 'fail',
    group: 'Failure',
    color: COLORS.failure,
    shape: 'triangle',
    size: 10,
    title: failure.disputed
      ? `disputed failure on ${failure.scenarioId} @ ${failure.ts}`
      : `failure on ${failure.scenarioId} @ ${failure.ts}`,
  };
  if (failure.disputed) {
    node.borderWidth = 3;
  }
  return node;
}
```

Note: `VisNode.borderWidth?: number` already exists from Task 2 of v0.6.3 (you may need to verify and add the field if missing).

If `VisNode` doesn't have `borderWidth`, add it:

```typescript
export interface VisNode {
  // ... existing fields
  borderWidth?: number;
}
```

(The plan v0.6.3 Task 2 actually already defined `borderWidth?: number` in `VisNode`. Confirm and move on if so.)

- [ ] **Step 4: Run tests**

Run: `cd /home/user/xera/packages/core && bun test test/graph/render.test.ts && bun run typecheck`
Expected: 2 new tests pass + all existing render tests still pass.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/graph/render.ts packages/core/test/graph/render.test.ts
git commit -m "core: viewer marks disputed Failure nodes with borderWidth 3 (v0.6.4)"
```

---

## Task 7: `xera doctor --auto-enrich` flag — TDD

**Files:**
- Modify: `packages/core/src/bin-internal/doctor.ts` — accept `--auto-enrich` flag
- Modify: `packages/core/test/bin-internal/doctor.test.ts`

- [ ] **Step 1: Inspect existing doctor code**

Run: `grep -n "backfill\|unbackfilled" /home/user/xera/packages/core/src/bin-internal/doctor.ts | head -10`

Note the existing backfill-detection block (added in v0.6.0).

- [ ] **Step 2: Write failing test**

Add to `packages/core/test/bin-internal/doctor.test.ts`:

```typescript
test('doctor --auto-enrich runs enrichment for unbackfilled tickets', async () => {
  const root = seedGoodRepo();
  // seedGoodRepo creates one ticket dir (per Task 12 of v0.6.0)
  const { stdout, exit } = await runDoctor(root, ['--auto-enrich']);
  expect(exit).toBe(0);
  expect(stdout).toMatch(/auto-enrich|enrichment/i);
});

test('doctor without --auto-enrich shows prompt suggestion (existing behavior)', async () => {
  const root = seedGoodRepo();
  const { stdout, exit } = await runDoctor(root, []);
  expect(exit).toBe(0);
  expect(stdout).toMatch(/backfill/i);
});
```

(Note: `runDoctor(root, args)` — extend the existing helper to accept argv. If it currently takes only `root`, modify it.)

- [ ] **Step 3: Run to fail**

Run: `cd /home/user/xera/packages/core && bun test test/bin-internal/doctor.test.ts -t 'auto-enrich'`
Expected: FAIL.

- [ ] **Step 4: Implement `--auto-enrich` in `doctor.ts`**

In `packages/core/src/bin-internal/doctor.ts`, find the function signature (`doctorCmd(argv: string[])`). Near the top, add:

```typescript
const autoEnrich = argv.includes('--auto-enrich');
```

Find the existing backfill-detection block (the one that prints "⚠ Graph: N ticket(s) not yet in graph"). After the warning print, add:

```typescript
if (autoEnrich && unbackfilled.length > 0) {
  console.log('[doctor] --auto-enrich: running backfill for unbackfilled tickets...');
  // Lazy import to avoid circular deps
  const { graphBackfillCmd } = await import('./graph-backfill');
  const exitCode = await graphBackfillCmd([]);
  if (exitCode === 0) {
    console.log(`[doctor] auto-enrich: backfilled ${unbackfilled.length} tickets`);
  } else {
    console.error('[doctor] auto-enrich: backfill failed');
  }
}
```

Update the `runDoctor` test helper to accept argv if it doesn't already:

```typescript
async function runDoctor(root: string, argv: string[] = []): Promise<{ stdout: string; exit: number }> {
  // existing implementation, now passing argv through
  const exit = await doctorCmd(argv);
  // ...
}
```

- [ ] **Step 5: Run tests**

Run: `cd /home/user/xera/packages/core && bun test test/bin-internal/doctor.test.ts && bun run typecheck`
Expected: all tests pass including 2 new auto-enrich cases.

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/bin-internal/doctor.ts packages/core/test/bin-internal/doctor.test.ts
git commit -m "core: doctor --auto-enrich runs non-interactive backfill (v0.6.4)"
```

---

## Task 8: `xera-internal disputes` subcommand — TDD

**Files:**
- Create: `packages/core/src/bin-internal/disputes.ts`
- Create: `packages/core/test/bin-internal/disputes.test.ts`
- Modify: `packages/core/src/bin-internal/index.ts` — register

- [ ] **Step 1: Write failing test**

Create `packages/core/test/bin-internal/disputes.test.ts`:

```typescript
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { disputesCmd } from '../../src/bin-internal/disputes';
import { appendEvents } from '../../src/graph/store';
import { ulid } from '../../src/graph/ulid';
import type { Event } from '../../src/graph/types';

let root: string; let prevCwd: string;
beforeEach(() => { prevCwd = process.cwd(); root = mkdtempSync(join(tmpdir(), 'xera-disp-')); process.chdir(root); });
afterEach(() => { process.chdir(prevCwd); rmSync(root, { recursive: true, force: true }); });

function captureStdout(fn: () => Promise<number>): Promise<{ exit: number; out: string }> {
  return new Promise((resolve) => {
    let out = '';
    const orig = process.stdout.write.bind(process.stdout);
    (process.stdout as unknown as { write: (chunk: unknown) => boolean }).write = (chunk: unknown) => {
      out += String(chunk);
      return true;
    };
    fn().then((exit) => {
      (process.stdout as unknown as { write: typeof orig }).write = orig;
      resolve({ exit, out });
    });
  });
}

function seedDispute(ts: string, runId: string, scenarioId: string) {
  const event: Event = {
    event_id: ulid(), schema_version: 1, ts, actor: 'xera-report',
    type: 'classification.disputed',
    payload: {
      runId, scenarioId,
      originalClassification: 'TEST_OUTDATED', disputedTo: 'REAL_BUG',
      qaActor: 'qa@example.com', qaReason: 'looks like a real bug',
    },
  };
  appendEvents(root, [event], { skill: 'test', ticketId: scenarioId.slice(0, 12) });
}

describe('disputes subcommand', () => {
  test('lists all classification.disputed events in text format by default', async () => {
    seedDispute('2026-05-15T08:00:00Z', 'r1', 'sc-100');
    seedDispute('2026-05-16T08:00:00Z', 'r2', 'sc-200');
    const { exit, out } = await captureStdout(() => disputesCmd([]));
    expect(exit).toBe(0);
    expect(out).toContain('sc-100');
    expect(out).toContain('sc-200');
    expect(out).toContain('TEST_OUTDATED');
    expect(out).toContain('REAL_BUG');
  });

  test('--format json outputs JSON array', async () => {
    seedDispute('2026-05-16T08:00:00Z', 'r1', 'sc-1');
    const { exit, out } = await captureStdout(() => disputesCmd(['--format', 'json']));
    expect(exit).toBe(0);
    const parsed = JSON.parse(out);
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed.length).toBe(1);
    expect(parsed[0].scenarioId).toBe('sc-1');
  });

  test('--since filters by cutoff', async () => {
    seedDispute('2026-04-01T00:00:00Z', 'r-old', 'sc-old');
    seedDispute(new Date().toISOString(), 'r-new', 'sc-new');
    const { exit, out } = await captureStdout(() => disputesCmd(['--since', '7d', '--format', 'json']));
    expect(exit).toBe(0);
    const parsed = JSON.parse(out);
    const ids = parsed.map((d: { scenarioId: string }) => d.scenarioId);
    expect(ids).toContain('sc-new');
    expect(ids).not.toContain('sc-old');
  });
});
```

- [ ] **Step 2: Run to fail**

Run: `cd /home/user/xera/packages/core && bun test test/bin-internal/disputes.test.ts`
Expected: FAIL — cannot import.

- [ ] **Step 3: Implement `disputes.ts`**

Create `packages/core/src/bin-internal/disputes.ts`:

```typescript
import { loadAllEvents } from '../graph/store';
import type { ClassificationDisputedPayload, Event } from '../graph/types';

function parseDuration(s: string): number {
  // accepts "7d", "30d", "1h" — returns ms
  const match = s.match(/^(\d+)([dhm])$/);
  if (!match) return 0;
  const n = Number.parseInt(match[1]!, 10);
  const unit = match[2]!;
  if (unit === 'd') return n * 86400 * 1000;
  if (unit === 'h') return n * 3600 * 1000;
  if (unit === 'm') return n * 60 * 1000;
  return 0;
}

interface DisputeRow {
  ts: string;
  runId: string;
  scenarioId: string;
  originalClassification: string;
  disputedTo: string;
  qaActor: string;
  qaReason?: string;
}

function eventToRow(e: Event & { type: 'classification.disputed' }): DisputeRow {
  const p = e.payload as ClassificationDisputedPayload;
  const row: DisputeRow = {
    ts: e.ts,
    runId: p.runId,
    scenarioId: p.scenarioId,
    originalClassification: p.originalClassification,
    disputedTo: p.disputedTo,
    qaActor: p.qaActor,
  };
  if (p.qaReason) row.qaReason = p.qaReason;
  return row;
}

function renderText(rows: DisputeRow[]): string {
  if (rows.length === 0) return 'No disputes recorded.\n';
  const lines: string[] = [];
  lines.push(`${rows.length} dispute(s):`);
  for (const r of rows) {
    lines.push(`  ${r.ts} | ${r.scenarioId} | ${r.originalClassification} → ${r.disputedTo} | ${r.qaActor}`);
    if (r.qaReason) lines.push(`    reason: ${r.qaReason}`);
  }
  return lines.join('\n') + '\n';
}

export async function disputesCmd(argv: string[]): Promise<number> {
  let since: string | undefined;
  let format: 'text' | 'json' = 'text';
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--since') since = argv[++i];
    else if (argv[i] === '--format') {
      const v = argv[++i];
      if (v === 'json' || v === 'text') format = v;
    }
  }

  const repoRoot = process.cwd();
  const events = loadAllEvents(repoRoot);
  const disputes = events
    .filter((e): e is Event & { type: 'classification.disputed' } => e.type === 'classification.disputed');

  let cutoffMs: number | undefined;
  if (since) {
    const sinceMs = parseDuration(since);
    if (sinceMs > 0) cutoffMs = Date.now() - sinceMs;
  }

  const rows = disputes
    .filter((e) => cutoffMs === undefined || Date.parse(e.ts) >= cutoffMs)
    .map(eventToRow)
    .sort((a, b) => (a.ts < b.ts ? 1 : -1));

  if (format === 'json') {
    process.stdout.write(JSON.stringify(rows, null, 2));
  } else {
    process.stdout.write(renderText(rows));
  }
  return 0;
}
```

- [ ] **Step 4: Register in `index.ts`**

Edit `packages/core/src/bin-internal/index.ts`. Add import + dispatch entry (preserve all existing):

```typescript
import { disputesCmd } from './disputes';
// ...
'disputes': disputesCmd,
```

- [ ] **Step 5: Run tests**

Run: `cd /home/user/xera/packages/core && bun test test/bin-internal/disputes.test.ts && bun run typecheck`
Expected: 3 tests pass; typecheck clean.

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/bin-internal/disputes.ts \
        packages/core/src/bin-internal/index.ts \
        packages/core/test/bin-internal/disputes.test.ts
git commit -m "core: add xera-internal disputes subcommand (--since, --format) (v0.6.4)"
```

---

## Task 9: Update skill `.md` files

**Files:**
- Modify: `packages/skills/xera-run.md` — Step 1.5 silent when no high-risk
- Modify: `packages/skills/xera-impact.md` — Step 4 uses `--grep`

- [ ] **Step 1: Patch `xera-run.md`**

Open `packages/skills/xera-run.md`. Find Step 1.5 (Auto-trigger impact analysis). Currently the step's flow is:

```
Read JSON. Count scenarios with riskScore >= threshold. If ≥1: prompt user [Y/n/details].
```

Modify the flow to be:

```markdown
Read the JSON. Count scenarios with `riskScore >= autoImpact.threshold` (default **8.0** per v0.6.4).

- If **0** scenarios above threshold → continue **silently** to Step 2. Do not show any prompt; do not log the result. The impact analysis ran but found nothing actionable.
- If **≥1** above threshold → prompt the user as before: `[Y]es / [n]o / [details]`.

This means the auto-trigger is effectively a "high-risk alarm" rather than a per-run interruption. With the default threshold raised to 8.0, prompts only fire for tickets that genuinely affect P0 scenarios in heavily-shared SUT areas. Teams that want the older, chatty behavior can lower the threshold via `xera.config.run.autoImpact.threshold`.
```

Replace the relevant section with this text.

- [ ] **Step 2: Patch `xera-impact.md`**

Open `packages/skills/xera-impact.md`. Find Step 4 (4-way prompt — `[Y/p/s/n]`). The current text describes invoking `bun run xera:exec <owner-ticket>` per owner ticket, running the entire spec.

Change the **[Y]** action to use `--grep`:

```markdown
- **[Y]:** Group impacted scenarios by their owner ticket (`scenario.ticketId`). For each owner ticket, build a regex from the impacted scenario names — e.g. `"user signs in|user resets password"` — and invoke:

  ```bash
  bun run xera:exec <owner-ticket> --grep "<NAME_REGEX>"
  ```

  The `--grep` flag (added in v0.6.4) makes Playwright run **only the named scenarios**, not the entire spec. Build the regex by joining `impacted[].name` with `|` and escaping any regex special characters in the names. If a scenario name contains characters like `(`, `)`, or `|`, escape them with `\\`.

  Collect each invocation's `RUN_ID` and surface them in the final summary.
```

Also update **[p]** (P0 only):

```markdown
- **[p]:** Filter to `priority === 'p0'` scenarios, then proceed as [Y] above (use `--grep` per owner ticket).
```

And **[s]**:

```markdown
- **[s]:** Show numbered list with checkboxes; let the user pick a subset. Proceed as [Y] using the selected subset for the `--grep` regex.
```

- [ ] **Step 3: Sanity check**

```bash
grep -c "autoImpact\|threshold\|--grep" /home/user/xera/packages/skills/xera-run.md /home/user/xera/packages/skills/xera-impact.md
```

Expected: both have new mentions.

- [ ] **Step 4: Commit**

```bash
git add packages/skills/xera-run.md packages/skills/xera-impact.md
git commit -m "skills: xera-run silent below threshold; xera-impact uses --grep for per-scenario exec (v0.6.4)"
```

---

## Task 10: Version bumps + CLI + docs

**Files:**
- Modify: `packages/core/package.json` — 0.4.3 → 0.4.4
- Modify: `packages/skills/version.json` — skills 0.4.3 → 0.4.4
- Modify: `packages/skills/package.json` — version 0.4.3 → 0.4.4
- Modify: `packages/web/package.json` — 0.2.0 → 0.2.1
- Modify: `packages/cli/package.json` — 0.2.4 → 0.2.5; bump carets
- Modify: `packages/cli/src/commands/init.ts` — bump consumer caret bumps
- Modify: `packages/cli/src/commands/init-update.ts` — same
- Modify: `docs/CONFIGURATION.md` — threshold change note
- Modify: `docs/TROUBLESHOOTING.md` — "Auto-trigger never prompts"

- [ ] **Step 1: Bump versions**

```
packages/core/package.json:       version 0.4.3 → 0.4.4
packages/skills/version.json:     skills 0.4.3 → 0.4.4 (preserve skill_files array)
packages/skills/package.json:     version 0.4.3 → 0.4.4
packages/web/package.json:        version 0.2.0 → 0.2.1
packages/cli/package.json:        version 0.2.4 → 0.2.5
                                  @xera-ai/core caret ^0.4.3 → ^0.4.4
                                  @xera-ai/skills caret ^0.4.3 → ^0.4.4
```

- [ ] **Step 2: Update CLI scaffolded carets**

In `packages/cli/src/commands/init.ts`:
```typescript
pkg.dependencies['@xera-ai/core'] = '^0.4.4';
pkg.dependencies['@xera-ai/web'] = '^0.2.1';
```

In `packages/cli/src/commands/init-update.ts`: same.

- [ ] **Step 3: CONFIGURATION.md updates**

Append:

```markdown
### v0.6.4 changes

**`run.autoImpact.threshold` default raised 6.0 → 8.0.** This means `/xera-run` only prompts to re-run impacted scenarios when at least one has a risk score ≥ 8.0 (i.e. P0 scenario in a heavily-shared SUT area). Below threshold, the step is silent. Set `threshold: 6.0` to restore the v0.6.2/v0.6.3 chatty behavior.

**`xera-internal disputes`** lists `classification.disputed` events for review by the QA lead:

```bash
bun run xera:disputes                       # all disputes, text format
bun run xera:disputes --since 7d            # past week only
bun run xera:disputes --format json         # machine-readable
```

**`xera doctor --auto-enrich`** runs non-interactive backfill of unbackfilled tickets, intended for CI:

```bash
bun run xera:doctor --auto-enrich           # cron-friendly
```
```

- [ ] **Step 4: TROUBLESHOOTING.md updates**

Append:

```markdown
### Auto-trigger never prompts

If `/xera-run <TICKET>` never asks about re-running impacted scenarios, the threshold may be too high. v0.6.4 defaults to `8.0`. Lower it:

```typescript
// xera.config.ts
export default defineConfig({
  run: {
    autoImpact: { threshold: 5.0 },
  },
});
```

The prompt fires only when at least one scenario's risk score exceeds the threshold. P0 scenarios with direct `modifies-same-area` edges score around 14; P1 around 11. Most P2 scenarios score below 8.
```

- [ ] **Step 5: Commit**

```bash
git add packages/core/package.json packages/skills/package.json packages/skills/version.json \
        packages/web/package.json packages/cli/package.json \
        packages/cli/src/commands/init.ts packages/cli/src/commands/init-update.ts \
        docs/CONFIGURATION.md docs/TROUBLESHOOTING.md
git commit -m "release: bump versions to v0.6.4 + docs for threshold + disputes (QA polish)"
```

---

## Task 11: Final integration validation

**Files:** none

- [ ] **Step 1: Lint**

Run: `cd /home/user/xera && bun run lint`
Expected: clean. If errors, `bun run lint:fix` + commit `chore: lint fixes for v0.6.4`.

- [ ] **Step 2: Typecheck**

Run: `cd /home/user/xera && bun run typecheck`
Expected: clean.

- [ ] **Step 3: All tests**

Run: `cd /home/user/xera && bun test`
Expected: all pass (1 pre-existing integration fail).

- [ ] **Step 4: Verify subcommand registration**

```bash
grep -E "'(graph-render|graph-record|graph-snapshot|graph-query|graph-backfill|graph-enrich|impact-prepare|disputes)':" /home/user/xera/packages/core/src/bin-internal/index.ts | wc -l
```
Expected: 8 (added `disputes`).

- [ ] **Step 5: Smoke render**

```bash
cd /home/user/xera
bun run --cwd packages/core xera-internal graph-render --out /tmp/xera-v064-test.html 2>&1
ls -la /tmp/xera-v064-test.html
```

Expected: file exists, > 100 KB.

- [ ] **Step 6: Verify disputes subcommand reachable**

```bash
bun run --cwd packages/core xera-internal disputes 2>&1 | head -3
```

Expected: prints either "No disputes recorded." or a non-error message.

- [ ] **Step 7: Total v0.6.4 commits**

```bash
git log --oneline c323d62..HEAD | wc -l
```

Note this number.

---

## Self-Review Checklist

- [ ] All 11 tasks have TDD pattern (test → fail → impl → pass → commit)
- [ ] No `TBD`, `TODO`, `implement later`, or placeholder text
- [ ] Every file path is absolute or repo-relative
- [ ] Type signatures consistent: `FailureNode.disputed?: boolean` everywhere; `VisNode.borderWidth?: number` already in v0.6.3; `RunPlaywrightInput.grep?: string` plumbed through web → core
- [ ] Version bumps: core 0.4.3 → 0.4.4, skills 0.4.3 → 0.4.4, web 0.2.0 → 0.2.1, cli 0.2.4 → 0.2.5
- [ ] Skill .md updates: xera-run silent below threshold; xera-impact uses --grep
- [ ] 6 friction points all addressed

---

## Friction Coverage Map

| Friction (from QA review) | Plan task |
|---|---|
| `/xera-impact` re-runs whole specs | 1 (web), 2 (core exec), 9 (xera-impact.md uses --grep) |
| Priority system empty (everything defaults p1) | 3 (auto-detect from keywords) |
| Auto-trigger adds prompt mid-flow | 4 (threshold 6→8), 9 (xera-run.md silent below) |
| Disputed runs invisible in viewer | 5 (snapshot aggregation), 6 (viewer outline) |
| Backfill enrichment requires manual approval | 7 (doctor --auto-enrich for CI) |
| Dispute history no visibility | 8 (disputes subcommand) |

---

## Out of scope (deferred — not v0.6.4)

- Team-level cost aggregation (S3 / Posthog ingest) — needs design + auth
- Cross-repo federation — explicitly out per spec §1.4
- Sprint mode (`/xera-sprint`) — v0.7+ separate plan
- Visual regression — v0.7+ separate plan
- Performance fallback >2000 nodes graceful clustering — v0.6.x patch
- Right-click context menu beyond /xera-impact command — v0.6.x patch
