import type { Classification } from '../artifact/status';

export interface HistorySummary {
  firstRun: boolean;
  consecutiveFails: number;
  lastResult: 'PASS' | 'FAIL' | null;
  lastClass: Classification | null;
}

export function summarizeHistory(
  history: Array<{ ts: string; result: 'PASS' | 'FAIL'; class: Classification }>,
): HistorySummary {
  if (history.length === 0) {
    return { firstRun: true, consecutiveFails: 0, lastResult: null, lastClass: null };
  }
  let consecutiveFails = 0;
  for (const entry of history) {
    if (entry.result === 'FAIL') consecutiveFails++;
    else break;
  }
  return {
    firstRun: false,
    consecutiveFails,
    lastResult: history[0]!.result,
    lastClass: history[0]!.class,
  };
}
