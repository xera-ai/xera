import { describe, expect, test } from 'bun:test';
import { loadExpected, loadSnap } from '../../../../fixtures/golden-coverage/_helpers';
import { buildCoverageReport } from '../../src/coverage/report';
import { DEFAULT_COVERAGE_CONFIG } from '../../src/coverage/types';
import type { Snapshot } from '../../src/graph/types';

const now = new Date('2026-05-17T10:00:00.000Z');

describe('golden-coverage fixtures', () => {
  test('uncovered-only', () => {
    const snap = loadSnap('uncovered-only') as Snapshot;
    const expected = loadExpected('uncovered-only');
    const r = buildCoverageReport(snap, DEFAULT_COVERAGE_CONFIG, now);
    expect(r).toEqual(expected as ReturnType<typeof buildCoverageReport>);
  });

  test('mixed', () => {
    const snap = loadSnap('mixed') as Snapshot;
    const expected = loadExpected('mixed');
    const r = buildCoverageReport(snap, DEFAULT_COVERAGE_CONFIG, now);
    expect(r).toEqual(expected as ReturnType<typeof buildCoverageReport>);
  });

  test('critical-boost', () => {
    const snap = loadSnap('critical-boost') as Snapshot;
    const expected = loadExpected('critical-boost');
    const config = { ...DEFAULT_COVERAGE_CONFIG, criticalAreas: ['checkout'] };
    const r = buildCoverageReport(snap, config, now);
    expect(r).toEqual(expected as ReturnType<typeof buildCoverageReport>);
  });

  test('bug-history', () => {
    const snap = loadSnap('bug-history') as Snapshot;
    const expected = loadExpected('bug-history');
    const r = buildCoverageReport(snap, DEFAULT_COVERAGE_CONFIG, now);
    expect(r).toEqual(expected as ReturnType<typeof buildCoverageReport>);
  });

  test('stale-only', () => {
    const snap = loadSnap('stale-only') as Snapshot;
    const expected = loadExpected('stale-only');
    const r = buildCoverageReport(snap, DEFAULT_COVERAGE_CONFIG, now);
    expect(r).toEqual(expected as ReturnType<typeof buildCoverageReport>);
  });
});
