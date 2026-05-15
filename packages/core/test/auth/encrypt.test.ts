import { describe, expect, test } from 'bun:test';
import { decrypt, encrypt, generateKey } from '../../src/auth/encrypt';

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
    // Decode the ct portion, flip all bits in the first byte, re-encode.
    // The previous `slice + char swap` approach was probabilistically flaky:
    // ~6% of random ciphertexts decoded to identical bytes after the swap
    // (when the removed base64 char's first 4 bits were 0000, matching 'A'),
    // making GCM verification erroneously succeed. Byte-level tampering
    // guarantees the ct bytes change, so GCM auth MUST detect it.
    const parts = ct.split(':');
    const ctBytes = Buffer.from(parts[3]!, 'base64');
    ctBytes[0] = (ctBytes[0]! ^ 0xff) & 0xff;
    parts[3] = ctBytes.toString('base64');
    const tampered = parts.join(':');
    expect(() => decrypt(tampered, k)).toThrow();
  });

  test('generateKey returns 64-hex-char string', () => {
    const k = generateKey();
    expect(k).toMatch(/^[0-9a-f]{64}$/);
  });
});
