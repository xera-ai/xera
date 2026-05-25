# xera v0.1 — Plan 03: Classifier & CLI

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the adapter-agnostic classifier framework, the `xera-internal` binary that wires all subcommands together, and the public `xera` CLI (`init` and `doctor`).

**Architecture:** Classifier reads normalized run, status history, and meta hashes; emits a verdict + draft Jira comment text. `xera-internal` is a thin dispatcher invoking core/web helpers and writing artifacts. Public `xera` CLI is the user-facing scaffold/health tool only.

**Tech Stack:** `cac` (CLI parser), `@clack/prompts` (interactive prompts), `picocolors`.

**Prereqs:** Plans 01 and 02 complete.

---

> **Status:** ✅ Completed 2026-05-14. All tasks in this plan are implemented and shipped. See [POSTMORTEM.md](POSTMORTEM.md) for bugs that surfaced in the plan code itself and post-launch patches.


## Phase 7 — Classifier framework

### Task 7.1: Classification types and history utility

**Files:**
- Create: `packages/core/src/classifier/types.ts`
- Create: `packages/core/src/classifier/history.ts`
- Create: `packages/core/test/classifier/history.test.ts`

- [x] **Step 1: Define types**

```ts
import type { Classification } from '../artifact/status';
import type { NormalizedRun, NormalizedScenario } from '@xera-ai/web';

export type { Classification };
export type Confidence = 'low' | 'medium' | 'high';

export interface ScenarioClassification {
  name: string;
  outcome: 'PASS' | 'FAIL' | 'SKIPPED';
  class: Classification;
  confidence: Confidence;
  rationale: string;
}

export interface ClassifyOutput {
  overall: Classification;
  overallConfidence: Confidence;
  scenarios: ScenarioClassification[];
}

export interface ClassifyContextInput {
  history: Array<{ ts: string; result: 'PASS' | 'FAIL'; class: Classification }>;
  storyHashChanged: boolean;
  specHashChanged: boolean;
  firstRun: boolean;
}
```

Note: the actual *reasoning* in v0.1 is done by the LLM (via skill prompt + diagnose-failure.md). What lives in `@xera-ai/core/classifier` are deterministic helpers + a final aggregator/writer. The skill calls `xera-internal report` which uses these helpers and the LLM-produced per-scenario classification (passed as input).

- [x] **Step 2: Failing test for history**

```ts
import { describe, expect, test } from 'vitest';
import { summarizeHistory } from '../../src/classifier/history';

describe('summarizeHistory', () => {
  test('detects consistent fails (3+ consecutive)', () => {
    const h = summarizeHistory([
      { ts: 't1', result: 'FAIL', class: 'REAL_BUG' },
      { ts: 't2', result: 'FAIL', class: 'REAL_BUG' },
      { ts: 't3', result: 'FAIL', class: 'REAL_BUG' },
    ]);
    expect(h.consecutiveFails).toBe(3);
    expect(h.lastResult).toBe('FAIL');
  });
  test('zero consecutive when first entry is PASS', () => {
    const h = summarizeHistory([{ ts: 't1', result: 'PASS', class: 'PASS' }]);
    expect(h.consecutiveFails).toBe(0);
  });
  test('first run when history empty', () => {
    const h = summarizeHistory([]);
    expect(h.firstRun).toBe(true);
  });
});
```

- [x] **Step 3: Implement history**

```ts
import type { Classification } from '../artifact/status';

export interface HistorySummary {
  firstRun: boolean;
  consecutiveFails: number;
  lastResult: 'PASS' | 'FAIL' | null;
  lastClass: Classification | null;
}

export function summarizeHistory(
  history: Array<{ ts: string; result: 'PASS' | 'FAIL'; class: Classification }>,
): HistorySummary {
  if (history.length === 0) {
    return { firstRun: true, consecutiveFails: 0, lastResult: null, lastClass: null };
  }
  let consecutiveFails = 0;
  for (const entry of history) {
    if (entry.result === 'FAIL') consecutiveFails++;
    else break;
  }
  return {
    firstRun: false,
    consecutiveFails,
    lastResult: history[0]!.result,
    lastClass: history[0]!.class,
  };
}
```

- [x] **Step 4: Tests pass + commit**

```bash
cd packages/core && npx vitest run
git add packages/core/src/classifier/{types,history}.ts packages/core/test/classifier/history.test.ts
git commit -m "core: classifier types + history summarizer"
```

---

### Task 7.2: Aggregate scenarios → overall classification

**Files:**
- Create: `packages/core/src/classifier/aggregate.ts`
- Create: `packages/core/test/classifier/aggregate.test.ts`

When the LLM has classified each failing scenario individually, the aggregator decides the overall verdict.

- [x] **Step 1: Failing tests**

```ts
import { describe, expect, test } from 'vitest';
import { aggregateScenarios } from '../../src/classifier/aggregate';

describe('aggregateScenarios', () => {
  test('all PASS → PASS', () => {
    const r = aggregateScenarios([
      { name: 'a', outcome: 'PASS', class: 'PASS', confidence: 'high', rationale: '' },
      { name: 'b', outcome: 'PASS', class: 'PASS', confidence: 'high', rationale: '' },
    ]);
    expect(r.overall).toBe('PASS');
    expect(r.overallConfidence).toBe('high');
  });
  test('any REAL_BUG → REAL_BUG', () => {
    const r = aggregateScenarios([
      { name: 'a', outcome: 'PASS', class: 'PASS', confidence: 'high', rationale: '' },
      { name: 'b', outcome: 'FAIL', class: 'REAL_BUG', confidence: 'medium', rationale: 'r' },
      { name: 'c', outcome: 'FAIL', class: 'SELECTOR_DRIFT', confidence: 'high', rationale: 'r' },
    ]);
    expect(r.overall).toBe('REAL_BUG');
    expect(r.overallConfidence).toBe('medium');
  });
  test('only SELECTOR_DRIFT → SELECTOR_DRIFT', () => {
    const r = aggregateScenarios([
      { name: 'a', outcome: 'FAIL', class: 'SELECTOR_DRIFT', confidence: 'high', rationale: '' },
    ]);
    expect(r.overall).toBe('SELECTOR_DRIFT');
  });
});
```

- [x] **Step 2: Run failing + implement**

```ts
import type { ClassifyOutput, ScenarioClassification, Confidence } from './types';

const CLASS_PRIORITY: Array<ClassifyOutput['overall']> = [
  'REAL_BUG', 'TEST_BUG', 'SELECTOR_DRIFT', 'FLAKY', 'PASS',
];

const CONF_RANK: Record<Confidence, number> = { low: 1, medium: 2, high: 3 };

export function aggregateScenarios(scenarios: ScenarioClassification[]): ClassifyOutput {
  if (scenarios.length === 0) {
    return { overall: 'PASS', overallConfidence: 'low', scenarios: [] };
  }
  if (scenarios.every(s => s.outcome === 'PASS')) {
    return { overall: 'PASS', overallConfidence: 'high', scenarios };
  }
  let chosen: ClassifyOutput['overall'] = 'PASS';
  for (const cls of CLASS_PRIORITY) {
    if (scenarios.some(s => s.class === cls)) { chosen = cls; break; }
  }
  const matching = scenarios.filter(s => s.class === chosen);
  const minConf = matching.reduce<Confidence>(
    (acc, s) => CONF_RANK[s.confidence] < CONF_RANK[acc] ? s.confidence : acc,
    'high',
  );
  return { overall: chosen, overallConfidence: minConf, scenarios };
}
```

- [x] **Step 3: Tests pass + commit**

```bash
cd packages/core && npx vitest run
git add packages/core/src/classifier/aggregate.ts packages/core/test/classifier/aggregate.test.ts
git commit -m "core: aggregate per-scenario classifications into overall verdict"
```

---

### Task 7.3: Jira comment builder

**Files:**
- Create: `packages/core/src/reporter/jira-comment.ts`
- Create: `packages/core/test/reporter/jira-comment.test.ts`

- [x] **Step 1: Failing tests**

```ts
import { describe, expect, test } from 'vitest';
import { buildJiraComment } from '../../src/reporter/jira-comment';

describe('buildJiraComment', () => {
  test('PASS comment is short and green', () => {
    const md = buildJiraComment({
      ticket: 'JIRA-1',
      runId: '2026-05-14T10-30-00',
      overall: 'PASS',
      overallConfidence: 'high',
      scenarios: [{ name: 's', outcome: 'PASS', class: 'PASS', confidence: 'high', rationale: '' }],
      xeraVersion: '0.1.0',
      promptsVersion: '1.0.0',
    });
    expect(md).toContain('PASS');
    expect(md).toContain('JIRA-1');
    expect(md).toContain('xera v0.1.0');
  });

  test('FAIL comment includes per-scenario diagnosis and reproduce command', () => {
    const md = buildJiraComment({
      ticket: 'JIRA-1',
      runId: '2026-05-14T10-30-00',
      overall: 'REAL_BUG',
      overallConfidence: 'high',
      scenarios: [
        { name: 'Login OK', outcome: 'PASS', class: 'PASS', confidence: 'high', rationale: '' },
        { name: 'Login fail bad password', outcome: 'FAIL', class: 'REAL_BUG', confidence: 'high',
          rationale: 'POST /api/login returned 500 instead of 401 with error message.' },
      ],
      xeraVersion: '0.1.0',
      promptsVersion: '1.0.0',
    });
    expect(md).toContain('REAL_BUG');
    expect(md).toContain('1 / 2 passed');
    expect(md).toContain('Login fail bad password');
    expect(md).toContain('returned 500');
    expect(md).toContain('npx xera-internal exec JIRA-1 --replay=2026-05-14T10-30-00');
  });
});
```

- [x] **Step 2: Run failing + implement**

```ts
import type { ClassifyOutput } from '../classifier/types';

export interface JiraCommentInput extends ClassifyOutput {
  ticket: string;
  runId: string;
  xeraVersion: string;
  promptsVersion: string;
}

export function buildJiraComment(input: JiraCommentInput): string {
  const passed = input.scenarios.filter(s => s.outcome === 'PASS').length;
  const total = input.scenarios.length;
  const icon = input.overall === 'PASS' ? '🟢' : '🔴';
  const header = `## ${icon} xera test ${input.overall === 'PASS' ? 'PASSED' : 'FAILED'} — ${input.ticket} (run ${input.runId})`;
  const meta = `**Classification:** ${input.overall} (confidence: ${input.overallConfidence})\n**Scenarios:** ${passed} / ${total} passed`;

  const failingBlocks = input.scenarios
    .filter(s => s.outcome === 'FAIL')
    .map(s => `### Scenario: ${s.name}\n- **Classification:** ${s.class} (confidence: ${s.confidence})\n- **Diagnosis:** ${s.rationale}`)
    .join('\n\n');

  const reproduce = `### Reproduce locally\n\n\`\`\`\nbunx xera-internal exec ${input.ticket} --replay=${input.runId}\n\`\`\``;

  const next = input.overall === 'PASS'
    ? ''
    : `### Suggested next action\n- Review the failing scenarios above.\n- Re-run after changes: open Claude Code and run \`/xera-run ${input.ticket}\`.\n\n`;

  const footer = `---\nxera v${input.xeraVersion} • prompts v${input.promptsVersion}`;

  return [header, '', meta, '', failingBlocks, '', next, reproduce, '', footer].filter(Boolean).join('\n');
}
```

- [x] **Step 3: Tests pass + commit**

```bash
cd packages/core && npx vitest run
git add packages/core/src/reporter/jira-comment.ts packages/core/test/reporter/jira-comment.test.ts
git commit -m "core: Jira comment builder (English, includes reproduce)"
```

---

### Task 7.4: Status writer

**Files:**
- Create: `packages/core/src/reporter/status-writer.ts`
- Create: `packages/core/test/reporter/status-writer.test.ts`

- [x] **Step 1: Failing test**

```ts
import { describe, expect, test } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { writeStatusFromClassification } from '../../src/reporter/status-writer';
import { readStatus } from '../../src/artifact/status';

describe('writeStatusFromClassification', () => {
  test('writes initial status + appends history on second call', () => {
    const dir = mkdtempSync(join(tmpdir(), 'xera-stw-'));
    const path = join(dir, 'status.json');
    writeStatusFromClassification(path, {
      ticket: 'JIRA-1',
      runTs: '2026-05-14T10:30:00.000Z',
      classification: {
        overall: 'PASS', overallConfidence: 'high',
        scenarios: [{ name: 'a', outcome: 'PASS', class: 'PASS', confidence: 'high', rationale: '' }],
      },
      scenarioCounts: { total: 1, passed: 1, failed: 0, skipped: 0 },
    });
    let s = readStatus(path)!;
    expect(s.history.length).toBe(1);

    writeStatusFromClassification(path, {
      ticket: 'JIRA-1',
      runTs: '2026-05-14T11:30:00.000Z',
      classification: {
        overall: 'REAL_BUG', overallConfidence: 'high',
        scenarios: [{ name: 'a', outcome: 'FAIL', class: 'REAL_BUG', confidence: 'high', rationale: 'x' }],
      },
      scenarioCounts: { total: 1, passed: 0, failed: 1, skipped: 0 },
    });
    s = readStatus(path)!;
    expect(s.history.length).toBe(2);
    expect(s.history[0]!.ts).toBe('2026-05-14T11:30:00.000Z');
    expect(s.result).toBe('FAIL');
    rmSync(dir, { recursive: true });
  });
});
```

- [x] **Step 2: Run failing + implement**

```ts
import type { ClassifyOutput } from '../classifier/types';
import { existsSync } from 'node:fs';
import { readStatus, writeStatus, appendHistory, type StatusJson } from '../artifact/status';

export interface StatusWriterInput {
  ticket: string;
  runTs: string;
  classification: ClassifyOutput;
  scenarioCounts: { total: number; passed: number; failed: number; skipped: number };
}

export function writeStatusFromClassification(path: string, input: StatusWriterInput): void {
  const result: StatusJson['result'] = input.classification.overall === 'PASS' ? 'PASS' : 'FAIL';
  const entry = { ts: input.runTs, result, class: input.classification.overall };
  if (!existsSync(path)) {
    writeStatus(path, {
      ticket: input.ticket,
      lastRun: input.runTs,
      result,
      classification: input.classification.overall,
      confidence: input.classification.overallConfidence,
      scenarios: input.scenarioCounts,
      history: [entry],
    });
    return;
  }
  const cur = readStatus(path)!;
  writeStatus(path, {
    ...cur,
    lastRun: input.runTs,
    result,
    classification: input.classification.overall,
    confidence: input.classification.overallConfidence,
    scenarios: input.scenarioCounts,
  });
  appendHistory(path, entry);
}
```

- [x] **Step 3: Tests pass + commit**

```bash
cd packages/core && npx vitest run
git add packages/core/src/reporter/status-writer.ts packages/core/test/reporter/status-writer.test.ts
git commit -m "core: status-writer integrates classification into status.json"
```

---

### Task 7.5: Classifier golden harness + fixtures

**Files:**
- Create: `fixtures/golden-tickets/sample-pass.json`
- Create: `fixtures/golden-tickets/selector-drift.json`
- Create: `fixtures/golden-tickets/real-bug-500.json`
- Create: `fixtures/golden-tickets/flaky-network.json`
- Create: `fixtures/golden-tickets/test-bug-contradicts-story.json`
- Create: `packages/core/test/classifier/golden.test.ts`

These fixtures contain the *expected* per-scenario classifications. The test asserts the aggregator handles them correctly. The fixtures are also reused by Plan 05's E2E + Plan 04's diagnose-failure prompt evaluation.

- [x] **Step 1: Create fixtures**

`fixtures/golden-tickets/sample-pass.json`:

```json
{
  "ticket": "GOLD-001",
  "description": "All scenarios pass",
  "scenarios": [
    { "name": "Login OK", "outcome": "PASS", "class": "PASS", "confidence": "high", "rationale": "all assertions met" }
  ],
  "scenarioCounts": { "total": 1, "passed": 1, "failed": 0, "skipped": 0 },
  "expected": { "overall": "PASS", "overallConfidence": "high" }
}
```

`fixtures/golden-tickets/selector-drift.json`:

```json
{
  "ticket": "GOLD-002",
  "description": "UI changed, story unchanged",
  "scenarios": [
    { "name": "Click submit", "outcome": "FAIL", "class": "SELECTOR_DRIFT", "confidence": "high",
      "rationale": "Expected role=button name=Submit; found role=button name=Send nearby." }
  ],
  "scenarioCounts": { "total": 1, "passed": 0, "failed": 1, "skipped": 0 },
  "expected": { "overall": "SELECTOR_DRIFT", "overallConfidence": "high" }
}
```

`fixtures/golden-tickets/real-bug-500.json`:

```json
{
  "ticket": "GOLD-003",
  "description": "Backend returned 500 instead of 401",
  "scenarios": [
    { "name": "Login OK", "outcome": "PASS", "class": "PASS", "confidence": "high", "rationale": "" },
    { "name": "Login fail bad pwd", "outcome": "FAIL", "class": "REAL_BUG", "confidence": "high",
      "rationale": "POST /api/login returned 500 instead of 401 with error message." }
  ],
  "scenarioCounts": { "total": 2, "passed": 1, "failed": 1, "skipped": 0 },
  "expected": { "overall": "REAL_BUG", "overallConfidence": "high" }
}
```

`fixtures/golden-tickets/flaky-network.json`:

```json
{
  "ticket": "GOLD-004",
  "description": "Same spec passed in prior runs, no spec change, timeout at network step",
  "scenarios": [
    { "name": "Submit form", "outcome": "FAIL", "class": "FLAKY", "confidence": "medium",
      "rationale": "Previous 3 runs passed; failure at waitForResponse with no spec changes." }
  ],
  "scenarioCounts": { "total": 1, "passed": 0, "failed": 1, "skipped": 0 },
  "expected": { "overall": "FLAKY", "overallConfidence": "medium" }
}
```

`fixtures/golden-tickets/test-bug-contradicts-story.json`:

```json
{
  "ticket": "GOLD-005",
  "description": "Spec asserts text the story never mentions",
  "scenarios": [
    { "name": "See dashboard greeting", "outcome": "FAIL", "class": "TEST_BUG", "confidence": "high",
      "rationale": "Spec asserts 'Welcome, Admin' but story only specifies 'Welcome'; the actual UI says 'Welcome'." }
  ],
  "scenarioCounts": { "total": 1, "passed": 0, "failed": 1, "skipped": 0 },
  "expected": { "overall": "TEST_BUG", "overallConfidence": "high" }
}
```

- [x] **Step 2: Failing test**

```ts
import { describe, expect, test } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { aggregateScenarios } from '../../src/classifier/aggregate';

const fixturesDir = join(process.cwd(), '..', '..', 'fixtures', 'golden-tickets');

describe('classifier golden fixtures', () => {
  for (const file of readdirSync(fixturesDir)) {
    if (!file.endsWith('.json')) continue;
    const fixture = JSON.parse(readFileSync(join(fixturesDir, file), 'utf8'));
    test(`${file}: aggregator matches expected overall`, () => {
      const r = aggregateScenarios(fixture.scenarios);
      expect(r.overall).toBe(fixture.expected.overall);
      expect(r.overallConfidence).toBe(fixture.expected.overallConfidence);
    });
  }
});
```

- [x] **Step 3: Tests pass + commit**

```bash
cd packages/core && npx vitest run
git add fixtures/golden-tickets packages/core/test/classifier/golden.test.ts
git commit -m "core+fixtures: classifier golden harness with 5 fixtures"
```

---

## Phase 8 — `xera-internal` binary

### Task 8.1: Bin entry + command dispatch

**Files:**
- Create: `packages/core/src/bin-internal/index.ts`
- Modify: `packages/core/package.json` (build script — already includes bin/internal.ts)
- Create: `packages/core/bin/internal.ts`

- [x] **Step 1: Write the dispatcher**

`packages/core/src/bin-internal/index.ts`:

```ts
import { fetchCmd } from './fetch';
import { validateFeatureCmd } from './validate-feature';
import { typecheckCmd } from './typecheck';
import { lintCmd } from './lint';
import { execCmd } from './exec';
import { normalizeCmd } from './normalize';
import { reportCmd } from './report';
import { postCmd } from './post';
import { statusCmd } from './status-cmd';
import { unlockCmd } from './unlock';
import { promoteCmd } from './promote';

const COMMANDS: Record<string, (argv: string[]) => Promise<number>> = {
  fetch: fetchCmd,
  'validate-feature': validateFeatureCmd,
  typecheck: typecheckCmd,
  lint: lintCmd,
  exec: execCmd,
  normalize: normalizeCmd,
  report: reportCmd,
  post: postCmd,
  status: statusCmd,
  unlock: unlockCmd,
  promote: promoteCmd,
};

export async function run(argv: string[]): Promise<number> {
  const [cmd, ...rest] = argv;
  if (!cmd || !COMMANDS[cmd]) {
    console.error(`Usage: xera-internal <command> [args...]\nCommands: ${Object.keys(COMMANDS).join(', ')}`);
    return 1;
  }
  try {
    return await COMMANDS[cmd]!(rest);
  } catch (err) {
    console.error(`[xera:${cmd}] failed: ${(err as Error).message}`);
    return 4;
  }
}
```

`packages/core/bin/internal.ts`:

```ts
#!/usr/bin/env node
import { run } from '../src/bin-internal/index';
const code = await run(process.argv.slice(2));
process.exit(code);
```

- [x] **Step 2: Make bin executable + commit**

```bash
chmod +x packages/core/bin/internal.ts
git add packages/core/bin/internal.ts packages/core/src/bin-internal/index.ts
git commit -m "core: xera-internal bin entry + command dispatcher skeleton"
```

The subcommand files (referenced above) are implemented in the following tasks. Each task adds one command file.

---

### Task 8.2: `fetch` subcommand

**Files:**
- Create: `packages/core/src/bin-internal/fetch.ts`
- Create: `packages/core/test/bin-internal/fetch.test.ts`

- [x] **Step 1: Failing test (mocks Jira client)**

```ts
import { describe, expect, test } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fetchCmd } from '../../src/bin-internal/fetch';

describe('xera-internal fetch', () => {
  test('writes story.md and meta.json', async () => {
    const cwd = mkdtempSync(join(tmpdir(), 'xera-fetch-'));
    // Write xera.config.ts
    writeFileSync(join(cwd, 'xera.config.ts'), `
      import { defineConfig } from '${process.cwd()}/packages/core/src/config/define.ts';
      export default defineConfig({
        jira: { baseUrl: 'https://x.atlassian.net', projectKeys: ['JIRA'], fields: { story: 'description' } },
        web: { baseUrl: { staging: 'https://x.com' }, defaultEnv: 'staging' },
        adapters: ['web'],
      });
    `);
    // Stub the jira client via env-injected factory
    process.env.XERA_TEST_JIRA = JSON.stringify({
      key: 'JIRA-1',
      summary: 'A summary',
      story: 'A user story',
      attachments: [],
      raw: {},
    });

    const exit = await fetchCmd(['JIRA-1'], { cwd });
    expect(exit).toBe(0);
    expect(existsSync(join(cwd, '.xera/JIRA-1/story.md'))).toBe(true);
    const story = readFileSync(join(cwd, '.xera/JIRA-1/story.md'), 'utf8');
    expect(story).toContain('A user story');

    delete process.env.XERA_TEST_JIRA;
    rmSync(cwd, { recursive: true });
  });
});
```

- [x] **Step 2: Run failing + implement**

```ts
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { loadConfig } from '../config/load';
import { resolveArtifactPaths } from '../artifact/paths';
import { hashString } from '../artifact/hash';
import { writeMeta, readMeta } from '../artifact/meta';
import { createJiraClient } from '../jira/client';
import type { JiraTicket } from '../jira/types';

export interface FetchCmdOpts { cwd?: string; }

export async function fetchCmd(argv: string[], opts: FetchCmdOpts = {}): Promise<number> {
  const cwd = opts.cwd ?? process.cwd();
  const ticket = argv[0];
  if (!ticket) {
    console.error('[xera:fetch] usage: xera-internal fetch <TICKET>');
    return 1;
  }
  const config = await loadConfig(cwd);
  const paths = resolveArtifactPaths(cwd, ticket);

  // Test injection: skip real Jira when XERA_TEST_JIRA env is set.
  let t: JiraTicket;
  if (process.env.XERA_TEST_JIRA) {
    t = JSON.parse(process.env.XERA_TEST_JIRA) as JiraTicket;
  } else {
    const client = await createJiraClient({
      baseUrl: config.jira.baseUrl,
      preferMcp: true,
      rest: process.env.JIRA_EMAIL && process.env.JIRA_API_TOKEN
        ? { email: process.env.JIRA_EMAIL, apiToken: process.env.JIRA_API_TOKEN }
        : undefined,
    });
    t = await client.fetchTicket(ticket, config.jira.fields);
  }

  const story = renderStory(t);
  mkdirSync(dirname(paths.storyPath), { recursive: true });
  writeFileSync(paths.storyPath, story);

  const existing = readMeta(paths.metaPath);
  writeMeta(paths.metaPath, {
    ticket,
    adapter: 'web',
    xera_version: '0.1.0',
    prompts_version: '1.0.0',
    fetched_at: new Date().toISOString(),
    story_hash: hashString(story),
    ...(existing ?? {}),
    // Re-stamp the just-fetched fields:
    story_hash: hashString(story),
    fetched_at: new Date().toISOString(),
  });

  console.log(`[xera:fetch] wrote ${paths.storyPath}`);
  return 0;
}

function renderStory(t: JiraTicket): string {
  const lines: string[] = [];
  lines.push(`# ${t.key}: ${t.summary}`, '');
  lines.push(`## Story`, '', t.story.trim(), '');
  if (t.acceptanceCriteria && t.acceptanceCriteria.trim()) {
    lines.push(`## Acceptance Criteria`, '', t.acceptanceCriteria.trim(), '');
  }
  if (t.attachments.length > 0) {
    lines.push(`## Attachments`, '', ...t.attachments.map(a => `- [${a.filename}](${a.url})`), '');
  }
  return lines.join('\n');
}
```

- [x] **Step 3: Tests pass + commit**

```bash
cd packages/core && npx vitest run
git add packages/core/src/bin-internal/fetch.ts packages/core/test/bin-internal/fetch.test.ts
git commit -m "core: xera-internal fetch — writes story.md + meta.json"
```

---

### Task 8.3: `validate-feature`, `typecheck`, `lint` subcommands

**Files:**
- Create: `packages/core/src/bin-internal/validate-feature.ts`
- Create: `packages/core/src/bin-internal/typecheck.ts`
- Create: `packages/core/src/bin-internal/lint.ts`
- Create: `packages/core/test/bin-internal/quality-gates.test.ts`

- [x] **Step 1: Implement validate-feature**

```ts
import { readFileSync, existsSync } from 'node:fs';
import { resolveArtifactPaths } from '../artifact/paths';
import { validateGherkin } from '@xera-ai/web';

export async function validateFeatureCmd(argv: string[]): Promise<number> {
  const ticket = argv[0];
  if (!ticket) { console.error('[xera:validate-feature] usage: validate-feature <TICKET>'); return 1; }
  const paths = resolveArtifactPaths(process.cwd(), ticket);
  if (!existsSync(paths.featurePath)) { console.error(`[xera:validate-feature] missing ${paths.featurePath}`); return 1; }
  const r = validateGherkin(readFileSync(paths.featurePath, 'utf8'));
  if (r.ok) { console.log('[xera:validate-feature] ok'); return 0; }
  for (const e of r.errors) console.error(`[xera:validate-feature] line ${e.line}: ${e.message}`);
  return 2;
}
```

- [x] **Step 2: Implement typecheck**

```ts
import { resolveArtifactPaths } from '../artifact/paths';
import { typecheckTicket } from '@xera-ai/web';

export async function typecheckCmd(argv: string[]): Promise<number> {
  const ticket = argv[0];
  if (!ticket) { console.error('[xera:typecheck] usage: typecheck <TICKET>'); return 1; }
  const paths = resolveArtifactPaths(process.cwd(), ticket);
  const r = await typecheckTicket(paths.ticketDir);
  if (r.ok) { console.log('[xera:typecheck] ok'); return 0; }
  for (const e of r.errors) console.error(`[xera:typecheck] ${e}`);
  return 2;
}
```

- [x] **Step 3: Implement lint**

```ts
import { resolveArtifactPaths } from '../artifact/paths';
import { lintTicket } from '@xera-ai/web';

export async function lintCmd(argv: string[]): Promise<number> {
  const ticket = argv[0];
  if (!ticket) { console.error('[xera:lint] usage: lint <TICKET>'); return 1; }
  const paths = resolveArtifactPaths(process.cwd(), ticket);
  const r = await lintTicket(paths.ticketDir);
  if (r.ok) { console.log('[xera:lint] ok'); return 0; }
  for (const w of r.warnings) console.error(`[xera:lint] ${w.file}:${w.line} [${w.rule}] ${w.message}`);
  return 2;
}
```

- [x] **Step 4: Smoke test all three**

```ts
import { describe, expect, test } from 'vitest';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { validateFeatureCmd } from '../../src/bin-internal/validate-feature';
import { typecheckCmd } from '../../src/bin-internal/typecheck';
import { lintCmd } from '../../src/bin-internal/lint';

function setupTicket(content: { feature?: string; spec?: string }): string {
  const cwd = mkdtempSync(join(tmpdir(), 'xera-qg-'));
  mkdirSync(join(cwd, '.xera/JIRA-1'), { recursive: true });
  if (content.feature !== undefined) writeFileSync(join(cwd, '.xera/JIRA-1/test.feature'), content.feature);
  if (content.spec !== undefined) writeFileSync(join(cwd, '.xera/JIRA-1/spec.ts'), content.spec);
  return cwd;
}

describe('quality gate subcommands', () => {
  test('validate-feature: exit 0 on good feature', async () => {
    const cwd = setupTicket({ feature: `Feature: x\n  Scenario: y\n    Given z\n` });
    process.chdir(cwd);
    expect(await validateFeatureCmd(['JIRA-1'])).toBe(0);
    rmSync(cwd, { recursive: true });
  });
  test('lint: exit 2 on auto-classname selector', async () => {
    const cwd = setupTicket({ spec: `page.locator('.MuiButton-root-3xyz')` });
    process.chdir(cwd);
    expect(await lintCmd(['JIRA-1'])).toBe(2);
    rmSync(cwd, { recursive: true });
  });
});
```

- [x] **Step 5: Tests pass + commit**

```bash
cd packages/core && npx vitest run
git add packages/core/src/bin-internal/{validate-feature,typecheck,lint}.ts packages/core/test/bin-internal/quality-gates.test.ts
git commit -m "core: xera-internal validate-feature + typecheck + lint subcommands"
```

---

### Task 8.4: `exec` subcommand (with auth refresh + lock)

**Files:**
- Create: `packages/core/src/bin-internal/exec.ts`
- Create: `packages/core/test/bin-internal/exec.test.ts`

- [x] **Step 1: Implement**

```ts
import { resolveArtifactPaths, generateRunId } from '../artifact/paths';
import { acquireLock, releaseLock, isLockStale, readLock, forceUnlock } from '../lock/file-lock';
import { NdjsonLogger } from '../logging/ndjson-logger';
import { loadConfig } from '../config/load';
import { readAuthState } from '../auth/state';
import { needsRefresh } from '../auth/refresh';
import { stagePlaywrightState, runAuthSetup, runPlaywright } from '@xera-ai/web';
import { chromium } from '@playwright/test';
import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

export async function execCmd(argv: string[]): Promise<number> {
  const ticket = argv[0];
  if (!ticket) { console.error('[xera:exec] usage: exec <TICKET>'); return 1; }
  const cwd = process.cwd();
  const config = await loadConfig(cwd);
  const paths = resolveArtifactPaths(cwd, ticket);
  const runId = generateRunId();
  const log = new NdjsonLogger(paths.logPath);

  // Acquire lock
  if (!acquireLock(paths.lockPath, runId)) {
    if (isLockStale(paths.lockPath)) {
      console.error(`[xera:exec] stale lock detected; force unlocking. Run \`xera-internal unlock ${ticket}\` to clear manually.`);
      forceUnlock(paths.lockPath);
      acquireLock(paths.lockPath, runId);
    } else {
      const existing = readLock(paths.lockPath);
      console.error(`[xera:exec] another run in progress (PID ${existing?.pid} on ${existing?.hostname}, started ${existing?.started_at}). Wait or run \`xera-internal unlock ${ticket}\`.`);
      return 1;
    }
  }

  const t0 = Date.now();
  try {
    // Auth refresh per role declared in xera.config.ts
    if (config.web.auth.strategy === 'storageState' && config.web.auth.setupScript) {
      const browser = await chromium.launch();
      try {
        for (const [roleName, roleCreds] of Object.entries(config.web.auth.roles)) {
          const entry = readAuthState(paths.authDir, roleName);
          if (needsRefresh(entry, { ttl: config.web.auth.ttl, refreshBuffer: config.web.auth.refreshBuffer })) {
            const email = process.env[roleCreds.envEmail];
            const password = process.env[roleCreds.envPassword];
            if (!email || !password) {
              console.error(`[xera:exec] missing env ${roleCreds.envEmail} or ${roleCreds.envPassword} for role "${roleName}"`);
              return 1;
            }
            await runAuthSetup({
              role: roleName,
              creds: { email, password },
              setupScriptPath: join(cwd, config.web.auth.setupScript),
              authDir: paths.authDir,
              browser,
            });
            log.log({ step: 'auth-refresh', role: roleName });
          }
        }
      } finally {
        await browser.close();
      }
    }

    // Stage Playwright storageState files for declared roles
    const stagedRoles: Record<string, string> = {};
    if (config.web.auth.strategy === 'storageState') {
      for (const roleName of Object.keys(config.web.auth.roles)) {
        if (readAuthState(paths.authDir, roleName)) {
          stagedRoles[roleName] = stagePlaywrightState(paths.authDir, roleName);
        }
      }
    }

    // Generate per-run playwright.config.ts if not present at ticketDir
    const cfgPath = join(paths.ticketDir, 'playwright.config.ts');
    if (!existsSync(cfgPath)) {
      writeFileSync(cfgPath, renderPlaywrightConfig({
        baseUrl: config.web.baseUrl[config.web.defaultEnv]!,
        storageStatePathPerRole: stagedRoles,
      }));
    }

    const runDir = paths.runPath(runId).runDir;
    mkdirSync(runDir, { recursive: true });

    log.log({ step: 'exec.start', runId });
    const r = await runPlaywright({ specPath: paths.specPath, configPath: cfgPath, outputDir: runDir });
    log.log({ step: 'exec.done', runId, exit: r.exitCode, ms: Date.now() - t0 });

    console.log(`[xera:exec] runId=${runId} outcome=${r.outcome}`);
    // Exit 3 means "test failed" (expected vs infra error)
    return r.outcome === 'PASS' ? 0 : 3;
  } finally {
    releaseLock(paths.lockPath);
  }
}

function renderPlaywrightConfig(opts: { baseUrl: string; storageStatePathPerRole: Record<string, string> }): string {
  const projects = Object.entries(opts.storageStatePathPerRole).map(
    ([role, path]) => `    { name: '${role}', use: { ...devices['Desktop Chromium'], storageState: '${path}' } }`,
  );
  if (projects.length === 0) projects.push(`    { name: 'default', use: { ...devices['Desktop Chromium'] } }`);
  return `import { defineConfig, devices } from '@playwright/test';
export default defineConfig({
  use: { baseURL: '${opts.baseUrl}', trace: 'on' },
  projects: [
${projects.join(',\n')}
  ],
});
`;
}
```

- [x] **Step 2: Lightweight test (skip real Playwright; assert lock + config gen)**

```ts
import { describe, expect, test } from 'vitest';
import { mkdtempSync, writeFileSync, mkdirSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { acquireLock } from '../../src/lock/file-lock';
import { execCmd } from '../../src/bin-internal/exec';

describe('xera-internal exec', () => {
  test('refuses to run when active lock exists', async () => {
    const cwd = mkdtempSync(join(tmpdir(), 'xera-exec-'));
    mkdirSync(join(cwd, '.xera/JIRA-1'), { recursive: true });
    writeFileSync(join(cwd, 'xera.config.ts'), `
      import { defineConfig } from '${process.cwd()}/packages/core/src/config/define.ts';
      export default defineConfig({
        jira: { baseUrl: 'https://x.atlassian.net', projectKeys: ['JIRA'], fields: { story: 'description' } },
        web: { baseUrl: { staging: 'https://x.com' }, defaultEnv: 'staging', auth: { strategy: 'none' } },
        adapters: ['web'],
      });
    `);
    acquireLock(join(cwd, '.xera/JIRA-1/.lock'), 'existing-run');
    process.chdir(cwd);
    expect(await execCmd(['JIRA-1'])).toBe(1);
    rmSync(cwd, { recursive: true });
  });
});
```

- [x] **Step 3: Tests pass + commit**

```bash
cd packages/core && npx vitest run
git add packages/core/src/bin-internal/exec.ts packages/core/test/bin-internal/exec.test.ts
git commit -m "core: xera-internal exec with auth refresh, lock, and config gen"
```

---

### Task 8.5: `normalize`, `report`, `post` subcommands

**Files:**
- Create: `packages/core/src/bin-internal/normalize.ts`
- Create: `packages/core/src/bin-internal/report.ts`
- Create: `packages/core/src/bin-internal/post.ts`

- [x] **Step 1: normalize**

```ts
import { resolveArtifactPaths } from '../artifact/paths';
import { normalizeRun } from '@xera-ai/web';
import { readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

export async function normalizeCmd(argv: string[]): Promise<number> {
  const ticket = argv[0];
  if (!ticket) { console.error('[xera:normalize] usage: normalize <TICKET> [--run=<runId>]'); return 1; }
  const paths = resolveArtifactPaths(process.cwd(), ticket);
  const runArg = argv.find(a => a.startsWith('--run='));
  const runId = runArg
    ? runArg.split('=')[1]!
    : readdirSync(paths.runsDir).filter(n => !n.startsWith('.')).sort().pop()!;
  if (!runId) { console.error('[xera:normalize] no run found'); return 1; }
  const runDir = join(paths.runsDir, runId);
  if (!existsSync(runDir)) { console.error(`[xera:normalize] runs/${runId} missing`); return 1; }
  const r = await normalizeRun({ runId, runDir });
  console.log(`[xera:normalize] wrote normalized.json (scrubbed_fields_count=${r.scrubbed_fields_count})`);
  return 0;
}
```

- [x] **Step 2: report**

`report` takes the per-scenario classifications produced by the LLM-driven skill (passed via `--input=path-to-json`) and writes `status.json` + draft comment file.

```ts
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { resolveArtifactPaths, generateRunId } from '../artifact/paths';
import { aggregateScenarios } from '../classifier/aggregate';
import { writeStatusFromClassification } from '../reporter/status-writer';
import { buildJiraComment } from '../reporter/jira-comment';
import type { ScenarioClassification } from '../classifier/types';

interface ReportInput {
  scenarios: ScenarioClassification[];
  scenarioCounts: { total: number; passed: number; failed: number; skipped: number };
  runId: string;
}

export async function reportCmd(argv: string[]): Promise<number> {
  const ticket = argv[0];
  const inputArg = argv.find(a => a.startsWith('--input='));
  if (!ticket || !inputArg) {
    console.error('[xera:report] usage: report <TICKET> --input=<classifier-output.json>');
    return 1;
  }
  const paths = resolveArtifactPaths(process.cwd(), ticket);
  const input = JSON.parse(readFileSync(inputArg.slice('--input='.length), 'utf8')) as ReportInput;

  const aggregated = aggregateScenarios(input.scenarios);
  const ts = new Date().toISOString();
  writeStatusFromClassification(paths.statusPath, {
    ticket,
    runTs: ts,
    classification: aggregated,
    scenarioCounts: input.scenarioCounts,
  });

  const md = buildJiraComment({
    ticket,
    runId: input.runId,
    overall: aggregated.overall,
    overallConfidence: aggregated.overallConfidence,
    scenarios: aggregated.scenarios,
    xeraVersion: '0.1.0',
    promptsVersion: '1.0.0',
  });
  const draftPath = join(paths.ticketDir, 'jira-comment.draft.md');
  writeFileSync(draftPath, md);
  console.log(`[xera:report] wrote status.json and ${draftPath}`);
  return 0;
}
```

- [x] **Step 3: post**

```ts
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { resolveArtifactPaths } from '../artifact/paths';
import { loadConfig } from '../config/load';
import { readStatus, writeStatus } from '../artifact/status';
import { createJiraClient } from '../jira/client';

export async function postCmd(argv: string[]): Promise<number> {
  const ticket = argv[0];
  if (!ticket) { console.error('[xera:post] usage: post <TICKET>'); return 1; }
  const cwd = process.cwd();
  const config = await loadConfig(cwd);
  if (!config.reporting.postToJira) {
    console.log('[xera:post] postToJira disabled in config; skipping');
    return 0;
  }
  const paths = resolveArtifactPaths(cwd, ticket);
  const draftPath = join(paths.ticketDir, 'jira-comment.draft.md');
  if (!existsSync(draftPath)) { console.error(`[xera:post] no draft at ${draftPath}; run \`xera-internal report\` first.`); return 1; }
  const body = readFileSync(draftPath, 'utf8');

  const client = await createJiraClient({
    baseUrl: config.jira.baseUrl,
    preferMcp: true,
    rest: process.env.JIRA_EMAIL && process.env.JIRA_API_TOKEN
      ? { email: process.env.JIRA_EMAIL, apiToken: process.env.JIRA_API_TOKEN }
      : undefined,
  });
  const r = await client.postComment(ticket, body);
  console.log(`[xera:post] posted comment id=${r.id}`);

  const s = readStatus(paths.statusPath);
  if (s) writeStatus(paths.statusPath, { ...s, last_jira_comment_id: r.id });
  return 0;
}
```

- [x] **Step 4: Commit**

```bash
git add packages/core/src/bin-internal/{normalize,report,post}.ts
git commit -m "core: xera-internal normalize + report + post subcommands"
```

---

### Task 8.6: `status`, `unlock`, `promote` subcommands

**Files:**
- Create: `packages/core/src/bin-internal/status-cmd.ts`
- Create: `packages/core/src/bin-internal/unlock.ts`
- Create: `packages/core/src/bin-internal/promote.ts`

- [x] **Step 1: status**

```ts
import { resolveArtifactPaths } from '../artifact/paths';
import { readStatus } from '../artifact/status';

export async function statusCmd(argv: string[]): Promise<number> {
  const ticket = argv[0];
  if (!ticket) { console.error('[xera:status] usage: status <TICKET>'); return 1; }
  const paths = resolveArtifactPaths(process.cwd(), ticket);
  const s = readStatus(paths.statusPath);
  if (!s) { console.log(`[xera:status] no status yet for ${ticket}`); return 0; }
  console.log(`${ticket}: ${s.result} (${s.classification}, conf=${s.confidence}) — ${s.scenarios.passed}/${s.scenarios.total} passed, last run ${s.lastRun}`);
  for (const h of s.history.slice(0, 5)) console.log(`  ${h.ts}  ${h.result}  ${h.class}`);
  return 0;
}
```

- [x] **Step 2: unlock**

```ts
import { resolveArtifactPaths } from '../artifact/paths';
import { isLockStale, readLock, forceUnlock } from '../lock/file-lock';

export async function unlockCmd(argv: string[]): Promise<number> {
  const ticket = argv[0];
  if (!ticket) { console.error('[xera:unlock] usage: unlock <TICKET> [--force]'); return 1; }
  const paths = resolveArtifactPaths(process.cwd(), ticket);
  const lock = readLock(paths.lockPath);
  if (!lock) { console.log(`[xera:unlock] no lock for ${ticket}`); return 0; }
  const force = argv.includes('--force');
  if (!force && !isLockStale(paths.lockPath)) {
    console.error(`[xera:unlock] lock is held by PID ${lock.pid} on ${lock.hostname} (active). Pass --force to override.`);
    return 1;
  }
  forceUnlock(paths.lockPath);
  console.log(`[xera:unlock] released`);
  return 0;
}
```

- [x] **Step 3: promote**

```ts
import { promotePom } from '@xera-ai/web';

export async function promoteCmd(argv: string[]): Promise<number> {
  const [ticket, className] = argv;
  if (!ticket || !className) {
    console.error('[xera:promote] usage: promote <TICKET> <PomClassName>');
    return 1;
  }
  await promotePom({ repoRoot: process.cwd(), ticket, className });
  console.log(`[xera:promote] moved ${className} → shared/page-objects/`);
  return 0;
}
```

- [x] **Step 4: Commit + verify build**

```bash
cd packages/core && npm run typecheck && npm run build
git add packages/core/src/bin-internal/{status-cmd,unlock,promote}.ts
git commit -m "core: xera-internal status + unlock + promote subcommands"
```

---

## Phase 9 — Public CLI (`xera init`, `xera doctor`)

### Task 9.1: CLI entry + cac setup

**Files:**
- Create: `packages/cli/src/index.ts`

- [x] **Step 1: Write entry**

```ts
import { cac } from 'cac';
import pc from 'picocolors';
import { initCommand } from './commands/init';
import { initUpdateCommand } from './commands/init-update';
import { doctorCommand } from './commands/doctor';

const VERSION = '0.1.0';

export default async function main(): Promise<void> {
  const cli = cac('xera');
  cli.help();
  cli.version(VERSION);

  cli
    .command('init', 'Scaffold a new xera project in the current directory')
    .option('--update', 'Non-destructive refresh of an existing project')
    .option('-y, --yes', 'Accept all defaults (non-interactive)')
    .action(async (opts: { update?: boolean; yes?: boolean }) => {
      if (opts.update) await initUpdateCommand({ yes: !!opts.yes });
      else await initCommand({ yes: !!opts.yes });
    });

  cli
    .command('doctor', 'Run a health check')
    .option('--strict <ticket>', 'Treat ticket-specific checks as required')
    .option('--logs <ticket>', 'Pretty-print xera.log for a ticket')
    .option('--usage', 'Show token/usage summary from recent runs')
    .action(async (opts: { strict?: string; logs?: string; usage?: boolean }) => {
      const exit = await doctorCommand(opts);
      process.exit(exit);
    });

  try {
    cli.parse(process.argv, { run: false });
    await cli.runMatchedCommand();
  } catch (e) {
    console.error(pc.red(`[xera] ${(e as Error).message}`));
    process.exit(1);
  }
}
```

- [x] **Step 2: Commit**

```bash
git add packages/cli/src/index.ts
git commit -m "cli: bin entry with init + doctor commands wired"
```

---

### Task 9.2: `xera init` — scaffold + prompts

**Files:**
- Create: `packages/cli/src/commands/init.ts`
- Create: `packages/cli/src/scaffold.ts`
- Create: `packages/cli/templates/xera.config.ts.tmpl`
- Create: `packages/cli/templates/playwright.config.ts.tmpl`
- Create: `packages/cli/templates/tsconfig.json.tmpl`
- Create: `packages/cli/templates/env.example.tmpl`
- Create: `packages/cli/templates/auth-setup.ts.tmpl`
- Create: `packages/cli/templates/sample/SAMPLE-001/story.md`
- Create: `packages/cli/templates/sample/SAMPLE-001/test.feature`
- Create: `packages/cli/templates/sample/SAMPLE-001/spec.ts`
- Create: `packages/cli/templates/sample/SAMPLE-001/meta.json`

The templates can use `{{var}}` placeholders, replaced by `scaffold.ts`.

- [x] **Step 1: Write templates**

`packages/cli/templates/xera.config.ts.tmpl`:

```ts
import { defineConfig } from '@xera-ai/core';

export default defineConfig({
  jira: {
    baseUrl: '{{jiraBaseUrl}}',
    projectKeys: [{{projectKeys}}],
    fields: {
      story: '{{storyField}}',
      {{#if acceptanceCriteriaField}}
      acceptanceCriteria: '{{acceptanceCriteriaField}}',
      {{/if}}
    },
  },
  web: {
    baseUrl: {
      staging: '{{stagingUrl}}',
    },
    defaultEnv: 'staging',
    {{#if authEnabled}}
    auth: {
      strategy: 'storageState',
      ttl: '8h',
      refreshBuffer: '30m',
      setupScript: './shared/auth-setup.ts',
      roles: {
        {{#each roles}}
        {{this}}: { envEmail: 'TEST_{{upper this}}_EMAIL', envPassword: 'TEST_{{upper this}}_PWD' },
        {{/each}}
      },
    },
    {{/if}}
  },
  adapters: ['web'],
});
```

`packages/cli/templates/playwright.config.ts.tmpl`:

```ts
import { defineConfig, devices } from '@playwright/test';
export default defineConfig({
  testDir: './.xera',
  testMatch: '**/spec.ts',
  use: { baseURL: '{{stagingUrl}}', trace: 'on', video: 'retain-on-failure', screenshot: 'only-on-failure' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chromium'] } }],
});
```

`packages/cli/templates/tsconfig.json.tmpl`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "skipLibCheck": true,
    "esModuleInterop": true,
    "isolatedModules": true,
    "types": ["@playwright/test", "@types/node"]
  },
  "include": [".xera/**/*.ts", "shared/**/*.ts"]
}
```

`packages/cli/templates/env.example.tmpl`:

```
# Jira (skip if Atlassian MCP is connected in your Claude Code)
JIRA_EMAIL=
JIRA_API_TOKEN=

# Test user credentials (one pair per role)
{{#each roles}}
TEST_{{upper this}}_EMAIL=
TEST_{{upper this}}_PWD=
{{/each}}

# xera auth state encryption key — DO NOT regenerate or .xera/.auth/ cache becomes useless
XERA_AUTH_KEY={{authKey}}
```

`packages/cli/templates/auth-setup.ts.tmpl`:

```ts
import { defineAuthSetup } from '@xera-ai/web';

export default defineAuthSetup(async (page, _role, creds) => {
  await page.goto('/login');
  await page.getByLabel('Email').fill(creds.email);
  await page.getByLabel('Password').fill(creds.password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL(/.*\/dashboard/);
  return { expiresAt: Date.now() + 8 * 3600 * 1000 };
});
```

`packages/cli/templates/sample/SAMPLE-001/story.md`:

```markdown
# SAMPLE-001: Playwright documentation site loads

## Story
As a QA engineer setting up xera,
I want to verify the framework can run an end-to-end test against a public website,
so that I know my environment is set up correctly.

## Acceptance Criteria
- Navigate to https://playwright.dev
- Page title contains "Playwright"
- Main heading is visible
```

`packages/cli/templates/sample/SAMPLE-001/test.feature`:

```gherkin
Feature: Playwright docs site smoke test

  Scenario: Home page loads with expected title
    Given I open the Playwright docs site
    Then the page title contains "Playwright"
    And I see the main heading
```

`packages/cli/templates/sample/SAMPLE-001/spec.ts`:

```ts
import { test, expect } from '@playwright/test';

test.describe('SAMPLE-001: Playwright docs site smoke test', () => {
  test('Home page loads with expected title', async ({ page }) => {
    await page.goto('https://playwright.dev');
    await expect(page).toHaveTitle(/Playwright/);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  });
});
```

`packages/cli/templates/sample/SAMPLE-001/meta.json`:

```json
{
  "ticket": "SAMPLE-001",
  "adapter": "web",
  "xera_version": "0.1.0",
  "prompts_version": "1.0.0",
  "source": "local",
  "fetched_at": "2026-05-14T00:00:00.000Z",
  "story_hash": "sha256:placeholder"
}
```

- [x] **Step 2: Implement `scaffold.ts`**

```ts
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const TEMPLATE_ROOT = join(fileURLToPath(import.meta.url), '..', '..', 'templates');

function render(tmpl: string, vars: Record<string, string | string[] | boolean>): string {
  let out = tmpl;
  // {{var}}
  out = out.replace(/\{\{(\w+)\}\}/g, (_, k) => {
    const v = vars[k];
    return v === undefined ? '' : Array.isArray(v) ? v.map(s => `'${s}'`).join(', ') : String(v);
  });
  // {{#if foo}}...{{/if}}
  out = out.replace(/\{\{#if (\w+)\}\}([\s\S]*?)\{\{\/if\}\}/g, (_, k, block) =>
    vars[k] ? String(block) : '',
  );
  // {{#each list}}...{{/each}} with {{this}} and {{upper this}}
  out = out.replace(/\{\{#each (\w+)\}\}([\s\S]*?)\{\{\/each\}\}/g, (_, k, block) => {
    const list = vars[k];
    if (!Array.isArray(list)) return '';
    return list
      .map(item =>
        String(block)
          .replace(/\{\{upper this\}\}/g, item.toUpperCase().replace(/-/g, '_'))
          .replace(/\{\{this\}\}/g, item),
      )
      .join('');
  });
  return out;
}

export function scaffoldFile(targetPath: string, templateName: string, vars: Record<string, unknown>): void {
  const tmpl = readFileSync(join(TEMPLATE_ROOT, templateName), 'utf8');
  mkdirSync(dirname(targetPath), { recursive: true });
  writeFileSync(targetPath, render(tmpl, vars as Record<string, string | string[] | boolean>));
}

export function copyDir(src: string, dest: string): void {
  mkdirSync(dest, { recursive: true });
  for (const entry of readdirSync(src, { withFileTypes: true })) {
    const s = join(src, entry.name);
    const d = join(dest, entry.name);
    if (entry.isDirectory()) copyDir(s, d);
    else writeFileSync(d, readFileSync(s));
  }
}

export const TEMPLATE_DIR = TEMPLATE_ROOT;
```

- [x] **Step 3: Implement `init.ts`**

```ts
import * as p from '@clack/prompts';
import pc from 'picocolors';
import { existsSync, writeFileSync, readFileSync, appendFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { generateKey } from '@xera-ai/core';
import { scaffoldFile, copyDir, TEMPLATE_DIR } from '../scaffold';

export async function initCommand(opts: { yes: boolean }): Promise<void> {
  const cwd = process.cwd();
  p.intro(pc.cyan('xera v0.1.0 — project setup'));

  // Prompt user
  const answers = opts.yes
    ? {
        jiraBaseUrl: 'https://example.atlassian.net',
        projectKeys: 'JIRA',
        stagingUrl: 'http://localhost:3000',
        storyField: 'description',
        acceptanceCriteriaField: '',
        authEnabled: true,
        roles: 'admin,regular',
      }
    : await p.group(
        {
          jiraBaseUrl: () => p.text({ message: 'Jira workspace URL', placeholder: 'https://x.atlassian.net' }),
          projectKeys: () => p.text({ message: 'Jira project key(s) (comma-separated)', placeholder: 'JIRA' }),
          stagingUrl: () => p.text({ message: 'Web app staging URL', placeholder: 'https://staging.example.com' }),
          storyField: () => p.text({ message: 'Jira field id for user story', initialValue: 'description' }),
          acceptanceCriteriaField: () =>
            p.text({ message: 'Jira field id for AC (leave empty if same as story)', initialValue: '' }),
          authEnabled: () => p.confirm({ message: 'Does your app require login to test most pages?', initialValue: true }),
          roles: () =>
            p.text({ message: 'Test user roles (comma-separated)', initialValue: 'admin,regular' }),
        },
        { onCancel: () => { p.cancel('Aborted.'); process.exit(0); } },
      );

  const vars = {
    jiraBaseUrl: answers.jiraBaseUrl,
    projectKeys: answers.projectKeys.split(',').map((s: string) => s.trim()).filter(Boolean),
    stagingUrl: answers.stagingUrl,
    storyField: answers.storyField,
    acceptanceCriteriaField: answers.acceptanceCriteriaField,
    authEnabled: !!answers.authEnabled,
    roles: answers.roles.split(',').map((s: string) => s.trim()).filter(Boolean),
    authKey: generateKey(),
  };

  scaffoldFile(join(cwd, 'xera.config.ts'), 'xera.config.ts.tmpl', vars);
  scaffoldFile(join(cwd, 'playwright.config.ts'), 'playwright.config.ts.tmpl', vars);
  scaffoldFile(join(cwd, 'tsconfig.json'), 'tsconfig.json.tmpl', vars);
  scaffoldFile(join(cwd, '.env.example'), 'env.example.tmpl', vars);
  if (vars.authEnabled) {
    scaffoldFile(join(cwd, 'shared/auth-setup.ts'), 'auth-setup.ts.tmpl', vars);
  }

  // .gitignore additions
  const gitignorePath = join(cwd, '.gitignore');
  const gitignoreAdditions = [
    '',
    '# xera',
    '.env',
    '.xera/**/runs/',
    '.xera/.auth/',
    'node_modules/',
  ].join('\n');
  if (existsSync(gitignorePath)) {
    const current = readFileSync(gitignorePath, 'utf8');
    if (!current.includes('# xera')) appendFileSync(gitignorePath, gitignoreAdditions);
  } else {
    writeFileSync(gitignorePath, gitignoreAdditions.trim() + '\n');
  }

  // Seed SAMPLE-001
  copyDir(join(TEMPLATE_DIR, 'sample/SAMPLE-001'), join(cwd, '.xera/SAMPLE-001'));

  // Copy skills from @xera-ai/skills into .claude/skills/
  const skillsSrc = require.resolve('@xera-ai/skills/package.json');
  const skillsDir = join(skillsSrc, '..');
  copyDir(skillsDir, join(cwd, '.claude/skills'));
  // Remove the package.json/version.json we copied
  for (const name of ['package.json', 'version.json']) {
    const f = join(cwd, '.claude/skills', name);
    if (existsSync(f)) require('node:fs').unlinkSync(f);
  }

  // Add npm scripts
  const pkgPath = join(cwd, 'package.json');
  const pkg = existsSync(pkgPath) ? JSON.parse(readFileSync(pkgPath, 'utf8')) : { name: 'xera-project', private: true, type: 'module' };
  pkg.scripts = pkg.scripts ?? {};
  pkg.scripts['xera:fetch'] = 'xera-internal fetch';
  pkg.scripts['xera:validate-feature'] = 'xera-internal validate-feature';
  pkg.scripts['xera:typecheck'] = 'xera-internal typecheck';
  pkg.scripts['xera:lint'] = 'xera-internal lint';
  pkg.scripts['xera:exec'] = 'xera-internal exec';
  pkg.scripts['xera:normalize'] = 'xera-internal normalize';
  pkg.scripts['xera:report'] = 'xera-internal report';
  pkg.scripts['xera:post'] = 'xera-internal post';
  pkg.scripts['xera:status'] = 'xera-internal status';
  pkg.scripts['xera:unlock'] = 'xera-internal unlock';
  pkg.scripts['xera:promote'] = 'xera-internal promote';
  pkg.dependencies = pkg.dependencies ?? {};
  pkg.dependencies['@xera-ai/core'] = '^0.1.0';
  pkg.dependencies['@xera-ai/web'] = '^0.1.0';
  pkg.dependencies['@xera-ai/prompts'] = '^1.0.0';
  pkg.devDependencies = pkg.devDependencies ?? {};
  pkg.devDependencies['@playwright/test'] = '^1.48.0';
  pkg.devDependencies['typescript'] = '^5.6.3';
  writeFileSync(pkgPath, JSON.stringify(pkg, null, 2));

  p.outro(pc.green('xera initialized! Next: edit .env, customize shared/auth-setup.ts, then run `/xera-run SAMPLE-001` in Claude Code.'));
}
```

- [x] **Step 4: Commit**

```bash
git add packages/cli/src/{scaffold,commands/init}.ts packages/cli/templates/
git commit -m "cli: implement xera init with interactive scaffold + skills copy"
```

---

### Task 9.3: `xera doctor`

**Files:**
- Create: `packages/cli/src/commands/doctor.ts`
- Create: `packages/cli/src/checks.ts`

- [x] **Step 1: Implement checks**

```ts
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadConfig } from '@xera-ai/core';

export interface Check { name: string; ok: boolean; message?: string; }

export async function runChecks(cwd: string): Promise<Check[]> {
  const checks: Check[] = [];

  // Node
  checks.push({ name: `node ${process.versions.node}`, ok: Number(process.versions.node.split('.')[0]) >= 20 });

  // xera.config.ts present and valid
  try {
    const cfg = await loadConfig(cwd);
    checks.push({ name: 'xera.config.ts found and valid', ok: true });

    // baseUrl reachable
    const url = cfg.web.baseUrl[cfg.web.defaultEnv]!;
    try {
      const r = await fetch(url, { redirect: 'manual' });
      checks.push({ name: `web baseUrl '${cfg.web.defaultEnv}' reachable`, ok: r.status < 500, message: `${url} → ${r.status}` });
    } catch (e) {
      checks.push({ name: `web baseUrl '${cfg.web.defaultEnv}' reachable`, ok: false, message: String(e) });
    }
  } catch (e) {
    checks.push({ name: 'xera.config.ts found and valid', ok: false, message: String((e as Error).message) });
  }

  // .env vars
  const envPath = join(cwd, '.env');
  if (!existsSync(envPath)) {
    checks.push({ name: '.env present', ok: false, message: 'copy from .env.example' });
  } else {
    const env = readFileSync(envPath, 'utf8');
    checks.push({ name: 'XERA_AUTH_KEY set', ok: /XERA_AUTH_KEY=[0-9a-fA-F]{64}/.test(env) });
  }

  // Playwright
  try {
    await import('@playwright/test');
    checks.push({ name: '@playwright/test installed', ok: true });
  } catch {
    checks.push({ name: '@playwright/test installed', ok: false, message: 'run: npm install -D @playwright/test' });
  }

  // Skills
  const skillsDir = join(cwd, '.claude/skills');
  if (!existsSync(skillsDir)) {
    checks.push({ name: 'xera skills present', ok: false, message: 'run `xera init`' });
  } else {
    const required = ['xera-run.md', 'xera-fetch.md', 'xera-feature.md', 'xera-script.md', 'xera-exec.md', 'xera-report.md', 'xera-promote.md'];
    const missing = required.filter(n => !existsSync(join(skillsDir, n)));
    checks.push({ name: 'xera skills present', ok: missing.length === 0, message: missing.length ? `missing: ${missing.join(', ')}` : undefined });
  }

  return checks;
}
```

- [x] **Step 2: Implement doctor command**

```ts
import { NdjsonLogger, resolveArtifactPaths } from '@xera-ai/core';
import { existsSync } from 'node:fs';
import { runChecks } from '../checks';
import pc from 'picocolors';

export async function doctorCommand(opts: { strict?: string; logs?: string; usage?: boolean }): Promise<number> {
  const cwd = process.cwd();

  if (opts.logs) {
    const paths = resolveArtifactPaths(cwd, opts.logs);
    if (!existsSync(paths.logPath)) { console.log(`No log at ${paths.logPath}`); return 0; }
    for (const entry of NdjsonLogger.readAll(paths.logPath)) {
      console.log(`${entry.ts}  ${JSON.stringify(entry)}`);
    }
    return 0;
  }

  if (opts.usage) {
    console.log('Token usage estimation requires log lines with tokens_in/tokens_out fields (added by skills).');
    return 0;
  }

  const checks = await runChecks(cwd);
  for (const c of checks) {
    const icon = c.ok ? pc.green('✓') : pc.red('✗');
    console.log(`${icon} ${c.name}${c.message ? pc.dim(` — ${c.message}`) : ''}`);
  }
  const allOk = checks.every(c => c.ok);
  if (opts.strict) {
    return allOk ? 0 : 1;
  }
  return 0;
}
```

- [x] **Step 3: Commit + smoke test**

```bash
cd packages/cli && npm run typecheck
git add packages/cli/src/{checks,commands/doctor}.ts
git commit -m "cli: xera doctor (init, --strict, --logs, --usage)"
```

---

### Task 9.4: `xera init --update`

**Files:**
- Create: `packages/cli/src/commands/init-update.ts`

- [x] **Step 1: Implement**

```ts
import * as p from '@clack/prompts';
import pc from 'picocolors';
import { existsSync, readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { copyDir, TEMPLATE_DIR } from '../scaffold';

export async function initUpdateCommand(_opts: { yes: boolean }): Promise<void> {
  const cwd = process.cwd();
  p.intro(pc.cyan('xera init --update'));

  // Bump deps to latest
  const pkgPath = join(cwd, 'package.json');
  if (!existsSync(pkgPath)) { p.cancel('No package.json found — run `xera init` first.'); process.exit(1); }
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
  pkg.dependencies['@xera-ai/core'] = '^0.1.0';
  pkg.dependencies['@xera-ai/web'] = '^0.1.0';
  pkg.dependencies['@xera-ai/prompts'] = '^1.0.0';
  writeFileSync(pkgPath, JSON.stringify(pkg, null, 2));

  // Refresh skills with 3-way diff
  const skillsSrc = require.resolve('@xera-ai/skills/package.json');
  const newSkillsDir = join(skillsSrc, '..');
  const localSkillsDir = join(cwd, '.claude/skills');

  for (const name of readdirSync(newSkillsDir)) {
    if (!name.endsWith('.md')) continue;
    const newContent = readFileSync(join(newSkillsDir, name), 'utf8');
    const localPath = join(localSkillsDir, name);
    if (!existsSync(localPath)) {
      writeFileSync(localPath, newContent);
      p.log.info(`+ ${name}`);
      continue;
    }
    const localContent = readFileSync(localPath, 'utf8');
    if (localContent === newContent) { p.log.info(`= ${name}`); continue; }
    const choice = await p.select({
      message: `${name} differs from package version`,
      options: [
        { value: 'keep', label: 'Keep local' },
        { value: 'overwrite', label: 'Overwrite with package version' },
      ],
    });
    if (choice === 'overwrite') {
      writeFileSync(localPath, newContent);
      p.log.success(`overwrote ${name}`);
    } else {
      p.log.warn(`kept local ${name}`);
    }
  }

  p.outro(pc.green('Update complete. Run `xera doctor` to verify.'));
}
```

- [x] **Step 2: Commit + final CLI build**

```bash
cd packages/cli && npm run typecheck && npm run build
git add packages/cli/src/commands/init-update.ts
git commit -m "cli: xera init --update with 3-way skill diff"
```

---

## End of Plan 03

Verify:

```bash
npm run lint
npm run typecheck
npx vitest run
```

Continue with [Plan 04: Orchestration (Prompts + Skills)](2026-05-14-xera-v01-04-orchestration.md).
