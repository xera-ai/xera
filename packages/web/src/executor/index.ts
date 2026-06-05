import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildPlaywrightArgs } from './playwright-args';

export interface SpawnResult {
  exitCode: number;
}
export type SpawnFn = (cmd: string, args: string[], env: NodeJS.ProcessEnv) => Promise<SpawnResult>;

export interface RunPlaywrightInput {
  specPath: string;
  configPath: string;
  outputDir: string;
  grep?: string;
  /**
   * Extra Playwright reporters to add alongside the always-on `json` reporter
   * that `normalize` reads. e.g. `['html']` writes an HTML report into the run
   * dir (#224). Multiple reporters are passed comma-joined to Playwright.
   */
  reporters?: string[];
  env?: NodeJS.ProcessEnv;
  spawn?: SpawnFn;
}

export interface RunPlaywrightResult {
  outcome: 'PASS' | 'FAIL';
  rawReportPath: string;
  exitCode: number;
}

const defaultSpawn: SpawnFn = (cmd, args, env) =>
  new Promise((resolve) => {
    const child = spawn(cmd, args, { env, stdio: 'inherit' });
    child.on('error', () => resolve({ exitCode: 1 }));
    child.on('close', (code) => resolve({ exitCode: code ?? 1 }));
  });

export async function runPlaywright(input: RunPlaywrightInput): Promise<RunPlaywrightResult> {
  const args = buildPlaywrightArgs({
    specPath: input.specPath,
    configPath: input.configPath,
    outputDir: input.outputDir,
    ...(input.grep && { grep: input.grep }),
    ...(input.reporters && { reporters: input.reporters }),
  });
  const spawn = input.spawn ?? defaultSpawn;
  const { exitCode } = await spawn('npx', ['playwright', ...args], {
    ...process.env,
    ...input.env,
  });
  const rawReportPath = join(input.outputDir, 'report.json');
  let outcome: 'PASS' | 'FAIL' = exitCode === 0 ? 'PASS' : 'FAIL';
  if (outcome === 'PASS') {
    try {
      const report = JSON.parse(readFileSync(rawReportPath, 'utf8')) as {
        stats?: { expected?: number };
      };
      if ((report.stats?.expected ?? 0) === 0) outcome = 'FAIL';
    } catch {
      outcome = 'FAIL';
    }
  }
  return { outcome, rawReportPath, exitCode };
}
