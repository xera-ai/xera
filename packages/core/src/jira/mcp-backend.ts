import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { JiraClient, JiraTicket } from './types';

const MCP_ENV = 'XERA_MCP_JIRA';

export async function createMcpBackend(_baseUrl: string): Promise<JiraClient | null> {
  if (process.env[MCP_ENV] !== '1') return null;
  const tmpDir = join(tmpdir(), 'xera-mcp');
  mkdirSync(tmpDir, { recursive: true });

  return {
    backend: 'mcp',
    async fetchTicket(key, _fields): Promise<JiraTicket> {
      const cachePath = join(tmpDir, `${key}.json`);
      if (!existsSync(cachePath)) {
        throw new Error(
          `MCP-mode fetch requires the skill to first call mcp__atlassian__getJiraIssue and write ${cachePath}. ` +
            `If you are running this directly, unset ${MCP_ENV} to use REST.`,
        );
      }
      const parsed = JSON.parse(readFileSync(cachePath, 'utf8')) as JiraTicket;
      return parsed;
    },
    async postComment(key, body) {
      const outPath = join(tmpDir, `${key}.comment.json`);
      writeFileSync(outPath, JSON.stringify({ key, body }));
      // The skill will read this file and call mcp__atlassian__addCommentToJiraIssue.
      return { id: 'mcp-pending' };
    },
    async transitionStatus(key, statusName) {
      const outPath = join(tmpDir, `${key}.transition.json`);
      writeFileSync(outPath, JSON.stringify({ key, statusName }));
    },
    async listFields(_sampleKey) {
      throw new Error('listFields is REST-only; init flow uses REST for field discovery.');
    },
  };
}
