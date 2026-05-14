import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { resolveArtifactPaths } from '../artifact/paths';
import { readStatus, writeStatus } from '../artifact/status';
import { loadConfig } from '../config/load';
import { createJiraClient } from '../jira/client';

export async function postCmd(argv: string[]): Promise<number> {
  const ticket = argv[0];
  if (!ticket) {
    console.error('[xera:post] usage: post <TICKET>');
    return 1;
  }
  const cwd = process.cwd();
  const config = await loadConfig(cwd);
  if (!config.reporting.postToJira) {
    console.log('[xera:post] postToJira disabled in config; skipping');
    return 0;
  }
  const paths = resolveArtifactPaths(cwd, ticket);
  const draftPath = join(paths.ticketDir, 'jira-comment.draft.md');
  if (!existsSync(draftPath)) {
    console.error(`[xera:post] no draft at ${draftPath}; run \`xera-internal report\` first.`);
    return 1;
  }
  const body = readFileSync(draftPath, 'utf8');

  const client = await createJiraClient({
    baseUrl: config.jira.baseUrl,
    preferMcp: true,
    ...(process.env.JIRA_EMAIL && process.env.JIRA_API_TOKEN
      ? { rest: { email: process.env.JIRA_EMAIL, apiToken: process.env.JIRA_API_TOKEN } }
      : {}),
  });
  const r = await client.postComment(ticket, body);
  console.log(`[xera:post] posted comment id=${r.id}`);

  const s = readStatus(paths.statusPath);
  if (s) writeStatus(paths.statusPath, { ...s, last_jira_comment_id: r.id });
  return 0;
}
