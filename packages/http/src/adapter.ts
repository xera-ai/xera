import { join } from 'node:path';
import type {
  DoctorReport,
  ExecuteInput,
  GenerateInput,
  GenerateResult,
  RunResult,
  TestAdapter,
} from '@xera-ai/core';
import { runHttpScenarios } from './executor';
import { normalizeHttpRun } from './trace-normalizer/normalize';

export const HttpAdapter: TestAdapter = {
  id: 'http',

  async generate(_input: GenerateInput): Promise<GenerateResult> {
    // Generation itself is LLM-driven via skills + prompts; the adapter
    // exposes helpers that the skills call via `npx xera-internal`.
    // No direct artifact writing here.
    return { artifacts: [], warnings: [] };
  },

  async execute(input: ExecuteInput): Promise<RunResult> {
    const runDir = join(input.ticketDir, 'runs', input.runId);
    const specPath = join(input.ticketDir, 'spec.ts');
    const raw = await runHttpScenarios({
      specPath,
      runDir,
      runId: input.runId,
      config: input.config,
      env: input.env,
    });
    const normalized = await normalizeHttpRun({ runId: input.runId, runDir });
    return {
      runId: input.runId,
      outcome: normalized.outcome,
      scenarios: normalized.scenarios.map((s) => {
        const out: RunResult['scenarios'][number] = { name: s.name, outcome: s.outcome };
        if (s.failure !== undefined) out.failure = s.failure;
        return out;
      }),
      artifactsDir: runDir,
      rawReportPath: raw.rawReportPath,
      normalizedReportPath: join(runDir, 'normalized.json'),
    };
  },

  async doctor(): Promise<DoctorReport> {
    const checks: DoctorReport['checks'] = [];
    try {
      await import('@playwright/test');
      checks.push({ name: '@playwright/test installed', ok: true });
    } catch {
      checks.push({
        name: '@playwright/test installed',
        ok: false,
        message: 'Run `npm install -D @playwright/test`.',
      });
    }
    return { ok: checks.every((c) => c.ok), checks };
  },
};
