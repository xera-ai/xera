import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { resolveArtifactPaths } from '../artifact/paths';
import { aggregateScenarios } from '../classifier/aggregate';
import { writeStatusFromClassification } from '../reporter/status-writer';
import { buildJiraComment } from '../reporter/jira-comment';
import type { ScenarioClassification } from '../classifier/types';

interface ReportInput {
  scenarios: ScenarioClassification[];
  scenarioCounts: { total: number; passed: number; failed: number; skipped: number };
  runId: string;
}

export async function reportCmd(argv: string[]): Promise<number> {
  const ticket = argv[0];
  const inputArg = argv.find(a => a.startsWith('--input='));
  if (!ticket || !inputArg) {
    console.error('[xera:report] usage: report <TICKET> --input=<classifier-output.json>');
    return 1;
  }
  const paths = resolveArtifactPaths(process.cwd(), ticket);
  const input = JSON.parse(readFileSync(inputArg.slice('--input='.length), 'utf8')) as ReportInput;

  const aggregated = aggregateScenarios(input.scenarios);
  const ts = new Date().toISOString();
  writeStatusFromClassification(paths.statusPath, {
    ticket,
    runTs: ts,
    classification: aggregated,
    scenarioCounts: input.scenarioCounts,
  });

  const md = buildJiraComment({
    ticket,
    runId: input.runId,
    overall: aggregated.overall,
    overallConfidence: aggregated.overallConfidence,
    scenarios: aggregated.scenarios,
    xeraVersion: '0.1.0',
    promptsVersion: '1.0.0',
  });
  const draftPath = join(paths.ticketDir, 'jira-comment.draft.md');
  writeFileSync(draftPath, md);
  console.log(`[xera:report] wrote status.json and ${draftPath}`);
  return 0;
}
