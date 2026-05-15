import { describe, expect, test } from 'bun:test';
import {
  CREDIT_CARD_RE,
  EMAIL_RE,
  JWT_RE,
  PHONE_RE,
  SENSITIVE_BODY_KEYS,
  SENSITIVE_HEADERS,
  scrubBodyJson,
  scrubFreeText,
  scrubHeaders,
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
    // Use a non-PII string for the email field value so scrubFreeText does not redact it.
    const r = scrubBodyJson({ email: 'plaintext-user', password: 'p', token: 't', other: 'ok' });
    expect(r.password).toBe('[REDACTED]');
    expect(r.token).toBe('[REDACTED]');
    expect(r.email).toBe('plaintext-user');
    expect(r.other).toBe('ok');
  });
  test('case-insensitive nested fields', () => {
    const r = scrubBodyJson({ outer: { ApiKey: 'k', NESTED: { secret: 's' } } }) as Record<
      string,
      any
    >;
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

describe('EMAIL_RE', () => {
  test('matches standard email addresses', () => {
    expect(EMAIL_RE.test('alice@example.com')).toBe(true);
    expect(EMAIL_RE.test('user.name+tag@sub.domain.io')).toBe(true);
    expect(EMAIL_RE.test('x@y.co')).toBe(true);
  });
  test('does not match non-email strings', () => {
    expect(EMAIL_RE.test('notanemail')).toBe(false);
    expect(EMAIL_RE.test('@nodomain')).toBe(false);
    expect(EMAIL_RE.test('missing@')).toBe(false);
  });
});

describe('PHONE_RE', () => {
  test('matches E.164-style and formatted phone numbers', () => {
    expect(PHONE_RE.test('+1 (415) 555-1234')).toBe(true);
    expect(PHONE_RE.test('07700 900 123')).toBe(true);
    expect(PHONE_RE.test('+447911123456')).toBe(true);
  });
  test('does not match short numeric strings', () => {
    expect(PHONE_RE.test('12345')).toBe(false);
    expect(PHONE_RE.test('#999')).toBe(false);
  });
});

describe('scrubFreeText', () => {
  test('replaces JWT in free text', () => {
    expect(scrubFreeText('token=eyJhbGciOi.eyJzdWIiOi.SflKxw end')).not.toContain('SflKxw');
  });
  test('replaces credit card in free text', () => {
    expect(scrubFreeText('card 4111 1111 1111 1111 charged')).not.toContain('4111 1111 1111 1111');
  });
  test('replaces email addresses', () => {
    expect(scrubFreeText('Contact alice@example.com please')).not.toContain('alice@example.com');
    expect(scrubFreeText('Contact alice@example.com please')).toContain('[REDACTED]');
  });
  test('replaces multiple emails in one string', () => {
    const result = scrubFreeText('From alice@a.com to bob@b.com via charlie@c.com');
    expect(result).not.toContain('alice@a.com');
    expect(result).not.toContain('bob@b.com');
    expect(result).not.toContain('charlie@c.com');
  });
  test('replaces e164-style phone numbers', () => {
    expect(scrubFreeText('Call +1 (415) 555-1234 today')).not.toContain('(415) 555-1234');
    expect(scrubFreeText('Call +1 (415) 555-1234 today')).toContain('[REDACTED]');
  });
  test('does not over-redact short numeric strings', () => {
    expect(scrubFreeText('Order #12345 confirmed')).toContain('12345');
  });
});
