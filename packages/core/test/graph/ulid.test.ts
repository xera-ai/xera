import { describe, expect, test } from 'vitest';
import { ulid } from '../../src/graph/ulid';

describe('ulid', () => {
  test('produces 26-char output', () => {
    expect(ulid()).toHaveLength(26);
  });

  test('output uses crockford base32 alphabet only', () => {
    const id = ulid();
    expect(id).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/);
  });

  test('monotonic within same millisecond', () => {
    // Pin the timestamp so every call shares the same ms and bumps the random part.
    const fixedMs = Date.now();
    const ids = Array.from({ length: 10 }, () => ulid(fixedMs));
    // All IDs share the same timestamp prefix.
    const tsParts = ids.map((id) => id.slice(0, 10));
    expect(new Set(tsParts).size).toBe(1);
    // Random part must be strictly increasing (monotonic bump).
    const sorted = [...ids].sort();
    expect(sorted).toEqual(ids);
  });

  test('different timestamps produce sortable output', () => {
    const a = ulid(1000);
    const b = ulid(2000);
    expect(a < b).toBe(true);
  });
});
