// Schema v1 — see docs/superpowers/specs/2026-05-16-xera-v06-project-knowledge-graph-design.md §3

export const SCHEMA_VERSION = 1 as const;

export type Priority = 'p0' | 'p1' | 'p2';
export type ScenarioStatus = 'pass' | 'fail';
export type EdgeKind =
  | 'tests'
  | 'uses'
  | 'covers'
  | 'modifies'
  | 'jira-linked'
  | 'similar'
  | 'ran';

export type Classification =
  | 'REAL_BUG'
  | 'TEST_BUG'
  | 'SELECTOR_DRIFT'
  | 'FLAKY'
  | 'PASS';
// Note: TEST_OUTDATED is added in v0.6.1.

export interface TicketFetchedPayload {
  ticketId: string;
  summary: string;
  ac: string[];
  jiraLinks: Array<{ ticketId: string; relation: 'blocks' | 'duplicates' | 'relates' | 'supersedes' }>;
  storyHash: string;
  modifiesAreas: string[];
}

export interface TicketEnrichedPayload {
  ticketId: string;
  enrichedAt: string;
  similarCount: number;
}

export interface ScenarioGeneratedPayload {
  scenarioId: string;
  ticketId: string;
  name: string;
  gherkin: string;
  priority: Priority;
  featureHash: string;
  generatedAt: string;
}

export interface PomGeneratedPayload {
  pomId: string;
  ticketId: string;
  filePath: string;
  route: string;
  locators: string[];
  scope: 'local' | 'shared';
}

export interface PomPromotedPayload {
  pomId: string;
  fromPath: string;
  toPath: string;
}

export interface RunCompletedPayload {
  scenarioId: string;
  ticketId: string;
  runId: string;
  status: ScenarioStatus;
  traceId?: string;
  runtime: number;
}

export interface RunClassifiedPayload {
  scenarioId: string;
  runId: string;
  classification: Classification;
  confidence: 'low' | 'medium' | 'high';
}

export interface ClassificationDisputedPayload {
  runId: string;
  scenarioId: string;
  originalClassification: Classification;
  disputedTo: Classification;
  qaActor: string;
  qaReason?: string;
}

export interface EdgeDiscoveredPayload {
  kind: EdgeKind;
  from: string;
  to: string;
  confidence?: number;
  source: string;
}

export type EventPayloadMap = {
  'ticket.fetched': TicketFetchedPayload;
  'ticket.enriched': TicketEnrichedPayload;
  'scenario.generated': ScenarioGeneratedPayload;
  'pom.generated': PomGeneratedPayload;
  'pom.promoted': PomPromotedPayload;
  'run.completed': RunCompletedPayload;
  'run.classified': RunClassifiedPayload;
  'classification.disputed': ClassificationDisputedPayload;
  'edge.discovered': EdgeDiscoveredPayload;
};

export type EventType = keyof EventPayloadMap;

export type Event = {
  [K in EventType]: {
    event_id: string;
    schema_version: typeof SCHEMA_VERSION;
    ts: string;
    actor: string;
    type: K;
    payload: EventPayloadMap[K];
  };
}[EventType];

export interface TicketNode {
  id: string;
  summary: string;
  ac: string[];
  storyHash: string;
  modifiesAreas: string[];
  fetchedAt: string;
  enrichedAt?: string;
}

export interface ScenarioNode {
  id: string;
  ticketId: string;
  name: string;
  gherkin: string;
  priority: Priority;
  featureHash: string;
  generatedAt: string;
}

export interface PomNode {
  id: string;
  ticketId: string;
  filePath: string;
  route: string;
  locators: string[];
  scope: 'local' | 'shared';
}

export interface AreaNode {
  id: string;
}

export interface FailureNode {
  id: string;
  scenarioId: string;
  runId: string;
  traceId?: string;
  ts: string;
}

export interface EdgeRecord {
  kind: EdgeKind;
  from: string;
  to: string;
  confidence?: number;
  source: string;
  discoveredAt: string;
}

export interface Snapshot {
  schema_version: typeof SCHEMA_VERSION;
  generated_at: string;
  event_count: number;
  events_hash: string;
  tickets: Record<string, TicketNode>;
  scenarios: Record<string, ScenarioNode>;
  poms: Record<string, PomNode>;
  areas: Record<string, AreaNode>;
  edges: EdgeRecord[];
  latest_failures: Record<string, FailureNode>;
}
