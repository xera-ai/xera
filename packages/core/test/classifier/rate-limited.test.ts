import { describe, expect, test } from 'bun:test';
import { classifyRateLimited, type HttpCallSummary } from '../../src/classifier/rate-limited';

describe('classifyRateLimited', () => {
  test('returns RATE_LIMITED when any captured call has status 429', () => {
    const calls: HttpCallSummary[] = [
      { status: 200, method: 'GET', url: '/x' },
      { status: 429, method: 'POST', url: '/orders' },
    ];
    expect(classifyRateLimited({ calls })).toEqual({
      class: 'RATE_LIMITED',
      rationale: 'Captured HTTP 429 on POST /orders',
    });
  });

  test('returns null when no 429 present', () => {
    const calls: HttpCallSummary[] = [{ status: 200, method: 'GET', url: '/x' }];
    expect(classifyRateLimited({ calls })).toBeNull();
  });

  test('returns null with no calls', () => {
    expect(classifyRateLimited({ calls: [] })).toBeNull();
  });

  test('returns first 429 when multiple are present (deterministic)', () => {
    const calls: HttpCallSummary[] = [
      { status: 429, method: 'POST', url: '/a' },
      { status: 429, method: 'GET', url: '/b' },
    ];
    expect(classifyRateLimited({ calls })?.rationale).toContain('POST /a');
  });
});
