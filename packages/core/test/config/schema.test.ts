import { describe, expect, test } from 'bun:test';
import { XeraConfigSchema } from '../../src/config/schema';

function validBase() {
  return {
    jira: {
      baseUrl: 'https://example.atlassian.net',
      projectKeys: ['PROJ'],
      fields: { story: 'description' },
    },
    web: {
      baseUrl: { local: 'http://localhost:3000' },
      defaultEnv: 'local',
    },
    adapters: ['web'],
  };
}

describe('XeraConfigSchema.coverage', () => {
  test('coverage block is optional; defaults fill when absent', () => {
    const parsed = XeraConfigSchema.parse(validBase());
    expect(parsed.coverage).toEqual({
      staleAfterDays: 30,
      criticalAreas: [],
      autoSnapshotOnCoverage: true,
    });
  });

  test('user-supplied coverage overrides defaults', () => {
    const parsed = XeraConfigSchema.parse({
      ...validBase(),
      coverage: {
        staleAfterDays: 14,
        criticalAreas: ['checkout', 'auth'],
        autoSnapshotOnCoverage: false,
      },
    });
    expect(parsed.coverage.staleAfterDays).toBe(14);
    expect(parsed.coverage.criticalAreas).toEqual(['checkout', 'auth']);
    expect(parsed.coverage.autoSnapshotOnCoverage).toBe(false);
  });

  test('rejects negative staleAfterDays', () => {
    expect(() =>
      XeraConfigSchema.parse({
        ...validBase(),
        coverage: { staleAfterDays: -1 },
      }),
    ).toThrow();
  });

  test('rejects criticalAreas containing non-slug strings', () => {
    expect(() =>
      XeraConfigSchema.parse({
        ...validBase(),
        coverage: { criticalAreas: ['Has Space'] },
      }),
    ).toThrow();
  });
});

const MIN_VALID = {
  jira: {
    baseUrl: 'https://x.atlassian.net',
    projectKeys: ['JIRA'],
    fields: { story: 'description' },
  },
  web: {
    baseUrl: { dev: 'https://staging.example.com' },
    defaultEnv: 'dev',
  },
};

describe('XeraConfigSchema run.autoImpact', () => {
  test('defaults to enabled=true, threshold=8.0', () => {
    const parsed = XeraConfigSchema.parse(MIN_VALID);
    expect(parsed.run?.autoImpact?.enabled).toBe(true);
    expect(parsed.run?.autoImpact?.threshold).toBe(8.0);
  });

  test('accepts custom threshold', () => {
    const parsed = XeraConfigSchema.parse({
      ...MIN_VALID,
      run: { autoImpact: { enabled: true, threshold: 8.5 } },
    });
    expect(parsed.run?.autoImpact?.threshold).toBe(8.5);
  });

  test('accepts disabled autoImpact', () => {
    const parsed = XeraConfigSchema.parse({
      ...MIN_VALID,
      run: { autoImpact: { enabled: false, threshold: 6.0 } },
    });
    expect(parsed.run?.autoImpact?.enabled).toBe(false);
  });

  test('rejects negative threshold', () => {
    expect(() =>
      XeraConfigSchema.parse({
        ...MIN_VALID,
        run: { autoImpact: { enabled: true, threshold: -1 } },
      }),
    ).toThrow();
  });
});

describe('XeraConfigSchema', () => {
  test('accepts minimal valid config', () => {
    const config = {
      jira: {
        baseUrl: 'https://example.atlassian.net',
        projectKeys: ['JIRA'],
        fields: { story: 'description' },
      },
      web: {
        baseUrl: { staging: 'https://staging.example.com' },
        defaultEnv: 'staging',
      },
      adapters: ['web'],
    };
    const result = XeraConfigSchema.safeParse(config);
    expect(result.success).toBe(true);
  });

  test('rejects empty projectKeys', () => {
    const result = XeraConfigSchema.safeParse({
      jira: {
        baseUrl: 'https://x.atlassian.net',
        projectKeys: [],
        fields: { story: 'description' },
      },
      web: { baseUrl: { staging: 'https://x.com' }, defaultEnv: 'staging' },
      adapters: ['web'],
    });
    expect(result.success).toBe(false);
  });

  test('rejects defaultEnv not present in baseUrl map', () => {
    const result = XeraConfigSchema.safeParse({
      jira: {
        baseUrl: 'https://x.atlassian.net',
        projectKeys: ['X'],
        fields: { story: 'description' },
      },
      web: { baseUrl: { staging: 'https://x.com' }, defaultEnv: 'prod' },
      adapters: ['web'],
    });
    expect(result.success).toBe(false);
  });

  test('auth strategy default is "none"', () => {
    const parsed = XeraConfigSchema.parse({
      jira: {
        baseUrl: 'https://x.atlassian.net',
        projectKeys: ['X'],
        fields: { story: 'description' },
      },
      web: { baseUrl: { staging: 'https://x.com' }, defaultEnv: 'staging' },
      adapters: ['web'],
    });
    expect(parsed.web?.auth.strategy).toBe('none');
  });
});

describe('XeraConfigSchema http block', () => {
  test('http block validates with bearer strategy and roles', () => {
    const parsed = XeraConfigSchema.parse({
      jira: {
        baseUrl: 'https://x.atlassian.net',
        projectKeys: ['PROJ'],
        fields: { story: 'description' },
      },
      http: {
        baseUrl: { dev: 'https://api.dev.x.com' },
        defaultEnv: 'dev',
        auth: {
          strategy: 'bearer',
          roles: { admin: { tokenEnv: 'ADMIN_BEARER_TOKEN' } },
        },
      },
      adapters: ['http'],
    });
    expect(parsed.http?.auth.strategy).toBe('bearer');
    expect(parsed.http?.auth.roles.admin?.tokenEnv).toBe('ADMIN_BEARER_TOKEN');
  });

  test('http block rejects defaultEnv not in baseUrl', () => {
    expect(() =>
      XeraConfigSchema.parse({
        jira: {
          baseUrl: 'https://x.atlassian.net',
          projectKeys: ['PROJ'],
          fields: { story: 'description' },
        },
        http: {
          baseUrl: { dev: 'https://api.dev.x.com' },
          defaultEnv: 'prod',
          auth: { strategy: 'none' },
        },
        adapters: ['http'],
      }),
    ).toThrow();
  });

  test('web becomes optional; http alone is valid', () => {
    const parsed = XeraConfigSchema.parse({
      jira: {
        baseUrl: 'https://x.atlassian.net',
        projectKeys: ['PROJ'],
        fields: { story: 'description' },
      },
      http: {
        baseUrl: { dev: 'https://api.dev.x.com' },
        defaultEnv: 'dev',
        auth: { strategy: 'none' },
      },
      adapters: ['http'],
    });
    expect(parsed.web).toBeUndefined();
    expect(parsed.http).toBeDefined();
  });

  test('rejects config with neither web nor http', () => {
    expect(() =>
      XeraConfigSchema.parse({
        jira: {
          baseUrl: 'https://x.atlassian.net',
          projectKeys: ['PROJ'],
          fields: { story: 'description' },
        },
        adapters: ['web'],
      }),
    ).toThrow(/At least one of/);
  });

  test('rejects adapters that reference unconfigured adapter', () => {
    expect(() =>
      XeraConfigSchema.parse({
        jira: {
          baseUrl: 'https://x.atlassian.net',
          projectKeys: ['PROJ'],
          fields: { story: 'description' },
        },
        web: {
          baseUrl: { dev: 'https://app.dev.x.com' },
          defaultEnv: 'dev',
          auth: { strategy: 'none' },
        },
        adapters: ['web', 'http'],
      }),
    ).toThrow(/must have a corresponding/);
  });
});
