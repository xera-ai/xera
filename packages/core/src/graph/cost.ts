import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { graphPaths } from './paths';

export interface LlmCallLog {
  ts?: string;
  skill: string;
  prompt: string;
  tokensIn: number;
  tokensOut: number;
  model: string;
  costUsd: number;
}

export function logLlmCall(repoRoot: string, call: LlmCallLog): void {
  const paths = graphPaths(repoRoot);
  mkdirSync(dirname(paths.costLog), { recursive: true });
  const record = {
    ts: call.ts ?? new Date().toISOString(),
    skill: call.skill,
    prompt: call.prompt,
    tokens_in: call.tokensIn,
    tokens_out: call.tokensOut,
    model: call.model,
    cost_estimate_usd: call.costUsd,
  };
  appendFileSync(paths.costLog, JSON.stringify(record) + '\n');
}

export interface CostSummary {
  totalCalls: number;
  totalUsd: number;
  bySkill: Record<string, { calls: number; usd: number }>;
  windowDays: number;
}

export function summarizeCost(repoRoot: string, daysBack: number): CostSummary {
  const paths = graphPaths(repoRoot);
  const result: CostSummary = { totalCalls: 0, totalUsd: 0, bySkill: {}, windowDays: daysBack };
  if (!existsSync(paths.costLog)) return result;
  const cutoff = Date.now() - daysBack * 86400 * 1000;
  for (const line of readFileSync(paths.costLog, 'utf8').split('\n')) {
    if (!line.trim()) continue;
    let row: { ts: string; skill: string; cost_estimate_usd: number };
    try { row = JSON.parse(line); } catch { continue; }
    if (Date.parse(row.ts) < cutoff) continue;
    result.totalCalls++;
    result.totalUsd += row.cost_estimate_usd;
    const s = (result.bySkill[row.skill] ??= { calls: 0, usd: 0 });
    s.calls++;
    s.usd += row.cost_estimate_usd;
  }
  return result;
}
