import { createMcpBackend } from './mcp-backend';
import { createRestBackend } from './rest-backend';
import type { JiraClient } from './types';

export interface CreateJiraClientOptions {
  baseUrl: string;
  preferMcp?: boolean;
  rest?: { email: string; apiToken: string };
}

export async function createJiraClient(opts: CreateJiraClientOptions): Promise<JiraClient> {
  if (opts.preferMcp !== false) {
    const mcp = await createMcpBackend(opts.baseUrl);
    if (mcp) return mcp;
  }
  if (!opts.rest) {
    throw new Error(
      'Atlassian MCP not connected and no REST credentials provided (JIRA_EMAIL + JIRA_API_TOKEN).',
    );
  }
  return createRestBackend(opts.baseUrl, opts.rest);
}
