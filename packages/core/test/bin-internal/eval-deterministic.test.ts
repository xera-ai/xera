import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
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

const baseManifest = (
  ticketStages: Record<string, Manifest['stages']>,
  stages: Manifest['stages'],
): Manifest => ({
  run_id: 'rid-1',
  started_at: '2026-05-20T00:00:00Z',
  git_sha: 'abc',
  tickets: Object.keys(ticketStages),
  stages,
  ticket_stages: ticketStages,
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
    const m = baseManifest({ 'EVAL-001': ['feature-from-story'] }, ['feature-from-story']);
    seedRun(cwd, 'rid-1', m);
    mkdirSync(join(cwd, '.xera/eval/rid-1/actual/EVAL-001'));
    writeFileSync(
      join(cwd, '.xera/eval/rid-1/actual/EVAL-001/test.feature'),
      'Feature: x\n  Scenario: y\n    Given z\n',
    );
    const exit = await evalDeterministicCmd(['rid-1']);
    expect(exit).toBe(0);
    const scores = JSON.parse(
      readFileSync(join(cwd, '.xera/eval/rid-1/deterministic-scores.json'), 'utf8'),
    );
    expect(scores.entries).toHaveLength(1);
    expect(scores.entries[0].passed).toBe(true);
    expect(scores.entries[0].checks).toContain('validate-feature');
  });

  test('records error on invalid gherkin without short-circuiting other tickets', async () => {
    const m = baseManifest(
      { 'EVAL-001': ['feature-from-story'], 'EVAL-002': ['feature-from-story'] },
      ['feature-from-story'],
    );
    seedRun(cwd, 'rid-1', m);
    mkdirSync(join(cwd, '.xera/eval/rid-1/actual/EVAL-001'));
    mkdirSync(join(cwd, '.xera/eval/rid-1/actual/EVAL-002'));
    writeFileSync(join(cwd, '.xera/eval/rid-1/actual/EVAL-001/test.feature'), 'not gherkin');
    writeFileSync(
      join(cwd, '.xera/eval/rid-1/actual/EVAL-002/test.feature'),
      'Feature: x\n  Scenario: y\n    Given z\n',
    );
    const exit = await evalDeterministicCmd(['rid-1']);
    expect(exit).toBe(0); // never bails — judge always still runs
    const scores = JSON.parse(
      readFileSync(join(cwd, '.xera/eval/rid-1/deterministic-scores.json'), 'utf8'),
    );
    const e1 = scores.entries.find((e: any) => e.ticket === 'EVAL-001');
    const e2 = scores.entries.find((e: any) => e.ticket === 'EVAL-002');
    expect(e1.passed).toBe(false);
    expect(typeof e1.error).toBe('string');
    expect(e2.passed).toBe(true);
  });

  test('marks missing actual as passed=false with explicit error', async () => {
    const m = baseManifest({ 'EVAL-001': ['feature-from-story'] }, ['feature-from-story']);
    seedRun(cwd, 'rid-1', m);
    // No actual/EVAL-001/test.feature written.
    const exit = await evalDeterministicCmd(['rid-1']);
    expect(exit).toBe(0);
    const scores = JSON.parse(
      readFileSync(join(cwd, '.xera/eval/rid-1/deterministic-scores.json'), 'utf8'),
    );
    expect(scores.entries[0].passed).toBe(false);
    expect(scores.entries[0].error).toContain('actual missing');
  });

  test('classifier stage: bucket equality with golden', async () => {
    const m = baseManifest({ 'GOLD-001': ['diagnose-failure'] }, ['diagnose-failure']);
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
    writeFileSync(
      join(cwd, '.xera/eval/rid-1/inputs/GOLD-001/classifier-input.json'),
      JSON.stringify(goldenInput),
    );
    writeFileSync(
      join(cwd, '.xera/eval/rid-1/actual/GOLD-001/classification.json'),
      JSON.stringify({
        runId: 'r',
        scenarios: [
          { name: 'a', outcome: 'PASS', class: 'PASS', confidence: 'high', rationale: 'r' },
        ],
        scenarioCounts: { total: 1, passed: 1, failed: 0, skipped: 0 },
      }),
    );
    const exit = await evalDeterministicCmd(['rid-1']);
    expect(exit).toBe(0);
    const scores = JSON.parse(
      readFileSync(join(cwd, '.xera/eval/rid-1/deterministic-scores.json'), 'utf8'),
    );
    expect(scores.entries[0].passed).toBe(true);
    expect(scores.entries[0].checks).toContain('bucket-match');
  });

  test('classifier stage: bucket mismatch records failure', async () => {
    const m = baseManifest({ 'GOLD-001': ['diagnose-failure'] }, ['diagnose-failure']);
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
    const scores = JSON.parse(
      readFileSync(join(cwd, '.xera/eval/rid-1/deterministic-scores.json'), 'utf8'),
    );
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

  test('respects per-ticket stages — EVAL ticket with only feature-from-story NOT iterated for script-from-feature', async () => {
    // Global stages includes both, but ticket_stages restricts EVAL-005 to feature-from-story only.
    const m = baseManifest({ 'EVAL-005': ['feature-from-story'] }, [
      'feature-from-story',
      'script-from-feature',
    ]);
    seedRun(cwd, 'rid-1', m);
    mkdirSync(join(cwd, '.xera/eval/rid-1/actual/EVAL-005'));
    writeFileSync(
      join(cwd, '.xera/eval/rid-1/actual/EVAL-005/test.feature'),
      'Feature: x\n  Scenario: y\n    Given z\n',
    );
    const exit = await evalDeterministicCmd(['rid-1']);
    expect(exit).toBe(0);
    const scores = JSON.parse(
      readFileSync(join(cwd, '.xera/eval/rid-1/deterministic-scores.json'), 'utf8'),
    );
    // Only 1 entry: feature-from-story. No script-from-feature entry despite being in global stages.
    expect(scores.entries).toHaveLength(1);
    expect(scores.entries[0].stage).toBe('feature-from-story');
    expect(scores.entries[0].ticket).toBe('EVAL-005');
    expect(
      scores.entries.find((e: { stage: string }) => e.stage === 'script-from-feature'),
    ).toBeUndefined();
  });
});
