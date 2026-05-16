import { describe, expect, test } from 'bun:test';
import { XeraConfigSchema } from '../../src/config/schema';

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
  test('defaults to enabled=true, threshold=6.0', () => {
    const parsed = XeraConfigSchema.parse(MIN_VALID);
    expect(parsed.run?.autoImpact?.enabled).toBe(true);
    expect(parsed.run?.autoImpact?.threshold).toBe(6.0);
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
    expect(parsed.web.auth.strategy).toBe('none');
  });
});
