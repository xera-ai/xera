import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createGithubMcpBackend } from '../../src/github/mcp-backend';

const SHARED_DIR = join(tmpdir(), 'xera-mcp-github');

describe('github mcp-backend', () => {
  beforeEach(() => {
    process.env.XERA_MCP_GITHUB = '1';
    mkdirSync(SHARED_DIR, { recursive: true });
  });
  afterEach(() => {
    delete process.env.XERA_MCP_GITHUB;
    if (existsSync(SHARED_DIR)) rmSync(SHARED_DIR, { recursive: true });
  });

  test('returns null when XERA_MCP_GITHUB is unset', () => {
    delete process.env.XERA_MCP_GITHUB;
    expect(createGithubMcpBackend('owner/repo')).toBeNull();
  });

  test('fetchTicket reads the file handoff written by the skill', async () => {
    const cachePath = join(SHARED_DIR, 'GH-7.json');
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
    const out = JSON.parse(readFileSync(join(SHARED_DIR, 'GH-7.comment.json'), 'utf8'));
    expect(out.body).toBe('comment body');
  });
});
