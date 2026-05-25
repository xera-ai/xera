import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { readMeta } from '../artifact/meta';
import { resolveArtifactPaths } from '../artifact/paths';
import { computeHttpRuleOverride } from '../classifier/http-override';
import { loadConfig } from '../config/load';

interface ContractDriftResult {
  runId: string;
  // The deterministic class for the run, or null when no rule fired. Only
  // CONTRACT_DRIFT is surfaced here — it's the class the /xera-report heal
  // sub-flow keys on. RATE_LIMITED / AUTH_EXPIRED are still applied later by
  // `xera-internal report`; they are not healable, so this shim ignores them.
  class: 'CONTRACT_DRIFT' | null;
  rationale: string;
  // Names of the FAIL scenarios to stamp CONTRACT_DRIFT in classifier-input.json
  // (the http override applies to every failing scenario in the run).
  scenarios: string[];
}

// Deterministic CONTRACT_DRIFT detector the /xera-report skill runs BEFORE its
// LLM classification, so the heal check (which reads classifier-input.json for
// `class: "CONTRACT_DRIFT"`) actually fires. Detection itself never involves an
// LLM — it reuses the same rule `xera-internal report` applies at the end. (#195)
export async function classifyDriftCmd(argv: string[]): Promise<number> {
  const ticket = argv[0];
  if (!ticket || ticket.startsWith('--')) {
    console.error('[xera:classify-drift] usage: classify-drift <TICKET> [--run=<runId>]');
    return 1;
  }
  const cwd = process.cwd();
  const paths = resolveArtifactPaths(cwd, ticket);

  const runArg = argv.find((a) => a.startsWith('--run='));
  const runId = runArg
    ? runArg.slice('--run='.length)
    : existsSync(paths.runsDir)
      ? readdirSync(paths.runsDir)
          .filter((n) => !n.startsWith('.'))
          .sort()
          .pop()
      : undefined;
  if (!runId) {
    console.error('[xera:classify-drift] no run found');
    return 1;
  }

  const result: ContractDriftResult = { runId, class: null, rationale: '', scenarios: [] };

  const meta = readMeta(paths.metaPath);
  if (meta?.adapter === 'http') {
    const config = await loadConfig(cwd);
    const override = await computeHttpRuleOverride({
      cwd,
      config,
      ticketDir: paths.ticketDir,
      runId,
    });
    if (override?.class === 'CONTRACT_DRIFT') {
      result.class = 'CONTRACT_DRIFT';
      result.rationale = override.rationale;
      const normalizedPath = join(paths.runsDir, runId, 'normalized.json');
      if (existsSync(normalizedPath)) {
        const norm = JSON.parse(readFileSync(normalizedPath, 'utf8')) as {
          scenarios?: Array<{ name: string; outcome: string }>;
        };
        result.scenarios = (norm.scenarios ?? [])
          .filter((s) => s.outcome === 'FAIL')
          .map((s) => s.name);
      }
    }
  }

  const outPath = join(paths.runsDir, runId, 'contract-drift.json');
  writeFileSync(outPath, JSON.stringify(result, null, 2));
  console.log(
    `[xera:classify-drift] class=${result.class ?? 'none'} scenarios=${result.scenarios.length} → ${outPath}`,
  );
  return 0;
}
