import { spawn } from 'node:child_process';
import type { IssueProvider, IssueTicket } from '../providers/types';

export interface GithubCliOptions {
  repo: string;
  ghBin?: string;
}

interface GhIssueJson {
  number: number;
  title: string;
  body: string;
  assignees?: Array<{ login: string }>;
  labels?: Array<{ name: string }>;
  url?: string;
}

interface GhCommentResult {
  id?: string;
  url?: string;
}

function toKey(number: number): string {
  return `GH-${number}`;
}

function parseKey(key: string): number {
  const m = key.match(/^GH-(\d+)$/);
  if (!m) {
    throw new Error(
      `Invalid github issue key "${key}" — expected GH-<number> (e.g. GH-42). Set xera.config.ts.github.repo to bind a default owner/repo.`,
    );
  }
  // m[1] is guaranteed to exist when match succeeds (capture group required by regex).
  return Number.parseInt(m[1] as string, 10);
}

function run(
  bin: string,
  args: string[],
  opts: { stdin?: string } = {},
): Promise<{ stdout: string; stderr: string; code: number }> {
  return new Promise((resolve, reject) => {
    const proc = spawn(bin, args, { stdio: ['pipe', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    proc.stdout.on('data', (d: Buffer) => {
      stdout += d.toString();
    });
    proc.stderr.on('data', (d: Buffer) => {
      stderr += d.toString();
    });
    proc.on('error', (err) => reject(err));
    proc.on('close', (code) => resolve({ stdout, stderr, code: code ?? 0 }));
    if (opts.stdin !== undefined) {
      proc.stdin.write(opts.stdin);
    }
    proc.stdin.end();
  });
}

export function createGithubCliBackend(opts: GithubCliOptions): IssueProvider {
  const ghBin = opts.ghBin ?? 'gh';
  const repo = opts.repo;

  return {
    backend: 'github-cli',
    async fetchTicket(key: string): Promise<IssueTicket> {
      const num = parseKey(key);
      const r = await run(ghBin, [
        'issue',
        'view',
        String(num),
        '--repo',
        repo,
        '--json',
        'number,title,body,labels,assignees,url',
      ]);
      if (r.code !== 0) {
        throw new Error(
          `gh issue view ${num} --repo ${repo} failed (exit ${r.code}): ${r.stderr.trim() || r.stdout.trim()}`,
        );
      }
      const json = JSON.parse(r.stdout) as GhIssueJson;
      return {
        key: toKey(json.number),
        summary: json.title,
        story: json.body ?? '',
        attachments: [],
      };
    },
    async postComment(key, body) {
      const num = parseKey(key);
      const r = await run(
        ghBin,
        ['issue', 'comment', String(num), '--repo', repo, '--body-file', '-'],
        { stdin: body },
      );
      if (r.code !== 0) {
        throw new Error(
          `gh issue comment ${num} --repo ${repo} failed (exit ${r.code}): ${r.stderr.trim() || r.stdout.trim()}`,
        );
      }
      const out = r.stdout.trim();
      // `gh issue comment` prints the comment URL on success; surface it as the id.
      const tail = out.split('\n').pop() ?? out;
      const result: GhCommentResult = { url: tail };
      return { id: result.url ?? 'gh-pending' };
    },
  };
}
