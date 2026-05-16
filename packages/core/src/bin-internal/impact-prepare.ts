import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { renderImpactMarkdown, walkImpact } from '../graph/impact';
import { deriveSnapshot, loadAllEvents } from '../graph/store';
import type { ImpactOpts, ImpactReport } from '../graph/impact';
import type { Priority } from '../graph/types';

function parseDepth(s: string | undefined): 1 | 2 | 3 {
  const n = s ? Number.parseInt(s, 10) : 2;
  if (n === 1 || n === 3) return n;
  return 2;
}

function parseMinPriority(s: string | undefined): Priority | undefined {
  if (s === 'p0' || s === 'p1' || s === 'p2') return s;
  return undefined;
}

export async function impactPrepareCmd(argv: string[]): Promise<number> {
  const ticket = argv[0];
  if (!ticket || ticket.startsWith('--')) {
    console.error('[impact-prepare] usage: impact-prepare <TICKET> [--depth 1|2|3] [--min-priority p0|p1|p2] [--quiet]');
    return 1;
  }

  let depth: 1 | 2 | 3 = 2;
  let minPriority: Priority | undefined;
  let quiet = false;
  for (let i = 1; i < argv.length; i++) {
    if (argv[i] === '--depth') depth = parseDepth(argv[++i]);
    else if (argv[i] === '--min-priority') minPriority = parseMinPriority(argv[++i]);
    else if (argv[i] === '--quiet') quiet = true;
  }

  const repoRoot = process.cwd();
  const graph = deriveSnapshot(loadAllEvents(repoRoot));
  const target = graph.tickets[ticket];
  if (!target) {
    console.error(`[impact-prepare] ticket ${ticket} not in graph; run /xera-fetch first`);
    return 2;
  }

  const opts: ImpactOpts = { depth };
  if (minPriority) opts.minPriority = minPriority;

  const scenarios = walkImpact(graph, target, opts);

  const report: ImpactReport = {
    targetTicket: ticket,
    modifiedAreas: target.modifiesAreas,
    scenarios,
    generatedAt: new Date().toISOString(),
  };

  const impactDir = join(repoRoot, '.xera/impact');
  mkdirSync(impactDir, { recursive: true });
  writeFileSync(join(impactDir, `${ticket}.json`), JSON.stringify(report, null, 2));
  if (!quiet) {
    writeFileSync(join(impactDir, `${ticket}.md`), renderImpactMarkdown(report));
  }
  return 0;
}
