import { describe, expect, test } from 'bun:test';
import { XeraConfigSchema } from '../../src/config/schema';

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
