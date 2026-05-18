import type { Classification, ScenarioNode, Snapshot, TicketNode } from './types';

export interface ClassifyInput {
  scenarioId: string;
  traceClassification: Classification;
}

export interface CandidateEvidence {
  ticketId: string;
  summary: string;
  modifiedArea: string;
  relevantAcRef?: string;
}

export interface ClassifyEvidence {
  candidateTickets?: CandidateEvidence[];
  reasoning?: string;
  expectedByTest?: string;
  actualInApp?: string;
  proposedAction?: 'regenerate-scenario' | 'review-and-decide';
}

export interface ClassifyOutput {
  classification: Classification;
  confidence: number;
  evidence?: ClassifyEvidence;
}

export interface OutdatedDecision {
  classification: 'TEST_OUTDATED' | 'BUG' | 'AMBIGUOUS';
  confidence: number;
  evidence: {
    reasoning: string;
    expectedByTest?: string;
    actualInApp?: string;
    relevantAcRef?: string;
  };
}

export type DecideOutdated = (args: {
  scenario: ScenarioNode;
  candidates: TicketNode[];
}) => Promise<OutdatedDecision>;

const DEFAULT_THRESHOLD = 0.7;
const SHORT_CIRCUIT: Classification[] = ['FLAKY', 'PASS', 'SKIPPED'];

export function findCandidateTickets(graph: Snapshot, scenario: ScenarioNode): TicketNode[] {
  const poms = graph.edges
    .filter((e) => e.kind === 'uses' && e.from === scenario.id)
    .map((e) => e.to);
  if (poms.length === 0) return [];

  const areas = graph.edges
    .filter((e) => e.kind === 'covers' && poms.includes(e.from))
    .map((e) => e.to);
  if (areas.length === 0) return [];

  const ticketIds = graph.edges
    .filter((e) => e.kind === 'modifies' && areas.includes(e.to))
    .map((e) => e.from);

  const seen = new Set<string>();
  const out: TicketNode[] = [];
  for (const id of ticketIds) {
    if (seen.has(id)) continue;
    seen.add(id);
    if (id === scenario.ticketId) continue;
    const t = graph.tickets[id];
    if (!t) continue;
    if (t.fetchedAt <= scenario.generatedAt) continue;
    out.push(t);
  }
  return out;
}

export async function enhanceClassification(
  input: ClassifyInput,
  graph: Snapshot,
  decideOutdated: DecideOutdated,
  options: { threshold?: number } = {},
): Promise<ClassifyOutput> {
  const threshold = options.threshold ?? DEFAULT_THRESHOLD;
  if (SHORT_CIRCUIT.includes(input.traceClassification)) {
    return { classification: input.traceClassification, confidence: 1 };
  }

  const scenario = graph.scenarios[input.scenarioId];
  if (!scenario) return { classification: input.traceClassification, confidence: 1 };

  const candidates = findCandidateTickets(graph, scenario);
  if (candidates.length === 0) {
    return { classification: input.traceClassification, confidence: 1 };
  }

  const candidateEvidence: CandidateEvidence[] = candidates.map((t) => {
    const area = graph.edges.find((e) => e.kind === 'modifies' && e.from === t.id)?.to ?? '';
    const ev: CandidateEvidence = { ticketId: t.id, summary: t.summary, modifiedArea: area };
    if (t.ac[0]) ev.relevantAcRef = t.ac[0];
    return ev;
  });

  const decision = await decideOutdated({ scenario, candidates });

  if (decision.classification === 'TEST_OUTDATED' && decision.confidence >= threshold) {
    const evidence: ClassifyEvidence = {
      candidateTickets: candidateEvidence,
      reasoning: decision.evidence.reasoning,
      proposedAction: 'regenerate-scenario',
    };
    if (decision.evidence.expectedByTest)
      evidence.expectedByTest = decision.evidence.expectedByTest;
    if (decision.evidence.actualInApp) evidence.actualInApp = decision.evidence.actualInApp;
    return {
      classification: 'TEST_OUTDATED',
      confidence: decision.confidence,
      evidence,
    };
  }

  return {
    classification: input.traceClassification,
    confidence: 1,
    evidence: { candidateTickets: candidateEvidence },
  };
}
