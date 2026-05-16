import { deriveSnapshot, isSnapshotStale, loadAllEvents, writeSnapshot } from '../graph/store';

export async function graphSnapshotCmd(argv: string[]): Promise<number> {
  const check = argv.includes('--check');
  const noRebuild = argv.includes('--no-rebuild');
  const repoRoot = process.cwd();
  const stale = isSnapshotStale(repoRoot);
  if (check) {
    if (!stale) return 0;
    if (noRebuild) { console.error('[graph-snapshot] stale'); return 1; }
    // fall through to rebuild
  }
  const events = loadAllEvents(repoRoot);
  const snap = deriveSnapshot(events);
  writeSnapshot(repoRoot, snap);
  if (check && stale) {
    console.log(`[graph-snapshot] rebuilt (${events.length} events)`);
  }
  return 0;
}
