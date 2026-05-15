import { describe, expect, test } from 'bun:test';
import {
  DeterministicScoresSchema,
  JudgmentSchema,
  ManifestSchema,
  type Stage,
  SummarySchema,
} from '../../src/eval/types';

describe('eval types', () => {
  test('ManifestSchema parses a valid manifest', () => {
    const m = {
      run_id: '20260520-103045-a1b2c3d',
      started_at: '2026-05-20T10:30:45Z',
      git_sha: 'a1b2c3d',
      tickets: ['EVAL-001'],
      stages: ['feature-from-story'] as Stage[],
      ticket_stages: { 'EVAL-001': ['feature-from-story'] as Stage[] },
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
      ticket_stages: { 'EVAL-001': ['unknown-stage'] },
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

  test('ManifestSchema requires ticket_stages field', () => {
    const bad = {
      run_id: '20260520-103045-a1b2c3d',
      started_at: '2026-05-20T10:30:45Z',
      git_sha: 'a1b2c3d',
      tickets: ['EVAL-001'],
      stages: ['feature-from-story'] as Stage[],
      // ticket_stages intentionally omitted
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

  test('ManifestSchema rejects ticket_stages with invalid stage value', () => {
    const bad = {
      run_id: '20260520-103045-a1b2c3d',
      started_at: '2026-05-20T10:30:45Z',
      git_sha: 'a1b2c3d',
      tickets: ['EVAL-001'],
      stages: ['feature-from-story'] as Stage[],
      ticket_stages: { 'EVAL-001': ['not-a-stage'] },
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
        {
          ticket: 'EVAL-001',
          stage: 'feature-from-story' as Stage,
          passed: false,
          checks: ['validate-feature'],
          error: 'gherkin parse error at line 4',
        },
        {
          ticket: 'EVAL-002',
          stage: 'feature-from-story' as Stage,
          passed: true,
          checks: ['validate-feature'],
        },
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
