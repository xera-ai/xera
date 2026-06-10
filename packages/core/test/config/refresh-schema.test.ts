import { describe, expect, test } from 'vitest';
import { XeraConfigSchema } from '../../src/config/schema';

const base = {
  github: { repo: 'owner/repo' },
  adapters: ['http' as const],
  http: {
    baseUrl: { dev: 'http://api.test' },
    defaultEnv: 'dev',
    auth: {
      strategy: 'reuse-web-session' as const,
      roles: {
        admin: {
          reuseWebSession: {
            domainContains: 'test',
            cookies: { access: { match: { regex: '_at$' } } },
          },
        },
      },
    },
  },
};

describe('reuseWebSession.refresh schema', () => {
  test('refresh is optional', () => {
    const cfg = XeraConfigSchema.parse(base);
    expect(cfg.http?.auth.roles.admin?.reuseWebSession?.refresh).toBeUndefined();
  });

  test('accepts refresh block with required endpoint + method default POST', () => {
    const cfg = XeraConfigSchema.parse({
      ...base,
      http: {
        ...base.http,
        auth: {
          ...base.http.auth,
          roles: {
            admin: {
              reuseWebSession: {
                domainContains: 'test',
                cookies: { access: { match: { regex: '_at$' } } },
                refresh: { endpoint: '/auth/refresh' },
              },
            },
          },
        },
      },
    });
    const r = cfg.http?.auth.roles.admin?.reuseWebSession?.refresh;
    expect(r?.endpoint).toBe('/auth/refresh');
    expect(r?.method).toBe('POST');
  });

  test('method accepts GET and POST, rejects PATCH', () => {
    const ok = XeraConfigSchema.safeParse({
      ...base,
      http: {
        ...base.http,
        auth: {
          ...base.http.auth,
          roles: {
            admin: {
              reuseWebSession: {
                domainContains: 'test',
                cookies: { access: { match: { regex: '_at$' } } },
                refresh: { endpoint: '/x', method: 'GET' },
              },
            },
          },
        },
      },
    });
    expect(ok.success).toBe(true);

    const bad = XeraConfigSchema.safeParse({
      ...base,
      http: {
        ...base.http,
        auth: {
          ...base.http.auth,
          roles: {
            admin: {
              reuseWebSession: {
                domainContains: 'test',
                cookies: { access: { match: { regex: '_at$' } } },
                refresh: { endpoint: '/x', method: 'PATCH' },
              },
            },
          },
        },
      },
    });
    expect(bad.success).toBe(false);
  });

  test('csrfHeader is optional', () => {
    const cfg = XeraConfigSchema.parse({
      ...base,
      http: {
        ...base.http,
        auth: {
          ...base.http.auth,
          roles: {
            admin: {
              reuseWebSession: {
                domainContains: 'test',
                cookies: { access: { match: { regex: '_at$' } } },
                refresh: { endpoint: '/x', csrfHeader: 'X-XSRF-Token' },
              },
            },
          },
        },
      },
    });
    expect(cfg.http?.auth.roles.admin?.reuseWebSession?.refresh?.csrfHeader).toBe('X-XSRF-Token');
  });
});
