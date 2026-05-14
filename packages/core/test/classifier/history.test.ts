import { describe, expect, test } from 'bun:test';
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
