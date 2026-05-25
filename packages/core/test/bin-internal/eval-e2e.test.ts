import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
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
  for (const p of [
    'feature-from-story',
    'script-from-feature',
    'diagnose-failure',
    'eval-rubric',
  ]) {
    writeFileSync(
      join(root, `packages/prompts/${p}.md`),
      `---\nid: ${p}\nversion: 1.0.0\n---\nbody`,
    );
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
