import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { IssueProvider, IssueTicket } from '../providers/types';

const MCP_ENV = 'XERA_MCP_GITHUB';
const DIR_ENV = 'XERA_MCP_GITHUB_DIR';
const TMP_SUBDIR = 'xera-mcp-github';

export function createGithubMcpBackend(_repo: string): IssueProvider | null {
  if (process.env[MCP_ENV] !== '1') return null;
  // XERA_MCP_GITHUB_DIR overrides the default cache dir — used by tests to avoid
  // colliding with a live MCP session that's also using the shared tmpdir path.
  const tmpDir = process.env[DIR_ENV] ?? join(tmpdir(), TMP_SUBDIR);
  mkdirSync(tmpDir, { recursive: true });

  return {
    backend: 'github-mcp',
    async fetchTicket(key: string): Promise<IssueTicket> {
      const cachePath = join(tmpDir, `${key}.json`);
      if (!existsSync(cachePath)) {
        throw new Error(
          `MCP-mode fetch requires the skill to first call mcp__github__get_issue and write ${cachePath}. ` +
            `If you are running this directly, unset ${MCP_ENV} to use the gh CLI.`,
        );
      }
      const parsed = JSON.parse(readFileSync(cachePath, 'utf8')) as IssueTicket;
      return parsed;
    },
    async postComment(key, body) {
      const outPath = join(tmpDir, `${key}.comment.json`);
      writeFileSync(outPath, JSON.stringify({ key, body }));
      // The skill reads this file and calls mcp__github__add_issue_comment.
      return { id: 'mcp-pending' };
    },
  };
}
