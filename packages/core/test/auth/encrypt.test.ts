import { describe, expect, test } from 'bun:test';
import { encrypt, decrypt, generateKey } from '../../src/auth/encrypt';

describe('AES-256-GCM helpers', () => {
  test('round-trips plaintext', () => {
    const key = generateKey();
    const ct = encrypt('hello world', key);
    expect(ct.startsWith('v1:')).toBe(true);
    expect(decrypt(ct, key)).toBe('hello world');
  });

  test('different keys produce different ciphertext for same plaintext', () => {
    const k1 = generateKey();
    const k2 = generateKey();
    expect(encrypt('x', k1)).not.toBe(encrypt('x', k2));
  });

  test('decrypt with wrong key throws', () => {
    const k1 = generateKey();
    const k2 = generateKey();
    const ct = encrypt('hello', k1);
    expect(() => decrypt(ct, k2)).toThrow();
  });

  test('tampered ciphertext throws (GCM auth)', () => {
    const k = generateKey();
    const ct = encrypt('hello', k);
    const tampered = ct.slice(0, -2) + (ct.endsWith('A') ? 'B' : 'A');
    expect(() => decrypt(tampered, k)).toThrow();
  });

  test('generateKey returns 64-hex-char string', () => {
    const k = generateKey();
    expect(k).toMatch(/^[0-9a-f]{64}$/);
  });
});
