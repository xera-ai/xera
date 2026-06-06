import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { hashString } from '../artifact/hash';
import { readMeta, writeMeta } from '../artifact/meta';
import { resolveArtifactPaths } from '../artifact/paths';
import { loadConfig } from '../config/load';
import { createIssueProvider } from '../providers/factory';
import type { IssueTicket } from '../providers/types';
import { PROMPTS_VERSION, XERA_VERSION } from '../versions';

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

  // Local source: skip Jira, stamp frontmatter from existing story.md body.
  const existingMeta = readMeta(paths.metaPath);
  if (existingMeta?.source === 'local') {
    const rawFile = existsSync(paths.storyPath) ? readFileSync(paths.storyPath, 'utf8') : '';
    const body = stripFrontmatter(rawFile);
    const summary = parseLocalSummary(ticket, body);
    const acText = parseAcSection(body);
    const acLines = parseAcLines(acText);
    const storyHash = hashString(body);
    const full = renderStory(ticket, summary, storyHash, acLines, 'body-extraction', body);
    mkdirSync(dirname(paths.storyPath), { recursive: true });
    writeFileSync(paths.storyPath, full);
    writeMeta(paths.metaPath, {
      ...existingMeta,
      story_hash: storyHash,
      fetched_at: new Date().toISOString(),
    });
    console.log(`[xera:fetch] local source — wrote ${paths.storyPath}`);
    return 0;
  }

  // Test injection: skip real fetch when XERA_TEST_ISSUE (preferred) or the
  // legacy XERA_TEST_JIRA env is set. Both accept the same JSON shape.
  let t: IssueTicket;
  const injected = process.env.XERA_TEST_ISSUE ?? process.env.XERA_TEST_JIRA;
  if (injected) {
    t = JSON.parse(injected) as IssueTicket;
  } else {
    const provider = await createIssueProvider(config);
    t = await provider.fetchTicket(ticket);
  }

  const body = renderStoryBody(t);
  const storyHash = hashString(body);
  const acLines = parseAcLines(t.acceptanceCriteria);
  // Track where AC came from so /xera-fetch step 3.5 (cognitive body-extraction)
  // and `xera doctor --strict <TICKET>` can act on accurate provenance.
  // `body-extraction` is set later by the skill if it finds AC in the description.
  const acSource: 'jira-field' | 'none' = acLines.length > 0 ? 'jira-field' : 'none';
  const full = renderStory(t.key, t.summary, storyHash, acLines, acSource, body);
  mkdirSync(dirname(paths.storyPath), { recursive: true });
  writeFileSync(paths.storyPath, full);

  const existing = readMeta(paths.metaPath);
  writeMeta(paths.metaPath, {
    ticket,
    adapter: 'web',
    xera_version: XERA_VERSION,
    prompts_version: PROMPTS_VERSION,
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

function renderStoryBody(t: IssueTicket): string {
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

function stripFrontmatter(raw: string): string {
  if (!raw.startsWith('---\n') && !raw.startsWith('---\r\n')) return raw;
  const end = raw.indexOf('\n---', 4);
  if (end === -1) return raw;
  return raw.slice(end + 4).replace(/^\n/, '');
}

function parseLocalSummary(ticket: string, body: string): string {
  const m = body.match(/^#\s+[A-Z][A-Z0-9-]*-\d+[\s—:-]+(.+)/m);
  return m?.[1]?.trim() ?? ticket;
}

function parseAcSection(body: string): string | undefined {
  const m = body.match(/##\s+acceptance\s+criteria\b[^\n]*\n([\s\S]*?)(?=\n##\s|$)/im);
  return m?.[1]?.trim() || undefined;
}

function renderStory(
  key: string,
  summary: string,
  storyHash: string,
  acLines: string[],
  acSource: 'jira-field' | 'body-extraction' | 'none',
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
  yamlLines.push(`acceptanceCriteriaSource: ${acSource}`);
  yamlLines.push('---', '');
  return yamlLines.join('\n') + body;
}
