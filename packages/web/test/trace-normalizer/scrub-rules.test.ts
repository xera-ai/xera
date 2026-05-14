import { describe, expect, test } from 'bun:test';
import {
  SENSITIVE_HEADERS,
  SENSITIVE_BODY_KEYS,
  JWT_RE,
  CREDIT_CARD_RE,
  scrubHeaders,
  scrubBodyJson,
  scrubFreeText,
} from '../../src/trace-normalizer/scrub-rules';

describe('SENSITIVE_HEADERS', () => {
  test('includes lowercase Authorization, Cookie, etc.', () => {
    expect(SENSITIVE_HEADERS).toContain('authorization');
    expect(SENSITIVE_HEADERS).toContain('cookie');
    expect(SENSITIVE_HEADERS).toContain('set-cookie');
    expect(SENSITIVE_HEADERS).toContain('x-api-key');
    expect(SENSITIVE_HEADERS).toContain('x-auth-token');
  });
});

describe('scrubHeaders', () => {
  test('replaces sensitive header values with [REDACTED]', () => {
    const r = scrubHeaders({ Authorization: 'Bearer abc', 'content-type': 'application/json' });
    expect(r.Authorization).toBe('[REDACTED]');
    expect(r['content-type']).toBe('application/json');
  });
  test('case-insensitive', () => {
    const r = scrubHeaders({ AUTHORIZATION: 'x', cookie: 'y' });
    expect(r.AUTHORIZATION).toBe('[REDACTED]');
    expect(r.cookie).toBe('[REDACTED]');
  });
});

describe('scrubBodyJson', () => {
  test('masks password/token/secret/apiKey fields', () => {
    const r = scrubBodyJson({ email: 'a@b.com', password: 'p', token: 't', other: 'ok' });
    expect(r.password).toBe('[REDACTED]');
    expect(r.token).toBe('[REDACTED]');
    expect(r.email).toBe('a@b.com');
    expect(r.other).toBe('ok');
  });
  test('case-insensitive nested fields', () => {
    const r = scrubBodyJson({ outer: { ApiKey: 'k', NESTED: { secret: 's' } } }) as Record<string, any>;
    expect(r.outer.ApiKey).toBe('[REDACTED]');
    expect(r.outer.NESTED.secret).toBe('[REDACTED]');
  });
  test('handles arrays', () => {
    const r = scrubBodyJson([{ password: 'p' }, { ok: 1 }]) as Array<Record<string, unknown>>;
    expect(r[0]!.password).toBe('[REDACTED]');
  });
});

describe('JWT and credit-card regex', () => {
  test('JWT_RE matches three-part token', () => {
    expect(JWT_RE.test('eyJhbGciOi.eyJzdWIiOi.SflKxw')).toBe(true);
    expect(JWT_RE.test('eyJhbGciOi')).toBe(false);
  });
  test('CREDIT_CARD_RE matches 16-digit groups with optional spaces/dashes', () => {
    expect(CREDIT_CARD_RE.test('4111 1111 1111 1111')).toBe(true);
    expect(CREDIT_CARD_RE.test('4111-1111-1111-1111')).toBe(true);
    expect(CREDIT_CARD_RE.test('4111111111111111')).toBe(true);
    expect(CREDIT_CARD_RE.test('1234')).toBe(false);
  });
});

describe('scrubFreeText', () => {
  test('replaces JWT in free text', () => {
    expect(scrubFreeText('token=eyJhbGciOi.eyJzdWIiOi.SflKxw end')).not.toContain('SflKxw');
  });
  test('replaces credit card in free text', () => {
    expect(scrubFreeText('card 4111 1111 1111 1111 charged')).not.toContain('4111 1111 1111 1111');
  });
});
