import { describe, expect, test } from 'bun:test';
import { acCoverageBackfillFinalizeCmd } from '../../src/bin-internal/ac-coverage-backfill-finalize';

describe('ac-coverage-backfill-finalize subcommand', () => {
  test('exports acCoverageBackfillFinalizeCmd returning Promise<number>', () => {
    expect(typeof acCoverageBackfillFinalizeCmd).toBe('function');
    const r = acCoverageBackfillFinalizeCmd(['--help-stub']);
    expect(r).toBeInstanceOf(Promise);
  });
});
