import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { resolveArtifactPaths } from '../artifact/paths';
import { aggregateScenarios } from '../classifier/aggregate';
import type { ScenarioClassification } from '../classifier/types';
import { enhanceClassification } from '../graph/classify';
import type { OutdatedDecision } from '../graph/classify';
import { deriveSnapshot, loadAllEvents } from '../graph/store';
import { buildJiraComment } from '../reporter/jira-comment';
import { writeStatusFromClassification } from '../reporter/status-writer';

interface ReportInput {
  scenarios: ScenarioClassification[];
  scenarioCounts: { total: number; passed: number; failed: number; skipped: number };
  runId: string;
}

export async function reportCmd(argv: string[]): Promise<number> {
  const ticket = argv[0];
  const inputArg = argv.find((a) => a.startsWith('--input='));
  if (!ticket || !inputArg) {
    console.error('[xera:report] usage: report <TICKET> --input=<classifier-output.json>');
    return 1;
  }
  const paths = resolveArtifactPaths(process.cwd(), ticket);
  const input = JSON.parse(readFileSync(inputArg.slice('--input='.length), 'utf8')) as ReportInput;

  const aggregated = aggregateScenarios(input.scenarios);

  // v0.6.1: TEST_OUTDATED enhancement.
  // The /xera-report skill writes outdated-decisions.json BEFORE invoking this subcommand,
  // containing { [scenarioId]: { classification, confidence, evidence } } for every
  // failing scenario the skill ran the LLM on. We use those decisions directly via
  // an injected resolver — no Claude call here.
  const decisionsPath = join(paths.ticketDir, 'runs', input.runId, 'outdated-decisions.json');
  const decisions: Record<string, OutdatedDecision> = existsSync(decisionsPath)
    ? (JSON.parse(readFileSync(decisionsPath, 'utf8')) as Record<string, OutdatedDecision>)
    : {};

  const graph = deriveSnapshot(loadAllEvents(process.cwd()));

  // Build a lookup: normalized name → scenarioId (graph node id) for this ticket.
  // This mirrors how graph-record-script.ts stores scenarios using sha1(ticket:name),
  // but here we look up by the stored node id so both sha1-keyed and stub-keyed graphs work.
  const normalizeScenarioName = (name: string) =>
    name.trim().toLowerCase().replace(/\s+/g, ' ');

  const scenarioIdByName: Record<string, string> = {};
  for (const [id, node] of Object.entries(graph.scenarios)) {
    if (node.ticketId === ticket) {
      scenarioIdByName[normalizeScenarioName(node.name)] = id;
    }
  }

  const enhancedScenarios: ScenarioClassification[] = await Promise.all(
    aggregated.scenarios.map(async (s) => {
      if (s.outcome !== 'FAIL') return s;
      const scenarioId = scenarioIdByName[normalizeScenarioName(s.name)];
      if (!scenarioId) return s;
      const decision = decisions[scenarioId];
      const decideOutdated = async (): Promise<OutdatedDecision> =>
        decision ?? {
          classification: 'BUG' as const,
          confidence: 0,
          evidence: { reasoning: 'no LLM decision' },
        };
      const enhanced = await enhanceClassification(
        { scenarioId, traceClassification: s.class },
        graph,
        decideOutdated,
      );
      if (enhanced.classification !== s.class) {
        return {
          ...s,
          class: enhanced.classification,
          rationale: `${s.rationale} | TEST_OUTDATED override (conf ${enhanced.confidence})`,
        };
      }
      return s;
    }),
  );

  const reAggregated = aggregateScenarios(enhancedScenarios);

  const ts = new Date().toISOString();
  writeStatusFromClassification(paths.statusPath, {
    ticket,
    runTs: ts,
    classification: reAggregated,
    scenarioCounts: input.scenarioCounts,
  });

  const md = buildJiraComment({
    ticket,
    runId: input.runId,
    overall: reAggregated.overall,
    overallConfidence: reAggregated.overallConfidence,
    scenarios: reAggregated.scenarios,
    xeraVersion: '0.1.0',
    promptsVersion: '1.0.0',
  });
  const draftPath = join(paths.ticketDir, 'jira-comment.draft.md');
  writeFileSync(draftPath, md);
  console.log(`[xera:report] wrote status.json and ${draftPath}`);
  return 0;
}
