import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { XeraConfig } from '@xera-ai/core';
import { generateHttpPlaywrightConfig } from './playwright-config';

export interface RunHttpScenariosInput {
  specPath: string;
  runDir: string;
  runId: string;
  config: XeraConfig;
  env: string;
}

export interface RunHttpScenariosResult {
  rawReportPath: string;
  exitCode: number;
}

export async function runHttpScenarios(
  input: RunHttpScenariosInput,
): Promise<RunHttpScenariosResult> {
  if (!input.config.http) {
    throw new Error('http config block is required for runHttpScenarios');
  }
  const baseURL = input.config.http.baseUrl[input.env];
  if (!baseURL) throw new Error(`No http baseUrl for env '${input.env}'`);

  mkdirSync(input.runDir, { recursive: true });
  const pwConfigPath = join(input.runDir, 'playwright.http.config.ts');
  writeFileSync(
    pwConfigPath,
    generateHttpPlaywrightConfig({
      specPath: input.specPath,
      outputDir: input.runDir,
      baseURL,
    }),
  );

  const rawReportPath = join(input.runDir, 'raw-report.json');
  const traceFile = join(input.runDir, 'http-trace.jsonl');

  const exitCode = await new Promise<number>((resolve) => {
    const child = spawn('npx', ['playwright', 'test', '--config', pwConfigPath], {
      env: {
        ...process.env,
        XERA_BASE_URL: baseURL,
        XERA_AUTH_DIR: join(process.cwd(), '.xera', '.auth'),
        XERA_HTTP_TRACE: traceFile,
        XERA_RUN_ID: input.runId,
      },
      stdio: 'inherit',
    });
    child.on('error', () => resolve(1));
    child.on('close', (code) => resolve(code ?? 1));
  });
  return { rawReportPath, exitCode };
}
