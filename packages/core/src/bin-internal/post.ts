import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { resolveArtifactPaths } from '../artifact/paths';
import { readStatus, writeStatus } from '../artifact/status';
import { loadConfig } from '../config/load';
import { createIssueProvider } from '../providers/factory';

export async function postCmd(argv: string[]): Promise<number> {
  const ticket = argv[0];
  if (!ticket) {
    console.error('[xera:post] usage: post <TICKET>');
    return 1;
  }
  const cwd = process.cwd();
  const config = await loadConfig(cwd);
  if (!config.reporting.postComment) {
    console.log('[xera:post] reporting.postComment disabled in config; skipping');
    return 0;
  }
  const paths = resolveArtifactPaths(cwd, ticket);
  const draftPath = join(paths.ticketDir, 'comment.draft.md');
  const legacyDraftPath = join(paths.ticketDir, 'jira-comment.draft.md');
  // Fall back to the legacy file name for in-flight tickets drafted before the rename.
  const effectiveDraft = existsSync(draftPath)
    ? draftPath
    : existsSync(legacyDraftPath)
      ? legacyDraftPath
      : null;
  if (effectiveDraft === null) {
    console.error(`[xera:post] no draft at ${draftPath}; run \`xera-internal report\` first.`);
    return 1;
  }
  const body = readFileSync(effectiveDraft, 'utf8');

  const provider = await createIssueProvider(config);
  const r = await provider.postComment(ticket, body);
  console.log(`[xera:post] posted comment id=${r.id}`);

  const s = readStatus(paths.statusPath);
  if (s) writeStatus(paths.statusPath, { ...s, last_comment_id: r.id });
  return 0;
}
