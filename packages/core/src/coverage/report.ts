import type { Snapshot } from '../graph/types';
import { computeAcGapScore, computeAreaRisk, RISK_WEIGHTS } from './risk';
import { type AreaStatus, computeAcStatus, computeAreaStatus, computeTicketStatus } from './status';
import type { CoverageConfig } from './types';

export interface AreaReportRow {
  id: string;
  status: AreaStatus;
  risk: number;
  breakdown: {
    recentTickets: number;
    recentBugs: number;
    criticalBoost: 1 | 2;
  };
}

export interface TicketReportRow {
  id: string;
  summary: string;
  acCount: number;
  satisfiedCount: number;
  gapScore: number;
  unsatisfiedAcs: Array<{ index: number; text: string }>;
}

export interface CoverageReport {
  generatedAt: string;
  windowDays: number;
  areas: AreaReportRow[];
  tickets: TicketReportRow[];
  acBackfillNeeded: boolean;
}

const STATUS_RANK: Record<AreaStatus, number> = {
  UNCOVERED: 0,
  STALE: 1,
  COVERED: 2,
};

function daysBetween(a: Date, b: Date): number {
  return Math.abs(a.getTime() - b.getTime()) / (1000 * 60 * 60 * 24);
}

export function buildCoverageReport(
  snap: Snapshot,
  config: CoverageConfig,
  now: Date,
): CoverageReport {
  const areas: AreaReportRow[] = Object.keys(snap.areas).map((areaId) => {
    const status = computeAreaStatus(areaId, snap, config.staleAfterDays, now);
    const risk = computeAreaRisk(areaId, snap, config, now);

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
    const criticalBoost: 1 | 2 = config.criticalAreas.includes(areaId) ? 2 : 1;

    return {
      id: areaId,
      status,
      risk,
      breakdown: { recentTickets, recentBugs, criticalBoost },
    };
  });

  areas.sort((a, b) => {
    if (STATUS_RANK[a.status] !== STATUS_RANK[b.status]) {
      return STATUS_RANK[a.status] - STATUS_RANK[b.status];
    }
    if (a.status === 'COVERED') return a.id.localeCompare(b.id);
    if (b.risk !== a.risk) return b.risk - a.risk;
    return a.id.localeCompare(b.id);
  });

  const tickets: TicketReportRow[] = Object.values(snap.tickets)
    .filter((t) => computeTicketStatus(t.id, snap, config.staleAfterDays, now) === 'INCOMPLETE')
    .map((t) => {
      const acs = Object.values(snap.acNodes)
        .filter((ac) => ac.ticketId === t.id)
        .sort((a, b) => a.index - b.index);
      const unsatisfiedAcs = acs
        .filter((ac) => computeAcStatus(ac.id, snap, config.staleAfterDays, now) === 'UNSATISFIED')
        .map((ac) => ({ index: ac.index, text: ac.text }));
      return {
        id: t.id,
        summary: t.summary,
        acCount: acs.length,
        satisfiedCount: acs.length - unsatisfiedAcs.length,
        gapScore: computeAcGapScore(t.id, snap, config, now),
        unsatisfiedAcs,
      };
    })
    .sort((a, b) => b.gapScore - a.gapScore || a.id.localeCompare(b.id));

  return {
    generatedAt: now.toISOString(),
    windowDays: config.staleAfterDays,
    areas,
    tickets,
    acBackfillNeeded: needsBackfill(snap),
  };
}

function needsBackfill(snap: Snapshot): boolean {
  // True when at least one scenario lacks a `satisfies` edge to its ticket's
  // ACs. Mirrors `findUnmapped` in ac-coverage-backfill-prepare so the flag
  // and the prepare output stay consistent for partially mapped tickets (#119).
  for (const ticket of Object.values(snap.tickets)) {
    const acIdsForTicket = new Set(
      Object.values(snap.acNodes)
        .filter((ac) => ac.ticketId === ticket.id)
        .map((ac) => ac.id),
    );
    if (acIdsForTicket.size === 0) continue;
    const scenariosForTicket = Object.values(snap.scenarios).filter(
      (s) => s.ticketId === ticket.id,
    );
    if (scenariosForTicket.length === 0) continue;
    for (const s of scenariosForTicket) {
      const mapped = snap.edges.some(
        (e) => e.kind === 'satisfies' && e.from === s.id && acIdsForTicket.has(e.to),
      );
      if (!mapped) return true;
    }
  }
  return false;
}

export interface RenderOptions {
  includeCovered?: boolean;
}

function pad(s: string, n: number): string {
  return s.length >= n ? s : `${s}${' '.repeat(n - s.length)}`;
}

export function renderMarkdown(report: CoverageReport, options: RenderOptions = {}): string {
  const lines: string[] = [];
  const dateOnly = report.generatedAt.slice(0, 10);
  lines.push('', `Coverage report — generated ${dateOnly} · window ${report.windowDays}d`, '');

  const uncovered = report.areas.filter((a) => a.status === 'UNCOVERED');
  if (uncovered.length > 0) {
    lines.push(
      `UNCOVERED — ${uncovered.length} area${uncovered.length === 1 ? '' : 's'}, sorted by risk`,
    );
    lines.push('');
    uncovered.forEach((a, i) => {
      const parts: string[] = [`${a.breakdown.recentTickets} tickets`];
      if (a.breakdown.recentBugs > 0) parts.push(`${a.breakdown.recentBugs} bugs`);
      if (a.breakdown.criticalBoost === 2) parts.push('critical ×2');
      lines.push(`  #${i + 1}  ${pad(a.id, 10)} risk ${a.risk}    ${parts.join(' · ')}`);
    });
    lines.push('');
  }

  const stale = report.areas.filter((a) => a.status === 'STALE');
  if (stale.length > 0) {
    lines.push(
      `STALE — ${stale.length} area${stale.length === 1 ? '' : 's'}, has tests but no PASS in ${report.windowDays}d`,
    );
    lines.push('');
    stale.forEach((a, i) => {
      lines.push(`  #${i + 1}  ${pad(a.id, 10)} (see --why ${a.id} for details)`);
    });
    lines.push('');
  }

  if (report.tickets.length > 0) {
    lines.push(
      `AC GAPS — ${report.tickets.length} ticket${report.tickets.length === 1 ? '' : 's'} with unsatisfied acceptance criteria`,
    );
    lines.push('');
    for (const t of report.tickets) {
      lines.push(
        `  ${t.id}  ${t.satisfiedCount}/${t.acCount} ACs covered · gap_score ${t.gapScore}`,
      );
      for (const ac of t.unsatisfiedAcs) {
        lines.push(`    ✗ AC-${ac.index + 1}  ${ac.text}`);
      }
      lines.push('');
    }
  }

  const covered = report.areas.filter((a) => a.status === 'COVERED');
  if (covered.length > 0) {
    if (options.includeCovered) {
      lines.push(`COVERED — ${covered.length} area${covered.length === 1 ? '' : 's'}`);
      lines.push('');
      covered.forEach((a, i) => {
        lines.push(`  #${i + 1}  ${pad(a.id, 10)} ok`);
      });
      lines.push('');
    } else {
      lines.push(
        `COVERED — ${covered.length} area${covered.length === 1 ? '' : 's'} (collapsed; show with --all)`,
      );
      lines.push('');
    }
  }

  return lines.join('\n');
}
