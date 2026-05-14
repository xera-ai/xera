import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parsePlaywrightReport } from '../../src/trace-normalizer/parse';

describe('parsePlaywrightReport', () => {
  test('PASS report', () => {
    const json = JSON.parse(readFileSync(join(__dirname, 'fixtures/report-pass.json'), 'utf8'));
    const parsed = parsePlaywrightReport(json, 'r1');
    expect(parsed.outcome).toBe('PASS');
    expect(parsed.scenarios.map(s => s.outcome)).toEqual(['PASS', 'PASS']);
  });

  test('FAIL report extracts error + screenshot path', () => {
    const json = JSON.parse(readFileSync(join(__dirname, 'fixtures/report-fail.json'), 'utf8'));
    const parsed = parsePlaywrightReport(json, 'r1');
    expect(parsed.outcome).toBe('FAIL');
    const failing = parsed.scenarios.find(s => s.outcome === 'FAIL')!;
    expect(failing.failure?.errorMessage).toContain('Invalid');
    expect(failing.failure?.screenshotPath).toBe('screenshots/scenario-2-failure.png');
  });
});
