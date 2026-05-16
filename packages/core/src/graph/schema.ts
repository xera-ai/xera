import { z } from 'zod';
import type { Event } from './types';
import { SCHEMA_VERSION } from './types';

const schemaV = z.literal(SCHEMA_VERSION);
const iso = z.string().datetime({ offset: false });

const ticketFetched = z
  .object({
    ticketId: z.string().regex(/^[A-Z][A-Z0-9]*-\d+$/),
    summary: z.string(),
    ac: z.array(z.string()),
    jiraLinks: z.array(
      z.object({
        ticketId: z.string().regex(/^[A-Z][A-Z0-9]*-\d+$/),
        relation: z.enum(['blocks', 'duplicates', 'relates', 'supersedes']),
      }),
    ),
    storyHash: z.string(),
    modifiesAreas: z.array(z.string().regex(/^[a-z0-9-]+$/)),
  })
  .passthrough();

const ticketEnriched = z
  .object({
    ticketId: z.string(),
    enrichedAt: iso,
    similarCount: z.number().int().nonnegative(),
  })
  .passthrough();

const scenarioGenerated = z
  .object({
    scenarioId: z.string(),
    ticketId: z.string(),
    name: z.string(),
    gherkin: z.string(),
    priority: z.enum(['p0', 'p1', 'p2']),
    featureHash: z.string(),
    generatedAt: iso,
  })
  .passthrough();

const pomGenerated = z
  .object({
    pomId: z.string(),
    ticketId: z.string(),
    filePath: z.string(),
    route: z.string(),
    locators: z.array(z.string()),
    scope: z.enum(['local', 'shared']),
  })
  .passthrough();

const pomPromoted = z
  .object({
    pomId: z.string(),
    fromPath: z.string(),
    toPath: z.string(),
  })
  .passthrough();

const runCompleted = z
  .object({
    scenarioId: z.string(),
    ticketId: z.string(),
    runId: z.string(),
    status: z.enum(['pass', 'fail']),
    traceId: z.string().optional(),
    runtime: z.number().nonnegative(),
  })
  .passthrough();

const classification = z.enum(['REAL_BUG', 'TEST_BUG', 'SELECTOR_DRIFT', 'FLAKY', 'PASS']);

const runClassified = z
  .object({
    scenarioId: z.string(),
    runId: z.string(),
    classification,
    confidence: z.enum(['low', 'medium', 'high']),
  })
  .passthrough();

const classificationDisputed = z
  .object({
    runId: z.string(),
    scenarioId: z.string(),
    originalClassification: classification,
    disputedTo: classification,
    qaActor: z.string(),
    qaReason: z.string().optional(),
  })
  .passthrough();

const edgeDiscovered = z
  .object({
    kind: z.enum(['tests', 'uses', 'covers', 'modifies', 'jira-linked', 'similar', 'ran']),
    from: z.string(),
    to: z.string(),
    confidence: z.number().min(0).max(1).optional(),
    source: z.string(),
  })
  .passthrough();

const base = {
  event_id: z.string().min(20),
  schema_version: schemaV,
  ts: iso,
  actor: z.string(),
};

export const EventSchema = z.discriminatedUnion('type', [
  z.object({ ...base, type: z.literal('ticket.fetched'), payload: ticketFetched }),
  z.object({ ...base, type: z.literal('ticket.enriched'), payload: ticketEnriched }),
  z.object({ ...base, type: z.literal('scenario.generated'), payload: scenarioGenerated }),
  z.object({ ...base, type: z.literal('pom.generated'), payload: pomGenerated }),
  z.object({ ...base, type: z.literal('pom.promoted'), payload: pomPromoted }),
  z.object({ ...base, type: z.literal('run.completed'), payload: runCompleted }),
  z.object({ ...base, type: z.literal('run.classified'), payload: runClassified }),
  z.object({
    ...base,
    type: z.literal('classification.disputed'),
    payload: classificationDisputed,
  }),
  z.object({ ...base, type: z.literal('edge.discovered'), payload: edgeDiscovered }),
]);

export function safeParseEvent(
  value: unknown,
): { success: true; data: Event } | { success: false; error: z.ZodError } {
  const r = EventSchema.safeParse(value);
  if (r.success) return { success: true, data: r.data as Event };
  return { success: false, error: r.error };
}
