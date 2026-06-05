import type { Snapshot } from '../graph/types';
import { computeAcGapScore, computeAreaRisk, RISK_WEIGHTS } from './risk';
import { computeAcStatus, computeAreaStatus, computeTicketStatus } from './status';
import type { CoverageConfig } from './types';

function daysBetween(a: Date, b: Date): number {
  return Math.abs(a.getTime() - b.getTime()) / (1000 * 60 * 60 * 24);
}

function pad(s: string, n: number): string {
  return s.length >= n ? s : `${s}${' '.repeat(n - s.length)}`;
}

export function buildWhyArea(
  areaId: string,
  snap: Snapshot,
  config: CoverageConfig,
  now: Date,
): string {
  if (snap.areas[areaId] === undefined) return `Unknown area: ${areaId}\n`;

  const status = computeAreaStatus(areaId, snap, config.staleAfterDays, now);
  const isCritical = config.criticalAreas.includes(areaId);
  const heading = isCritical ? `${status}, critical` : status;

  const risk = computeAreaRisk(areaId, snap, config, now);
  const recentTickets = snap.edges
    .filter((e) => e.kind === 'modifies' && e.to === areaId)
    .map((e) => snap.tickets[e.from])
    .filter((t): t is NonNullable<typeof t> => t !== undefined)
    .filter((t) => daysBetween(now, new Date(t.fetchedAt)) <= config.staleAfterDays);
  const pomsInArea = snap.edges
    .filter((e) => e.kind === 'covers' && e.to === areaId)
    .map((e) => e.from);
  const scenariosInArea = new Set(
    snap.edges.filter((e) => e.kind === 'uses' && pomsInArea.includes(e.to)).map((e) => e.from),
  );
  const recentBugs = snap.classifications
    .filter((c) => scenariosInArea.has(c.scenarioId))
    .filter((c) => RISK_WEIGHTS.bugClassifications.has(c.classification))
    .filter((c) => daysBetween(now, new Date(c.ts)) <= config.staleAfterDays);
  const boost = isCritical ? 2 : 1;

  const lines: string[] = [
    '',
    `Area: ${areaId} (${heading})`,
    '',
    `Risk score: ${risk}`,
    '  recent_tickets × critical_boost + recent_bugs',
    `  = ${recentTickets.length} × ${boost} + ${recentBugs.length} = ${risk}`,
    '',
    `Recent tickets (${recentTickets.length}, last ${config.staleAfterDays}d):`,
  ];
  for (const t of recentTickets) {
    lines.push(`  ${t.id}  ${t.fetchedAt.slice(0, 10)}  ${t.summary}`);
  }
  if (recentTickets.length === 0) lines.push('  (none)');
  lines.push('');
  if (recentBugs.length > 0) {
    lines.push(`Recent bugs (${recentBugs.length}, last ${config.staleAfterDays}d):`);
    for (const b of recentBugs) {
      lines.push(`  ${b.ts.slice(0, 10)}  ${pad(b.classification, 14)} scenario ${b.scenarioId}`);
    }
    lines.push('');
  }
  if (status === 'UNCOVERED') {
    lines.push('No POM covers this area. To draft scenarios:');
    lines.push(`  /xera-fill-gap ${areaId}`);
  }
  return `${lines.join('\n')}\n`;
}

export function buildWhyTicket(
  ticketId: string,
  snap: Snapshot,
  config: CoverageConfig,
  now: Date,
): string {
  const ticket = snap.tickets[ticketId];
  if (!ticket) return `Unknown ticket: ${ticketId}\n`;

  const status = computeTicketStatus(ticketId, snap, config.staleAfterDays, now);
  const acs = Object.values(snap.acNodes)
    .filter((ac) => ac.ticketId === ticketId)
    .sort((a, b) => a.index - b.index);
  const satisfiedCount = acs.filter(
    (ac) => computeAcStatus(ac.id, snap, config.staleAfterDays, now) === 'SATISFIED',
  ).length;
  const gapScore = computeAcGapScore(ticketId, snap, config, now);

  const days = daysBetween(now, new Date(ticket.fetchedAt));
  let boostLabel: string;
  if (days <= RISK_WEIGHTS.recencyThresholdDays) boostLabel = '×2.0';
  else if (days <= config.staleAfterDays) boostLabel = '×1.0';
  else boostLabel = '×0.5';

  const lines: string[] = [
    '',
    `Ticket: ${ticketId} (${status}, ${satisfiedCount}/${acs.length} ACs covered)`,
    `  Title: ${ticket.summary}`,
    `  Fetched: ${ticket.fetchedAt.slice(0, 10)} (${Math.floor(days)}d ago, recency boost ${boostLabel})`,
    `  AC gap score: ${gapScore}`,
    '',
    'Acceptance Criteria:',
  ];
  for (const ac of acs) {
    const acStatus = computeAcStatus(ac.id, snap, config.staleAfterDays, now);
    const marker = acStatus === 'SATISFIED' ? '✓' : '✗';
    const satisfyingScenarios = snap.edges
      .filter((e) => e.kind === 'satisfies' && e.to === ac.id)
      .map((e) => e.from);
    const scenarioRef =
      satisfyingScenarios.length > 0 ? ` — scenario "${satisfyingScenarios[0]}"` : '';
    lines.push(`  ${marker} AC-${ac.index + 1}  ${ac.text}${scenarioRef}`);
  }
  lines.push('');
  if (status === 'INCOMPLETE') {
    lines.push('To draft scenarios for unsatisfied ACs:');
    lines.push(`  /xera-fill-gap --ticket ${ticketId}`);
  }
  return `${lines.join('\n')}\n`;
}
