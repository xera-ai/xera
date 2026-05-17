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
});
