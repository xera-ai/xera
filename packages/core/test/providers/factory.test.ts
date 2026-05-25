import { afterEach, describe, expect, test } from 'vitest';
import { XeraConfigSchema } from '../../src/config/schema';
import { createIssueProvider } from '../../src/providers/factory';

function jiraConfig() {
  return XeraConfigSchema.parse({
    jira: {
      baseUrl: 'https://x.atlassian.net',
      projectKeys: ['PROJ'],
      fields: { story: 'description' },
    },
    web: { baseUrl: { staging: 'https://x.com' }, defaultEnv: 'staging' },
    adapters: ['web'],
  });
}

function githubConfig() {
  return XeraConfigSchema.parse({
    github: { repo: 'owner/repo' },
    web: { baseUrl: { staging: 'https://x.com' }, defaultEnv: 'staging' },
    adapters: ['web'],
  });
}

describe('createIssueProvider', () => {
  afterEach(() => {
    delete process.env.XERA_MCP_JIRA;
    delete process.env.XERA_MCP_GITHUB;
  });

  test('routes to github backend when config.github is set', async () => {
    const provider = await createIssueProvider(githubConfig(), {});
    expect(provider.backend).toBe('github-cli');
  });

  test('routes to github MCP backend when XERA_MCP_GITHUB=1', async () => {
    process.env.XERA_MCP_GITHUB = '1';
    const provider = await createIssueProvider(githubConfig(), {});
    expect(provider.backend).toBe('github-mcp');
  });

  test('routes to jira backend when config.jira is set (REST creds provided)', async () => {
    const provider = await createIssueProvider(jiraConfig(), {
      JIRA_EMAIL: 'a@b.com',
      JIRA_API_TOKEN: 'tok',
    });
    expect(provider.backend).toBe('jira-rest');
  });

  test('routes to jira MCP backend when XERA_MCP_JIRA=1', async () => {
    process.env.XERA_MCP_JIRA = '1';
    const provider = await createIssueProvider(jiraConfig(), {});
    expect(provider.backend).toBe('jira-mcp');
  });
});
