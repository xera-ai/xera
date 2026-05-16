import { loadAllEvents } from '../graph/store';
import type { ClassificationDisputedPayload, Event } from '../graph/types';

function parseDuration(s: string): number {
  // accepts "7d", "30d", "1h", "5m" — returns ms; returns 0 for invalid input
  const match = s.match(/^(\d+)([dhm])$/);
  if (!match) return 0;
  const n = Number.parseInt(match[1]!, 10);
  const unit = match[2]!;
  if (unit === 'd') return n * 86400 * 1000;
  if (unit === 'h') return n * 3600 * 1000;
  if (unit === 'm') return n * 60 * 1000;
  return 0;
}

interface DisputeRow {
  ts: string;
  runId: string;
  scenarioId: string;
  originalClassification: string;
  disputedTo: string;
  qaActor: string;
  qaReason?: string;
}

function eventToRow(e: Event & { type: 'classification.disputed' }): DisputeRow {
  const p = e.payload as ClassificationDisputedPayload;
  const row: DisputeRow = {
    ts: e.ts,
    runId: p.runId,
    scenarioId: p.scenarioId,
    originalClassification: p.originalClassification,
    disputedTo: p.disputedTo,
    qaActor: p.qaActor,
  };
  if (p.qaReason) row.qaReason = p.qaReason;
  return row;
}

function renderText(rows: DisputeRow[]): string {
  if (rows.length === 0) return 'No disputes recorded.\n';
  const lines: string[] = [];
  lines.push(`${rows.length} dispute(s):`);
  for (const r of rows) {
    lines.push(
      `  ${r.ts} | ${r.scenarioId} | ${r.originalClassification} → ${r.disputedTo} | ${r.qaActor}`,
    );
    if (r.qaReason) lines.push(`    reason: ${r.qaReason}`);
  }
  return `${lines.join('\n')}\n`;
}

export async function disputesCmd(argv: string[]): Promise<number> {
  let since: string | undefined;
  let format: 'text' | 'json' = 'text';
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--since') {
      since = argv[++i];
    } else if (argv[i] === '--format') {
      const v = argv[++i];
      if (v === 'json' || v === 'text') format = v;
    }
  }

  const repoRoot = process.cwd();
  const events = loadAllEvents(repoRoot);
  const disputes = events.filter(
    (e): e is Event & { type: 'classification.disputed' } => e.type === 'classification.disputed',
  );

  let cutoffMs: number | undefined;
  if (since) {
    const sinceMs = parseDuration(since);
    if (sinceMs > 0) cutoffMs = Date.now() - sinceMs;
  }

  const rows = disputes
    .filter((e) => cutoffMs === undefined || Date.parse(e.ts) >= cutoffMs)
    .map(eventToRow)
    .sort((a, b) => (a.ts < b.ts ? 1 : -1));

  if (format === 'json') {
    process.stdout.write(JSON.stringify(rows, null, 2));
  } else {
    process.stdout.write(renderText(rows));
  }
  return 0;
}
