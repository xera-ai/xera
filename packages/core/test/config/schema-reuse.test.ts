import { describe, expect, test } from 'vitest';
import { XeraConfigSchema } from '../../src/config/schema';

const base = {
  github: { repo: 'owner/repo' },
  web: { baseUrl: { dev: 'http://example.test' }, defaultEnv: 'dev', auth: {} },
};

describe('http.auth reuse-web-session schema', () => {
  test('strategy enum accepts reuse-web-session', () => {
    const cfg = XeraConfigSchema.parse({
      ...base,
      http: {
        baseUrl: { dev: 'http://example.test' },
        defaultEnv: 'dev',
        auth: {
          strategy: 'reuse-web-session',
          roles: {
            admin: {
              reuseWebSession: {
                domainContains: 'x.com',
                cookies: {
                  access: { match: { regex: '_at$' } },
                  refresh: { match: { glob: '*_rt' }, path: '/auth' },
                  csrf: { match: { literal: 'xs_csrf' }, header: 'X-CSRF-Token' },
                },
              },
            },
          },
        },
      },
    });
    expect(cfg.http?.auth.strategy).toBe('reuse-web-session');
    expect(cfg.http?.auth.roles.admin?.reuseWebSession?.cookies.access.driveExpiry).toBe(true);
  });

  test('superRefine errors when strategy=reuse-web-session but role lacks reuseWebSession', () => {
    const r = XeraConfigSchema.safeParse({
      ...base,
      http: {
        baseUrl: { dev: 'http://example.test' },
        defaultEnv: 'dev',
        auth: { strategy: 'reuse-web-session', roles: { admin: {} } },
      },
    });
    expect(r.success).toBe(false);
    if (!r.success) {
      const msg = JSON.stringify(r.error.format());
      expect(msg).toContain('reuseWebSession');
      expect(msg).toContain('admin');
    }
  });

  test('csrf.header is required when csrf is present', () => {
    const r = XeraConfigSchema.safeParse({
      ...base,
      http: {
        baseUrl: { dev: 'http://example.test' },
        defaultEnv: 'dev',
        auth: {
          strategy: 'reuse-web-session',
          roles: {
            admin: {
              reuseWebSession: {
                domainContains: 'x.com',
                cookies: {
                  access: { match: { regex: '_at$' } },
                  csrf: { match: { literal: 'xs_csrf' } },
                },
              },
            },
          },
        },
      },
    });
    expect(r.success).toBe(false);
  });
});
