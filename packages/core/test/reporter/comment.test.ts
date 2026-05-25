import { describe, expect, test } from 'vitest';
import { buildComment } from '../../src/reporter/comment';

describe('buildComment', () => {
  test('PASS comment is short and green', () => {
    const md = buildComment({
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
    const md = buildComment({
      ticket: 'JIRA-1',
      runId: '2026-05-14T10-30-00',
      overall: 'REAL_BUG',
      overallConfidence: 'high',
      scenarios: [
        { name: 'Login OK', outcome: 'PASS', class: 'PASS', confidence: 'high', rationale: '' },
        {
          name: 'Login fail bad password',
          outcome: 'FAIL',
          class: 'REAL_BUG',
          confidence: 'high',
          rationale: 'POST /api/login returned 500 instead of 401 with error message.',
        },
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
