import { type ChildProcess, spawn as nodeSpawn } from 'node:child_process';

export interface Proc {
  /** Resolves with the process exit code (1 on spawn error). */
  exited: Promise<number>;
  /** Resolves with captured stdout text once the process exits (pipe mode). */
  stdout: Promise<string>;
  /** Resolves with captured stderr text once the process exits (pipe mode). */
  stderr: Promise<string>;
  kill: (signal?: NodeJS.Signals) => void;
}

/**
 * Spawn a child process for integration tests. Replaces Bun's `spawn`:
 * pass the command as an array `[bin, ...args]`. With `pipe: true`, stdout and
 * stderr are captured (stderr exposed via the `stderr` promise); otherwise they
 * inherit the parent's streams.
 */
export function run(
  cmd: string[],
  opts: { cwd?: string; env?: NodeJS.ProcessEnv; pipe?: boolean } = {},
): Proc {
  const [bin, ...args] = cmd;
  const child: ChildProcess = nodeSpawn(bin!, args, {
    cwd: opts.cwd,
    env: opts.env ?? process.env,
    stdio: opts.pipe ? ['ignore', 'pipe', 'pipe'] : 'inherit',
  });
  let outText = '';
  let errText = '';
  child.stdout?.on('data', (chunk) => {
    outText += chunk;
  });
  child.stderr?.on('data', (chunk) => {
    errText += chunk;
  });
  const exited = new Promise<number>((resolve) => {
    child.on('error', () => resolve(1));
    child.on('close', (code) => resolve(code ?? 1));
  });
  return {
    exited,
    stdout: exited.then(() => outText),
    stderr: exited.then(() => errText),
    kill: (signal) => {
      child.kill(signal);
    },
  };
}
