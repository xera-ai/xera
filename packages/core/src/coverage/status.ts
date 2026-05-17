import type { Snapshot } from '../graph/types';

export type ScenarioStatus = 'PASSING' | 'NOT_PASSING';

function daysBetween(a: Date, b: Date): number {
  return Math.abs(a.getTime() - b.getTime()) / (1000 * 60 * 60 * 24);
}

export function computeScenarioStatus(
  scenarioId: string,
  snap: Snapshot,
  windowDays: number,
  now: Date,
): ScenarioStatus {
  const events = snap.classifications
    .filter((c) => c.scenarioId === scenarioId)
    .sort((a, b) => (a.ts < b.ts ? 1 : a.ts > b.ts ? -1 : 0));
  const latest = events[0];
  if (!latest) return 'NOT_PASSING';
  if (latest.classification !== 'PASS') return 'NOT_PASSING';
  if (daysBetween(now, new Date(latest.ts)) > windowDays) return 'NOT_PASSING';
  return 'PASSING';
}
