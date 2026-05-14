import { runPlaywright } from './executor';
import { normalizeRun } from './trace-normalizer/normalize';
import type { TestAdapter, GenerateInput, GenerateResult, ExecuteInput, RunResult, DoctorReport } from '@xera/core/adapter';
import { join } from 'node:path';

export const WebAdapter: TestAdapter = {
  id: 'web',

  async generate(_input: GenerateInput): Promise<GenerateResult> {
    // Generation itself is LLM-driven via skills + prompts; the adapter
    // exposes helpers (validateGherkin, typecheckTicket, lintTicket) that
    // the skills call via `bun run xera:*`. No direct artifact writing here.
    return { artifacts: [], warnings: [] };
  },

  async execute(input: ExecuteInput): Promise<RunResult> {
    const runDir = join(input.ticketDir, 'runs', input.runId);
    const specPath = join(input.ticketDir, 'spec.ts');
    const configPath = join(input.ticketDir, 'playwright.config.ts');
    const pwResult = await runPlaywright({ specPath, configPath, outputDir: runDir });
    const normalized = await normalizeRun({ runId: input.runId, runDir });
    return {
      runId: input.runId,
      outcome: normalized.outcome,
      scenarios: normalized.scenarios.map(s => {
        const out: RunResult['scenarios'][number] = { name: s.name, outcome: s.outcome };
        if (s.failure !== undefined) out.failure = s.failure;
        return out;
      }),
      artifactsDir: runDir,
      rawReportPath: pwResult.rawReportPath,
      normalizedReportPath: join(runDir, 'normalized.json'),
    };
  },

  async doctor(): Promise<DoctorReport> {
    const checks: DoctorReport['checks'] = [];
    try {
      await import('@playwright/test');
      checks.push({ name: '@playwright/test installed', ok: true });
    } catch {
      checks.push({ name: '@playwright/test installed', ok: false, message: 'Run `bun add -D @playwright/test`.' });
    }
    return { ok: checks.every(c => c.ok), checks };
  },
};
