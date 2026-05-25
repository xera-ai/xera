import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { createGithubMcpBackend } from '../../src/github/mcp-backend';

let cacheDir: string;

describe('github mcp-backend', () => {
  beforeEach(() => {
    process.env.XERA_MCP_GITHUB = '1';
    // Per-test cache dir so we never touch the shared $TMPDIR/xera-mcp-github
    // path that a real MCP session may be using.
    cacheDir = mkdtempSync(join(tmpdir(), 'xera-mcp-github-test-'));
    process.env.XERA_MCP_GITHUB_DIR = cacheDir;
  });
  afterEach(() => {
    delete process.env.XERA_MCP_GITHUB;
    delete process.env.XERA_MCP_GITHUB_DIR;
    rmSync(cacheDir, { recursive: true, force: true });
  });

  test('returns null when XERA_MCP_GITHUB is unset', () => {
    delete process.env.XERA_MCP_GITHUB;
    expect(createGithubMcpBackend('owner/repo')).toBeNull();
  });

  test('fetchTicket reads the file handoff written by the skill', async () => {
    const cachePath = join(cacheDir, 'GH-7.json');
    writeFileSync(
      cachePath,
      JSON.stringify({
        key: 'GH-7',
        summary: 'Hi',
        story: 'body',
        attachments: [],
      }),
    );
    const c = createGithubMcpBackend('owner/repo');
    if (!c) throw new Error('expected non-null backend');
    const t = await c.fetchTicket('GH-7');
    expect(t.key).toBe('GH-7');
    expect(t.story).toBe('body');
  });

  test('fetchTicket throws a helpful error when the skill forgot to write the handoff', async () => {
    const c = createGithubMcpBackend('owner/repo');
    if (!c) throw new Error('expected non-null backend');
    await expect(c.fetchTicket('GH-99')).rejects.toThrow(/mcp__github__get_issue/);
  });

  test('postComment writes the handoff for the skill to relay', async () => {
    const c = createGithubMcpBackend('owner/repo');
    if (!c) throw new Error('expected non-null backend');
    const r = await c.postComment('GH-7', 'comment body');
    expect(r.id).toBe('mcp-pending');
    const out = JSON.parse(readFileSync(join(cacheDir, 'GH-7.comment.json'), 'utf8'));
    expect(out.body).toBe('comment body');
  });
});
