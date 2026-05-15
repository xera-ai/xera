import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { evalReportCmd } from '../../src/bin-internal/eval-report';
import type { Manifest } from '../../src/eval/types';
import { acquireLock } from '../../src/lock/file-lock';

const manifest: Manifest = {
  run_id: 'rid-1',
  started_at: '2026-05-20T00:00:00Z',
  git_sha: 'abc',
  tickets: ['EVAL-001'],
  stages: ['feature-from-story'],
  ticket_stages: { 'EVAL-001': ['feature-from-story'] },
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
        entries: [
          {
            ticket: 'EVAL-001',
            stage: 'feature-from-story',
            passed: true,
            checks: ['validate-feature'],
          },
        ],
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
        entries: [
          {
            ticket: 'EVAL-001',
            stage: 'feature-from-story',
            passed: true,
            checks: ['validate-feature'],
          },
        ],
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
        entries: [
          {
            ticket: 'EVAL-001',
            stage: 'feature-from-story',
            passed: false,
            checks: ['validate-feature'],
            error: 'actual missing: test.feature',
          },
        ],
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
      {
        run_id: 'rid-1',
        entries: [
          {
            ticket: 'EVAL-001',
            stage: 'feature-from-story',
            passed: true,
            checks: ['validate-feature'],
          },
        ],
      },
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
      {
        run_id: 'rid-1',
        entries: [
          {
            ticket: 'EVAL-001',
            stage: 'feature-from-story',
            passed: true,
            checks: ['validate-feature'],
          },
        ],
      },
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

  test('releases lock on bad judge JSON (exit 2)', async () => {
    seedRun(
      cwd,
      'rid-1',
      {
        run_id: 'rid-1',
        entries: [
          {
            ticket: 'EVAL-001',
            stage: 'feature-from-story',
            passed: true,
            checks: ['validate-feature'],
          },
        ],
      },
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
    expect(existsSync(join(cwd, '.xera/eval/rid-1/.lock'))).toBe(true);
    const orig = console.error;
    console.error = () => {};
    try {
      const exit = await evalReportCmd(['rid-1']);
      expect(exit).toBe(2);
    } finally {
      console.error = orig;
    }
    expect(existsSync(join(cwd, '.xera/eval/rid-1/.lock'))).toBe(false);
  });
});
