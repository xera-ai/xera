export default {
  github: { repo: 'owner/repo' },
  adapters: ['http'] as const,
  http: {
    baseUrl: { dev: 'http://api.test.local' },
    defaultEnv: 'dev',
    auth: {
      strategy: 'reuse-web-session' as const,
      ttl: '8h',
      refreshBuffer: '30m',
      roles: {
        admin: {
          reuseWebSession: {
            domainContains: 'test.local',
            cookies: {
              access: { match: { regex: '_at$' } },
              refresh: { match: { regex: '_rt$' }, path: '/auth' },
              csrf: { match: { literal: 'xs_csrf' }, header: 'X-CSRF-Token' },
            },
          },
        },
      },
    },
  },
};
