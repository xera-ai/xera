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
  env?: NodeJS.ProcessEnv;
  spawn?: SpawnFn;
}

export interface RunPlaywrightResult {
  outcome: 'PASS' | 'FAIL';
  rawReportPath: string;
  exitCode: number;
}

const defaultSpawn: SpawnFn = async (cmd, args, env) => {
  const proc = Bun.spawn([cmd, ...args], { env, stdout: 'inherit', stderr: 'inherit' });
  const exitCode = await proc.exited;
  return { exitCode };
};

export async function runPlaywright(input: RunPlaywrightInput): Promise<RunPlaywrightResult> {
  const args = buildPlaywrightArgs({
    specPath: input.specPath,
    configPath: input.configPath,
    outputDir: input.outputDir,
    ...(input.grep && { grep: input.grep }),
  });
  const spawn = input.spawn ?? defaultSpawn;
  const { exitCode } = await spawn('npx', ['playwright', ...args], {
    ...process.env,
    ...input.env,
  });
  return {
    outcome: exitCode === 0 ? 'PASS' : 'FAIL',
    rawReportPath: join(input.outputDir, 'report.json'),
    exitCode,
  };
}
