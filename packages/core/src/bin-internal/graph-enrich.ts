import { enrichTicket } from '../graph/enrich';

export async function graphEnrichCmd(argv: string[]): Promise<number> {
  let ticket: string | undefined;
  let force = false;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--ticket') ticket = argv[++i];
    else if (argv[i] === '--force') force = true;
  }

  const repoRoot = process.cwd();

  if (!ticket) {
    console.error('[graph-enrich] usage: graph-enrich --ticket <id> [--force]');
    return 1;
  }

  try {
    const result = await enrichTicket(repoRoot, ticket, { force });
    console.log(`[graph-enrich] ${ticket} enriched (${result.similarCount} similar edges, at ${result.enrichedAt})`);
    return 0;
  } catch (e) {
    console.error(`[graph-enrich] ${ticket} failed: ${(e as Error).message}`);
    return 1;
  }
}
