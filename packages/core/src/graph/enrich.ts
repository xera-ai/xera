import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';
import { appendEvents, deriveSnapshot, loadAllEvents } from './store';
import { ulid } from './ulid';
import { SCHEMA_VERSION } from './types';
import type { EdgeDiscoveredPayload, Event, TicketEnrichedPayload } from './types';

const MAX_SIMILAR_EDGES = 10;
const MIN_CONFIDENCE = 0.7;

const SimilarEntrySchema = z.object({
  ticketId: z.string().regex(/^[A-Z][A-Z0-9]*-\d+$/),
  confidence: z.number(),
  reason: z.string(),
});

const EnrichmentInputSchema = z.object({
  similar: z.array(SimilarEntrySchema),
});

export interface EnrichOptions {
  force?: boolean;
}

export interface EnrichResult {
  ticketId: string;
  similarCount: number;
  enrichedAt: string;
}

const nowIso = () => new Date().toISOString();

const mk = <T extends Event['type']>(
  actor: string,
  type: T,
  payload: Extract<Event, { type: T }>['payload'],
): Event =>
  ({ event_id: ulid(), schema_version: SCHEMA_VERSION, ts: nowIso(), actor, type, payload }) as Event;

export async function enrichTicket(repoRoot: string, ticketId: string, opts: EnrichOptions): Promise<EnrichResult> {
  const inputPath = join(repoRoot, '.xera', ticketId, 'enrichment-input.json');
  if (!existsSync(inputPath)) {
    throw new Error(`enrichment-input.json not found at ${inputPath}`);
  }

  const raw = JSON.parse(readFileSync(inputPath, 'utf8'));
  const parsed = EnrichmentInputSchema.safeParse(raw);
  if (!parsed.success) {
    throw new Error(`invalid enrichment-input.json: ${parsed.error.message}`);
  }

  const snapshot = deriveSnapshot(loadAllEvents(repoRoot));
  if (!snapshot.tickets[ticketId]) {
    throw new Error(`ticket ${ticketId} not in graph; run /xera-fetch first`);
  }

  if (snapshot.tickets[ticketId]!.enrichedAt && !opts.force) {
    return { ticketId, similarCount: 0, enrichedAt: snapshot.tickets[ticketId]!.enrichedAt! };
  }

  const validated = parsed.data.similar
    .map((s) => ({ ...s, confidence: Math.max(0, Math.min(1, s.confidence)) }))
    .filter((s) => s.confidence >= MIN_CONFIDENCE)
    .filter((s) => snapshot.tickets[s.ticketId] !== undefined)
    .filter((s) => s.ticketId !== ticketId)
    .slice(0, MAX_SIMILAR_EDGES);

  const events: Event[] = [];
  for (const s of validated) {
    const payload: EdgeDiscoveredPayload = {
      kind: 'similar',
      from: ticketId,
      to: s.ticketId,
      confidence: s.confidence,
      source: `claude:${s.reason.slice(0, 80)}`,
    };
    events.push(mk('graph-enrich', 'edge.discovered', payload));
  }

  const enrichedAt = nowIso();
  const enrichedPayload: TicketEnrichedPayload = {
    ticketId,
    enrichedAt,
    similarCount: validated.length,
  };
  events.push(mk('graph-enrich', 'ticket.enriched', enrichedPayload));

  appendEvents(repoRoot, events, { skill: 'graph-enrich', ticketId });

  return { ticketId, similarCount: validated.length, enrichedAt };
}
