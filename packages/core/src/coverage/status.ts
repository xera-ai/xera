import type { Snapshot } from '../graph/types';

export type ScenarioStatus = 'PASSING' | 'NOT_PASSING';
export type AreaStatus = 'UNCOVERED' | 'STALE' | 'COVERED';
export type AcStatus = 'SATISFIED' | 'UNSATISFIED';
// 3-state AC status for the graph viewer side panel — distinguishes
// "covered by a failing scenario" (BROKEN, write a fix) from "no
// satisfying scenario" (GAP, write a new test). Coverage tab uses the
// coarser 2-state AcStatus where both BROKEN and GAP collapse to UNSATISFIED.
export type AcStatus3 = 'VERIFIED' | 'BROKEN' | 'GAP';
export type TicketStatus = 'COMPLETE' | 'INCOMPLETE';

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

export function computeAreaStatus(
  areaId: string,
  snap: Snapshot,
  windowDays: number,
  now: Date,
): AreaStatus {
  const coveringPoms = snap.edges
    .filter((e) => e.kind === 'covers' && e.to === areaId)
    .map((e) => e.from);
  if (coveringPoms.length === 0) return 'UNCOVERED';

  const scenariosInArea = snap.edges
    .filter((e) => e.kind === 'uses' && coveringPoms.includes(e.to))
    .map((e) => e.from);
  const anyPassing = scenariosInArea.some(
    (sid) => computeScenarioStatus(sid, snap, windowDays, now) === 'PASSING',
  );
  return anyPassing ? 'COVERED' : 'STALE';
}

export function computeAcStatus(
  acId: string,
  snap: Snapshot,
  windowDays: number,
  now: Date,
): AcStatus {
  const edges = snap.edges.filter((e) => e.kind === 'satisfies' && e.to === acId);
  if (edges.length === 0) return 'UNSATISFIED';
  const anyPassing = edges.some(
    (e) => computeScenarioStatus(e.from, snap, windowDays, now) === 'PASSING',
  );
  return anyPassing ? 'SATISFIED' : 'UNSATISFIED';
}

export function computeAcStatus3(
  acId: string,
  snap: Snapshot,
  windowDays: number,
  now: Date,
): AcStatus3 {
  const edges = snap.edges.filter((e) => e.kind === 'satisfies' && e.to === acId);
  if (edges.length === 0) return 'GAP';
  const anyPassing = edges.some(
    (e) => computeScenarioStatus(e.from, snap, windowDays, now) === 'PASSING',
  );
  return anyPassing ? 'VERIFIED' : 'BROKEN';
}

export function computeTicketStatus(
  ticketId: string,
  snap: Snapshot,
  windowDays: number,
  now: Date,
): TicketStatus {
  const acIds = Object.values(snap.acNodes)
    .filter((ac) => ac.ticketId === ticketId)
    .map((ac) => ac.id);
  if (acIds.length === 0) return 'COMPLETE';
  const allSatisfied = acIds.every(
    (acId) => computeAcStatus(acId, snap, windowDays, now) === 'SATISFIED',
  );
  return allSatisfied ? 'COMPLETE' : 'INCOMPLETE';
}
