import { join } from 'node:path';

export interface GraphPaths {
  eventsDir: string;
  snapshotFile: string;
  costLog: string;
  eventsMonthDir(yyyyMm: string): string;
  eventFile(ulid: string, skill: string, ticketId: string, yyyyMm: string): string;
}

export function graphPaths(repoRoot: string): GraphPaths {
  const eventsDir = join(repoRoot, '.xera/graph/events');
  return {
    eventsDir,
    snapshotFile: join(repoRoot, '.xera/graph/snapshot.json'),
    costLog: join(repoRoot, '.xera/cost-log.jsonl'),
    eventsMonthDir: (yyyyMm) => join(eventsDir, yyyyMm),
    eventFile: (ulid, skill, ticketId, yyyyMm) =>
      join(eventsDir, yyyyMm, `${ulid}-${skill}-${ticketId}.jsonl`),
  };
}

export function currentYyyyMm(now: Date = new Date()): string {
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}
