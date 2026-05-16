import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { readMeta } from '../artifact/meta';
import { resolveArtifactPaths } from '../artifact/paths';
import { readAuthState } from '../auth/state';
import { aggregateScenarios } from '../classifier/aggregate';
import { type AuthFileSummary, classifyAuthExpired } from '../classifier/auth-expired';
import { classifyContractDrift } from '../classifier/contract-drift';
import { classifyRateLimited } from '../classifier/rate-limited';
import type { ScenarioClassification } from '../classifier/types';
import { loadConfig } from '../config/load';
import type { OutdatedDecision } from '../graph/classify';
import { enhanceClassification } from '../graph/classify';
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
  const cwd = process.cwd();
  const paths = resolveArtifactPaths(cwd, ticket);
  const input = JSON.parse(readFileSync(inputArg.slice('--input='.length), 'utf8')) as ReportInput;

  // v0.7: apply deterministic HTTP classifier rules before aggregation.
  // When adapter === 'http', scan normalized.json http.calls for rate-limit,
  // auth-expired, and contract-drift signals and override failing scenario classes.
  interface HttpRuleOverride {
    class: ScenarioClassification['class'];
    rationale: string;
  }
  let httpRuleOverride: HttpRuleOverride | null = null;

  const meta = readMeta(paths.metaPath);
  if (meta?.adapter === 'http') {
    const config = await loadConfig(cwd);
    if (config.http) {
      const normalizedPath = join(paths.ticketDir, 'runs', input.runId, 'normalized.json');
      if (existsSync(normalizedPath)) {
        const norm = JSON.parse(readFileSync(normalizedPath, 'utf8')) as {
          http?: {
            calls?: Array<{ method: string; url: string; status: number; respBody?: unknown }>;
          };
        };
        const calls = norm.http?.calls ?? [];

        // RATE_LIMITED
        const rate = classifyRateLimited({ calls });
        if (rate) httpRuleOverride = rate;

        // AUTH_EXPIRED — needs auth files
        if (!httpRuleOverride) {
          const authFiles: Record<string, AuthFileSummary> = {};
          const httpAuthDir = join(cwd, '.xera', '.auth', 'http');
          for (const role of Object.keys(config.http.auth.roles)) {
            const entry = readAuthState(httpAuthDir, role);
            if (entry) {
              const p = entry.payload as {
                token: string;
                type: 'bearer' | 'apiKey' | 'basic' | 'cookie';
              };
              if (typeof p.token === 'string' && typeof p.type === 'string') {
                authFiles[role] = {
                  token: p.token,
                  type: p.type as AuthFileSummary['type'],
                  expires_at: entry.expires_at,
                };
              }
            }
          }
          const authExp = classifyAuthExpired({ calls, authFiles });
          if (authExp) httpRuleOverride = authExp;
        }

        // CONTRACT_DRIFT — needs openapi
        if (!httpRuleOverride && config.http.spec) {
          const { loadOpenApi } = await import('@xera-ai/http');
          const openapi = await loadOpenApi(config.http.spec);
          if (openapi) {
            const drift = classifyContractDrift({
              calls: calls.map((c) => ({
                method: c.method,
                url: c.url,
                status: c.status,
                respBody: c.respBody,
              })),
              openapi,
            });
            if (drift) httpRuleOverride = drift;
          }
        }
      }
    }
  }

  // Apply override: if a deterministic rule fired, stamp every FAIL scenario with it.
  const scenariosForAggregation: ScenarioClassification[] = httpRuleOverride
    ? input.scenarios.map((s) =>
        s.outcome === 'FAIL'
          ? {
              ...s,
              class: httpRuleOverride.class,
              rationale: httpRuleOverride.rationale,
              confidence: 'high' as const,
            }
          : s,
      )
    : input.scenarios;

  const aggregated = aggregateScenarios(scenariosForAggregation);

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
  const normalizeScenarioName = (name: string) => name.trim().toLowerCase().replace(/\s+/g, ' ');

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
