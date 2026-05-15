import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { validateGherkin } from '@xera-ai/web';
import { resolveEvalPaths } from '../eval/paths';
import {
  type DeterministicEntry,
  type DeterministicScores,
  DeterministicScoresSchema,
  ManifestSchema,
} from '../eval/types';

export interface EvalDeterministicOpts {
  cwd?: string;
}

interface ClassifierScenario {
  name: string;
  class: string;
}

function checkFeatureFromStory(actualFeaturePath: string): {
  passed: boolean;
  checks: string[];
  error?: string;
} {
  if (!existsSync(actualFeaturePath)) {
    return { passed: false, checks: ['validate-feature'], error: 'actual missing: test.feature' };
  }
  try {
    const r = validateGherkin(readFileSync(actualFeaturePath, 'utf8'));
    if (r.ok) return { passed: true, checks: ['validate-feature'] };
    return {
      passed: false,
      checks: ['validate-feature'],
      error: r.errors.map((e) => `line ${e.line}: ${e.message}`).join('; '),
    };
  } catch (err) {
    return { passed: false, checks: ['validate-feature'], error: (err as Error).message };
  }
}

function checkScriptFromFeature(actualTicketDir: string): {
  passed: boolean;
  checks: string[];
  error?: string;
} {
  // v0.2 deviation: file-presence only. Full typecheck/lint hookup is deferred to v0.2.1
  // because v0.1's lintTicket/typecheckTicket resolve paths from .xera/<TICKET>/ (consumer
  // project layout), not .xera/eval/<run-id>/actual/<ticket>/. The judge dimensions
  // "Requirements satisfied", "Wait strategy", "No dead code" cover the lint surface.
  const specPath = join(actualTicketDir, 'spec.ts');
  if (!existsSync(specPath)) {
    return { passed: false, checks: ['file-presence'], error: 'actual missing: spec.ts' };
  }
  return { passed: true, checks: ['file-presence'] };
}

function checkDiagnoseFailure(
  inputsTicketDir: string,
  actualTicketDir: string,
): { passed: boolean; checks: string[]; error?: string } {
  const inputPath = join(inputsTicketDir, 'classifier-input.json');
  const actualPath = join(actualTicketDir, 'classification.json');
  if (!existsSync(actualPath)) {
    return {
      passed: false,
      checks: ['bucket-match'],
      error: 'actual missing: classification.json',
    };
  }
  if (!existsSync(inputPath)) {
    return {
      passed: false,
      checks: ['bucket-match'],
      error: 'inputs missing: classifier-input.json',
    };
  }
  const golden = JSON.parse(readFileSync(inputPath, 'utf8'));
  const actual = JSON.parse(readFileSync(actualPath, 'utf8'));
  const goldScens: ClassifierScenario[] = golden.scenarios ?? [];
  const actScens: ClassifierScenario[] = actual.scenarios ?? [];
  const mismatches: string[] = [];
  for (const g of goldScens) {
    const a = actScens.find((s) => s.name === g.name);
    if (!a) {
      mismatches.push(`missing scenario "${g.name}"`);
      continue;
    }
    if (a.class !== g.class)
      mismatches.push(`scenario "${g.name}": expected class ${g.class}, got ${a.class}`);
  }
  if (mismatches.length > 0) {
    return {
      passed: false,
      checks: ['bucket-match'],
      error: `bucket mismatch — ${mismatches.join('; ')}`,
    };
  }
  return { passed: true, checks: ['bucket-match'] };
}

export async function evalDeterministicCmd(
  argv: string[],
  opts: EvalDeterministicOpts = {},
): Promise<number> {
  const cwd = opts.cwd ?? process.cwd();
  const runId = argv[0];
  if (!runId) {
    console.error('[xera:eval-deterministic] usage: eval-deterministic <run-id>');
    return 1;
  }
  const paths = resolveEvalPaths(cwd, runId);
  if (!existsSync(paths.manifest)) {
    console.error(`[xera:eval-deterministic] missing manifest.json at ${paths.manifest}`);
    return 1;
  }
  const manifest = ManifestSchema.parse(JSON.parse(readFileSync(paths.manifest, 'utf8')));

  const entries: DeterministicEntry[] = [];
  for (const ticket of manifest.tickets) {
    for (const stage of manifest.stages) {
      // Skip stage if it doesn't apply to this ticket type:
      // - EVAL-* tickets → feature-from-story, script-from-feature
      // - GOLD-* tickets → diagnose-failure
      const isClassifier = stage === 'diagnose-failure';
      const isGoldTicket = ticket.startsWith('GOLD-');
      if (isClassifier !== isGoldTicket) continue;

      const inputsDir = paths.ticketInputsDir(ticket);
      const actualDir = paths.ticketActualDir(ticket);
      let result: { passed: boolean; checks: string[]; error?: string };
      if (stage === 'feature-from-story') {
        result = checkFeatureFromStory(join(actualDir, 'test.feature'));
      } else if (stage === 'script-from-feature') {
        result = checkScriptFromFeature(actualDir);
      } else {
        result = checkDiagnoseFailure(inputsDir, actualDir);
      }

      const entry: DeterministicEntry = {
        ticket,
        stage,
        passed: result.passed,
        checks: result.checks,
      };
      if (result.error !== undefined) entry.error = result.error;
      entries.push(entry);
    }
  }

  const scores: DeterministicScores = { run_id: runId, entries };
  DeterministicScoresSchema.parse(scores);
  writeFileSync(paths.deterministicScores, JSON.stringify(scores, null, 2));
  console.log(`[xera:eval-deterministic] wrote ${entries.length} entries`);
  return 0;
}
