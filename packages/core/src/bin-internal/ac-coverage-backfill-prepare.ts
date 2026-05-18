import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { deriveSnapshot, loadAllEvents } from '../graph/store';
import type { Snapshot } from '../graph/types';

interface BackfillInput {
  tickets: Array<{
    id: string;
    summary: string;
    acs: string[];
    scenarios: Array<{ id: string; name: string; gherkin: string }>;
  }>;
}

function findUnmapped(snap: Snapshot): BackfillInput {
  const out: BackfillInput['tickets'] = [];
  for (const ticket of Object.values(snap.tickets)) {
    if (ticket.ac.length === 0) continue;
    const ticketScenarios = Object.values(snap.scenarios).filter((s) => s.ticketId === ticket.id);
    if (ticketScenarios.length === 0) continue;
    const acIdsForTicket = new Set(
      Object.values(snap.acNodes)
        .filter((ac) => ac.ticketId === ticket.id)
        .map((ac) => ac.id),
    );
    // Per-scenario: a scenario is "unmapped" if it has no `satisfies` edge to
    // any of this ticket's ACs. Surface only those — finalize is now additive
    // (#119) so partial mappings won't clobber prior edges.
    const unmappedScenarios = ticketScenarios.filter(
      (s) =>
        !snap.edges.some(
          (e) => e.kind === 'satisfies' && e.from === s.id && acIdsForTicket.has(e.to),
        ),
    );
    if (unmappedScenarios.length === 0) continue;
    out.push({
      id: ticket.id,
      summary: ticket.summary,
      acs: ticket.ac,
      scenarios: unmappedScenarios.map((s) => ({
        id: s.id,
        name: s.name,
        gherkin: s.gherkin,
      })),
    });
  }
  return { tickets: out };
}

interface ParsedArgs {
  outputFile?: string;
}

function parseArgs(argv: string[]): ParsedArgs {
  const args: ParsedArgs = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--output') {
      const v = argv[++i];
      if (v !== undefined) args.outputFile = v;
    } else if (a === '--help-stub') {
      /* no-op */
    } else {
      console.error(`[ac-coverage-backfill-prepare] unknown flag: ${a}`);
      return args;
    }
  }
  return args;
}

export async function acCoverageBackfillPrepareCmd(argv: string[]): Promise<number> {
  const args = parseArgs(argv);
  const cwd = process.cwd();
  const snap = deriveSnapshot(loadAllEvents(cwd));
  const input = findUnmapped(snap);

  const outDir = join(cwd, '.xera/coverage');
  mkdirSync(outDir, { recursive: true });
  const outPath = args.outputFile ?? join(outDir, 'ac-backfill-input.json');
  writeFileSync(outPath, JSON.stringify(input, null, 2));
  return 0;
}
