import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  writeFileSync,
} from 'node:fs';
import { dirname } from 'node:path';
import { currentYyyyMm, graphPaths } from './paths';
import { safeParseEvent } from './schema';
import { SCHEMA_VERSION } from './types';
import type {
  EdgeRecord,
  Event,
  FailureNode,
  PomNode,
  ScenarioNode,
  Snapshot,
  TicketNode,
} from './types';

export interface AppendOptions {
  skill: string;
  ticketId: string;
  now?: Date;
}

export function appendEvents(repoRoot: string, events: Event[], opts: AppendOptions): string {
  if (events.length === 0) return '';
  const paths = graphPaths(repoRoot);
  const yyyyMm = currentYyyyMm(opts.now);
  const monthDir = paths.eventsMonthDir(yyyyMm);
  mkdirSync(monthDir, { recursive: true });
  const ulid = events[0]!.event_id;
  const finalPath = paths.eventFile(ulid, opts.skill, opts.ticketId, yyyyMm);
  const tmpPath = `${finalPath}.tmp`;
  const body = `${events.map((e) => JSON.stringify(e)).join('\n')}\n`;
  writeFileSync(tmpPath, body);
  renameSync(tmpPath, finalPath);
  return finalPath;
}

export function loadAllEvents(repoRoot: string): Event[] {
  const paths = graphPaths(repoRoot);
  if (!existsSync(paths.eventsDir)) return [];
  const files: string[] = [];
  for (const monthDir of readdirSync(paths.eventsDir, { withFileTypes: true })) {
    if (!monthDir.isDirectory()) continue;
    const monthPath = paths.eventsMonthDir(monthDir.name);
    for (const f of readdirSync(monthPath)) {
      if (f.endsWith('.jsonl')) files.push(`${monthPath}/${f}`);
    }
  }
  files.sort((a, b) => {
    const ua = a.split('/').pop()!.split('-')[0]!;
    const ub = b.split('/').pop()!.split('-')[0]!;
    return ua < ub ? -1 : ua > ub ? 1 : 0;
  });
  const events: Event[] = [];
  for (const file of files) {
    try {
      const lines = readFileSync(file, 'utf8').split('\n').filter(Boolean);
      for (const line of lines) {
        let parsed: unknown;
        try {
          parsed = JSON.parse(line);
        } catch {
          console.warn(`[graph.store] skip-line bad-json ${file}`);
          continue;
        }
        const r = safeParseEvent(parsed);
        if (!r.success) {
          console.warn(`[graph.store] skip-line invalid ${file}`);
          continue;
        }
        events.push(r.data);
      }
    } catch (e) {
      console.warn(`[graph.store] skip-file ${file} ${(e as Error).message}`);
    }
  }
  events.sort((a, b) => (a.event_id < b.event_id ? -1 : a.event_id > b.event_id ? 1 : 0));
  return events;
}

export function computeEventsHash(events: Event[]): string {
  const h = createHash('sha256');
  for (const e of events) h.update(e.event_id);
  return `sha256:${h.digest('hex')}`;
}

export function deriveSnapshot(events: Event[]): Snapshot {
  const tickets: Record<string, TicketNode> = {};
  const scenarios: Record<string, ScenarioNode> = {};
  const poms: Record<string, PomNode> = {};
  const areas: Record<string, { id: string }> = {};
  const edges: EdgeRecord[] = [];
  const latestFailures: Record<string, FailureNode> = {};

  for (const e of events) {
    switch (e.type) {
      case 'ticket.fetched':
        tickets[e.payload.ticketId] = {
          id: e.payload.ticketId,
          summary: e.payload.summary,
          ac: e.payload.ac,
          storyHash: e.payload.storyHash,
          modifiesAreas: e.payload.modifiesAreas,
          fetchedAt: e.ts,
        };
        for (const a of e.payload.modifiesAreas) areas[a] = { id: a };
        for (const link of e.payload.jiraLinks) {
          edges.push({
            kind: 'jira-linked',
            from: e.payload.ticketId,
            to: link.ticketId,
            source: `jira:${link.relation}`,
            discoveredAt: e.ts,
          });
        }
        break;
      case 'ticket.enriched':
        if (tickets[e.payload.ticketId])
          tickets[e.payload.ticketId]!.enrichedAt = e.payload.enrichedAt;
        break;
      case 'scenario.generated':
        scenarios[e.payload.scenarioId] = {
          id: e.payload.scenarioId,
          ticketId: e.payload.ticketId,
          name: e.payload.name,
          gherkin: e.payload.gherkin,
          priority: e.payload.priority,
          featureHash: e.payload.featureHash,
          generatedAt: e.payload.generatedAt,
        };
        edges.push({
          kind: 'tests',
          from: e.payload.ticketId,
          to: e.payload.scenarioId,
          source: 'xera-script',
          discoveredAt: e.ts,
        });
        break;
      case 'pom.generated':
        poms[e.payload.pomId] = {
          id: e.payload.pomId,
          ticketId: e.payload.ticketId,
          filePath: e.payload.filePath,
          route: e.payload.route,
          locators: e.payload.locators,
          scope: e.payload.scope,
        };
        break;
      case 'pom.promoted':
        if (poms[e.payload.pomId]) {
          poms[e.payload.pomId]!.filePath = e.payload.toPath;
          poms[e.payload.pomId]!.scope = 'shared';
        }
        break;
      case 'run.completed':
        if (e.payload.status === 'fail') {
          const fail: FailureNode = {
            id: `${e.payload.runId}:${e.payload.scenarioId}`,
            scenarioId: e.payload.scenarioId,
            runId: e.payload.runId,
            ts: e.ts,
          };
          if (e.payload.traceId) fail.traceId = e.payload.traceId;
          latestFailures[e.payload.scenarioId] = fail;
        } else {
          delete latestFailures[e.payload.scenarioId];
        }
        break;
      case 'edge.discovered': {
        const ed: EdgeRecord = {
          kind: e.payload.kind,
          from: e.payload.from,
          to: e.payload.to,
          source: e.payload.source,
          discoveredAt: e.ts,
        };
        if (e.payload.confidence !== undefined) ed.confidence = e.payload.confidence;
        edges.push(ed);
        break;
      }
      // run.classified and classification.disputed: not materialized in v0.6.0 snapshot
      default:
        break;
    }
  }

  return {
    schema_version: SCHEMA_VERSION,
    generated_at: new Date().toISOString(),
    event_count: events.length,
    events_hash: computeEventsHash(events),
    tickets,
    scenarios,
    poms,
    areas,
    edges,
    latest_failures: latestFailures,
  };
}

export function writeSnapshot(repoRoot: string, snap: Snapshot): void {
  const paths = graphPaths(repoRoot);
  mkdirSync(dirname(paths.snapshotFile), { recursive: true });
  const tmp = `${paths.snapshotFile}.tmp`;
  writeFileSync(tmp, JSON.stringify(snap, null, 2));
  renameSync(tmp, paths.snapshotFile);
}

export function loadSnapshot(repoRoot: string): Snapshot | null {
  const paths = graphPaths(repoRoot);
  if (!existsSync(paths.snapshotFile)) return null;
  try {
    return JSON.parse(readFileSync(paths.snapshotFile, 'utf8')) as Snapshot;
  } catch {
    return null;
  }
}

export function isSnapshotStale(repoRoot: string): boolean {
  const snap = loadSnapshot(repoRoot);
  if (!snap) return true;
  const liveHash = computeEventsHash(loadAllEvents(repoRoot));
  return snap.events_hash !== liveHash;
}
