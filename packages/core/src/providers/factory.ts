import type { XeraConfig } from '../config/schema';
import { createGithubClient } from '../github/client';
import { createJiraClient } from '../jira/client';
import type { JiraFieldMap } from '../jira/types';
import type { IssueProvider, IssueTicket } from './types';

export type CreateIssueProviderEnv = Record<string, string | undefined>;

export async function createIssueProvider(
  config: XeraConfig,
  env: CreateIssueProviderEnv = process.env,
): Promise<IssueProvider> {
  if (config.github) {
    return createGithubClient({ repo: config.github.repo });
  }
  if (!config.jira) {
    throw new Error('No issue provider configured: set `jira` or `github` in xera.config.ts');
  }
  const jiraCfg = config.jira;
  const jira = await createJiraClient({
    baseUrl: jiraCfg.baseUrl,
    preferMcp: true,
    ...(env.JIRA_EMAIL && env.JIRA_API_TOKEN
      ? { rest: { email: env.JIRA_EMAIL, apiToken: env.JIRA_API_TOKEN } }
      : {}),
  });
  const fieldMap: JiraFieldMap =
    jiraCfg.fields.acceptanceCriteria !== undefined
      ? {
          story: jiraCfg.fields.story,
          acceptanceCriteria: jiraCfg.fields.acceptanceCriteria,
        }
      : { story: jiraCfg.fields.story };

  return {
    backend: `jira-${jira.backend}`,
    async fetchTicket(key: string): Promise<IssueTicket> {
      const t = await jira.fetchTicket(key, fieldMap);
      const out: IssueTicket = {
        key: t.key,
        summary: t.summary,
        story: t.story,
        attachments: t.attachments,
      };
      if (t.acceptanceCriteria !== undefined) out.acceptanceCriteria = t.acceptanceCriteria;
      return out;
    },
    postComment(key, body) {
      return jira.postComment(key, body);
    },
  };
}
