import type { IssueProvider } from '../providers/types';
import { createGithubCliBackend } from './cli-backend';
import { createGithubMcpBackend } from './mcp-backend';

export interface CreateGithubClientOptions {
  repo: string;
  ghBin?: string;
}

export function createGithubClient(opts: CreateGithubClientOptions): IssueProvider {
  const mcp = createGithubMcpBackend(opts.repo);
  if (mcp) return mcp;
  return createGithubCliBackend(opts);
}
