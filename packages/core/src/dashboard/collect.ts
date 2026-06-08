import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { readStatus } from '../artifact/status';
import { loadConfig } from '../config/load';
import { deriveSnapshot, loadAllEvents } from '../graph/store';
import type {
  AppliedFilters,
  AreaStat,
  ClassificationBin,
  CollectOpts,
  DashboardSnapshot,
  RecentFailure,
  TicketRow,
} from './types';

const TICKET_RE = /^[A-Z][A-Z0-9-]+$/;
const DAY_MS = 86_400_000;

function parseDurationMs(s: string): number {
  const m = s.match(/^(\d+)([smhd])$/);
  if (!m) throw new Error(`invalid --since '${s}' (expected like '24h', '7d')`);
  const n = Number(m[1]);
  const unit = m[2];
  return n * (unit === 's' ? 1000 : unit === 'm' ? 60_000 : unit === 'h' ? 3_600_000 : DAY_MS);
}

// Returns the latest run id that has a playwright-report/, or null.
// Caller writes both `has_html_report` (boolean for backwards-compat) and
// `latest_run_id` (the real ULID, used by renderHtml for the link target —
// `runs/latest/` is NOT a real on-disk path; runs live at `runs/<ULID>/`).
function findLatestPlaywrightRun(xeraDir: string, ticketId: string): string | null {
  const runsDir = join(xeraDir, ticketId, 'runs');
  if (!existsSync(runsDir)) return null;
  const runs = readdirSync(runsDir).sort().reverse();
  for (const runId of runs) {
    if (existsSync(join(runsDir, runId, 'playwright-report', 'index.html'))) {
      return runId;
    }
  }
  return null;
}

export async function collectDashboard(cwd: string, opts: CollectOpts): Promise<DashboardSnapshot> {
  const config = await loadConfig(cwd);
  const xeraDir = join(cwd, '.xera');
  const events = loadAllEvents(cwd);
  const snap = deriveSnapshot(events);

  const sinceMs = opts.since ? parseDurationMs(opts.since) : undefined;
  const sinceCutoff = sinceMs ? Date.now() - sinceMs : 0;
  const staleAfterMs = (config.dashboard?.staleAfterDays ?? 7) * DAY_MS;
  const recentLimit = config.dashboard?.recentFailureLimit ?? 10;

  const allTickets: TicketRow[] = [];
  if (existsSync(xeraDir)) {
    const entries = readdirSync(xeraDir, { withFileTypes: true }).filter(
      (d) => d.isDirectory() && TICKET_RE.test(d.name),
    );

    for (const entry of entries) {
      const ticketId = entry.name;
      const statusPath = join(xeraDir, ticketId, 'status.json');
      const areas = snap.tickets[ticketId]?.modifiesAreas ?? [];
      const latestRunId = findLatestPlaywrightRun(xeraDir, ticketId);
      const hasHtml = latestRunId !== null;

      if (!existsSync(statusPath)) {
        allTickets.push({
          ticketId,
          result: 'NEVER_RUN',
          classification: null,
          confidence: null,
          scenarios: { total: 0, passed: 0, failed: 0 },
          lastRun: null,
          areas,
          has_html_report: hasHtml,
          latest_run_id: latestRunId,
        });
        continue;
      }

      try {
        const status = readStatus(statusPath);
        if (!status) throw new Error('readStatus returned null');
        allTickets.push({
          ticketId,
          result: status.result,
          classification: status.classification,
          confidence: status.confidence,
          scenarios: {
            total: status.scenarios.total,
            passed: status.scenarios.passed,
            failed: status.scenarios.failed,
          },
          lastRun: status.lastRun,
          areas,
          has_html_report: hasHtml,
          latest_run_id: latestRunId,
        });
      } catch {
        allTickets.push({
          ticketId,
          result: 'UNKNOWN',
          classification: null,
          confidence: null,
          scenarios: { total: 0, passed: 0, failed: 0 },
          lastRun: null,
          areas,
          has_html_report: hasHtml,
          latest_run_id: latestRunId,
        });
      }
    }
  }

  let filtered = allTickets;
  if (opts.failingOnly) filtered = filtered.filter((t) => t.result === 'FAIL');
  if (opts.classifications?.length) {
    const set = new Set(opts.classifications);
    filtered = filtered.filter((t) => t.classification !== null && set.has(t.classification));
  }
  if (opts.areas?.length) {
    const set = new Set(opts.areas);
    filtered = filtered.filter((t) => t.areas.some((a) => set.has(a)));
  }

  const totals = {
    tickets: filtered.length,
    last_pass: filtered.filter((t) => t.result === 'PASS').length,
    last_fail: filtered.filter((t) => t.result === 'FAIL').length,
    never_run: filtered.filter((t) => t.result === 'NEVER_RUN').length,
    scenarios_pass: filtered.reduce((s, t) => s + t.scenarios.passed, 0),
    scenarios_fail: filtered.reduce((s, t) => s + t.scenarios.failed, 0),
  };

  const classBins = new Map<string, number>();
  for (const t of filtered) {
    if (t.classification)
      classBins.set(t.classification, (classBins.get(t.classification) ?? 0) + 1);
  }
  const classifications: ClassificationBin[] = Array.from(classBins.entries())
    .map(([classification, count]) => ({ classification, count }))
    .sort((a, b) => b.count - a.count);

  const now = Date.now();
  const recent_failures: RecentFailure[] = filtered
    .filter((t) => t.result === 'FAIL' && t.lastRun !== null)
    .filter((t) => {
      if (sinceMs === undefined) return true;
      const ts = new Date(t.lastRun as string).getTime();
      // Window is [now - sinceMs, now]. Future timestamps (ts > now) fall
      // outside "the past N units" and are excluded.
      return ts >= sinceCutoff && ts <= now;
    })
    .sort(
      (a, b) => new Date(b.lastRun as string).getTime() - new Date(a.lastRun as string).getTime(),
    )
    .slice(0, recentLimit)
    .map((t) => ({
      ticketId: t.ticketId,
      classification: t.classification as string,
      confidence: t.confidence as 'low' | 'medium' | 'high',
      lastRun: t.lastRun as string,
      scenarios_failed: t.scenarios.failed,
      scenarios_total: t.scenarios.total,
      areas: t.areas,
    }));

  const stale = filtered.filter(
    (t) =>
      t.lastRun !== null &&
      t.result !== 'NEVER_RUN' &&
      Date.now() - new Date(t.lastRun).getTime() > staleAfterMs,
  );

  const criticalAreaSet = new Set(config.coverage?.criticalAreas ?? []);
  const areaToTickets = new Map<string, string[]>();
  for (const t of filtered) {
    if (t.result !== 'FAIL') continue;
    for (const a of t.areas) {
      const list = areaToTickets.get(a);
      if (list) list.push(t.ticketId);
      else areaToTickets.set(a, [t.ticketId]);
    }
  }
  const allAreas: AreaStat[] = Array.from(areaToTickets.entries()).map(([area, tickets]) => ({
    area,
    failing_tickets: tickets,
    is_critical: criticalAreaSet.has(area),
  }));

  const critical_alerts = allAreas.filter((a) => a.is_critical);
  const top_failing_areas = [...allAreas]
    .sort((a, b) => b.failing_tickets.length - a.failing_tickets.length)
    .slice(0, 5);

  filtered.sort((a, b) => {
    if (a.lastRun === null && b.lastRun === null) return a.ticketId.localeCompare(b.ticketId);
    if (a.lastRun === null) return 1;
    if (b.lastRun === null) return -1;
    return new Date(b.lastRun).getTime() - new Date(a.lastRun).getTime();
  });

  const filters_applied: AppliedFilters = {};
  if (opts.since) filters_applied.since = opts.since;
  if (opts.classifications?.length) filters_applied.classifications = opts.classifications;
  if (opts.areas?.length) filters_applied.areas = opts.areas;
  if (opts.failingOnly) filters_applied.failing_only = true;

  return {
    generated_at: new Date().toISOString(),
    totals,
    classifications,
    tickets: filtered,
    recent_failures,
    stale,
    critical_alerts,
    top_failing_areas,
    filters_applied,
  };
}
