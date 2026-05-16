import { describe, test, expect } from 'bun:test';
import { classifyAuthExpired } from '../../src/classifier/auth-expired';
import type { HttpCallSummary } from '../../src/classifier/rate-limited';

const expiredJwt = () => {
  const past = Math.floor(Date.now() / 1000) - 60;
  const payload = Buffer.from(JSON.stringify({ exp: past })).toString('base64url');
  return `eyJhbGciOiJIUzI1NiJ9.${payload}.fake-sig`;
};

const freshJwt = () => {
  const future = Math.floor(Date.now() / 1000) + 3600;
  const payload = Buffer.from(JSON.stringify({ exp: future })).toString('base64url');
  return `eyJhbGciOiJIUzI1NiJ9.${payload}.fake-sig`;
};

describe('classifyAuthExpired', () => {
  test('returns AUTH_EXPIRED on 401 with expired JWT in auth file', () => {
    const calls: HttpCallSummary[] = [{ status: 401, method: 'GET', url: '/users' }];
    const out = classifyAuthExpired({
      calls,
      authFiles: {
        user: {
          token: expiredJwt(),
          type: 'bearer',
          expires_at: new Date(Date.now() - 1000).toISOString(),
        },
      },
    });
    expect(out?.class).toBe('AUTH_EXPIRED');
    expect(out?.rationale).toContain('user');
  });

  test('returns null on 401 with fresh JWT (real bug path)', () => {
    const calls: HttpCallSummary[] = [{ status: 401, method: 'GET', url: '/users' }];
    expect(
      classifyAuthExpired({
        calls,
        authFiles: {
          user: {
            token: freshJwt(),
            type: 'bearer',
            expires_at: new Date(Date.now() + 1e6).toISOString(),
          },
        },
      }),
    ).toBeNull();
  });

  test('returns null when no 401 captured even if auth file expired', () => {
    const calls: HttpCallSummary[] = [{ status: 200, method: 'GET', url: '/x' }];
    expect(
      classifyAuthExpired({
        calls,
        authFiles: {
          user: {
            token: expiredJwt(),
            type: 'bearer',
            expires_at: new Date(Date.now() - 1000).toISOString(),
          },
        },
      }),
    ).toBeNull();
  });

  test('returns null when no auth files registered', () => {
    expect(classifyAuthExpired({ calls: [{ status: 401, method: 'GET', url: '/x' }], authFiles: {} })).toBeNull();
  });

  test('detects expiry via file expires_at even without JWT exp', () => {
    const calls: HttpCallSummary[] = [{ status: 401, method: 'GET', url: '/x' }];
    const out = classifyAuthExpired({
      calls,
      authFiles: {
        user: { token: 'opaque-token-no-jwt', type: 'bearer', expires_at: new Date(Date.now() - 1000).toISOString() },
      },
    });
    expect(out?.class).toBe('AUTH_EXPIRED');
  });
});
