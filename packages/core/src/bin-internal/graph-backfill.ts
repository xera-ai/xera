import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { recordScriptImpl } from './graph-record-script';

async function backfillTicket(repoRoot: string, ticket: string, dryRun: boolean): Promise<number> {
  // 1) Synthesize ticket.fetched from story.md (use story.md mtime)
  const storyPath = join(repoRoot, '.xera', ticket, 'story.md');
  if (!existsSync(storyPath)) return 0;

  const { recordFetch } = await import('./graph-record');
  // Re-use the same code path; in dry-run we don't actually call appendEvents.
  // For simplicity in v0.6.0, dry-run lists ticket count and returns.
  if (dryRun) {
    console.log(`[backfill dry-run] would backfill ${ticket}`);
    return 0;
  }
  // fetch first (establishes ticket node), then script (adds scenarios/POMs).
  await recordFetch(repoRoot, ticket);
  await recordScriptImpl(repoRoot, ticket);
  return 0;
}

export async function graphBackfillCmd(argv: string[]): Promise<number> {
  const dryRun = argv.includes('--dry-run');
  const repoRoot = process.cwd();
  const xeraDir = join(repoRoot, '.xera');
  if (!existsSync(xeraDir)) {
    console.log('[backfill] no .xera/ directory');
    return 0;
  }
  const tickets: string[] = [];
  for (const entry of readdirSync(xeraDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    if (entry.name === 'graph') continue;
    if (entry.name.startsWith('.')) continue;
    if (!/^[A-Z]+-\d+$/.test(entry.name)) continue;
    tickets.push(entry.name);
  }
  console.log(`[backfill] found ${tickets.length} tickets`);
  for (const t of tickets) await backfillTicket(repoRoot, t, dryRun);
  console.log(`[backfill] done`);
  return 0;
}
