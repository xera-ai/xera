import { describe, expect, test } from 'bun:test';
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
