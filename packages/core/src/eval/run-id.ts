import { execSync } from 'node:child_process';

export interface RunIdOpts {
  getGitSha?: () => string | null;
  now?: () => Date;
}

function defaultGetGitSha(): string | null {
  try {
    return execSync('git rev-parse HEAD', { stdio: ['ignore', 'pipe', 'ignore'] })
      .toString()
      .trim();
  } catch {
    return null;
  }
}

function pad(n: number): string {
  return n.toString().padStart(2, '0');
}

export function generateRunId(opts: RunIdOpts = {}): string {
  const getGitSha = opts.getGitSha ?? defaultGetGitSha;
  const now = (opts.now ?? (() => new Date()))();
  const date = `${now.getUTCFullYear()}${pad(now.getUTCMonth() + 1)}${pad(now.getUTCDate())}`;
  const time = `${pad(now.getUTCHours())}${pad(now.getUTCMinutes())}${pad(now.getUTCSeconds())}`;
  const sha = getGitSha();
  const short = sha ? sha.slice(0, 7) : 'nogit';
  return `${date}-${time}-${short}`;
}
