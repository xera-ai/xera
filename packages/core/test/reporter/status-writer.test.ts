import { describe, expect, test } from 'bun:test';
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
