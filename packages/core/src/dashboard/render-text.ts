import type { DashboardSnapshot } from './types';

const BOX_WIDTH = 75;

export interface RenderTextOpts {
  color?: boolean;
}

function pct(n: number, total: number): string {
  return total === 0 ? '0%' : `${Math.round((n / total) * 100)}%`;
}

function bar(count: number, max: number, width = 12): string {
  if (max === 0) return '';
  return '█'.repeat(Math.max(1, Math.round((count / max) * width)));
}

function pad(s: string, n: number): string {
  return s.length >= n ? s : s + ' '.repeat(n - s.length);
}

function truncate(s: string, n: number): string {
  return s.length <= n ? s : `${s.slice(0, n - 1)}…`;
}

function box(line: string): string {
  return `║ ${pad(line, BOX_WIDTH - 4)} ║`;
}

const TOP = `╔${'═'.repeat(BOX_WIDTH - 2)}╗`;
const MID = `╠${'═'.repeat(BOX_WIDTH - 2)}╣`;
const BOT = `╚${'═'.repeat(BOX_WIDTH - 2)}╝`;

function colorize(text: string, c: 'green' | 'red' | 'gray' | 'yellow', enabled: boolean): string {
  if (!enabled) return text;
  const codes = { green: '32', red: '31', gray: '90', yellow: '33' };
  return `\x1b[${codes[c]}m${text}\x1b[0m`;
}

export function renderText(snap: DashboardSnapshot, opts: RenderTextOpts = {}): string {
  // Color enabled only when explicitly true, or undefined + attached to a TTY.
  const color = opts.color ?? Boolean(process.stdout.isTTY);
  const lines: string[] = [];

  if (snap.totals.tickets === 0) {
    lines.push('xera Dashboard — no tickets yet');
    lines.push('');
    lines.push('Run /xera-fetch <TICKET> to add a ticket.');
    return lines.join('\n');
  }

  lines.push(TOP);
  lines.push(box(`xera Dashboard — last run summary across ${snap.totals.tickets} tickets`));
  lines.push(MID);
  lines.push(
    box(
      `Tickets:  ${snap.totals.tickets}    ` +
        `${colorize('PASS', 'green', color)}: ${snap.totals.last_pass} (${pct(snap.totals.last_pass, snap.totals.tickets)})   ` +
        `${colorize('FAIL', 'red', color)}: ${snap.totals.last_fail} (${pct(snap.totals.last_fail, snap.totals.tickets)})   ` +
        `NEVER_RUN: ${snap.totals.never_run}`,
    ),
  );
  const scTotal = snap.totals.scenarios_pass + snap.totals.scenarios_fail;
  lines.push(
    box(
      `Scenarios: ${scTotal}  PASS: ${snap.totals.scenarios_pass} (${pct(snap.totals.scenarios_pass, scTotal)})  FAIL: ${snap.totals.scenarios_fail}`,
    ),
  );
  lines.push(BOT);
  lines.push('');

  if (snap.classifications.length > 0) {
    lines.push('Classifications (last run):');
    const maxCount = Math.max(...snap.classifications.map((c) => c.count));
    const maxLabel = Math.max(...snap.classifications.map((c) => c.classification.length), 12);
    for (const c of snap.classifications) {
      lines.push(`  ${pad(c.classification, maxLabel)} ${pad(bar(c.count, maxCount), 14)} ${c.count}`);
    }
    lines.push('');
  }

  if (snap.recent_failures.length > 0) {
    lines.push('Recent failures:');
    for (const f of snap.recent_failures) {
      const areas = truncate(f.areas.join(', '), 30);
      lines.push(
        `  ${pad(f.ticketId, 12)} ${colorize('FAIL', 'red', color)}  ${pad(f.classification, 17)} conf=${pad(f.confidence, 6)}  ${f.lastRun.slice(0, 16)}  ${f.scenarios_failed}/${f.scenarios_total}  areas: ${areas}`,
      );
    }
    lines.push('');
  }

  if (snap.stale.length > 0) {
    lines.push('Stale (last run > threshold):');
    for (const t of snap.stale) {
      lines.push(
        `  ${pad(t.ticketId, 12)} ${pad(t.result, 6)} ${(t.lastRun ?? '').slice(0, 16)}  areas: ${truncate(t.areas.join(', '), 30)}`,
      );
    }
    lines.push('');
  }

  if (snap.critical_alerts.length > 0) {
    lines.push('Critical areas with failures:');
    for (const a of snap.critical_alerts) {
      lines.push(
        `  ⚠ ${a.area}: ${a.failing_tickets.length} failing ticket${a.failing_tickets.length === 1 ? '' : 's'} (${a.failing_tickets.join(', ')})`,
      );
    }
    lines.push('');
  }

  if (snap.top_failing_areas.length > 0) {
    lines.push('Top failing areas:');
    lines.push('  ' + snap.top_failing_areas.map((a) => `${a.area} (${a.failing_tickets.length})`).join('   '));
    lines.push('');
  }

  lines.push('→ Inspect a ticket:   /xera-report <TICKET>');
  lines.push('→ HTML viewer:        npx xera dashboard --serve');

  return lines.join('\n');
}
