import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { deriveSnapshot, loadAllEvents } from '../graph/store';
import type { Snapshot } from '../graph/types';

interface AreaContext {
  mode: 'area';
  area: string;
  tickets: Array<{ id: string; summary: string; ac: string[] }>;
  existingScenarios: Array<{ areaSlug: string; gherkin: string }>;
}

interface TicketContext {
  mode: 'ticket';
  ticket: { id: string; summary: string; ac: string[] };
  unsatisfiedAcs: Array<{ index: number; text: string }>;
  existingScenarios: Array<{ scenarioId: string; name: string; gherkin: string }>;
}

interface ParsedArgs {
  area?: string;
  ticket?: string;
  outputDir?: string;
}

function parseArgs(argv: string[]): ParsedArgs | { error: string } {
  const args: ParsedArgs = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--area') {
      const v = argv[++i];
      if (v !== undefined) args.area = v;
    } else if (a === '--ticket') {
      const v = argv[++i];
      if (v !== undefined) args.ticket = v;
    } else if (a === '--output-dir') {
      const v = argv[++i];
      if (v !== undefined) args.outputDir = v;
    } else if (a === '--help-stub') {
      /* no-op */
    } else {
      return { error: `unknown flag: ${a}` };
    }
  }
  if (!args.area && !args.ticket) return { error: 'one of --area or --ticket required' };
  if (args.area && args.ticket) return { error: '--area and --ticket are mutually exclusive' };
  return args;
}

function buildAreaContext(snap: Snapshot, area: string): AreaContext | null {
  // Use modifiesAreas on ticket nodes (set from ticket.fetched) to find tickets for this area.
  // edge.discovered with kind='modifies' is an additional source, but ticket.fetched also
  // populates ticket.modifiesAreas directly — so check both.
  const edgeTicketIds = new Set(
    snap.edges.filter((e) => e.kind === 'modifies' && e.to === area).map((e) => e.from),
  );
  const ticketsForArea = Object.values(snap.tickets).filter(
    (t) => t.modifiesAreas.includes(area) || edgeTicketIds.has(t.id),
  );
  if (ticketsForArea.length === 0) return null;

  // existingScenarios from other areas — limit to 3 to keep prompt input small
  const scenariosFromOtherAreas = Object.values(snap.scenarios)
    .filter((s) => {
      const t = snap.tickets[s.ticketId];
      if (!t) return false;
      return !t.modifiesAreas.includes(area) && t.modifiesAreas.length > 0;
    })
    .slice(0, 3)
    .map((s) => {
      const ownerTicket = snap.tickets[s.ticketId];
      const areaSlug = ownerTicket?.modifiesAreas[0] ?? 'unknown';
      return { areaSlug, gherkin: s.gherkin };
    });

  return {
    mode: 'area',
    area,
    tickets: ticketsForArea.map((t) => ({ id: t.id, summary: t.summary, ac: t.ac })),
    existingScenarios: scenariosFromOtherAreas,
  };
}

function buildTicketContext(snap: Snapshot, ticketId: string): TicketContext | null {
  const ticket = snap.tickets[ticketId];
  if (!ticket) return null;

  const acNodesForTicket = Object.values(snap.acNodes)
    .filter((ac) => ac.ticketId === ticketId)
    .sort((a, b) => a.index - b.index);
  const satisfiedAcIds = new Set(
    snap.edges
      .filter((e) => e.kind === 'satisfies' && acNodesForTicket.some((ac) => ac.id === e.to))
      .map((e) => e.to),
  );
  const unsatisfiedAcs = acNodesForTicket
    .filter((ac) => !satisfiedAcIds.has(ac.id))
    .map((ac) => ({ index: ac.index, text: ac.text }));

  if (unsatisfiedAcs.length === 0) return null;

  const existingScenarios = Object.values(snap.scenarios)
    .filter((s) => s.ticketId === ticketId)
    .map((s) => ({ scenarioId: s.id, name: s.name, gherkin: s.gherkin }));

  return {
    mode: 'ticket',
    ticket: { id: ticket.id, summary: ticket.summary, ac: ticket.ac },
    unsatisfiedAcs,
    existingScenarios,
  };
}

export async function fillGapPrepareCmd(argv: string[]): Promise<number> {
  const parsed = parseArgs(argv);
  if ('error' in parsed) {
    console.error(`[fill-gap-prepare] ${parsed.error}`);
    return 1;
  }

  const cwd = process.cwd();
  const snap = deriveSnapshot(loadAllEvents(cwd));

  let context: AreaContext | TicketContext | null;
  let scope: string;
  if (parsed.area) {
    context = buildAreaContext(snap, parsed.area);
    scope = parsed.area;
    if (!context) {
      console.error(
        `[fill-gap-prepare] area "${parsed.area}" has no tickets modifying it; cannot fill`,
      );
      return 2;
    }
  } else {
    context = buildTicketContext(snap, parsed.ticket!);
    scope = parsed.ticket!;
    if (!context) {
      console.error(
        `[fill-gap-prepare] ticket "${parsed.ticket}" not found or has no unsatisfied ACs`,
      );
      return 2;
    }
  }

  const outDir = parsed.outputDir ?? join(cwd, '.xera/coverage', scope);
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, 'context.json'), JSON.stringify(context, null, 2));
  return 0;
}
