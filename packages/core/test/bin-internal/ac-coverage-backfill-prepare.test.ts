import { describe, expect, test } from 'bun:test';
import { acCoverageBackfillPrepareCmd } from '../../src/bin-internal/ac-coverage-backfill-prepare';

describe('ac-coverage-backfill-prepare subcommand', () => {
  test('exports acCoverageBackfillPrepareCmd returning Promise<number>', () => {
    expect(typeof acCoverageBackfillPrepareCmd).toBe('function');
    const r = acCoverageBackfillPrepareCmd(['--help-stub']);
    expect(r).toBeInstanceOf(Promise);
  });
});
