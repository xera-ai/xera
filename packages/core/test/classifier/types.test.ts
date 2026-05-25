import { describe, expect, test } from 'vitest';
import type { Classification } from '../../src/artifact/status';

describe('Classification enum', () => {
  test('includes v0.7 buckets', () => {
    const buckets: Classification[] = [
      'PASS',
      'REAL_BUG',
      'TEST_BUG',
      'SELECTOR_DRIFT',
      'FLAKY',
      'TEST_OUTDATED',
      'CONTRACT_DRIFT',
      'RATE_LIMITED',
      'AUTH_EXPIRED',
    ];
    expect(buckets).toContain('CONTRACT_DRIFT');
    expect(buckets).toContain('RATE_LIMITED');
    expect(buckets).toContain('AUTH_EXPIRED');
  });
});
