import type { Snapshot } from '../graph/types';
import { computeAcStatus } from './status';
import type { CoverageConfig } from './types';

export const RISK_WEIGHTS = {
  criticalBoost: 2,
  bugClassifications: new Set<string>(['REAL_BUG', 'TEST_OUTDATED']),
  recencyBoosts: { recent: 2.0, withinWindow: 1.0, older: 0.5 },
  recencyThresholdDays: 7,
} as const;

function daysBetween(a: Date, b: Date): number {
  return Math.abs(a.getTime() - b.getTime()) / (1000 * 60 * 60 * 24);
}

export function computeAreaRisk(
  areaId: string,
  snap: Snapshot,
  config: CoverageConfig,
  now: Date,
): number {
  const recentTickets = snap.edges
    .filter((e) => e.kind === 'modifies' && e.to === areaId)
    .map((e) => snap.tickets[e.from])
    .filter((t): t is NonNullable<typeof t> => t !== undefined)
    .filter((t) => daysBetween(now, new Date(t.fetchedAt)) <= config.staleAfterDays).length;

  const pomsInArea = snap.edges
    .filter((e) => e.kind === 'covers' && e.to === areaId)
    .map((e) => e.from);
  const scenariosInArea = new Set(
    snap.edges.filter((e) => e.kind === 'uses' && pomsInArea.includes(e.to)).map((e) => e.from),
  );
  const recentBugs = snap.classifications
    .filter((c) => scenariosInArea.has(c.scenarioId))
    .filter((c) => RISK_WEIGHTS.bugClassifications.has(c.classification))
    .filter((c) => daysBetween(now, new Date(c.ts)) <= config.staleAfterDays).length;

  const criticalBoost = config.criticalAreas.includes(areaId) ? RISK_WEIGHTS.criticalBoost : 1;

  return recentTickets * criticalBoost + recentBugs;
}

export function computeAcGapScore(
  ticketId: string,
  snap: Snapshot,
  config: CoverageConfig,
  now: Date,
): number {
  const ticket = snap.tickets[ticketId];
  if (!ticket) return 0;

  const acs = Object.values(snap.acNodes).filter((ac) => ac.ticketId === ticketId);
  const unsatisfied = acs.filter(
    (ac) => computeAcStatus(ac.id, snap, config.staleAfterDays, now) === 'UNSATISFIED',
  ).length;
  if (unsatisfied === 0) return 0;

  const days = daysBetween(now, new Date(ticket.fetchedAt));
  let boost: number;
  if (days <= RISK_WEIGHTS.recencyThresholdDays) {
    boost = RISK_WEIGHTS.recencyBoosts.recent;
  } else if (days <= config.staleAfterDays) {
    boost = RISK_WEIGHTS.recencyBoosts.withinWindow;
  } else {
    boost = RISK_WEIGHTS.recencyBoosts.older;
  }
  return unsatisfied * boost;
}
