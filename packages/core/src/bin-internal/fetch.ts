import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { loadConfig } from '../config/load';
import { resolveArtifactPaths } from '../artifact/paths';
import { hashString } from '../artifact/hash';
import { writeMeta, readMeta } from '../artifact/meta';
import { createJiraClient } from '../jira/client';
import type { JiraTicket } from '../jira/types';

export interface FetchCmdOpts { cwd?: string; }

export async function fetchCmd(argv: string[], opts: FetchCmdOpts = {}): Promise<number> {
  const cwd = opts.cwd ?? process.cwd();
  const ticket = argv[0];
  if (!ticket) {
    console.error('[xera:fetch] usage: xera-internal fetch <TICKET>');
    return 1;
  }
  const config = await loadConfig(cwd);
  const paths = resolveArtifactPaths(cwd, ticket);

  // Test injection: skip real Jira when XERA_TEST_JIRA env is set.
  let t: JiraTicket;
  if (process.env.XERA_TEST_JIRA) {
    t = JSON.parse(process.env.XERA_TEST_JIRA) as JiraTicket;
  } else {
    const client = await createJiraClient({
      baseUrl: config.jira.baseUrl,
      preferMcp: true,
      ...(process.env.JIRA_EMAIL && process.env.JIRA_API_TOKEN
        ? { rest: { email: process.env.JIRA_EMAIL, apiToken: process.env.JIRA_API_TOKEN } }
        : {}),
    });
    const fieldMap = config.jira.fields.acceptanceCriteria !== undefined
      ? { story: config.jira.fields.story, acceptanceCriteria: config.jira.fields.acceptanceCriteria }
      : { story: config.jira.fields.story };
    t = await client.fetchTicket(ticket, fieldMap);
  }

  const story = renderStory(t);
  mkdirSync(dirname(paths.storyPath), { recursive: true });
  writeFileSync(paths.storyPath, story);

  const existing = readMeta(paths.metaPath);
  writeMeta(paths.metaPath, {
    ticket,
    adapter: 'web',
    xera_version: '0.1.0',
    prompts_version: '1.0.0',
    ...(existing ?? {}),
    // Re-stamp the just-fetched fields:
    story_hash: hashString(story),
    fetched_at: new Date().toISOString(),
  });

  console.log(`[xera:fetch] wrote ${paths.storyPath}`);
  return 0;
}

function renderStory(t: JiraTicket): string {
  const lines: string[] = [];
  lines.push(`# ${t.key}: ${t.summary}`, '');
  lines.push(`## Story`, '', t.story.trim(), '');
  if (t.acceptanceCriteria && t.acceptanceCriteria.trim()) {
    lines.push(`## Acceptance Criteria`, '', t.acceptanceCriteria.trim(), '');
  }
  if (t.attachments.length > 0) {
    lines.push(`## Attachments`, '', ...t.attachments.map(a => `- [${a.filename}](${a.url})`), '');
  }
  return lines.join('\n');
}
