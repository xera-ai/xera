import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { hashString } from '../artifact/hash';
import { readMeta, writeMeta } from '../artifact/meta';
import { resolveArtifactPaths } from '../artifact/paths';
import { loadConfig } from '../config/load';
import { createJiraClient } from '../jira/client';
import type { JiraTicket } from '../jira/types';

export interface FetchCmdOpts {
  cwd?: string;
}

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
    const fieldMap =
      config.jira.fields.acceptanceCriteria !== undefined
        ? {
            story: config.jira.fields.story,
            acceptanceCriteria: config.jira.fields.acceptanceCriteria,
          }
        : { story: config.jira.fields.story };
    t = await client.fetchTicket(ticket, fieldMap);
  }

  const body = renderStoryBody(t);
  const storyHash = hashString(body);
  const acLines = parseAcLines(t.acceptanceCriteria);
  const full = renderStory(t.key, t.summary, storyHash, acLines, body);
  mkdirSync(dirname(paths.storyPath), { recursive: true });
  writeFileSync(paths.storyPath, full);

  const existing = readMeta(paths.metaPath);
  writeMeta(paths.metaPath, {
    ticket,
    adapter: 'web',
    xera_version: '0.1.0',
    prompts_version: '1.0.0',
    ...(existing ?? {}),
    // Re-stamp the just-fetched fields:
    story_hash: storyHash,
    fetched_at: new Date().toISOString(),
  });

  console.log(`[xera:fetch] wrote ${paths.storyPath}`);
  return 0;
}

function parseAcLines(raw: string | undefined): string[] {
  if (!raw?.trim()) return [];
  return raw
    .trim()
    .split('\n')
    .map((l) => l.replace(/^[\s\-*]+/, '').trim())
    .filter(Boolean);
}

function renderStoryBody(t: JiraTicket): string {
  const lines: string[] = [];
  lines.push(`# ${t.key}: ${t.summary}`, '');

  const story = t.story.trim();
  // Avoid double "## Story" heading when Jira description already starts with it.
  if (/^##\s+story\b/i.test(story)) {
    lines.push(story, '');
  } else {
    lines.push('## Story', '', story, '');
  }

  if (t.acceptanceCriteria?.trim()) {
    const ac = t.acceptanceCriteria.trim();
    if (/^##\s+acceptance\s+criteria\b/i.test(ac)) {
      lines.push(ac, '');
    } else {
      lines.push('## Acceptance Criteria', '', ac, '');
    }
  }
  if (t.attachments.length > 0) {
    lines.push(
      '## Attachments',
      '',
      ...t.attachments.map((a) => `- [${a.filename}](${a.url})`),
      '',
    );
  }
  return lines.join('\n');
}

function renderStory(
  key: string,
  summary: string,
  storyHash: string,
  acLines: string[],
  body: string,
): string {
  const yamlLines = [
    '---',
    `ticketId: ${key}`,
    `summary: ${JSON.stringify(summary)}`,
    `storyHash: ${storyHash}`,
  ];
  if (acLines.length > 0) {
    yamlLines.push('acceptanceCriteria:');
    for (const ac of acLines) yamlLines.push(`  - ${JSON.stringify(ac)}`);
  }
  yamlLines.push('---', '');
  return yamlLines.join('\n') + body;
}
