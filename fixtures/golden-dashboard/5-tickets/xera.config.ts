export default {
  github: { repo: 'owner/test' },
  adapters: ['web' as const],
  web: { baseUrl: { dev: 'http://test.local' }, defaultEnv: 'dev', auth: {} },
  coverage: { criticalAreas: ['checkout'] },
  dashboard: { staleAfterDays: 7 },
};
