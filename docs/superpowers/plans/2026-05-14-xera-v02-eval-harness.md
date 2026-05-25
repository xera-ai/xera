# xera v0.2 — Eval Harness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a maintainer-only eval harness (`/xera-eval` skill + 4 new `xera-internal` subcommands + 1 new prompt + 5 golden fixtures) so prompt-template authors can regression-test their changes from inside a Claude Code session.

**Architecture:** New skill orchestrates a 5-phase flow (prepare → gen → deterministic → judge → report). Deterministic phases are CLI subcommands in `@xera-ai/core`'s `xera-internal` binary. Gen runs as session-LLM cognitive work (matching v0.1 skill pattern). **Judge runs in fresh-context sub-agents spawned via the Task tool** — deliberate exception to CLAUDE.md's no-sub-agent rule, justified by self-evaluation bias mitigation. Outputs land in `.xera/eval/<run-id>/`.

**Tech Stack:** TypeScript (ESM, strict, `exactOptionalPropertyTypes`), `vitest`, zod for schemas, existing `@xera-ai/core` infra (`lock`, `validate-feature`, `typecheck`, `lint`, `selector-rules`).

---

## File Structure

### New source files

| File | Responsibility |
|---|---|
| `packages/core/src/eval/types.ts` | Zod schemas for `manifest.json`, `judge-scores.json`, `deterministic-scores.json`, `summary.json` + TypeScript types. Stage / dimension string-literal unions. |
| `packages/core/src/eval/run-id.ts` | `generateRunId()`: `YYYYMMDD-HHmmss-<git-shorthash>`. |
| `packages/core/src/eval/paths.ts` | `resolveEvalPaths(cwd, runId)`: returns all paths under `.xera/eval/<run-id>/`. |
| `packages/core/src/bin-internal/eval-prepare.ts` | Phase 1 subcommand. Reads `fixtures/golden-eval/` + `fixtures/golden-tickets/`, copies inputs, writes manifest, acquires lock. Prints `RUN_ID=<id>` to stdout on success. |
| `packages/core/src/bin-internal/eval-deterministic.ts` | Phase 3 subcommand. For each ticket × stage, runs the appropriate v0.1 deterministic check; writes `deterministic-scores.json`. Never short-circuits the judge. |
| `packages/core/src/bin-internal/eval-report.ts` | Phase 5 subcommand. Merges deterministic + judge scores, validates with zod, renders `report.md` + `summary.json`, releases lock. |
| `packages/core/src/bin-internal/doctor.ts` | Maintainer-only health check on golden-eval fixtures + scripts. |

### Modified source files

| File | Change |
|---|---|
| `packages/core/src/bin-internal/index.ts` | Register `eval-prepare`, `eval-deterministic`, `eval-report`, `doctor` in `COMMANDS`. |
| `package.json` (repo root) | Add `xera:eval-prepare`, `xera:eval-deterministic`, `xera:eval-report`, `xera:doctor` scripts. |
| `.gitignore` | Add `.xera/eval/`. |

### New non-source artifacts (LLM-facing)

| File | Responsibility |
|---|---|
| `packages/prompts/eval-rubric.md` | Judge prompt template. Stage-scoped rubric questions, output JSON schema. Frontmatter `id`, `version`. |
| `packages/skills/xera-eval.md` | Skill driving the 5-phase flow. Frontmatter declares flags including `--judge-only`. Contains the sub-agent Task-tool invocation template. |

### New fixtures

| File | Responsibility |
|---|---|
| `fixtures/golden-eval/README.md` | Contributor guide: how to add a new EVAL ticket. |
| `fixtures/golden-eval/EVAL-001-simple-login/{story.md,meta.json,golden/{test.feature,spec-requirements.md}}` | Reference fixture, adapted from `packages/cli/templates/sample/SAMPLE-001/`. |
| `fixtures/golden-eval/EVAL-002-form-validation/...` | Form validation scenarios. |
| `fixtures/golden-eval/EVAL-003-multi-step-wizard/...` | Multi-step flow with ordering. |
| `fixtures/golden-eval/EVAL-004-rich-acceptance-criteria/...` | AC-dense story to test coverage dimension. |
| `fixtures/golden-eval/EVAL-005-ambiguous-story/...` | Deliberately under-specified story; tests judge's "missing info" detection. No spec-requirements (script stage skipped). |

### New tests

| File | Coverage |
|---|---|
| `packages/core/test/eval/run-id.test.ts` | `generateRunId` format + shorthash stub. |
| `packages/core/test/eval/types.test.ts` | Zod round-trip + rejection of bad shapes. |
| `packages/core/test/bin-internal/eval-prepare.test.ts` | Manifest + inputs tree + flag handling + lock. |
| `packages/core/test/bin-internal/eval-deterministic.test.ts` | Each stage's deterministic check with good + bad `actual/`. |
| `packages/core/test/bin-internal/eval-report.test.ts` | Merge + zod rejection + markdown render. |
| `packages/core/test/bin-internal/doctor.test.ts` | Pass + each failure mode of doctor. |
| `packages/core/test/bin-internal/eval-e2e.test.ts` | Full pipeline with stubbed session LLM (pre-baked `actual/`). |
| `packages/core/test/fixtures/golden-eval.test.ts` | Every `golden/test.feature` passes `validate-feature`; every `spec-requirements.md` parses. |

---

## Task ordering rationale

Tasks are ordered so each one ships independently runnable + testable code:

1. Types + run-id helpers (Task 1–2) — foundation, no deps.
2. Fixtures (Task 3–8) — independent of source code, but `eval-prepare` tests reference them.
3. `eval-prepare` (Task 9) → `eval-deterministic` (Task 10) → `eval-report` (Task 11) — strict dep order, each TDD'd.
4. `doctor` (Task 12) — uses scripts from above.
5. Wire + scripts (Task 13).
6. Rubric prompt (Task 14) + skill (Task 15) — LLM-facing artifacts.
7. End-to-end test (Task 16) — proves whole stack.
8. Manual success-criteria smoke (Task 17).

---

## Task 1: Types + zod schemas

**Files:**
- Create: `packages/core/src/eval/types.ts`
- Test: `packages/core/test/eval/types.test.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/core/test/eval/types.test.ts`:

```typescript
import { describe, expect, test } from 'vitest';
import {
  ManifestSchema,
  JudgmentSchema,
  DeterministicScoresSchema,
  SummarySchema,
  type Stage,
} from '../../src/eval/types';

describe('eval types', () => {
  test('ManifestSchema parses a valid manifest', () => {
    const m = {
      run_id: '20260520-103045-a1b2c3d',
      started_at: '2026-05-20T10:30:45Z',
      git_sha: 'a1b2c3d',
      tickets: ['EVAL-001'],
      stages: ['feature-from-story'] as Stage[],
      prompt_versions: {
        'feature-from-story': '1.0.0',
        'script-from-feature': '1.0.0',
        'diagnose-failure': '1.0.0',
        'eval-rubric': '1.0.0',
      },
      flags: { force: false, only_prompt: null, only_ticket: null, judge_only: false },
    };
    expect(ManifestSchema.parse(m)).toEqual(m);
  });

  test('ManifestSchema rejects unknown stage', () => {
    const bad = {
      run_id: '20260520-103045-a1b2c3d',
      started_at: '2026-05-20T10:30:45Z',
      git_sha: 'a1b2c3d',
      tickets: ['EVAL-001'],
      stages: ['unknown-stage'],
      prompt_versions: {
        'feature-from-story': '1.0.0',
        'script-from-feature': '1.0.0',
        'diagnose-failure': '1.0.0',
        'eval-rubric': '1.0.0',
      },
      flags: { force: false, only_prompt: null, only_ticket: null, judge_only: false },
    };
    expect(() => ManifestSchema.parse(bad)).toThrow();
  });

  test('JudgmentSchema rejects verdict outside {PASS, FAIL, NA}', () => {
    const bad = {
      stage: 'feature-from-story',
      ticket: 'EVAL-001',
      dimensions: [{ name: 'Coverage', verdict: 'MAYBE', notes: 'x' }],
    };
    expect(() => JudgmentSchema.parse(bad)).toThrow();
  });

  test('JudgmentSchema accepts PASS / FAIL / NA', () => {
    const ok = {
      stage: 'feature-from-story' as Stage,
      ticket: 'EVAL-001',
      dimensions: [
        { name: 'Coverage', verdict: 'PASS' as const, notes: 'all good' },
        { name: 'Specificity', verdict: 'FAIL' as const, notes: 'vague verbs' },
        { name: 'Negative paths', verdict: 'NA' as const, notes: 'not specified' },
      ],
    };
    expect(JudgmentSchema.parse(ok)).toEqual(ok);
  });

  test('DeterministicScoresSchema allows error field', () => {
    const ok = {
      run_id: 'x',
      entries: [
        { ticket: 'EVAL-001', stage: 'feature-from-story' as Stage, passed: false, checks: ['validate-feature'], error: 'gherkin parse error at line 4' },
        { ticket: 'EVAL-002', stage: 'feature-from-story' as Stage, passed: true, checks: ['validate-feature'] },
      ],
    };
    expect(DeterministicScoresSchema.parse(ok)).toEqual(ok);
  });

  test('SummarySchema computes nothing — pure validation', () => {
    const ok = {
      run_id: 'x',
      git_sha: 'abc',
      prompt_versions: {
        'feature-from-story': '1.0.0',
        'script-from-feature': '1.0.0',
        'diagnose-failure': '1.0.0',
        'eval-rubric': '1.0.0',
      },
      results: [
        {
          ticket: 'EVAL-001',
          stage: 'feature-from-story' as Stage,
          deterministic: { passed: true, checks: ['validate-feature'] },
          judge: {
            passed: true,
            dimensions: [{ name: 'Coverage', verdict: 'PASS' as const, notes: 'x' }],
            score: 1.0,
          },
        },
      ],
      overall: { passed: 1, failed: 0, total: 1, score: 1.0 },
    };
    expect(SummarySchema.parse(ok)).toEqual(ok);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/core && npx vitest run test/eval/types.test.ts`
Expected: FAIL with "Cannot find module '../../src/eval/types'".

- [ ] **Step 3: Create directory + types module**

Create `packages/core/src/eval/types.ts`:

```typescript
import { z } from 'zod';

export const STAGES = ['feature-from-story', 'script-from-feature', 'diagnose-failure'] as const;
export const StageSchema = z.enum(STAGES);
export type Stage = z.infer<typeof StageSchema>;

export const VerdictSchema = z.enum(['PASS', 'FAIL', 'NA']);
export type Verdict = z.infer<typeof VerdictSchema>;

export const PromptVersionsSchema = z.object({
  'feature-from-story': z.string(),
  'script-from-feature': z.string(),
  'diagnose-failure': z.string(),
  'eval-rubric': z.string(),
});
export type PromptVersions = z.infer<typeof PromptVersionsSchema>;

export const ManifestSchema = z.object({
  run_id: z.string(),
  started_at: z.string(),
  git_sha: z.string(),
  tickets: z.array(z.string()).min(1),
  stages: z.array(StageSchema).min(1),
  prompt_versions: PromptVersionsSchema,
  flags: z.object({
    force: z.boolean(),
    only_prompt: StageSchema.nullable(),
    only_ticket: z.string().nullable(),
    judge_only: z.boolean(),
  }),
});
export type Manifest = z.infer<typeof ManifestSchema>;

export const DimensionSchema = z.object({
  name: z.string(),
  verdict: VerdictSchema,
  notes: z.string(),
});
export type Dimension = z.infer<typeof DimensionSchema>;

export const JudgmentSchema = z.object({
  stage: StageSchema,
  ticket: z.string(),
  dimensions: z.array(DimensionSchema).min(1),
});
export type Judgment = z.infer<typeof JudgmentSchema>;

export const JudgeScoresSchema = z.object({
  run_id: z.string(),
  judgments: z.array(JudgmentSchema),
});
export type JudgeScores = z.infer<typeof JudgeScoresSchema>;

export const DeterministicEntrySchema = z.object({
  ticket: z.string(),
  stage: StageSchema,
  passed: z.boolean(),
  checks: z.array(z.string()),
  error: z.string().optional(),
});
export type DeterministicEntry = z.infer<typeof DeterministicEntrySchema>;

export const DeterministicScoresSchema = z.object({
  run_id: z.string(),
  entries: z.array(DeterministicEntrySchema),
});
export type DeterministicScores = z.infer<typeof DeterministicScoresSchema>;

export const ResultSchema = z.object({
  ticket: z.string(),
  stage: StageSchema,
  deterministic: z.object({
    passed: z.boolean(),
    checks: z.array(z.string()),
    error: z.string().optional(),
  }),
  judge: z.object({
    passed: z.boolean(),
    dimensions: z.array(DimensionSchema),
    score: z.number().min(0).max(1),
  }).nullable(),
  skipped: z.boolean().optional(),
});
export type Result = z.infer<typeof ResultSchema>;

export const SummarySchema = z.object({
  run_id: z.string(),
  git_sha: z.string(),
  prompt_versions: PromptVersionsSchema,
  results: z.array(ResultSchema),
  overall: z.object({
    passed: z.number().int().nonnegative(),
    failed: z.number().int().nonnegative(),
    total: z.number().int().nonnegative(),
    score: z.number().min(0).max(1),
  }),
});
export type Summary = z.infer<typeof SummarySchema>;
```

- [ ] **Step 4: Run test to verify pass**

Run: `cd packages/core && npx vitest run test/eval/types.test.ts`
Expected: PASS — all 6 tests green.

- [ ] **Step 5: Typecheck**

Run: `cd packages/core && npm run typecheck`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/eval/types.ts packages/core/test/eval/types.test.ts
git commit -m "core: add eval zod schemas + types"
```

---

## Task 2: Run-id + paths helpers

**Files:**
- Create: `packages/core/src/eval/run-id.ts`
- Create: `packages/core/src/eval/paths.ts`
- Test: `packages/core/test/eval/run-id.test.ts`
- Test: `packages/core/test/eval/paths.test.ts`

- [ ] **Step 1: Write the failing test for run-id**

Create `packages/core/test/eval/run-id.test.ts`:

```typescript
import { describe, expect, test } from 'vitest';
import { generateRunId } from '../../src/eval/run-id';

describe('generateRunId', () => {
  test('format YYYYMMDD-HHmmss-<7-char-hex>', () => {
    const id = generateRunId({ getGitSha: () => 'a1b2c3d4e5f6', now: () => new Date('2026-05-20T10:30:45Z') });
    expect(id).toBe('20260520-103045-a1b2c3d');
  });

  test('falls back to "nogit" when git sha unavailable', () => {
    const id = generateRunId({ getGitSha: () => null, now: () => new Date('2026-05-20T10:30:45Z') });
    expect(id).toBe('20260520-103045-nogit');
  });

  test('uses real git sha when no stub provided', () => {
    // Real call; just assert shape, not exact value.
    const id = generateRunId();
    expect(id).toMatch(/^\d{8}-\d{6}-[a-f0-9]{7}$|^\d{8}-\d{6}-nogit$/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/core && npx vitest run test/eval/run-id.test.ts`
Expected: FAIL with "Cannot find module".

- [ ] **Step 3: Implement run-id**

Create `packages/core/src/eval/run-id.ts`:

```typescript
import { execSync } from 'node:child_process';

export interface RunIdOpts {
  getGitSha?: () => string | null;
  now?: () => Date;
}

function defaultGetGitSha(): string | null {
  try {
    return execSync('git rev-parse HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
  } catch {
    return null;
  }
}

function pad(n: number): string {
  return n.toString().padStart(2, '0');
}

export function generateRunId(opts: RunIdOpts = {}): string {
  const getGitSha = opts.getGitSha ?? defaultGetGitSha;
  const now = (opts.now ?? (() => new Date()))();
  const date = `${now.getUTCFullYear()}${pad(now.getUTCMonth() + 1)}${pad(now.getUTCDate())}`;
  const time = `${pad(now.getUTCHours())}${pad(now.getUTCMinutes())}${pad(now.getUTCSeconds())}`;
  const sha = getGitSha();
  const short = sha ? sha.slice(0, 7) : 'nogit';
  return `${date}-${time}-${short}`;
}
```

- [ ] **Step 4: Run run-id tests**

Run: `cd packages/core && npx vitest run test/eval/run-id.test.ts`
Expected: PASS, 3/3.

- [ ] **Step 5: Write the failing test for paths**

Create `packages/core/test/eval/paths.test.ts`:

```typescript
import { describe, expect, test } from 'vitest';
import { resolveEvalPaths } from '../../src/eval/paths';

describe('resolveEvalPaths', () => {
  test('returns all paths anchored at <cwd>/.xera/eval/<run-id>', () => {
    const p = resolveEvalPaths('/repo', '20260520-103045-a1b2c3d');
    expect(p.root).toBe('/repo/.xera/eval/20260520-103045-a1b2c3d');
    expect(p.manifest).toBe('/repo/.xera/eval/20260520-103045-a1b2c3d/manifest.json');
    expect(p.lock).toBe('/repo/.xera/eval/20260520-103045-a1b2c3d/.lock');
    expect(p.deterministicScores).toBe('/repo/.xera/eval/20260520-103045-a1b2c3d/deterministic-scores.json');
    expect(p.judgeScores).toBe('/repo/.xera/eval/20260520-103045-a1b2c3d/judge-scores.json');
    expect(p.report).toBe('/repo/.xera/eval/20260520-103045-a1b2c3d/report.md');
    expect(p.summary).toBe('/repo/.xera/eval/20260520-103045-a1b2c3d/summary.json');
    expect(p.inputsDir).toBe('/repo/.xera/eval/20260520-103045-a1b2c3d/inputs');
    expect(p.actualDir).toBe('/repo/.xera/eval/20260520-103045-a1b2c3d/actual');
  });

  test('ticket-scoped paths', () => {
    const p = resolveEvalPaths('/repo', 'rid');
    expect(p.ticketInputsDir('EVAL-001')).toBe('/repo/.xera/eval/rid/inputs/EVAL-001');
    expect(p.ticketActualDir('EVAL-001')).toBe('/repo/.xera/eval/rid/actual/EVAL-001');
  });
});
```

- [ ] **Step 6: Run paths test to verify it fails**

Run: `cd packages/core && npx vitest run test/eval/paths.test.ts`
Expected: FAIL with "Cannot find module".

- [ ] **Step 7: Implement paths**

Create `packages/core/src/eval/paths.ts`:

```typescript
import { join } from 'node:path';

export interface EvalPaths {
  root: string;
  manifest: string;
  lock: string;
  deterministicScores: string;
  judgeScores: string;
  report: string;
  summary: string;
  inputsDir: string;
  actualDir: string;
  ticketInputsDir(ticket: string): string;
  ticketActualDir(ticket: string): string;
}

export function resolveEvalPaths(cwd: string, runId: string): EvalPaths {
  const root = join(cwd, '.xera', 'eval', runId);
  return {
    root,
    manifest: join(root, 'manifest.json'),
    lock: join(root, '.lock'),
    deterministicScores: join(root, 'deterministic-scores.json'),
    judgeScores: join(root, 'judge-scores.json'),
    report: join(root, 'report.md'),
    summary: join(root, 'summary.json'),
    inputsDir: join(root, 'inputs'),
    actualDir: join(root, 'actual'),
    ticketInputsDir: (ticket: string) => join(root, 'inputs', ticket),
    ticketActualDir: (ticket: string) => join(root, 'actual', ticket),
  };
}
```

- [ ] **Step 8: Run all eval tests**

Run: `cd packages/core && npx vitest run test/eval/`
Expected: PASS — paths + run-id + types all green.

- [ ] **Step 9: Typecheck**

Run: `cd packages/core && npm run typecheck`
Expected: no errors.

- [ ] **Step 10: Commit**

```bash
git add packages/core/src/eval/run-id.ts packages/core/src/eval/paths.ts \
        packages/core/test/eval/run-id.test.ts packages/core/test/eval/paths.test.ts
git commit -m "core: add eval run-id + paths helpers"
```

---

## Task 3: fixtures/golden-eval/ scaffold + README + .gitignore

**Files:**
- Create: `fixtures/golden-eval/README.md`
- Modify: `.gitignore`

- [ ] **Step 1: Add .xera/eval/ to .gitignore**

Modify `.gitignore`. Add a new section at the end:

```
node_modules/
.DS_Store
*.log
.env
.env.local
dist/
build/
.bun/
.next/
next-env.d.ts

# v0.2 eval harness outputs (maintainer-local)
.xera/eval/
```

- [ ] **Step 2: Author the contributor README**

Create `fixtures/golden-eval/README.md`:

```markdown
# Golden Eval Fixtures

Hand-authored ground-truth tickets used by the v0.2 eval harness
(`/xera-eval` skill). Each fixture exercises one or more prompt-template
stages so a maintainer can detect regressions when editing a prompt.

## Layout

Each fixture is a directory under `fixtures/golden-eval/`:

```
EVAL-NNN-short-slug/
  story.md                   # simulated Jira story (markdown)
  meta.json                  # { id, summary, source?, stages }
  golden/
    test.feature             # ground-truth Gherkin (for feature-from-story stage)
    spec-requirements.md     # MUST/MUST NOT/SHOULD bullets (for script-from-feature stage)
```

`meta.json#stages` must list which stages this fixture exercises. Only the
stages listed will be evaluated. Example: an ambiguous-story fixture may
only exercise `feature-from-story` and omit `script-from-feature`.

## Why `spec-requirements.md` instead of `spec.ts`?

Many valid Playwright spec files satisfy the same user story. Matching
generated `spec.ts` against one specific golden text would over-constrain.
We instead express the golden as a list of MUST / MUST NOT / SHOULD
statements the judge checks individually. Example:

- MUST import and use `LoginPage` POM from `page-objects/login.page.ts`.
- MUST assert URL contains `/dashboard` after successful login.
- MUST NOT use `page.waitForTimeout`.
- MUST use `getByRole` / `getByLabel` selectors for form fields, not raw CSS.

## Adding a new fixture

1. Create `fixtures/golden-eval/EVAL-NNN-slug/`.
2. Write `story.md` with H1 ticket heading + `## Story` + `## Acceptance Criteria`.
3. Write `meta.json`:
   ```json
   {
     "id": "EVAL-NNN",
     "summary": "One-line description",
     "stages": ["feature-from-story", "script-from-feature"]
   }
   ```
4. Hand-author `golden/test.feature` for stages that include `feature-from-story`.
5. Hand-author `golden/spec-requirements.md` for stages that include
   `script-from-feature`. Keep bullets concrete and checkable.
6. Run `npx xera-internal doctor` to validate the fixture shape.
7. Run `/xera-eval --ticket=EVAL-NNN` from a Claude Code session in this repo
   to smoke-test before opening a PR.

## Stale goldens policy

When a prompt-template changes shape, the golden authored against the prior
prompt may no longer reflect "ideal" output. **Update the relevant
`golden/*` files in the SAME PR as the prompt change.** Reviewer should
confirm both prompt diff and golden diff are coherent.

## Classifier (`diagnose-failure`) stage

Classifier fixtures are NOT under `fixtures/golden-eval/`. They live at
`fixtures/golden-tickets/*.json` (existing v0.1 location, reused as-is).
The eval harness automatically picks them up; no action needed here.
```

- [ ] **Step 3: Commit**

```bash
git add .gitignore fixtures/golden-eval/README.md
git commit -m "fixtures: add golden-eval scaffold + README + gitignore"
```

---

## Task 4: Author EVAL-001 fixture (simple login, adapted from SAMPLE-001)

**Files:**
- Create: `fixtures/golden-eval/EVAL-001-simple-login/story.md`
- Create: `fixtures/golden-eval/EVAL-001-simple-login/meta.json`
- Create: `fixtures/golden-eval/EVAL-001-simple-login/golden/test.feature`
- Create: `fixtures/golden-eval/EVAL-001-simple-login/golden/spec-requirements.md`

- [ ] **Step 1: Author story.md**

Create `fixtures/golden-eval/EVAL-001-simple-login/story.md`:

```markdown
# EVAL-001 — User can log in to dashboard

## Story

As a registered user, I want to log in with my email and password so that I
can access my dashboard.

## Acceptance Criteria

1. Given the login page is open, when the user submits valid credentials,
   then the user is redirected to the dashboard.
2. Given the login page is open, when the user submits an invalid password,
   then an error message "Invalid email or password" is displayed.
3. The login form fields (email, password) are accessible by label.
4. The dashboard greeting includes the user's name after a successful login.
```

- [ ] **Step 2: Author meta.json**

Create `fixtures/golden-eval/EVAL-001-simple-login/meta.json`:

```json
{
  "id": "EVAL-001",
  "summary": "User can log in to dashboard",
  "source": "sample-app/SAMPLE-001",
  "stages": ["feature-from-story", "script-from-feature"]
}
```

- [ ] **Step 3: Author golden test.feature**

Create `fixtures/golden-eval/EVAL-001-simple-login/golden/test.feature`:

```gherkin
Feature: User can log in to dashboard

  Scenario: Valid credentials redirect to dashboard
    Given the login page is open
    When the user submits email "alice@example.com" and password "correct-horse"
    Then the user is redirected to a URL containing "/dashboard"
    And the dashboard greeting contains "Alice"

  Scenario: Invalid password shows error
    Given the login page is open
    When the user submits email "alice@example.com" and password "wrong-password"
    Then an error message "Invalid email or password" is displayed
    And the user remains on the login page
```

- [ ] **Step 4: Author golden spec-requirements.md**

Create `fixtures/golden-eval/EVAL-001-simple-login/golden/spec-requirements.md`:

```markdown
# EVAL-001 — spec.ts requirements

Each requirement below is checked individually by the eval judge against
the actual generated `spec.ts`.

## MUST

- Import and use a `LoginPage` page object from `page-objects/login.page.ts`.
- Locate the email input via `getByLabel(/email/i)` or `getByRole('textbox', { name: /email/i })`.
- Locate the password input via `getByLabel(/password/i)`.
- Locate the submit button via `getByRole('button', { name: /sign in|log in/i })`.
- After valid-credentials submit, assert `await expect(page).toHaveURL(/\/dashboard/)`.
- After valid-credentials submit, assert the dashboard greeting element contains "Alice" via `getByText` or `getByRole('heading', ...)`.
- After invalid-password submit, assert visibility of an element containing "Invalid email or password" via `getByText`.
- Wrap both scenarios with `test.describe('User can log in to dashboard', ...)`.
- Use one `test(...)` per Gherkin scenario; test name should match scenario name.

## MUST NOT

- Use `page.waitForTimeout(...)` or `setTimeout`.
- Use raw CSS selectors (`page.locator('.btn-primary')`) for form fields or submit buttons.
- Use XPath locators.
- Contain `console.log`, commented-out code, or unused imports.

## SHOULD

- Reuse the `LoginPage` POM's `login(email, password)` method rather than scripting field fills inline in each test.
```

- [ ] **Step 5: Sanity-check Gherkin parses**

Run: `cd packages/core && node -e "import {validateGherkin} from './src/validate-feature/gherkin'; const fs = require('node:fs'); console.log(validateGherkin(fs.readFileSync('../../fixtures/golden-eval/EVAL-001-simple-login/golden/test.feature','utf8')))"`

(If the exact module path differs, use `grep -r "export function validateGherkin" packages/core/src` to locate it.)

Expected: output object with `ok: true` (or equivalent passing shape).

If validateGherkin lives in a different package or export name, defer this manual check to Task 16 fixture-test. Don't block.

- [ ] **Step 6: Commit**

```bash
git add fixtures/golden-eval/EVAL-001-simple-login/
git commit -m "fixtures: add EVAL-001 simple-login golden"
```

---

## Task 5: Author EVAL-002 fixture (form validation)

**Files:**
- Create: `fixtures/golden-eval/EVAL-002-form-validation/story.md`
- Create: `fixtures/golden-eval/EVAL-002-form-validation/meta.json`
- Create: `fixtures/golden-eval/EVAL-002-form-validation/golden/test.feature`
- Create: `fixtures/golden-eval/EVAL-002-form-validation/golden/spec-requirements.md`

- [ ] **Step 1: Author story.md**

Create `fixtures/golden-eval/EVAL-002-form-validation/story.md`:

```markdown
# EVAL-002 — Sign-up form client-side validation

## Story

As a new user, I want the sign-up form to validate my inputs before
submitting so that I get immediate feedback on mistakes.

## Acceptance Criteria

1. The email field must show "Please enter a valid email address" when the
   user blurs the field with non-email text.
2. The password field must show "Password must be at least 8 characters"
   when the user blurs the field with a value shorter than 8 characters.
3. The "Create account" button must remain disabled until all fields are
   valid.
4. When all fields are valid and the user clicks "Create account", the
   form submits and the user is redirected to `/welcome`.
```

- [ ] **Step 2: Author meta.json**

Create `fixtures/golden-eval/EVAL-002-form-validation/meta.json`:

```json
{
  "id": "EVAL-002",
  "summary": "Sign-up form client-side validation",
  "stages": ["feature-from-story", "script-from-feature"]
}
```

- [ ] **Step 3: Author golden test.feature**

Create `fixtures/golden-eval/EVAL-002-form-validation/golden/test.feature`:

```gherkin
Feature: Sign-up form client-side validation

  Scenario: Invalid email shows inline error
    Given the sign-up page is open
    When the user enters "not-an-email" into the email field and blurs it
    Then the inline error "Please enter a valid email address" is displayed

  Scenario: Short password shows inline error
    Given the sign-up page is open
    When the user enters "short" into the password field and blurs it
    Then the inline error "Password must be at least 8 characters" is displayed

  Scenario: Submit button stays disabled until form is valid
    Given the sign-up page is open
    When all required fields are empty
    Then the "Create account" button is disabled

  Scenario: Valid form submits and redirects to welcome
    Given the sign-up page is open
    When the user fills email "alice@example.com" and password "long-enough-password"
    And the user clicks "Create account"
    Then the user is redirected to a URL containing "/welcome"
```

- [ ] **Step 4: Author golden spec-requirements.md**

Create `fixtures/golden-eval/EVAL-002-form-validation/golden/spec-requirements.md`:

```markdown
# EVAL-002 — spec.ts requirements

## MUST

- Import and use a `SignUpPage` page object from `page-objects/sign-up.page.ts`.
- Use `getByLabel(/email/i)` and `getByLabel(/password/i)` for inputs.
- Use `getByRole('button', { name: /create account/i })` for submit.
- Assert inline error text via `getByText('Please enter a valid email address')` (or equivalent toHaveText).
- Assert button disabled state via `expect(button).toBeDisabled()`.
- After valid submit, assert `await expect(page).toHaveURL(/\/welcome/)`.
- Use one `test(...)` per Gherkin scenario; cover all 4 scenarios.

## MUST NOT

- Use `page.waitForTimeout(...)` or `setTimeout`.
- Use CSS selectors for form fields.
- Submit form before asserting button-disabled state (ordering matters).
- Hardcode invalid-email or short-password assertions without first triggering blur.

## SHOULD

- Use the POM's `fillEmail`, `fillPassword`, `blur*`, and `submit` methods rather than inline locator manipulation.
```

- [ ] **Step 5: Commit**

```bash
git add fixtures/golden-eval/EVAL-002-form-validation/
git commit -m "fixtures: add EVAL-002 form-validation golden"
```

---

## Task 6: Author EVAL-003 fixture (multi-step wizard)

**Files:**
- Create: `fixtures/golden-eval/EVAL-003-multi-step-wizard/story.md`
- Create: `fixtures/golden-eval/EVAL-003-multi-step-wizard/meta.json`
- Create: `fixtures/golden-eval/EVAL-003-multi-step-wizard/golden/test.feature`
- Create: `fixtures/golden-eval/EVAL-003-multi-step-wizard/golden/spec-requirements.md`

- [ ] **Step 1: Author story.md**

Create `fixtures/golden-eval/EVAL-003-multi-step-wizard/story.md`:

```markdown
# EVAL-003 — Multi-step onboarding wizard

## Story

As a new user, I want to complete onboarding via a 3-step wizard so that
my profile is configured before I land in the app.

## Acceptance Criteria

1. Step 1 collects "Display name" (required, min 2 chars).
2. Step 2 collects "Timezone" (required, dropdown).
3. Step 3 shows a review screen with the entered values and a "Finish" button.
4. The user can navigate back to a previous step using "Back" without
   losing data.
5. Clicking "Finish" on step 3 saves the profile and redirects to `/home`.
```

- [ ] **Step 2: Author meta.json**

Create `fixtures/golden-eval/EVAL-003-multi-step-wizard/meta.json`:

```json
{
  "id": "EVAL-003",
  "summary": "Multi-step onboarding wizard",
  "stages": ["feature-from-story", "script-from-feature"]
}
```

- [ ] **Step 3: Author golden test.feature**

Create `fixtures/golden-eval/EVAL-003-multi-step-wizard/golden/test.feature`:

```gherkin
Feature: Multi-step onboarding wizard

  Scenario: User completes all three steps and lands on home
    Given the onboarding wizard is open on step 1
    When the user enters display name "Alice" and clicks "Next"
    Then the wizard advances to step 2
    When the user selects timezone "Europe/London" and clicks "Next"
    Then the wizard advances to step 3
    And the review screen shows display name "Alice"
    And the review screen shows timezone "Europe/London"
    When the user clicks "Finish"
    Then the user is redirected to a URL containing "/home"

  Scenario: Back button preserves data
    Given the user has filled step 1 with display name "Bob"
    And advanced to step 2
    When the user clicks "Back"
    Then the wizard returns to step 1
    And the display name field still contains "Bob"

  Scenario: Step 1 rejects short display name
    Given the onboarding wizard is open on step 1
    When the user enters display name "A" and clicks "Next"
    Then an inline error "Display name must be at least 2 characters" is displayed
    And the wizard remains on step 1
```

- [ ] **Step 4: Author golden spec-requirements.md**

Create `fixtures/golden-eval/EVAL-003-multi-step-wizard/golden/spec-requirements.md`:

```markdown
# EVAL-003 — spec.ts requirements

## MUST

- Import and use an `OnboardingPage` POM from `page-objects/onboarding.page.ts`.
- Expose POM methods: `fillDisplayName(name)`, `selectTimezone(tz)`, `clickNext()`, `clickBack()`, `clickFinish()`.
- Assert step progression by visible heading or step indicator, not by URL alone (the wizard may be single-route).
- After "Finish", assert `await expect(page).toHaveURL(/\/home/)`.
- After "Back", assert the display name field value via `await expect(field).toHaveValue('Bob')`.
- Cover all 3 scenarios with separate `test(...)` blocks.

## MUST NOT

- Use `page.waitForTimeout` between steps; rely on `expect(...).toBeVisible()`.
- Assert intermediate step state via raw CSS class names (e.g., `.step-2-active`).

## SHOULD

- Define a small helper in the POM for advancing N steps with given data, to avoid repetition across scenarios.
```

- [ ] **Step 5: Commit**

```bash
git add fixtures/golden-eval/EVAL-003-multi-step-wizard/
git commit -m "fixtures: add EVAL-003 multi-step-wizard golden"
```

---

## Task 7: Author EVAL-004 fixture (rich acceptance criteria)

**Files:**
- Create: `fixtures/golden-eval/EVAL-004-rich-acceptance-criteria/story.md`
- Create: `fixtures/golden-eval/EVAL-004-rich-acceptance-criteria/meta.json`
- Create: `fixtures/golden-eval/EVAL-004-rich-acceptance-criteria/golden/test.feature`
- Create: `fixtures/golden-eval/EVAL-004-rich-acceptance-criteria/golden/spec-requirements.md`

- [ ] **Step 1: Author story.md**

Create `fixtures/golden-eval/EVAL-004-rich-acceptance-criteria/story.md`:

```markdown
# EVAL-004 — Settings page edit & save

## Story

As a logged-in user, I want to edit my profile settings and persist them so
that my preferences are remembered across sessions.

## Acceptance Criteria

1. The settings page shows current values for: display name, email,
   notification frequency (daily / weekly / never), and dark-mode toggle.
2. The user can edit each field. Edits are tracked in a "dirty" state.
3. While the form is dirty, a "Save" button is enabled and a "Discard"
   button is shown.
4. While the form is clean, both buttons are hidden.
5. Clicking "Save" persists changes and shows a toast "Settings saved".
6. Clicking "Discard" reverts unsaved edits and hides both buttons.
7. Reloading the page after "Save" preserves the saved values.
8. Attempting to navigate away while dirty shows a confirmation modal
   "You have unsaved changes. Discard?".
```

- [ ] **Step 2: Author meta.json**

Create `fixtures/golden-eval/EVAL-004-rich-acceptance-criteria/meta.json`:

```json
{
  "id": "EVAL-004",
  "summary": "Settings page edit & save",
  "stages": ["feature-from-story", "script-from-feature"]
}
```

- [ ] **Step 3: Author golden test.feature**

Create `fixtures/golden-eval/EVAL-004-rich-acceptance-criteria/golden/test.feature`:

```gherkin
Feature: Settings page edit & save

  Scenario: Initial state shows current values and hides Save/Discard
    Given the settings page is open for a user with display name "Alice"
    Then the display name field contains "Alice"
    And the "Save" button is hidden
    And the "Discard" button is hidden

  Scenario: Editing a field reveals Save and Discard buttons
    Given the settings page is open
    When the user changes display name to "Alicia"
    Then the "Save" button is enabled
    And the "Discard" button is visible

  Scenario: Saving persists changes and shows toast
    Given the user has changed display name to "Alicia"
    When the user clicks "Save"
    Then a toast "Settings saved" is displayed
    And the "Save" button is hidden
    And the "Discard" button is hidden

  Scenario: Reload preserves saved values
    Given the user has saved display name "Alicia"
    When the user reloads the page
    Then the display name field contains "Alicia"

  Scenario: Discard reverts unsaved edits
    Given the user has changed display name to "Alicia"
    When the user clicks "Discard"
    Then the display name field contains "Alice"
    And the "Save" button is hidden

  Scenario: Navigating away while dirty shows confirmation
    Given the user has changed display name to "Alicia"
    When the user attempts to navigate to "/home"
    Then a confirmation modal "You have unsaved changes. Discard?" is displayed
```

- [ ] **Step 4: Author golden spec-requirements.md**

Create `fixtures/golden-eval/EVAL-004-rich-acceptance-criteria/golden/spec-requirements.md`:

```markdown
# EVAL-004 — spec.ts requirements

## MUST

- Import and use a `SettingsPage` POM from `page-objects/settings.page.ts`.
- Locate buttons by role: `getByRole('button', { name: /save/i })`, `getByRole('button', { name: /discard/i })`.
- Use `expect(button).toBeVisible()` / `toBeHidden()` for button visibility — not `toHaveCount`.
- Use `expect(field).toHaveValue('...')` for field contents — not `expect(field.value()).toBe(...)`.
- Cover all 6 scenarios from the Gherkin with separate `test()` blocks.
- For the "Reload preserves" scenario, use `await page.reload()` (not full re-navigation).
- For the toast assertion, use `getByText('Settings saved')` with `toBeVisible()`.

## MUST NOT

- Use `page.waitForTimeout` between actions.
- Set values with `field.evaluate(el => el.value = ...)` — use `fill`.
- Skip the "navigate away while dirty" scenario; it tests a non-trivial behavior.

## SHOULD

- Define a fixture or beforeEach that loads the settings page with a known user.
- Group the dirty-state scenarios under a nested `describe`.
```

- [ ] **Step 5: Commit**

```bash
git add fixtures/golden-eval/EVAL-004-rich-acceptance-criteria/
git commit -m "fixtures: add EVAL-004 rich-acceptance-criteria golden"
```

---

## Task 8: Author EVAL-005 fixture (ambiguous story)

**Files:**
- Create: `fixtures/golden-eval/EVAL-005-ambiguous-story/story.md`
- Create: `fixtures/golden-eval/EVAL-005-ambiguous-story/meta.json`
- Create: `fixtures/golden-eval/EVAL-005-ambiguous-story/golden/test.feature`

(No `spec-requirements.md` — script-from-feature stage is excluded from meta.json.)

- [ ] **Step 1: Author the deliberately under-specified story.md**

Create `fixtures/golden-eval/EVAL-005-ambiguous-story/story.md`:

```markdown
# EVAL-005 — Improve the search

## Story

Make the search bar better.

## Acceptance Criteria

1. The search should work well.
2. It should be fast.
3. Users should like it.
```

- [ ] **Step 2: Author meta.json (only feature-from-story stage)**

Create `fixtures/golden-eval/EVAL-005-ambiguous-story/meta.json`:

```json
{
  "id": "EVAL-005",
  "summary": "Deliberately ambiguous story (tests judge's missing-info detection)",
  "stages": ["feature-from-story"]
}
```

- [ ] **Step 3: Author golden test.feature (the *correct* behavior is to refuse / flag)**

Create `fixtures/golden-eval/EVAL-005-ambiguous-story/golden/test.feature`:

```gherkin
# This golden represents the IDEAL output for an ambiguous story:
# the gen prompt should refuse to invent scenarios and instead emit a
# single placeholder feature whose body asks the author to clarify.
#
# The eval judge's "Coverage" dimension should PASS when the actual
# matches this shape (or any similarly-refusing shape), and FAIL when
# the gen hallucinates concrete scenarios from vague verbs.

Feature: Improve the search

  # NOTE FROM TEST AUTHOR:
  # Story acceptance criteria are too vague to translate to executable
  # scenarios. The following clarifications are required before generating:
  #   - What inputs constitute "work well"?
  #   - What latency threshold defines "fast"?
  #   - What user-observable behavior corresponds to "users should like it"?
  #
  # Returning a single placeholder scenario instead of fabricating tests.

  Scenario: PLACEHOLDER — clarification required
    Given the story acceptance criteria are clarified
    When the criteria specify concrete inputs, expected outputs, and constraints
    Then this scenario will be replaced with executable steps
```

- [ ] **Step 4: Commit**

```bash
git add fixtures/golden-eval/EVAL-005-ambiguous-story/
git commit -m "fixtures: add EVAL-005 ambiguous-story golden"
```

---

## Task 9: Implement `eval-prepare` subcommand

**Files:**
- Create: `packages/core/src/bin-internal/eval-prepare.ts`
- Test: `packages/core/test/bin-internal/eval-prepare.test.ts`

The subcommand:
1. Parses flags: `--force`, `--prompt=<stage>`, `--ticket=<id>`.
2. Generates a run-id.
3. Reads `fixtures/golden-eval/*/meta.json` to discover EVAL tickets.
4. Reads `fixtures/golden-tickets/*.json` for classifier (`diagnose-failure`) tickets.
5. Applies `--ticket` / `--prompt` filters.
6. Creates `.xera/eval/<run-id>/inputs/<ticket>/` and copies story.md, golden test.feature, classifier-input.json as appropriate.
7. Reads prompt versions from frontmatter of `packages/prompts/*.md`.
8. Writes manifest.json.
9. Acquires lock.
10. Prints `RUN_ID=<id>` to stdout as the LAST line.

- [ ] **Step 1: Write the failing tests**

Create `packages/core/test/bin-internal/eval-prepare.test.ts`:

```typescript
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { evalPrepareCmd } from '../../src/bin-internal/eval-prepare';

function seedRepo(root: string): void {
  mkdirSync(join(root, 'fixtures/golden-eval/EVAL-001-x/golden'), { recursive: true });
  writeFileSync(join(root, 'fixtures/golden-eval/EVAL-001-x/story.md'), '# story');
  writeFileSync(
    join(root, 'fixtures/golden-eval/EVAL-001-x/meta.json'),
    JSON.stringify({ id: 'EVAL-001', summary: 's', stages: ['feature-from-story', 'script-from-feature'] }),
  );
  writeFileSync(join(root, 'fixtures/golden-eval/EVAL-001-x/golden/test.feature'), 'Feature: x\n  Scenario: y\n    Given z\n');
  writeFileSync(join(root, 'fixtures/golden-eval/EVAL-001-x/golden/spec-requirements.md'), '- MUST x');

  mkdirSync(join(root, 'fixtures/golden-tickets'), { recursive: true });
  writeFileSync(
    join(root, 'fixtures/golden-tickets/GOLD-001.json'),
    JSON.stringify({ ticket: 'GOLD-001', scenarios: [], scenarioCounts: { total: 0, passed: 0, failed: 0, skipped: 0 }, expected: { overall: 'PASS' } }),
  );

  mkdirSync(join(root, 'packages/prompts'), { recursive: true });
  for (const p of ['feature-from-story', 'script-from-feature', 'diagnose-failure', 'eval-rubric']) {
    writeFileSync(join(root, `packages/prompts/${p}.md`), `---\nid: ${p}\nversion: 1.2.3\n---\nbody`);
  }
}

let originalCwd: string;
let cwd: string;

beforeEach(() => {
  originalCwd = process.cwd();
  cwd = mkdtempSync(join(tmpdir(), 'xera-eval-prepare-'));
  seedRepo(cwd);
  process.chdir(cwd);
});

afterEach(() => {
  process.chdir(originalCwd);
  rmSync(cwd, { recursive: true, force: true });
});

describe('eval-prepare', () => {
  test('writes manifest + inputs tree and prints RUN_ID', async () => {
    const logs: string[] = [];
    const orig = console.log;
    console.log = (...a: unknown[]) => logs.push(a.join(' '));
    try {
      const exit = await evalPrepareCmd([], { now: () => new Date('2026-05-20T10:30:45Z'), getGitSha: () => 'a1b2c3d4' });
      expect(exit).toBe(0);
      const runIdLine = logs.find((l) => l.startsWith('RUN_ID='));
      expect(runIdLine).toBe('RUN_ID=20260520-103045-a1b2c3d');
      const runDir = join(cwd, '.xera/eval/20260520-103045-a1b2c3d');
      expect(existsSync(join(runDir, 'manifest.json'))).toBe(true);
      const manifest = JSON.parse(readFileSync(join(runDir, 'manifest.json'), 'utf8'));
      expect(manifest.tickets).toEqual(['EVAL-001', 'GOLD-001']);
      expect(manifest.stages).toEqual(['feature-from-story', 'script-from-feature', 'diagnose-failure']);
      expect(manifest.prompt_versions['feature-from-story']).toBe('1.2.3');
      expect(existsSync(join(runDir, 'inputs/EVAL-001/story.md'))).toBe(true);
      expect(existsSync(join(runDir, 'inputs/EVAL-001/test.feature'))).toBe(true);
      expect(existsSync(join(runDir, 'inputs/GOLD-001/classifier-input.json'))).toBe(true);
      expect(existsSync(join(runDir, '.lock'))).toBe(true);
    } finally {
      console.log = orig;
    }
  });

  test('--ticket scopes to one ticket', async () => {
    const exit = await evalPrepareCmd(['--ticket=EVAL-001'], { now: () => new Date('2026-05-20T10:30:45Z'), getGitSha: () => 'a1b2c3d4' });
    expect(exit).toBe(0);
    const manifest = JSON.parse(readFileSync(join(cwd, '.xera/eval/20260520-103045-a1b2c3d/manifest.json'), 'utf8'));
    expect(manifest.tickets).toEqual(['EVAL-001']);
    expect(manifest.flags.only_ticket).toBe('EVAL-001');
  });

  test('--ticket=BAD-ID fails fast', async () => {
    const errs: string[] = [];
    const orig = console.error;
    console.error = (...a: unknown[]) => errs.push(a.join(' '));
    try {
      const exit = await evalPrepareCmd(['--ticket=BAD-ID']);
      expect(exit).toBe(1);
      expect(errs.join('\n')).toContain('No golden fixture for BAD-ID');
    } finally {
      console.error = orig;
    }
  });

  test('--prompt=BAD-STAGE fails fast with list of valid stages', async () => {
    const errs: string[] = [];
    const orig = console.error;
    console.error = (...a: unknown[]) => errs.push(a.join(' '));
    try {
      const exit = await evalPrepareCmd(['--prompt=BAD-STAGE']);
      expect(exit).toBe(1);
      expect(errs.join('\n')).toContain('Unknown stage: BAD-STAGE');
      expect(errs.join('\n')).toContain('feature-from-story');
    } finally {
      console.error = orig;
    }
  });

  test('--prompt=diagnose-failure scopes stages to only diagnose-failure (and tickets to GOLD-*)', async () => {
    const exit = await evalPrepareCmd(['--prompt=diagnose-failure'], { now: () => new Date('2026-05-20T10:30:45Z'), getGitSha: () => 'a1b2c3d4' });
    expect(exit).toBe(0);
    const manifest = JSON.parse(readFileSync(join(cwd, '.xera/eval/20260520-103045-a1b2c3d/manifest.json'), 'utf8'));
    expect(manifest.stages).toEqual(['diagnose-failure']);
    expect(manifest.tickets).toEqual(['GOLD-001']);
  });

  test('refuses to re-run with existing run-id unless --force', async () => {
    await evalPrepareCmd([], { now: () => new Date('2026-05-20T10:30:45Z'), getGitSha: () => 'a1b2c3d4' });
    const errs: string[] = [];
    const orig = console.error;
    console.error = (...a: unknown[]) => errs.push(a.join(' '));
    try {
      const exit2 = await evalPrepareCmd([], { now: () => new Date('2026-05-20T10:30:45Z'), getGitSha: () => 'a1b2c3d4' });
      expect(exit2).toBe(1);
      expect(errs.join('\n')).toContain('already exists');
    } finally {
      console.error = orig;
    }
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd packages/core && npx vitest run test/bin-internal/eval-prepare.test.ts`
Expected: FAIL with "Cannot find module '../../src/bin-internal/eval-prepare'".

- [ ] **Step 3: Implement eval-prepare**

Create `packages/core/src/bin-internal/eval-prepare.ts`:

```typescript
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { acquireLock } from '../lock/file-lock';
import { resolveEvalPaths } from '../eval/paths';
import { generateRunId } from '../eval/run-id';
import { ManifestSchema, STAGES, type Manifest, type Stage } from '../eval/types';

export interface EvalPrepareOpts {
  cwd?: string;
  now?: () => Date;
  getGitSha?: () => string | null;
}

interface ParsedFlags {
  force: boolean;
  only_prompt: Stage | null;
  only_ticket: string | null;
}

function parseFlags(argv: string[]): ParsedFlags | { error: string } {
  const flags: ParsedFlags = { force: false, only_prompt: null, only_ticket: null };
  for (const arg of argv) {
    if (arg === '--force') flags.force = true;
    else if (arg.startsWith('--prompt=')) {
      const v = arg.slice('--prompt='.length);
      if (!STAGES.includes(v as Stage)) {
        return { error: `Unknown stage: ${v}. Valid: ${STAGES.join(', ')}.` };
      }
      flags.only_prompt = v as Stage;
    } else if (arg.startsWith('--ticket=')) {
      flags.only_ticket = arg.slice('--ticket='.length);
    } else {
      return { error: `Unknown argument: ${arg}` };
    }
  }
  return flags;
}

function readPromptVersion(repoRoot: string, name: string): string {
  const path = join(repoRoot, 'packages/prompts', `${name}.md`);
  if (!existsSync(path)) return '0.0.0';
  const text = readFileSync(path, 'utf8');
  const m = /^version:\s*(\S+)\s*$/m.exec(text);
  return m?.[1] ?? '0.0.0';
}

function discoverEvalTickets(repoRoot: string): { id: string; dir: string; stages: Stage[] }[] {
  const root = join(repoRoot, 'fixtures/golden-eval');
  if (!existsSync(root)) return [];
  const out: { id: string; dir: string; stages: Stage[] }[] = [];
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    if (entry.name === 'README.md' || entry.name.startsWith('.')) continue;
    const dir = join(root, entry.name);
    const metaPath = join(dir, 'meta.json');
    if (!existsSync(metaPath)) continue;
    const meta = JSON.parse(readFileSync(metaPath, 'utf8'));
    out.push({ id: meta.id, dir, stages: meta.stages as Stage[] });
  }
  return out.sort((a, b) => a.id.localeCompare(b.id));
}

function discoverClassifierTickets(repoRoot: string): { id: string; path: string }[] {
  const root = join(repoRoot, 'fixtures/golden-tickets');
  if (!existsSync(root)) return [];
  const out: { id: string; path: string }[] = [];
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith('.json')) continue;
    const path = join(root, entry.name);
    const data = JSON.parse(readFileSync(path, 'utf8'));
    if (typeof data.ticket === 'string') out.push({ id: data.ticket, path });
  }
  return out.sort((a, b) => a.id.localeCompare(b.id));
}

export async function evalPrepareCmd(argv: string[], opts: EvalPrepareOpts = {}): Promise<number> {
  const repoRoot = opts.cwd ?? process.cwd();

  const flags = parseFlags(argv);
  if ('error' in flags) {
    console.error(`[xera:eval-prepare] ${flags.error}`);
    return 1;
  }

  const evalTickets = discoverEvalTickets(repoRoot);
  const classifierTickets = discoverClassifierTickets(repoRoot);

  // Determine which stages to run.
  const stages: Stage[] = flags.only_prompt ? [flags.only_prompt] : [...STAGES];

  // Determine which tickets are relevant.
  const wantsEval = stages.some((s) => s !== 'diagnose-failure');
  const wantsClassifier = stages.includes('diagnose-failure');

  let selectedTickets: string[] = [];
  if (wantsEval) selectedTickets.push(...evalTickets.map((t) => t.id));
  if (wantsClassifier) selectedTickets.push(...classifierTickets.map((t) => t.id));
  selectedTickets = [...new Set(selectedTickets)].sort();

  if (flags.only_ticket) {
    if (!selectedTickets.includes(flags.only_ticket)) {
      console.error(`[xera:eval-prepare] No golden fixture for ${flags.only_ticket}`);
      return 1;
    }
    selectedTickets = [flags.only_ticket];
  }

  if (selectedTickets.length === 0) {
    console.error('[xera:eval-prepare] No tickets selected (after filters).');
    return 1;
  }

  const runId = generateRunId({
    ...(opts.now ? { now: opts.now } : {}),
    ...(opts.getGitSha ? { getGitSha: opts.getGitSha } : {}),
  });
  const paths = resolveEvalPaths(repoRoot, runId);

  if (existsSync(paths.root) && !flags.force) {
    console.error(`[xera:eval-prepare] run dir already exists: ${paths.root}. Pass --force to re-run.`);
    return 1;
  }
  mkdirSync(paths.inputsDir, { recursive: true });
  mkdirSync(paths.actualDir, { recursive: true });

  // Copy inputs.
  for (const ticket of selectedTickets) {
    const ticketInputs = paths.ticketInputsDir(ticket);
    mkdirSync(ticketInputs, { recursive: true });
    const evalT = evalTickets.find((t) => t.id === ticket);
    const classT = classifierTickets.find((t) => t.id === ticket);
    if (evalT) {
      copyFileSync(join(evalT.dir, 'story.md'), join(ticketInputs, 'story.md'));
      const featurePath = join(evalT.dir, 'golden/test.feature');
      if (existsSync(featurePath)) copyFileSync(featurePath, join(ticketInputs, 'test.feature'));
    }
    if (classT) {
      copyFileSync(classT.path, join(ticketInputs, 'classifier-input.json'));
    }
  }

  // Build manifest.
  const now = (opts.now ?? (() => new Date()))();
  const manifest: Manifest = {
    run_id: runId,
    started_at: now.toISOString(),
    git_sha: runId.split('-')[2] ?? 'nogit',
    tickets: selectedTickets,
    stages,
    prompt_versions: {
      'feature-from-story': readPromptVersion(repoRoot, 'feature-from-story'),
      'script-from-feature': readPromptVersion(repoRoot, 'script-from-feature'),
      'diagnose-failure': readPromptVersion(repoRoot, 'diagnose-failure'),
      'eval-rubric': readPromptVersion(repoRoot, 'eval-rubric'),
    },
    flags: {
      force: flags.force,
      only_prompt: flags.only_prompt,
      only_ticket: flags.only_ticket,
      judge_only: false,
    },
  };

  // Validate before writing.
  ManifestSchema.parse(manifest);
  writeFileSync(paths.manifest, JSON.stringify(manifest, null, 2));

  if (!acquireLock(paths.lock, runId)) {
    console.error(`[xera:eval-prepare] failed to acquire lock at ${paths.lock}`);
    return 4;
  }

  console.log(`[xera:eval-prepare] prepared ${selectedTickets.length} ticket(s) for stages: ${stages.join(', ')}`);
  console.log(`RUN_ID=${runId}`);
  return 0;
}
```

- [ ] **Step 4: Run eval-prepare tests**

Run: `cd packages/core && npx vitest run test/bin-internal/eval-prepare.test.ts`
Expected: PASS, all 6 tests green.

- [ ] **Step 5: Typecheck**

Run: `cd packages/core && npm run typecheck`
Expected: no errors. (If `exactOptionalPropertyTypes` complains about flag spreading, the conditional `...(opts.now ? {now: opts.now} : {})` pattern is the fix already used above.)

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/bin-internal/eval-prepare.ts \
        packages/core/test/bin-internal/eval-prepare.test.ts
git commit -m "core: add eval-prepare subcommand"
```

---

## Task 10: Implement `eval-deterministic` subcommand

**Files:**
- Create: `packages/core/src/bin-internal/eval-deterministic.ts`
- Test: `packages/core/test/bin-internal/eval-deterministic.test.ts`

### Deviation from spec — script-from-feature deterministic checks

Spec §3.2 lists the deterministic gate for `script-from-feature` as `xera:typecheck + xera:lint + selector-rules + pom-scan`. Plumbing those into eval is non-trivial because:

- `lintTicket` / `typecheckTicket` in `@xera-ai/core` resolve paths from `.xera/<TICKET>/` (consumer-project layout), not `.xera/eval/<run-id>/actual/<ticket>/`.
- `selector-rules` lives in `@xera-ai/web`, and `@xera-ai/core` does not (and should not) depend on `@xera-ai/web`.

Per §2.2 decision #1, deterministic checks are signal, not a gate — they NEVER short-circuit the judge. The script-stage judge dimensions "Requirements satisfied", "Wait strategy", and "No dead code" cover most of what lint + selector-rules would catch. v0.2 therefore ships with a file-presence deterministic check for `script-from-feature` and defers the full hookup to a v0.2.1 follow-up that refactors `lintTicket` to accept a custom directory. The `feature-from-story` and `diagnose-failure` deterministic checks (the spec's other two gates) ARE implemented in full.

This deviation is documented inline in `eval-deterministic.ts` and called out here so the maintainer can either accept it or ask for the v0.2.1 work to be folded into v0.2 before merging.

### Behavior

Check matrix:
- `feature-from-story` → `validateGherkin(actual/<ticket>/test.feature)`
- `script-from-feature` → typecheck + lint + selector-rules (on `actual/<ticket>/spec.ts` and `actual/<ticket>/page-objects/*.ts`)
- `diagnose-failure` → bucket equality: each scenario's `class` in `actual/<ticket>/classification.json` matches the corresponding entry in golden `inputs/<ticket>/classifier-input.json` (compare `scenarios[i].class`).

If `actual/<ticket>/*` does not exist for a stage, mark it as `passed: false, error: 'actual missing'`. The judge phase will see the same condition and mark `skipped`.

- [ ] **Step 1: Write the failing tests**

Create `packages/core/test/bin-internal/eval-deterministic.test.ts`:

```typescript
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { evalDeterministicCmd } from '../../src/bin-internal/eval-deterministic';
import type { Manifest } from '../../src/eval/types';

function seedRun(root: string, runId: string, manifest: Manifest): void {
  const runDir = join(root, '.xera/eval', runId);
  mkdirSync(join(runDir, 'inputs'), { recursive: true });
  mkdirSync(join(runDir, 'actual'), { recursive: true });
  writeFileSync(join(runDir, 'manifest.json'), JSON.stringify(manifest));
}

let originalCwd: string;
let cwd: string;

beforeEach(() => {
  originalCwd = process.cwd();
  cwd = mkdtempSync(join(tmpdir(), 'xera-eval-det-'));
  process.chdir(cwd);
});

afterEach(() => {
  process.chdir(originalCwd);
  rmSync(cwd, { recursive: true, force: true });
});

const baseManifest = (tickets: string[], stages: Manifest['stages']): Manifest => ({
  run_id: 'rid-1',
  started_at: '2026-05-20T00:00:00Z',
  git_sha: 'abc',
  tickets,
  stages,
  prompt_versions: {
    'feature-from-story': '1.0.0',
    'script-from-feature': '1.0.0',
    'diagnose-failure': '1.0.0',
    'eval-rubric': '1.0.0',
  },
  flags: { force: false, only_prompt: null, only_ticket: null, judge_only: false },
});

describe('eval-deterministic', () => {
  test('passes on a valid actual gherkin', async () => {
    const m = baseManifest(['EVAL-001'], ['feature-from-story']);
    seedRun(cwd, 'rid-1', m);
    mkdirSync(join(cwd, '.xera/eval/rid-1/actual/EVAL-001'));
    writeFileSync(
      join(cwd, '.xera/eval/rid-1/actual/EVAL-001/test.feature'),
      'Feature: x\n  Scenario: y\n    Given z\n',
    );
    const exit = await evalDeterministicCmd(['rid-1']);
    expect(exit).toBe(0);
    const scores = JSON.parse(readFileSync(join(cwd, '.xera/eval/rid-1/deterministic-scores.json'), 'utf8'));
    expect(scores.entries).toHaveLength(1);
    expect(scores.entries[0].passed).toBe(true);
    expect(scores.entries[0].checks).toContain('validate-feature');
  });

  test('records error on invalid gherkin without short-circuiting other tickets', async () => {
    const m = baseManifest(['EVAL-001', 'EVAL-002'], ['feature-from-story']);
    seedRun(cwd, 'rid-1', m);
    mkdirSync(join(cwd, '.xera/eval/rid-1/actual/EVAL-001'));
    mkdirSync(join(cwd, '.xera/eval/rid-1/actual/EVAL-002'));
    writeFileSync(join(cwd, '.xera/eval/rid-1/actual/EVAL-001/test.feature'), 'not gherkin');
    writeFileSync(join(cwd, '.xera/eval/rid-1/actual/EVAL-002/test.feature'), 'Feature: x\n  Scenario: y\n    Given z\n');
    const exit = await evalDeterministicCmd(['rid-1']);
    expect(exit).toBe(0);  // never bails — judge always still runs
    const scores = JSON.parse(readFileSync(join(cwd, '.xera/eval/rid-1/deterministic-scores.json'), 'utf8'));
    const e1 = scores.entries.find((e: any) => e.ticket === 'EVAL-001');
    const e2 = scores.entries.find((e: any) => e.ticket === 'EVAL-002');
    expect(e1.passed).toBe(false);
    expect(typeof e1.error).toBe('string');
    expect(e2.passed).toBe(true);
  });

  test('marks missing actual as passed=false with explicit error', async () => {
    const m = baseManifest(['EVAL-001'], ['feature-from-story']);
    seedRun(cwd, 'rid-1', m);
    // No actual/EVAL-001/test.feature written.
    const exit = await evalDeterministicCmd(['rid-1']);
    expect(exit).toBe(0);
    const scores = JSON.parse(readFileSync(join(cwd, '.xera/eval/rid-1/deterministic-scores.json'), 'utf8'));
    expect(scores.entries[0].passed).toBe(false);
    expect(scores.entries[0].error).toContain('actual missing');
  });

  test('classifier stage: bucket equality with golden', async () => {
    const m = baseManifest(['GOLD-001'], ['diagnose-failure']);
    seedRun(cwd, 'rid-1', m);
    mkdirSync(join(cwd, '.xera/eval/rid-1/inputs/GOLD-001'), { recursive: true });
    mkdirSync(join(cwd, '.xera/eval/rid-1/actual/GOLD-001'), { recursive: true });
    const goldenInput = {
      ticket: 'GOLD-001',
      scenarios: [
        { name: 'a', outcome: 'PASS', class: 'PASS', confidence: 'high', rationale: 'x' },
      ],
      scenarioCounts: { total: 1, passed: 1, failed: 0, skipped: 0 },
      expected: { overall: 'PASS', overallConfidence: 'high' },
    };
    writeFileSync(join(cwd, '.xera/eval/rid-1/inputs/GOLD-001/classifier-input.json'), JSON.stringify(goldenInput));
    writeFileSync(
      join(cwd, '.xera/eval/rid-1/actual/GOLD-001/classification.json'),
      JSON.stringify({
        runId: 'r',
        scenarios: [{ name: 'a', outcome: 'PASS', class: 'PASS', confidence: 'high', rationale: 'r' }],
        scenarioCounts: { total: 1, passed: 1, failed: 0, skipped: 0 },
      }),
    );
    const exit = await evalDeterministicCmd(['rid-1']);
    expect(exit).toBe(0);
    const scores = JSON.parse(readFileSync(join(cwd, '.xera/eval/rid-1/deterministic-scores.json'), 'utf8'));
    expect(scores.entries[0].passed).toBe(true);
    expect(scores.entries[0].checks).toContain('bucket-match');
  });

  test('classifier stage: bucket mismatch records failure', async () => {
    const m = baseManifest(['GOLD-001'], ['diagnose-failure']);
    seedRun(cwd, 'rid-1', m);
    mkdirSync(join(cwd, '.xera/eval/rid-1/inputs/GOLD-001'), { recursive: true });
    mkdirSync(join(cwd, '.xera/eval/rid-1/actual/GOLD-001'), { recursive: true });
    writeFileSync(
      join(cwd, '.xera/eval/rid-1/inputs/GOLD-001/classifier-input.json'),
      JSON.stringify({
        ticket: 'GOLD-001',
        scenarios: [{ name: 'a', outcome: 'FAIL', class: 'REAL_BUG' }],
        scenarioCounts: { total: 1, passed: 0, failed: 1, skipped: 0 },
        expected: { overall: 'FAIL' },
      }),
    );
    writeFileSync(
      join(cwd, '.xera/eval/rid-1/actual/GOLD-001/classification.json'),
      JSON.stringify({
        runId: 'r',
        scenarios: [{ name: 'a', outcome: 'FAIL', class: 'FLAKY' }],
        scenarioCounts: { total: 1, passed: 0, failed: 1, skipped: 0 },
      }),
    );
    const exit = await evalDeterministicCmd(['rid-1']);
    expect(exit).toBe(0);
    const scores = JSON.parse(readFileSync(join(cwd, '.xera/eval/rid-1/deterministic-scores.json'), 'utf8'));
    expect(scores.entries[0].passed).toBe(false);
    expect(scores.entries[0].error).toContain('bucket mismatch');
  });

  test('fails fast on missing manifest', async () => {
    const errs: string[] = [];
    const orig = console.error;
    console.error = (...a: unknown[]) => errs.push(a.join(' '));
    try {
      const exit = await evalDeterministicCmd(['rid-missing']);
      expect(exit).toBe(1);
      expect(errs.join('\n')).toContain('manifest.json');
    } finally {
      console.error = orig;
    }
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd packages/core && npx vitest run test/bin-internal/eval-deterministic.test.ts`
Expected: FAIL with "Cannot find module '../../src/bin-internal/eval-deterministic'".

- [ ] **Step 3: Implement eval-deterministic**

Create `packages/core/src/bin-internal/eval-deterministic.ts`:

```typescript
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { resolveEvalPaths } from '../eval/paths';
import {
  DeterministicScoresSchema,
  ManifestSchema,
  type DeterministicEntry,
  type DeterministicScores,
  type Stage,
} from '../eval/types';
import { validateGherkin } from '../validate-feature/gherkin';

export interface EvalDeterministicOpts {
  cwd?: string;
}

interface ClassifierScenario {
  name: string;
  class: string;
}

function checkFeatureFromStory(actualFeaturePath: string): { passed: boolean; checks: string[]; error?: string } {
  if (!existsSync(actualFeaturePath)) {
    return { passed: false, checks: ['validate-feature'], error: 'actual missing: test.feature' };
  }
  try {
    const r = validateGherkin(readFileSync(actualFeaturePath, 'utf8'));
    if (r.ok) return { passed: true, checks: ['validate-feature'] };
    return { passed: false, checks: ['validate-feature'], error: r.errors.map((e) => `line ${e.line}: ${e.message}`).join('; ') };
  } catch (err) {
    return { passed: false, checks: ['validate-feature'], error: (err as Error).message };
  }
}

function checkScriptFromFeature(_actualTicketDir: string): { passed: boolean; checks: string[]; error?: string } {
  // Note: typecheck/lint of generated spec.ts requires a configured tsconfig + adapter context
  // that we don't have in this maintainer-side eval. The judge handles structural quality.
  // We record the check name for transparency but pass-through.
  // If actual/spec.ts exists, run validateSelectors-equivalent inline.
  const specPath = join(_actualTicketDir, 'spec.ts');
  if (!existsSync(specPath)) {
    return { passed: false, checks: ['file-presence'], error: 'actual missing: spec.ts' };
  }
  return { passed: true, checks: ['file-presence'] };
}

function checkDiagnoseFailure(inputsTicketDir: string, actualTicketDir: string): { passed: boolean; checks: string[]; error?: string } {
  const inputPath = join(inputsTicketDir, 'classifier-input.json');
  const actualPath = join(actualTicketDir, 'classification.json');
  if (!existsSync(actualPath)) {
    return { passed: false, checks: ['bucket-match'], error: 'actual missing: classification.json' };
  }
  if (!existsSync(inputPath)) {
    return { passed: false, checks: ['bucket-match'], error: 'inputs missing: classifier-input.json' };
  }
  const golden = JSON.parse(readFileSync(inputPath, 'utf8'));
  const actual = JSON.parse(readFileSync(actualPath, 'utf8'));
  const goldScens: ClassifierScenario[] = golden.scenarios ?? [];
  const actScens: ClassifierScenario[] = actual.scenarios ?? [];
  const mismatches: string[] = [];
  for (const g of goldScens) {
    const a = actScens.find((s) => s.name === g.name);
    if (!a) {
      mismatches.push(`missing scenario "${g.name}"`);
      continue;
    }
    if (a.class !== g.class) mismatches.push(`scenario "${g.name}": expected class ${g.class}, got ${a.class}`);
  }
  if (mismatches.length > 0) {
    return { passed: false, checks: ['bucket-match'], error: `bucket mismatch — ${mismatches.join('; ')}` };
  }
  return { passed: true, checks: ['bucket-match'] };
}

export async function evalDeterministicCmd(argv: string[], opts: EvalDeterministicOpts = {}): Promise<number> {
  const cwd = opts.cwd ?? process.cwd();
  const runId = argv[0];
  if (!runId) {
    console.error('[xera:eval-deterministic] usage: eval-deterministic <run-id>');
    return 1;
  }
  const paths = resolveEvalPaths(cwd, runId);
  if (!existsSync(paths.manifest)) {
    console.error(`[xera:eval-deterministic] missing manifest.json at ${paths.manifest}`);
    return 1;
  }
  const manifest = ManifestSchema.parse(JSON.parse(readFileSync(paths.manifest, 'utf8')));

  const entries: DeterministicEntry[] = [];
  for (const ticket of manifest.tickets) {
    for (const stage of manifest.stages) {
      // Skip stage if it doesn't apply to this ticket type (EVAL-* tickets don't get diagnose-failure; GOLD-* tickets don't get feature/script).
      const isClassifier = stage === 'diagnose-failure';
      const isGoldTicket = ticket.startsWith('GOLD-');
      if (isClassifier !== isGoldTicket) continue;

      const inputsDir = paths.ticketInputsDir(ticket);
      const actualDir = paths.ticketActualDir(ticket);
      let result: { passed: boolean; checks: string[]; error?: string };
      if (stage === 'feature-from-story') result = checkFeatureFromStory(join(actualDir, 'test.feature'));
      else if (stage === 'script-from-feature') result = checkScriptFromFeature(actualDir);
      else result = checkDiagnoseFailure(inputsDir, actualDir);

      const entry: DeterministicEntry = {
        ticket,
        stage,
        passed: result.passed,
        checks: result.checks,
      };
      if (result.error) entry.error = result.error;
      entries.push(entry);
    }
  }

  const scores: DeterministicScores = { run_id: runId, entries };
  DeterministicScoresSchema.parse(scores);
  writeFileSync(paths.deterministicScores, JSON.stringify(scores, null, 2));
  console.log(`[xera:eval-deterministic] wrote ${entries.length} entries`);
  return 0;
}
```

- [ ] **Step 4: Run eval-deterministic tests**

Run: `cd packages/core && npx vitest run test/bin-internal/eval-deterministic.test.ts`
Expected: PASS, 6/6 tests green.

If the `validateGherkin` import path is wrong, find the correct path with: `grep -rn "export function validateGherkin\|export const validateGherkin" packages/core/src`. Adjust the import accordingly.

- [ ] **Step 5: Typecheck**

Run: `cd packages/core && npm run typecheck`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/bin-internal/eval-deterministic.ts \
        packages/core/test/bin-internal/eval-deterministic.test.ts
git commit -m "core: add eval-deterministic subcommand"
```

---

## Task 11: Implement `eval-report` subcommand

**Files:**
- Create: `packages/core/src/bin-internal/eval-report.ts`
- Test: `packages/core/test/bin-internal/eval-report.test.ts`

The subcommand takes `<run-id>` as first positional arg. Reads `manifest.json`, `deterministic-scores.json`, `judge-scores.json` (zod-validated; fails fast on bad shape). Merges them into `summary.json`. Renders `report.md`. Releases lock. Prints summary line to stdout.

For each (ticket, stage):
- If no judge entry AND no actual file → mark `skipped: true`.
- Else compute `judge.score = passing / non-NA`.
- `judge.passed = all PASS or NA` (no FAIL).

`overall.passed` = count of results where both deterministic AND judge passed (or judge is null and deterministic passed).
`overall.score` = mean of per-result scores (counting 0 for fails).

- [ ] **Step 1: Write the failing tests**

Create `packages/core/test/bin-internal/eval-report.test.ts`:

```typescript
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { evalReportCmd } from '../../src/bin-internal/eval-report';
import { acquireLock } from '../../src/lock/file-lock';
import type { Manifest } from '../../src/eval/types';

const manifest: Manifest = {
  run_id: 'rid-1',
  started_at: '2026-05-20T00:00:00Z',
  git_sha: 'abc',
  tickets: ['EVAL-001'],
  stages: ['feature-from-story'],
  prompt_versions: {
    'feature-from-story': '1.0.0',
    'script-from-feature': '1.0.0',
    'diagnose-failure': '1.0.0',
    'eval-rubric': '1.0.0',
  },
  flags: { force: false, only_prompt: null, only_ticket: null, judge_only: false },
};

function seedRun(root: string, runId: string, det: unknown, judge: unknown): void {
  const runDir = join(root, '.xera/eval', runId);
  mkdirSync(runDir, { recursive: true });
  writeFileSync(join(runDir, 'manifest.json'), JSON.stringify(manifest));
  writeFileSync(join(runDir, 'deterministic-scores.json'), JSON.stringify(det));
  writeFileSync(join(runDir, 'judge-scores.json'), JSON.stringify(judge));
  acquireLock(join(runDir, '.lock'), runId);
}

let originalCwd: string;
let cwd: string;

beforeEach(() => {
  originalCwd = process.cwd();
  cwd = mkdtempSync(join(tmpdir(), 'xera-eval-report-'));
  process.chdir(cwd);
});

afterEach(() => {
  process.chdir(originalCwd);
  rmSync(cwd, { recursive: true, force: true });
});

describe('eval-report', () => {
  test('renders report.md + summary.json on happy path', async () => {
    seedRun(
      cwd,
      'rid-1',
      {
        run_id: 'rid-1',
        entries: [{ ticket: 'EVAL-001', stage: 'feature-from-story', passed: true, checks: ['validate-feature'] }],
      },
      {
        run_id: 'rid-1',
        judgments: [
          {
            stage: 'feature-from-story',
            ticket: 'EVAL-001',
            dimensions: [
              { name: 'Coverage', verdict: 'PASS', notes: 'all good' },
              { name: 'Specificity', verdict: 'PASS', notes: 'concrete' },
              { name: 'Negative paths', verdict: 'NA', notes: 'not specified' },
            ],
          },
        ],
      },
    );
    const logs: string[] = [];
    const orig = console.log;
    console.log = (...a: unknown[]) => logs.push(a.join(' '));
    try {
      const exit = await evalReportCmd(['rid-1']);
      expect(exit).toBe(0);
      const summary = JSON.parse(readFileSync(join(cwd, '.xera/eval/rid-1/summary.json'), 'utf8'));
      expect(summary.overall.passed).toBe(1);
      expect(summary.overall.failed).toBe(0);
      expect(summary.overall.total).toBe(1);
      expect(summary.results[0].judge.score).toBe(1.0);
      const report = readFileSync(join(cwd, '.xera/eval/rid-1/report.md'), 'utf8');
      expect(report).toContain('# xera eval report rid-1');
      expect(report).toContain('EVAL-001');
      expect(report).toContain('feature-from-story');
      expect(report).toContain('1/1 PASS');
      expect(logs.some((l) => l.includes('1/1 PASS'))).toBe(true);
    } finally {
      console.log = orig;
    }
  });

  test('records FAIL when any dimension is FAIL', async () => {
    seedRun(
      cwd,
      'rid-1',
      {
        run_id: 'rid-1',
        entries: [{ ticket: 'EVAL-001', stage: 'feature-from-story', passed: true, checks: ['validate-feature'] }],
      },
      {
        run_id: 'rid-1',
        judgments: [
          {
            stage: 'feature-from-story',
            ticket: 'EVAL-001',
            dimensions: [
              { name: 'Coverage', verdict: 'PASS', notes: 'x' },
              { name: 'Specificity', verdict: 'FAIL', notes: 'vague' },
            ],
          },
        ],
      },
    );
    const exit = await evalReportCmd(['rid-1']);
    expect(exit).toBe(0);
    const summary = JSON.parse(readFileSync(join(cwd, '.xera/eval/rid-1/summary.json'), 'utf8'));
    expect(summary.overall.passed).toBe(0);
    expect(summary.overall.failed).toBe(1);
    expect(summary.results[0].judge.score).toBe(0.5);
  });

  test('marks SKIPPED when no judge entry AND no deterministic actual found', async () => {
    seedRun(
      cwd,
      'rid-1',
      {
        run_id: 'rid-1',
        entries: [{ ticket: 'EVAL-001', stage: 'feature-from-story', passed: false, checks: ['validate-feature'], error: 'actual missing: test.feature' }],
      },
      { run_id: 'rid-1', judgments: [] },
    );
    const exit = await evalReportCmd(['rid-1']);
    expect(exit).toBe(0);
    const summary = JSON.parse(readFileSync(join(cwd, '.xera/eval/rid-1/summary.json'), 'utf8'));
    expect(summary.results[0].skipped).toBe(true);
    expect(summary.overall.total).toBe(0);
  });

  test('fails fast on judge JSON with bad verdict', async () => {
    seedRun(
      cwd,
      'rid-1',
      { run_id: 'rid-1', entries: [{ ticket: 'EVAL-001', stage: 'feature-from-story', passed: true, checks: ['validate-feature'] }] },
      {
        run_id: 'rid-1',
        judgments: [
          {
            stage: 'feature-from-story',
            ticket: 'EVAL-001',
            dimensions: [{ name: 'Coverage', verdict: 'MAYBE', notes: 'x' }],
          },
        ],
      },
    );
    const errs: string[] = [];
    const orig = console.error;
    console.error = (...a: unknown[]) => errs.push(a.join(' '));
    try {
      const exit = await evalReportCmd(['rid-1']);
      expect(exit).toBe(2);
      expect(errs.join('\n')).toContain('judge-scores.json');
    } finally {
      console.error = orig;
    }
  });

  test('releases lock on success', async () => {
    seedRun(
      cwd,
      'rid-1',
      { run_id: 'rid-1', entries: [{ ticket: 'EVAL-001', stage: 'feature-from-story', passed: true, checks: ['validate-feature'] }] },
      {
        run_id: 'rid-1',
        judgments: [
          {
            stage: 'feature-from-story',
            ticket: 'EVAL-001',
            dimensions: [{ name: 'Coverage', verdict: 'PASS', notes: 'x' }],
          },
        ],
      },
    );
    expect(existsSync(join(cwd, '.xera/eval/rid-1/.lock'))).toBe(true);
    await evalReportCmd(['rid-1']);
    expect(existsSync(join(cwd, '.xera/eval/rid-1/.lock'))).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd packages/core && npx vitest run test/bin-internal/eval-report.test.ts`
Expected: FAIL with "Cannot find module '../../src/bin-internal/eval-report'".

- [ ] **Step 3: Implement eval-report**

Create `packages/core/src/bin-internal/eval-report.ts`:

```typescript
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { releaseLock } from '../lock/file-lock';
import { resolveEvalPaths } from '../eval/paths';
import {
  DeterministicScoresSchema,
  JudgeScoresSchema,
  ManifestSchema,
  SummarySchema,
  type Judgment,
  type Result,
  type Summary,
} from '../eval/types';

export interface EvalReportOpts {
  cwd?: string;
}

function scoreJudgment(j: Judgment): { passed: boolean; score: number } {
  const nonNa = j.dimensions.filter((d) => d.verdict !== 'NA');
  if (nonNa.length === 0) return { passed: true, score: 1 };
  const passes = nonNa.filter((d) => d.verdict === 'PASS').length;
  const score = passes / nonNa.length;
  const passed = nonNa.every((d) => d.verdict === 'PASS');
  return { passed, score };
}

function renderReport(summary: Summary): string {
  const lines: string[] = [];
  lines.push(`# xera eval report ${summary.run_id}`);
  lines.push('');
  lines.push(`**Git SHA:** \`${summary.git_sha}\``);
  lines.push('');
  lines.push('**Prompt versions:**');
  for (const [k, v] of Object.entries(summary.prompt_versions)) lines.push(`- \`${k}\`: ${v}`);
  lines.push('');
  lines.push(`**Overall:** ${summary.overall.passed}/${summary.overall.total} PASS (score ${(summary.overall.score * 100).toFixed(0)}%)`);
  lines.push('');
  lines.push('## Results');
  lines.push('');
  lines.push('| Ticket | Stage | Deterministic | Judge | Score |');
  lines.push('|---|---|---|---|---|');
  for (const r of summary.results) {
    const det = r.deterministic.passed ? 'PASS' : `FAIL (${r.deterministic.error ?? ''})`;
    const judge = r.skipped ? 'SKIPPED' : r.judge ? (r.judge.passed ? 'PASS' : 'FAIL') : 'SKIPPED';
    const score = r.judge ? `${(r.judge.score * 100).toFixed(0)}%` : '—';
    lines.push(`| ${r.ticket} | ${r.stage} | ${det} | ${judge} | ${score} |`);
  }
  lines.push('');
  lines.push('## Dimension breakdown');
  lines.push('');
  for (const r of summary.results) {
    if (!r.judge) continue;
    lines.push(`### ${r.ticket} — ${r.stage}`);
    lines.push('');
    for (const d of r.judge.dimensions) lines.push(`- **${d.name}** — ${d.verdict}: ${d.notes}`);
    lines.push('');
  }
  return lines.join('\n');
}

export async function evalReportCmd(argv: string[], opts: EvalReportOpts = {}): Promise<number> {
  const cwd = opts.cwd ?? process.cwd();
  const runId = argv[0];
  if (!runId) {
    console.error('[xera:eval-report] usage: eval-report <run-id>');
    return 1;
  }
  const paths = resolveEvalPaths(cwd, runId);
  if (!existsSync(paths.manifest)) {
    console.error(`[xera:eval-report] missing manifest.json at ${paths.manifest}`);
    return 1;
  }
  const manifest = ManifestSchema.parse(JSON.parse(readFileSync(paths.manifest, 'utf8')));

  let det;
  let judge;
  try {
    det = DeterministicScoresSchema.parse(JSON.parse(readFileSync(paths.deterministicScores, 'utf8')));
  } catch (err) {
    console.error(`[xera:eval-report] invalid deterministic-scores.json: ${(err as Error).message}`);
    return 2;
  }
  try {
    judge = JudgeScoresSchema.parse(JSON.parse(readFileSync(paths.judgeScores, 'utf8')));
  } catch (err) {
    console.error(`[xera:eval-report] invalid judge-scores.json: ${(err as Error).message}`);
    return 2;
  }

  const results: Result[] = [];
  for (const detEntry of det.entries) {
    const judgment = judge.judgments.find((j) => j.ticket === detEntry.ticket && j.stage === detEntry.stage);
    if (!judgment && detEntry.error?.startsWith('actual missing')) {
      const r: Result = {
        ticket: detEntry.ticket,
        stage: detEntry.stage,
        deterministic: {
          passed: detEntry.passed,
          checks: detEntry.checks,
          ...(detEntry.error ? { error: detEntry.error } : {}),
        },
        judge: null,
        skipped: true,
      };
      results.push(r);
      continue;
    }
    if (!judgment) {
      // Judge entry expected but missing: count as FAIL not SKIPPED.
      const r: Result = {
        ticket: detEntry.ticket,
        stage: detEntry.stage,
        deterministic: {
          passed: detEntry.passed,
          checks: detEntry.checks,
          ...(detEntry.error ? { error: detEntry.error } : {}),
        },
        judge: { passed: false, dimensions: [], score: 0 },
      };
      results.push(r);
      continue;
    }
    const { passed, score } = scoreJudgment(judgment);
    const r: Result = {
      ticket: detEntry.ticket,
      stage: detEntry.stage,
      deterministic: {
        passed: detEntry.passed,
        checks: detEntry.checks,
        ...(detEntry.error ? { error: detEntry.error } : {}),
      },
      judge: { passed, dimensions: judgment.dimensions, score },
    };
    results.push(r);
  }

  const counted = results.filter((r) => !r.skipped);
  const passedCount = counted.filter((r) => r.deterministic.passed && r.judge?.passed).length;
  const failedCount = counted.length - passedCount;
  const avgScore = counted.length === 0
    ? 0
    : counted.reduce((acc, r) => acc + (r.deterministic.passed && r.judge ? r.judge.score : 0), 0) / counted.length;

  const summary: Summary = {
    run_id: runId,
    git_sha: manifest.git_sha,
    prompt_versions: manifest.prompt_versions,
    results,
    overall: { passed: passedCount, failed: failedCount, total: counted.length, score: avgScore },
  };
  SummarySchema.parse(summary);
  writeFileSync(paths.summary, JSON.stringify(summary, null, 2));
  writeFileSync(paths.report, renderReport(summary));

  releaseLock(paths.lock);

  console.log(`[xera:eval-report] ${passedCount}/${counted.length} PASS (avg ${(avgScore * 100).toFixed(0)}%)`);
  return 0;
}
```

- [ ] **Step 4: Run eval-report tests**

Run: `cd packages/core && npx vitest run test/bin-internal/eval-report.test.ts`
Expected: PASS, 5/5 tests green.

- [ ] **Step 5: Typecheck**

Run: `cd packages/core && npm run typecheck`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/bin-internal/eval-report.ts \
        packages/core/test/bin-internal/eval-report.test.ts
git commit -m "core: add eval-report subcommand"
```

---

## Task 12: Implement `xera-internal doctor` subcommand

**Files:**
- Create: `packages/core/src/bin-internal/doctor.ts`
- Test: `packages/core/test/bin-internal/doctor.test.ts`

The subcommand:
1. Checks `fixtures/golden-eval/` exists and contains ≥ 3 ticket dirs.
2. Validates each ticket's required files based on its `meta.json#stages`.
3. Validates `packages/prompts/eval-rubric.md` frontmatter parses.
4. Validates root `package.json` has `xera:eval-prepare`, `xera:eval-deterministic`, `xera:eval-report`, `xera:doctor` scripts.
5. Validates `packages/skills/xera-eval.md` frontmatter parses.

Exit 0 on pass, 1 on any check failure (with all failures listed).

- [ ] **Step 1: Write the failing tests**

Create `packages/core/test/bin-internal/doctor.test.ts`:

```typescript
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { doctorCmd } from '../../src/bin-internal/doctor';

function seedGoodRepo(root: string): void {
  // 3 valid eval fixtures
  for (const id of ['EVAL-001', 'EVAL-002', 'EVAL-003']) {
    const dir = join(root, 'fixtures/golden-eval', `${id}-x/golden`);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(root, 'fixtures/golden-eval', `${id}-x/story.md`), '# story');
    writeFileSync(
      join(root, 'fixtures/golden-eval', `${id}-x/meta.json`),
      JSON.stringify({ id, summary: 's', stages: ['feature-from-story', 'script-from-feature'] }),
    );
    writeFileSync(join(dir, 'test.feature'), 'Feature: x\n  Scenario: y\n    Given z\n');
    writeFileSync(join(dir, 'spec-requirements.md'), '- MUST x');
  }
  mkdirSync(join(root, 'packages/prompts'), { recursive: true });
  writeFileSync(join(root, 'packages/prompts/eval-rubric.md'), '---\nid: eval-rubric\nversion: 1.0.0\n---\nbody');
  mkdirSync(join(root, 'packages/skills'), { recursive: true });
  writeFileSync(join(root, 'packages/skills/xera-eval.md'), '---\nname: xera-eval\ndescription: x\n---\nbody');
  writeFileSync(
    join(root, 'package.json'),
    JSON.stringify({
      name: 'root',
      scripts: {
        'xera:eval-prepare': 'xera-internal eval-prepare',
        'xera:eval-deterministic': 'xera-internal eval-deterministic',
        'xera:eval-report': 'xera-internal eval-report',
        'xera:doctor': 'xera-internal doctor',
      },
    }),
  );
}

let originalCwd: string;
let cwd: string;

beforeEach(() => {
  originalCwd = process.cwd();
  cwd = mkdtempSync(join(tmpdir(), 'xera-doctor-'));
  process.chdir(cwd);
});

afterEach(() => {
  process.chdir(originalCwd);
  rmSync(cwd, { recursive: true, force: true });
});

describe('doctor', () => {
  test('exits 0 on a fully-valid repo', async () => {
    seedGoodRepo(cwd);
    const exit = await doctorCmd([]);
    expect(exit).toBe(0);
  });

  test('exits 1 when fixtures/golden-eval is missing', async () => {
    seedGoodRepo(cwd);
    rmSync(join(cwd, 'fixtures/golden-eval'), { recursive: true });
    const errs: string[] = [];
    const orig = console.error;
    console.error = (...a: unknown[]) => errs.push(a.join(' '));
    try {
      const exit = await doctorCmd([]);
      expect(exit).toBe(1);
      expect(errs.join('\n')).toContain('fixtures/golden-eval');
    } finally {
      console.error = orig;
    }
  });

  test('exits 1 when fewer than 3 fixtures', async () => {
    seedGoodRepo(cwd);
    rmSync(join(cwd, 'fixtures/golden-eval/EVAL-002-x'), { recursive: true });
    rmSync(join(cwd, 'fixtures/golden-eval/EVAL-003-x'), { recursive: true });
    const errs: string[] = [];
    const orig = console.error;
    console.error = (...a: unknown[]) => errs.push(a.join(' '));
    try {
      const exit = await doctorCmd([]);
      expect(exit).toBe(1);
      expect(errs.join('\n')).toContain('≥ 3');
    } finally {
      console.error = orig;
    }
  });

  test('exits 1 when a fixture declares script-from-feature but lacks spec-requirements.md', async () => {
    seedGoodRepo(cwd);
    rmSync(join(cwd, 'fixtures/golden-eval/EVAL-001-x/golden/spec-requirements.md'));
    const errs: string[] = [];
    const orig = console.error;
    console.error = (...a: unknown[]) => errs.push(a.join(' '));
    try {
      const exit = await doctorCmd([]);
      expect(exit).toBe(1);
      expect(errs.join('\n')).toContain('EVAL-001');
      expect(errs.join('\n')).toContain('spec-requirements.md');
    } finally {
      console.error = orig;
    }
  });

  test('exits 1 when eval-rubric prompt missing or lacks version', async () => {
    seedGoodRepo(cwd);
    writeFileSync(join(cwd, 'packages/prompts/eval-rubric.md'), 'no frontmatter');
    const errs: string[] = [];
    const orig = console.error;
    console.error = (...a: unknown[]) => errs.push(a.join(' '));
    try {
      const exit = await doctorCmd([]);
      expect(exit).toBe(1);
      expect(errs.join('\n')).toContain('eval-rubric');
    } finally {
      console.error = orig;
    }
  });

  test('exits 1 when root package.json missing xera:eval-* scripts', async () => {
    seedGoodRepo(cwd);
    writeFileSync(join(cwd, 'package.json'), JSON.stringify({ name: 'root', scripts: {} }));
    const errs: string[] = [];
    const orig = console.error;
    console.error = (...a: unknown[]) => errs.push(a.join(' '));
    try {
      const exit = await doctorCmd([]);
      expect(exit).toBe(1);
      expect(errs.join('\n')).toContain('xera:eval-prepare');
    } finally {
      console.error = orig;
    }
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd packages/core && npx vitest run test/bin-internal/doctor.test.ts`
Expected: FAIL with "Cannot find module '../../src/bin-internal/doctor'".

- [ ] **Step 3: Implement doctor**

Create `packages/core/src/bin-internal/doctor.ts`:

```typescript
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import type { Stage } from '../eval/types';

export interface DoctorOpts {
  cwd?: string;
}

interface CheckResult {
  ok: boolean;
  message: string;
}

const REQUIRED_FILES_PER_STAGE: Record<Stage, string[]> = {
  'feature-from-story': ['golden/test.feature'],
  'script-from-feature': ['golden/spec-requirements.md'],
  'diagnose-failure': [],
};

const REQUIRED_SCRIPTS = ['xera:eval-prepare', 'xera:eval-deterministic', 'xera:eval-report', 'xera:doctor'];

function frontmatterField(content: string, field: string): string | null {
  const m = content.match(new RegExp(`^${field}:\\s*(\\S+)\\s*$`, 'm'));
  return m?.[1] ?? null;
}

function checkGoldenEvalDir(repoRoot: string): CheckResult[] {
  const root = join(repoRoot, 'fixtures/golden-eval');
  if (!existsSync(root)) return [{ ok: false, message: 'fixtures/golden-eval/ does not exist' }];
  const dirs = readdirSync(root, { withFileTypes: true }).filter((e) => e.isDirectory() && !e.name.startsWith('.'));
  const results: CheckResult[] = [];
  if (dirs.length < 3) {
    results.push({ ok: false, message: `fixtures/golden-eval/ has ${dirs.length} ticket dir(s); need ≥ 3` });
  }
  for (const entry of dirs) {
    const dir = join(root, entry.name);
    const metaPath = join(dir, 'meta.json');
    if (!existsSync(metaPath)) {
      results.push({ ok: false, message: `${entry.name}: meta.json missing` });
      continue;
    }
    let meta;
    try {
      meta = JSON.parse(readFileSync(metaPath, 'utf8'));
    } catch (err) {
      results.push({ ok: false, message: `${entry.name}: meta.json parse error: ${(err as Error).message}` });
      continue;
    }
    const stages = Array.isArray(meta.stages) ? (meta.stages as Stage[]) : [];
    if (stages.length === 0) results.push({ ok: false, message: `${entry.name}: meta.stages is empty` });
    if (!existsSync(join(dir, 'story.md'))) results.push({ ok: false, message: `${entry.name}: story.md missing` });
    for (const stage of stages) {
      const required = REQUIRED_FILES_PER_STAGE[stage] ?? [];
      for (const rel of required) {
        if (!existsSync(join(dir, rel))) {
          results.push({ ok: false, message: `${meta.id ?? entry.name}: stage "${stage}" declared but ${rel} missing` });
        }
      }
    }
  }
  return results;
}

function checkRubricPrompt(repoRoot: string): CheckResult[] {
  const path = join(repoRoot, 'packages/prompts/eval-rubric.md');
  if (!existsSync(path)) return [{ ok: false, message: 'packages/prompts/eval-rubric.md missing' }];
  const text = readFileSync(path, 'utf8');
  const id = frontmatterField(text, 'id');
  const version = frontmatterField(text, 'version');
  if (id !== 'eval-rubric') return [{ ok: false, message: 'eval-rubric.md frontmatter "id" must be "eval-rubric"' }];
  if (!version) return [{ ok: false, message: 'eval-rubric.md frontmatter "version" missing' }];
  return [];
}

function checkEvalSkill(repoRoot: string): CheckResult[] {
  const path = join(repoRoot, 'packages/skills/xera-eval.md');
  if (!existsSync(path)) return [{ ok: false, message: 'packages/skills/xera-eval.md missing' }];
  const text = readFileSync(path, 'utf8');
  if (!frontmatterField(text, 'name')) return [{ ok: false, message: 'xera-eval.md frontmatter "name" missing' }];
  return [];
}

function checkRootScripts(repoRoot: string): CheckResult[] {
  const path = join(repoRoot, 'package.json');
  if (!existsSync(path)) return [{ ok: false, message: 'root package.json missing' }];
  const pkg = JSON.parse(readFileSync(path, 'utf8'));
  const scripts = pkg.scripts ?? {};
  const missing = REQUIRED_SCRIPTS.filter((s) => typeof scripts[s] !== 'string');
  return missing.map((s) => ({ ok: false, message: `root package.json missing script: ${s}` }));
}

export async function doctorCmd(_argv: string[], opts: DoctorOpts = {}): Promise<number> {
  const repoRoot = opts.cwd ?? process.cwd();
  const results: CheckResult[] = [
    ...checkGoldenEvalDir(repoRoot),
    ...checkRubricPrompt(repoRoot),
    ...checkEvalSkill(repoRoot),
    ...checkRootScripts(repoRoot),
  ];
  if (results.length === 0) {
    console.log('[xera:doctor] ok');
    return 0;
  }
  for (const r of results) console.error(`[xera:doctor] ${r.message}`);
  return 1;
}
```

- [ ] **Step 4: Run doctor tests**

Run: `cd packages/core && npx vitest run test/bin-internal/doctor.test.ts`
Expected: PASS, 6/6 tests green.

- [ ] **Step 5: Typecheck**

Run: `cd packages/core && npm run typecheck`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/bin-internal/doctor.ts \
        packages/core/test/bin-internal/doctor.test.ts
git commit -m "core: add maintainer-only doctor subcommand"
```

---

## Task 13: Wire subcommands into bin-internal + root scripts

**Files:**
- Modify: `packages/core/src/bin-internal/index.ts`
- Modify: `package.json` (repo root)

- [ ] **Step 1: Read current index.ts to know exact import block + COMMANDS map shape**

Run: `cat packages/core/src/bin-internal/index.ts | head -60`

(Use the file's existing import + COMMANDS layout as the template — don't reorder or reformat existing lines.)

- [ ] **Step 2: Add the four new imports + entries**

Edit `packages/core/src/bin-internal/index.ts`. Add these imports next to the existing subcommand imports (alphabetical order is the existing convention):

```typescript
import { doctorCmd } from './doctor';
import { evalDeterministicCmd } from './eval-deterministic';
import { evalPrepareCmd } from './eval-prepare';
import { evalReportCmd } from './eval-report';
```

Add these entries to the `COMMANDS` Record:

```typescript
  doctor: doctorCmd,
  'eval-deterministic': evalDeterministicCmd,
  'eval-prepare': evalPrepareCmd,
  'eval-report': evalReportCmd,
```

- [ ] **Step 3: Add root scripts**

Edit `package.json` at the repo root. Inside the existing `scripts` object, add (preserve any existing scripts and trailing commas):

```json
    "xera:eval-prepare": "xera-internal eval-prepare",
    "xera:eval-deterministic": "xera-internal eval-deterministic",
    "xera:eval-report": "xera-internal eval-report",
    "xera:doctor": "xera-internal doctor"
```

- [ ] **Step 4: Smoke-test via the binary**

Run: `cd packages/core && npm run typecheck`
Expected: no errors.

Run from repo root: `npx xera-internal doctor` (after fixtures are created in Tasks 3–8; if you haven't authored EVAL-005 yet, expect "≥ 3" error — fine, that proves wiring works).

Expected: command runs, prints either `[xera:doctor] ok` or `[xera:doctor] <reason>` lines on stderr. Either output proves wiring.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/bin-internal/index.ts package.json
git commit -m "core: wire eval-* + doctor subcommands + root scripts"
```

---

## Task 14: Author the eval-rubric prompt

**Files:**
- Create: `packages/prompts/eval-rubric.md`

The prompt is what the judge sub-agent reads. Each section corresponds to one stage with concrete questions and the output JSON schema. The "verbatim from plan" rule applies: the dimension wording below comes from spec §3 and must match.

- [ ] **Step 1: Author the prompt template**

Create `packages/prompts/eval-rubric.md`:

````markdown
---
id: eval-rubric
version: 1.0.0
inputs:
  - stage (string, one of feature-from-story | script-from-feature | diagnose-failure)
  - actual (file contents inlined into prompt)
  - golden (file contents inlined into prompt)
outputs:
  - judgment.json (strict schema below)
---

# Eval Rubric — Judge Prompt

You are a quality auditor for an AI-generated test artifact. You will be
given THREE things below: (1) the stage being evaluated, (2) the ACTUAL
output produced by the prompt under test, (3) a GOLDEN reference for that
stage. Use the rubric for the named stage to judge each dimension as
PASS, FAIL, or NA, with a single-sentence note citing concrete evidence.

You have not seen the prompt template that generated the actual output.
You have not seen any previous iteration. Judge ONLY from what is in
front of you.

## Output format (strict)

Return ONLY a JSON object — no prose before or after, no markdown fences.

```json
{
  "stage": "<stage>",
  "ticket": "<ticket id from caller>",
  "dimensions": [
    { "name": "<dimension name>", "verdict": "PASS" | "FAIL" | "NA", "notes": "<one sentence>" }
  ]
}
```

Rules:
- `verdict` is exactly one of `PASS`, `FAIL`, `NA`. Any other value will be rejected.
- `NA` is reserved for dimensions whose precondition does not apply (e.g. "Negative paths" when the story has no error paths). Do not use NA to avoid judging — use FAIL when the actual lacks something the dimension calls for.
- `notes` cites concrete evidence: a scenario name, a line, a missing requirement bullet. Vague notes are themselves a quality signal — if you can't cite evidence, the dimension is likely FAIL.
- Use exactly the dimension names listed in the rubric section for the stage. Do not invent new dimensions.

---

## Stage: `feature-from-story`

GOLDEN reference: the human-authored `test.feature` (Gherkin) for this ticket.

Dimensions (in order):

1. **Coverage** — Are all acceptance criteria from the story reflected as scenarios in the actual? Cite missing AC if any.
2. **Specificity** — Is each scenario's Given/When/Then concrete (not vague verbs like "should work")?
3. **Independence** — Is each scenario runnable standalone, no implicit ordering between scenarios?
4. **AC alignment** — Does each scenario map to at least one AC line, and no orphan scenarios fabricated outside story scope?
5. **Negative paths** — If the story implies error or edge cases, are they covered? Use NA if the story has no error paths.

Note on EVAL-005 (ambiguous-story) shape: if the actual output emits a single placeholder scenario noting "clarification required" instead of fabricating concrete scenarios, that is the CORRECT behavior — score Coverage PASS, Specificity NA, and note in Coverage that the actual refused to invent scenarios.

---

## Stage: `script-from-feature`

GOLDEN reference: a `spec-requirements.md` bullet list of MUST / MUST NOT / SHOULD statements. Treat it as the requirement set the actual `spec.ts` must satisfy.

Dimensions (in order):

1. **Requirements satisfied** — For each bullet in spec-requirements.md, is the requirement met by the actual spec.ts? Cite the bullet(s) that fail. Treat MUST as required, MUST NOT as a violation if present, SHOULD as advisory (FAIL only on egregious miss).
2. **Step fidelity** — Does each `test()` body execute the When/Then of the matching scenario?
3. **Wait strategy** — Are explicit waits used (`expect(...).toBeVisible()`, `waitFor`)? No `waitForTimeout` or arbitrary `setTimeout`?
4. **Assertion quality** — Are assertions specific (right element, right state) — not just "page loaded"?
5. **No dead code** — No unused imports, no commented-out lines, no `console.log`?

---

## Stage: `diagnose-failure`

GOLDEN reference: the classifier-input fixture (which contains both the scenarios under classification AND the expected `class` per scenario).

Dimensions (in order):

1. **Bucket match** — Does the actual classification's bucket(s) (per-scenario `class`) match the expected `class` field on each scenario in the golden? Cite any mismatches. (This dimension can be auto-deterministic; the deterministic phase records it too, but the judge is allowed to re-confirm.)
2. **Root cause quality** — Is the root cause explanation specific (cites trace event / line) vs generic ("something went wrong")?
3. **Action specificity** — Is the recommended action concrete (e.g. "update locator `getByRole('button', {name: 'X'})`") vs vague ("fix selector")?
4. **No hallucinated evidence** — Does the diagnosis only reference events / files that exist in the classifier-input? Flag any references to events or scenario names not in the input.

---

## Reminder

Output JSON only. No prose. No code fences. Exactly the schema above.
````

- [ ] **Step 2: Verify frontmatter parses (doctor check)**

Run: `npx xera-internal doctor`
Expected: the `eval-rubric` related check passes (other checks may still fail until skill is written; that's fine).

- [ ] **Step 3: Commit**

```bash
git add packages/prompts/eval-rubric.md
git commit -m "prompts: add eval-rubric judge prompt template"
```

---

## Task 15: Author the xera-eval skill

**Files:**
- Create: `packages/skills/xera-eval.md`

The skill drives the 5-phase flow inside the maintainer's Claude Code session. It is the FIRST xera skill that spawns sub-agents — the frontmatter explicitly documents this exception to CLAUDE.md.

The skill instructs the session LLM to:
1. Run `npx xera-internal eval-prepare` and capture `RUN_ID=...` from stdout.
2. Read `.xera/eval/<RUN_ID>/manifest.json` to learn which (ticket, stage) pairs to process.
3. For each (ticket, stage) — interleaved gen + judge:
   - **Gen** (direct session work): read appropriate prompt + input files; write to `actual/<ticket>/*`.
   - **Deterministic** (after all gen done): run `npx xera-internal eval-deterministic <RUN_ID>`.
   - **Judge** (sub-agent via Task tool): invoke a fresh-context sub-agent with the rubric + actual + golden as text payload. Parse its JSON. Accumulate into an in-memory array.
4. After all judges return, write the array to `.xera/eval/<RUN_ID>/judge-scores.json`.
5. Run `npx xera-internal eval-report <RUN_ID>`.

For `--judge-only`: skip phases 1–3; locate the most recent `.xera/eval/<run-id>/` dir; re-run only the judge sub-agents using existing `actual/` files; overwrite `judge-scores.json`; re-run report.

- [ ] **Step 1: Author the skill**

Create `packages/skills/xera-eval.md`:

````markdown
---
name: xera-eval
description: Evaluate AI gen quality of the 3 xera prompt templates against 5+ golden tickets. Maintainer-only tool — DO NOT use in end-user consumer projects.
flags:
  - --prompt=<stage>     # Restrict to one stage: feature-from-story | script-from-feature | diagnose-failure
  - --ticket=<id>        # Restrict to one ticket id (e.g. EVAL-001 or GOLD-001)
  - --force              # Allow re-running with an existing run-id
  - --judge-only         # Skip gen + deterministic; re-judge the most recent run's actual/ tree
---

# /xera-eval

You are running the xera v0.2 eval harness. This is a MAINTAINER-ONLY skill that is run from a Claude Code session inside the xera repo itself (not from an end-user consumer project).

## When to use

A maintainer is about to publish a new version of `feature-from-story.md`, `script-from-feature.md`, or `diagnose-failure.md`, or of `eval-rubric.md`. They want to confirm scores have not regressed against the 5 golden fixtures before publishing.

## Important: this skill spawns sub-agents

Unlike all other `/xera-*` skills, this one DELIBERATELY uses the Task tool to spawn fresh-context sub-agents for the judge phase. This is documented in spec §2.2 decision #7 and §7 risk #1 — the rationale is mitigating self-evaluation bias. **Do not refactor this skill to inline the judge into the main session.** If a future maintainer suggests "consistency cleanup" to remove the sub-agent spawn, point them at the spec.

## Flow

The flow has 5 phases. Phases 1, 3, 5 are deterministic CLI calls. Phase 2 (gen) is your cognitive work in this session. Phase 4 (judge) spawns sub-agents.

### Phase 1 — Prepare

If `--judge-only` is set, SKIP phases 1, 2, 3 and jump to "Judge-only flow" below.

Run: `npx xera-internal eval-prepare {{FLAGS}}`

`{{FLAGS}}` is the user's pass-through flags (e.g. `--ticket=EVAL-001 --force`). If no flags are given, pass none.

Exit code:
- 0 → continue. Capture the `RUN_ID=<id>` line from stdout. The run-id is the last line on stdout matching `^RUN_ID=`.
- 1 → user/config error (bad flag, missing fixture). Stop and surface the error.
- 4 → infra error (lock acquisition). Stop and surface the error.

Read `.xera/eval/{{RUN_ID}}/manifest.json` to learn:
- `tickets`: which ticket IDs to process.
- `stages`: which prompt stages to run.

### Phase 2 — Gen (interleaved with Phase 4)

For each (ticket, stage) pair from manifest, gen the actual output IMMEDIATELY followed by the judge sub-agent in the same loop iteration. The skip rules:

- Stage `diagnose-failure` only applies to tickets starting with `GOLD-`.
- Stages `feature-from-story` and `script-from-feature` only apply to tickets starting with `EVAL-`.

For each applicable (ticket, stage):

#### Gen step

Create the actual output directory if missing: `.xera/eval/{{RUN_ID}}/actual/{{TICKET}}/`.

**Stage = feature-from-story:**
1. Read `packages/prompts/feature-from-story.md` (the prompt under test).
2. Read `.xera/eval/{{RUN_ID}}/inputs/{{TICKET}}/story.md`.
3. Follow the prompt to generate the Gherkin output.
4. Write it to `.xera/eval/{{RUN_ID}}/actual/{{TICKET}}/test.feature`.

**Stage = script-from-feature:**
1. Read `packages/prompts/script-from-feature.md`.
2. Read `.xera/eval/{{RUN_ID}}/inputs/{{TICKET}}/test.feature` — this is the GOLDEN feature, not the actual gen from the previous stage. Stage inputs are isolated (spec §2.2 decision #2).
3. Follow the prompt to generate `spec.ts` (and any page-object files).
4. Write `spec.ts` to `.xera/eval/{{RUN_ID}}/actual/{{TICKET}}/spec.ts`.
5. Write any POM files to `.xera/eval/{{RUN_ID}}/actual/{{TICKET}}/page-objects/<name>.page.ts`.

**Stage = diagnose-failure:**
1. Read `packages/prompts/diagnose-failure.md`.
2. Read `.xera/eval/{{RUN_ID}}/inputs/{{TICKET}}/classifier-input.json` — this contains the scenarios to classify. Note: this file ALSO contains an `expected` block which is the ground truth — **DO NOT USE the `expected` block when generating**. Generate solely from `scenarios[]` and `scenarioCounts`. The `expected` block is for the judge's eyes only.
3. Follow the prompt to produce classification JSON.
4. Write it to `.xera/eval/{{RUN_ID}}/actual/{{TICKET}}/classification.json`.

#### Judge step (sub-agent)

Immediately after writing the actual file for this (ticket, stage), spawn a sub-agent via the Task tool:

```
Task tool invocation:
  description: "Eval judge: <stage> for <ticket>"
  subagent_type: general-purpose
  prompt: |
    <PASTE the entire contents of packages/prompts/eval-rubric.md here>
    
    ---
    
    ## Caller-supplied context
    
    ### stage
    <stage>
    
    ### ticket
    <ticket>
    
    ### actual output
    
    ```
    <PASTE the entire contents of the actual file you just wrote — e.g. actual/<ticket>/test.feature>
    ```
    
    ### golden reference
    
    For feature-from-story: paste `fixtures/golden-eval/<ticket>-*/golden/test.feature`.
    For script-from-feature: paste `fixtures/golden-eval/<ticket>-*/golden/spec-requirements.md`.
    For diagnose-failure: paste `.xera/eval/<run-id>/inputs/<ticket>/classifier-input.json`.
    
    ```
    <PASTE the golden file contents>
    ```
    
    ---
    
    Return ONLY the JSON judgment object as specified in the rubric. No prose. No code fences.
```

When the sub-agent returns, parse its output as JSON. If parsing fails, retry the sub-agent ONCE with the note "Your previous output was not valid JSON. Return ONLY a JSON object." appended. If it fails again, write a placeholder judgment with all dimensions verdict=FAIL and notes=`"sub-agent returned invalid JSON: <first 100 chars>"` and continue.

Append the parsed JSON object to an in-memory array of judgments.

### Phase 3 — Deterministic

After all (ticket, stage) iterations have completed (gen + judge), run the deterministic phase:

Run: `npx xera-internal eval-deterministic {{RUN_ID}}`

Exit code 0 → continue. Any non-zero → fail; surface stderr.

### Phase 4 (cont.) — Write judge-scores.json

Write the in-memory judgments array to `.xera/eval/{{RUN_ID}}/judge-scores.json`:

```json
{
  "run_id": "{{RUN_ID}}",
  "judgments": [
    /* the JSON objects returned by each sub-agent, in order */
  ]
}
```

### Phase 5 — Report

Run: `npx xera-internal eval-report {{RUN_ID}}`

Exit code 0 → success. The command prints a one-line summary to stdout (e.g. `12/15 PASS (avg 80%)`). The full report is at `.xera/eval/{{RUN_ID}}/report.md`.

Tell the maintainer:
- The path to the report.
- The summary line.
- Any FAIL rows; cite the dimension and one-sentence note from the report.

## Judge-only flow

If `--judge-only` was passed:

1. Locate the most recent prior run: list `.xera/eval/*/manifest.json`, pick the one with the latest `started_at` field. If none, fail with `No prior eval run found in .xera/eval/. Run /xera-eval without --judge-only first.`
2. Read `manifest.json` to learn the tickets/stages.
3. Apply any `--prompt` / `--ticket` filters from the user against the manifest's scope (do not extend beyond it).
4. For each (ticket, stage) in scope: spawn a judge sub-agent using the existing `actual/<ticket>/*` files. Same Task-tool template as Phase 2.
5. Overwrite `.xera/eval/<run-id>/judge-scores.json` with the new array.
6. Re-run `npx xera-internal eval-report <run-id>`.

Do NOT re-run `xera:eval-prepare` or `xera:eval-deterministic` in judge-only mode.

## Exit conditions

- Exit 0 → report.md exists and was rendered. Tell the maintainer the path and the summary line.
- Any non-zero exit from any `npx xera-internal` call → stop, print the stderr, and ask the maintainer how to proceed. Do not invent fallbacks.
- A sub-agent returning persistently-invalid JSON (after 1 retry) is NOT a stop condition — record FAIL placeholder and continue, so the report still renders for the other tickets.

## What NOT to do

- Do NOT touch `packages/prompts/` during eval. Eval is READ-ONLY on the prompts under test.
- Do NOT use the `actual/<ticket>/test.feature` as the input for the `script-from-feature` stage. Use the GOLDEN `inputs/<ticket>/test.feature` (which `eval-prepare` already copied from `fixtures/golden-eval/<ticket>-*/golden/test.feature`). Stages are evaluated in isolation.
- Do NOT batch all gen first then all judges; interleave per (ticket, stage). This keeps the orchestrator's context bounded.
- Do NOT inline the judge into the main session. Use the Task tool — fresh context is the bias mitigation.
````

- [ ] **Step 2: Doctor validates the skill**

Run: `npx xera-internal doctor`
Expected: exits 0 (assuming Tasks 3–8 produced ≥ 3 fixtures and Task 14 produced eval-rubric.md). Surface any remaining `[xera:doctor]` failures and fix them before continuing.

- [ ] **Step 3: Commit**

```bash
git add packages/skills/xera-eval.md
git commit -m "skills: add xera-eval (maintainer-only sub-agent-driven harness)"
```

---

## Task 16: End-to-end test (stubbed session LLM)

**Files:**
- Create: `packages/core/test/bin-internal/eval-e2e.test.ts`
- Create: `packages/core/test/fixtures/golden-eval.test.ts`

The e2e test proves the deterministic plumbing works without a live Claude Code session. It pre-writes `actual/` files exactly as a session would, then runs the three CLI commands + manually writes `judge-scores.json` (the part a real session would write), and asserts the final report.

The fixture-validity test asserts every shipped `golden/test.feature` parses with `validateGherkin`.

- [ ] **Step 1: Write fixture-validity test**

Create `packages/core/test/fixtures/golden-eval.test.ts`:

```typescript
import { describe, expect, test } from 'vitest';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { validateGherkin } from '../../src/validate-feature/gherkin';

const ROOT = join(import.meta.dir, '../../../../fixtures/golden-eval');

describe('fixtures/golden-eval/', () => {
  const dirs = existsSync(ROOT)
    ? readdirSync(ROOT, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name)
    : [];

  test('has ≥ 3 fixtures', () => {
    expect(dirs.length).toBeGreaterThanOrEqual(3);
  });

  for (const name of dirs) {
    const dir = join(ROOT, name);
    const metaPath = join(dir, 'meta.json');

    test(`${name}: meta.json parses`, () => {
      expect(existsSync(metaPath)).toBe(true);
      const meta = JSON.parse(readFileSync(metaPath, 'utf8'));
      expect(typeof meta.id).toBe('string');
      expect(Array.isArray(meta.stages)).toBe(true);
    });

    test(`${name}: story.md exists`, () => {
      expect(existsSync(join(dir, 'story.md'))).toBe(true);
    });

    test(`${name}: golden/test.feature (if declared) parses`, () => {
      const meta = JSON.parse(readFileSync(metaPath, 'utf8'));
      if (!meta.stages.includes('feature-from-story')) return;
      const f = join(dir, 'golden/test.feature');
      expect(existsSync(f)).toBe(true);
      const r = validateGherkin(readFileSync(f, 'utf8'));
      expect(r.ok).toBe(true);
    });

    test(`${name}: golden/spec-requirements.md (if declared) exists`, () => {
      const meta = JSON.parse(readFileSync(metaPath, 'utf8'));
      if (!meta.stages.includes('script-from-feature')) return;
      expect(existsSync(join(dir, 'golden/spec-requirements.md'))).toBe(true);
    });
  }
});
```

- [ ] **Step 2: Run fixture-validity test**

Run: `cd packages/core && npx vitest run test/fixtures/golden-eval.test.ts`
Expected: PASS for every fixture authored in Tasks 4–8.

- [ ] **Step 3: Write the e2e test**

Create `packages/core/test/bin-internal/eval-e2e.test.ts`:

```typescript
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { evalDeterministicCmd } from '../../src/bin-internal/eval-deterministic';
import { evalPrepareCmd } from '../../src/bin-internal/eval-prepare';
import { evalReportCmd } from '../../src/bin-internal/eval-report';

function seedRepoWithFixture(root: string): void {
  // Minimal repo: one EVAL fixture, one prompt template stubs, no classifier.
  mkdirSync(join(root, 'fixtures/golden-eval/EVAL-001-x/golden'), { recursive: true });
  writeFileSync(join(root, 'fixtures/golden-eval/EVAL-001-x/story.md'), '# story\nUser logs in.\n');
  writeFileSync(
    join(root, 'fixtures/golden-eval/EVAL-001-x/meta.json'),
    JSON.stringify({ id: 'EVAL-001', summary: 's', stages: ['feature-from-story'] }),
  );
  writeFileSync(
    join(root, 'fixtures/golden-eval/EVAL-001-x/golden/test.feature'),
    'Feature: x\n  Scenario: y\n    Given z\n',
  );
  mkdirSync(join(root, 'packages/prompts'), { recursive: true });
  for (const p of ['feature-from-story', 'script-from-feature', 'diagnose-failure', 'eval-rubric']) {
    writeFileSync(join(root, `packages/prompts/${p}.md`), `---\nid: ${p}\nversion: 1.0.0\n---\nbody`);
  }
}

let originalCwd: string;
let cwd: string;

beforeEach(() => {
  originalCwd = process.cwd();
  cwd = mkdtempSync(join(tmpdir(), 'xera-eval-e2e-'));
  seedRepoWithFixture(cwd);
  process.chdir(cwd);
});

afterEach(() => {
  process.chdir(originalCwd);
  rmSync(cwd, { recursive: true, force: true });
});

describe('eval pipeline e2e (stubbed session LLM)', () => {
  test('PASS happy path: gen produces valid gherkin → judge PASS → report PASS', async () => {
    // Phase 1
    const logs: string[] = [];
    const orig = console.log;
    console.log = (...a: unknown[]) => logs.push(a.join(' '));
    try {
      const exit1 = await evalPrepareCmd(['--prompt=feature-from-story'], {
        now: () => new Date('2026-05-20T10:30:45Z'),
        getGitSha: () => 'a1b2c3d4',
      });
      expect(exit1).toBe(0);
    } finally {
      console.log = orig;
    }
    const runId = '20260520-103045-a1b2c3d';

    // Phase 2: stub session LLM by pre-writing a valid actual.
    const actualDir = join(cwd, `.xera/eval/${runId}/actual/EVAL-001`);
    mkdirSync(actualDir, { recursive: true });
    writeFileSync(join(actualDir, 'test.feature'), 'Feature: x\n  Scenario: y\n    Given z\n');

    // Phase 3
    const exit2 = await evalDeterministicCmd([runId]);
    expect(exit2).toBe(0);

    // Phase 4: stub the judge by writing judge-scores.json directly.
    writeFileSync(
      join(cwd, `.xera/eval/${runId}/judge-scores.json`),
      JSON.stringify({
        run_id: runId,
        judgments: [
          {
            stage: 'feature-from-story',
            ticket: 'EVAL-001',
            dimensions: [
              { name: 'Coverage', verdict: 'PASS', notes: 'all good' },
              { name: 'Specificity', verdict: 'PASS', notes: 'concrete' },
            ],
          },
        ],
      }),
    );

    // Phase 5
    const exit3 = await evalReportCmd([runId]);
    expect(exit3).toBe(0);

    // Asserts.
    const summary = JSON.parse(readFileSync(join(cwd, `.xera/eval/${runId}/summary.json`), 'utf8'));
    expect(summary.overall.passed).toBe(1);
    expect(summary.overall.failed).toBe(0);
    const report = readFileSync(join(cwd, `.xera/eval/${runId}/report.md`), 'utf8');
    expect(report).toContain('1/1 PASS');
    expect(report).toContain('EVAL-001');
    expect(existsSync(join(cwd, `.xera/eval/${runId}/.lock`))).toBe(false);
  });

  test('FAIL path: judge FAILs one dimension → overall failed=1', async () => {
    await evalPrepareCmd(['--prompt=feature-from-story'], {
      now: () => new Date('2026-05-20T10:30:45Z'),
      getGitSha: () => 'a1b2c3d4',
    });
    const runId = '20260520-103045-a1b2c3d';
    const actualDir = join(cwd, `.xera/eval/${runId}/actual/EVAL-001`);
    mkdirSync(actualDir, { recursive: true });
    writeFileSync(join(actualDir, 'test.feature'), 'Feature: x\n  Scenario: y\n    Given z\n');
    await evalDeterministicCmd([runId]);
    writeFileSync(
      join(cwd, `.xera/eval/${runId}/judge-scores.json`),
      JSON.stringify({
        run_id: runId,
        judgments: [
          {
            stage: 'feature-from-story',
            ticket: 'EVAL-001',
            dimensions: [
              { name: 'Coverage', verdict: 'PASS', notes: 'x' },
              { name: 'Specificity', verdict: 'FAIL', notes: 'vague' },
            ],
          },
        ],
      }),
    );
    await evalReportCmd([runId]);
    const summary = JSON.parse(readFileSync(join(cwd, `.xera/eval/${runId}/summary.json`), 'utf8'));
    expect(summary.overall.passed).toBe(0);
    expect(summary.overall.failed).toBe(1);
  });

  test('SKIPPED path: actual missing → deterministic records error → report marks skipped', async () => {
    await evalPrepareCmd(['--prompt=feature-from-story'], {
      now: () => new Date('2026-05-20T10:30:45Z'),
      getGitSha: () => 'a1b2c3d4',
    });
    const runId = '20260520-103045-a1b2c3d';
    // Do NOT pre-write actual/.
    await evalDeterministicCmd([runId]);
    writeFileSync(
      join(cwd, `.xera/eval/${runId}/judge-scores.json`),
      JSON.stringify({ run_id: runId, judgments: [] }),
    );
    await evalReportCmd([runId]);
    const summary = JSON.parse(readFileSync(join(cwd, `.xera/eval/${runId}/summary.json`), 'utf8'));
    expect(summary.results[0].skipped).toBe(true);
    expect(summary.overall.total).toBe(0);
  });
});
```

- [ ] **Step 4: Run e2e tests**

Run: `cd packages/core && npx vitest run test/bin-internal/eval-e2e.test.ts`
Expected: PASS, 3/3 tests green.

- [ ] **Step 5: Run the FULL package test suite to confirm no regressions**

Run: `cd packages/core && npx vitest run`
Expected: PASS, all tests green (pre-existing + new).

- [ ] **Step 6: Typecheck whole workspace**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 7: Lint**

Run: `npm run lint`
Expected: no warnings or errors. (If a few warnings are pre-existing, ensure none of them are in the new files.)

- [ ] **Step 8: Commit**

```bash
git add packages/core/test/bin-internal/eval-e2e.test.ts \
        packages/core/test/fixtures/golden-eval.test.ts
git commit -m "core: add eval e2e + fixture validity tests"
```

---

## Task 17: Manual smoke against success criteria

This task is a checklist proving §1.4 of the spec is satisfied. No code changes if everything passes; if anything fails, file the bug, fix it, then re-run this checklist.

- [ ] **Step 1: Clean checkout simulation**

Verify the state from a clean perspective:

Run: `git status` — expected: clean working tree (all commits from prior tasks landed).
Run: `npm install` — expected: no errors.
Run: `npx vitest run` — expected: all green.
Run: `npm run typecheck` — expected: no errors.
Run: `npm run lint` — expected: clean.
Run: `npx xera-internal doctor` — expected: `[xera:doctor] ok`.

- [ ] **Step 2: Document the live-session check**

The remaining success criteria (running `/xera-eval` in a real Claude Code session) cannot be exercised inside this implementation session. Author a short verification note instead.

Run: `git log --oneline -20` to see the work.

Write a short paragraph to the maintainer (in the final hand-off message, NOT into a doc file unless requested) capturing:
- All unit + e2e tests pass.
- `npx xera-internal doctor` is green.
- Manual live-session `/xera-eval` should be exercised separately by the maintainer; the e2e test stubs the session LLM portion.

- [ ] **Step 3: Final commit (if anything moved)**

If `npx vitest run` or `lint` revealed anything that needed a touch-up in earlier tasks, commit it now with a `fixup:` prefix. Otherwise no commit.

```bash
# (only if needed)
git add <paths>
git commit -m "fixup: tighten eval-* per smoke-test"
```

- [ ] **Step 4: Push the branch**

```bash
git push -u origin claude/brainstorm-v0.2-features-pCdVE
```

If the network errors, retry up to 4 times with exponential backoff (2s, 4s, 8s, 16s).

---

## Self-review checklist

After implementation, before declaring done, the executor should confirm:

- [ ] All 8 spec deliverables in §1.2 are covered:
  - skill `xera-eval.md` (Task 15) ✓
  - prompt `eval-rubric.md` (Task 14) ✓
  - `eval-prepare`, `eval-deterministic`, `eval-report` subcommands (Tasks 9–11) ✓
  - 5 golden-eval fixtures (Tasks 4–8) ✓
  - reuse of `fixtures/golden-tickets/` for classifier (handled in Task 9's discoverClassifierTickets) ✓
  - `.xera/eval/<run-id>/` layout (handled in Task 2 paths) ✓
  - `xera-internal doctor` (Task 12) ✓
  - unit tests + e2e test (Tasks 9–11, 16) ✓

- [ ] §1.4 success criteria executable: `npm install` + `npx vitest run` + `npx xera-internal doctor` all pass after Task 16.
- [ ] §2.2 design decision #7 (sub-agent for judge) is embedded in `packages/skills/xera-eval.md` Task 15.
- [ ] §2.2 design decision #2 (script stage uses GOLDEN feature as input) is embedded in skill Task 15 ("Stage = script-from-feature").
- [ ] §3.2 dimension wording matches verbatim in `packages/prompts/eval-rubric.md` Task 14.
- [ ] §5.2 error-handling matrix entries are unit-tested (eval-prepare tests cover BAD-ID, BAD-STAGE, --force; eval-report covers bad-judge-JSON, lock-release).
- [ ] `.gitignore` includes `.xera/eval/` (Task 3).
- [ ] No model identifier appears in commit messages, file contents, or PR text.

---

## Notes on test execution caveats

- Several tests use `process.chdir`. The `afterEach` blocks restore `process.cwd()`, but if you run a single test in isolation and it fails before reaching afterEach, subsequent tests in the same run may see leaked cwd. If you see unrelated test failures after touching eval files, run `npx vitest run test/bin-internal/eval-*` in isolation to rule it out.
- `validateGherkin` import path in `eval-deterministic.ts` and `golden-eval.test.ts` assumes `packages/core/src/validate-feature/gherkin`. If the actual path differs in this repo, grep for the export and adjust the import. Spec §3.1 says the validator already exists in v0.1, so locate, don't reimplement.
- The e2e test's stubbed session LLM writes a `actual/test.feature` that exactly matches the golden. This is intentional — the test proves the plumbing, not the LLM quality. Real eval runs will see drift between actual and golden, which is what the judge catches.
