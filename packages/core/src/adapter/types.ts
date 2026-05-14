import type { XeraConfig } from '../config/schema';
import type { Classification } from '../artifact/status';

export interface GenerateInput {
  ticketDir: string;
  feature: string;
  story: string;
  config: XeraConfig;
}

export interface GenerateResult {
  artifacts: string[];
  warnings: string[];
}

export interface ExecuteInput {
  ticketDir: string;
  config: XeraConfig;
  runId: string;
  env: string;
}

export interface ScenarioResult {
  name: string;
  outcome: 'PASS' | 'FAIL' | 'SKIPPED';
  failure?: {
    step?: string;
    errorMessage?: string;
    domSnapshotAtFailure?: string;
    networkAtFailure?: Array<{ method: string; url: string; status: number }>;
    consoleAtFailure?: string[];
    screenshotPath?: string;
  };
}

export interface RunResult {
  runId: string;
  outcome: 'PASS' | 'FAIL';
  scenarios: ScenarioResult[];
  artifactsDir: string;
  rawReportPath: string;
  normalizedReportPath: string;
}

export interface ClassifyContext {
  history: Array<{ ts: string; result: 'PASS' | 'FAIL'; class: Classification }>;
  storyHashChanged: boolean;
  specHashChanged: boolean;
}

export interface DoctorReport {
  ok: boolean;
  checks: Array<{ name: string; ok: boolean; message?: string }>;
}

export interface TestAdapter {
  readonly id: string;
  generate(input: GenerateInput): Promise<GenerateResult>;
  execute(input: ExecuteInput): Promise<RunResult>;
  classify?(run: RunResult, ctx: ClassifyContext): Partial<{ class: Classification; rationale: string }>;
  doctor(): Promise<DoctorReport>;
}
