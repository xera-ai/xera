import { deriveSnapshot, loadAllEvents } from '../graph/store';
import type { Snapshot } from '../graph/types';

function filterByTicket(snap: Snapshot, ticket: string): Snapshot {
  const out: Snapshot = {
    ...snap,
    tickets: snap.tickets[ticket] ? { [ticket]: snap.tickets[ticket]! } : {},
    scenarios: Object.fromEntries(Object.entries(snap.scenarios).filter(([, s]) => s.ticketId === ticket)),
    poms: Object.fromEntries(Object.entries(snap.poms).filter(([, p]) => p.ticketId === ticket)),
    edges: snap.edges.filter((e) => e.from === ticket || e.to === ticket),
  };
  return out;
}

function renderText(snap: Snapshot): string {
  const out: string[] = [];
  out.push(`Graph snapshot — ${snap.event_count} events`);
  out.push(`Tickets: ${Object.keys(snap.tickets).length}`);
  out.push(`Scenarios: ${Object.keys(snap.scenarios).length}`);
  out.push(`POMs: ${Object.keys(snap.poms).length}`);
  out.push(`Edges: ${snap.edges.length}`);
  for (const t of Object.values(snap.tickets)) {
    out.push(`  ${t.id} — ${t.summary}`);
  }
  return out.join('\n');
}

export async function graphQueryCmd(argv: string[]): Promise<number> {
  let ticket: string | undefined; let format: 'text' | 'json' = 'text';
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--ticket') ticket = argv[++i];
    else if (argv[i] === '--format') format = argv[++i] as 'text' | 'json';
  }
  const repoRoot = process.cwd();
  let snap = deriveSnapshot(loadAllEvents(repoRoot));
  if (ticket) snap = filterByTicket(snap, ticket);
  if (format === 'json') process.stdout.write(JSON.stringify(snap, null, 2));
  else process.stdout.write(renderText(snap));
  return 0;
}
