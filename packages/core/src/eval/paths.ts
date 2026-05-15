import { join } from 'node:path';

export interface EvalPaths {
  root: string;
  manifest: string;
  lock: string;
  deterministicScores: string;
  judgeScores: string;
  report: string;
  summary: string;
  inputsDir: string;
  actualDir: string;
  ticketInputsDir(ticket: string): string;
  ticketActualDir(ticket: string): string;
}

export function resolveEvalPaths(cwd: string, runId: string): EvalPaths {
  const root = join(cwd, '.xera', 'eval', runId);
  return {
    root,
    manifest: join(root, 'manifest.json'),
    lock: join(root, '.lock'),
    deterministicScores: join(root, 'deterministic-scores.json'),
    judgeScores: join(root, 'judge-scores.json'),
    report: join(root, 'report.md'),
    summary: join(root, 'summary.json'),
    inputsDir: join(root, 'inputs'),
    actualDir: join(root, 'actual'),
    ticketInputsDir: (ticket: string) => join(root, 'inputs', ticket),
    ticketActualDir: (ticket: string) => join(root, 'actual', ticket),
  };
}
