import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolveEvalPaths } from '../eval/paths';
import {
  type DeterministicScores,
  DeterministicScoresSchema,
  type JudgeScores,
  JudgeScoresSchema,
  type Judgment,
  ManifestSchema,
  type Result,
  type Summary,
  SummarySchema,
} from '../eval/types';
import { releaseLock } from '../lock/file-lock';

export interface EvalReportOpts {
  cwd?: string;
}

function scoreJudgment(j: Judgment): { passed: boolean; score: number } {
  const nonNa = j.dimensions.filter((d) => d.verdict !== 'NA');
  if (nonNa.length === 0) return { passed: true, score: 1 };
  const passes = nonNa.filter((d) => d.verdict === 'PASS').length;
  const score = passes / nonNa.length;
  const passed = nonNa.every((d) => d.verdict === 'PASS');
  return { passed, score };
}

function renderReport(summary: Summary): string {
  const lines: string[] = [];
  lines.push(`# xera eval report ${summary.run_id}`);
  lines.push('');
  lines.push(`**Git SHA:** \`${summary.git_sha}\``);
  lines.push('');
  lines.push('**Prompt versions:**');
  for (const [k, v] of Object.entries(summary.prompt_versions)) lines.push(`- \`${k}\`: ${v}`);
  lines.push('');
  lines.push(
    `**Overall:** ${summary.overall.passed}/${summary.overall.total} PASS (score ${(summary.overall.score * 100).toFixed(0)}%)`,
  );
  lines.push('');
  lines.push('## Results');
  lines.push('');
  lines.push('| Ticket | Stage | Deterministic | Judge | Score |');
  lines.push('|---|---|---|---|---|');
  for (const r of summary.results) {
    const det = r.deterministic.passed ? 'PASS' : `FAIL (${r.deterministic.error ?? ''})`;
    const judge = r.skipped ? 'SKIPPED' : r.judge ? (r.judge.passed ? 'PASS' : 'FAIL') : 'SKIPPED';
    const score = r.judge ? `${(r.judge.score * 100).toFixed(0)}%` : '—';
    lines.push(`| ${r.ticket} | ${r.stage} | ${det} | ${judge} | ${score} |`);
  }
  lines.push('');
  lines.push('## Dimension breakdown');
  lines.push('');
  for (const r of summary.results) {
    if (!r.judge || r.judge.dimensions.length === 0) continue;
    lines.push(`### ${r.ticket} — ${r.stage}`);
    lines.push('');
    for (const d of r.judge.dimensions) lines.push(`- **${d.name}** — ${d.verdict}: ${d.notes}`);
    lines.push('');
  }
  return lines.join('\n');
}

export async function evalReportCmd(argv: string[], opts: EvalReportOpts = {}): Promise<number> {
  const cwd = opts.cwd ?? process.cwd();
  const runId = argv[0];
  if (!runId) {
    console.error('[xera:eval-report] usage: eval-report <run-id>');
    return 1;
  }
  const paths = resolveEvalPaths(cwd, runId);
  if (!existsSync(paths.manifest)) {
    console.error(`[xera:eval-report] missing manifest.json at ${paths.manifest}`);
    return 1;
  }
  const manifest = ManifestSchema.parse(JSON.parse(readFileSync(paths.manifest, 'utf8')));

  try {
    let det: DeterministicScores;
    let judge: JudgeScores;
    try {
      det = DeterministicScoresSchema.parse(
        JSON.parse(readFileSync(paths.deterministicScores, 'utf8')),
      );
    } catch (err) {
      console.error(
        `[xera:eval-report] invalid deterministic-scores.json: ${(err as Error).message}`,
      );
      return 2;
    }
    try {
      judge = JudgeScoresSchema.parse(JSON.parse(readFileSync(paths.judgeScores, 'utf8')));
    } catch (err) {
      console.error(`[xera:eval-report] invalid judge-scores.json: ${(err as Error).message}`);
      return 2;
    }

    const results: Result[] = [];
    for (const detEntry of det.entries) {
      const judgment = judge.judgments.find(
        (j) => j.ticket === detEntry.ticket && j.stage === detEntry.stage,
      );
      if (!judgment && detEntry.error?.startsWith('actual missing')) {
        const r: Result = {
          ticket: detEntry.ticket,
          stage: detEntry.stage,
          deterministic: {
            passed: detEntry.passed,
            checks: detEntry.checks,
            ...(detEntry.error !== undefined ? { error: detEntry.error } : {}),
          },
          judge: null,
          skipped: true,
        };
        results.push(r);
        continue;
      }
      if (!judgment) {
        // Judge entry expected but missing: count as FAIL not SKIPPED.
        const r: Result = {
          ticket: detEntry.ticket,
          stage: detEntry.stage,
          deterministic: {
            passed: detEntry.passed,
            checks: detEntry.checks,
            ...(detEntry.error !== undefined ? { error: detEntry.error } : {}),
          },
          judge: { passed: false, dimensions: [], score: 0 },
        };
        results.push(r);
        continue;
      }
      const { passed, score } = scoreJudgment(judgment);
      const r: Result = {
        ticket: detEntry.ticket,
        stage: detEntry.stage,
        deterministic: {
          passed: detEntry.passed,
          checks: detEntry.checks,
          ...(detEntry.error !== undefined ? { error: detEntry.error } : {}),
        },
        judge: { passed, dimensions: judgment.dimensions, score },
      };
      results.push(r);
    }

    const counted = results.filter((r) => !r.skipped);
    const passedCount = counted.filter((r) => r.deterministic.passed && r.judge?.passed).length;
    const failedCount = counted.length - passedCount;
    const avgScore =
      counted.length === 0
        ? 0
        : counted.reduce(
            (acc, r) => acc + (r.deterministic.passed && r.judge ? r.judge.score : 0),
            0,
          ) / counted.length;

    const summary: Summary = {
      run_id: runId,
      git_sha: manifest.git_sha,
      prompt_versions: manifest.prompt_versions,
      results,
      overall: { passed: passedCount, failed: failedCount, total: counted.length, score: avgScore },
    };
    SummarySchema.parse(summary);
    writeFileSync(paths.summary, JSON.stringify(summary, null, 2));
    writeFileSync(paths.report, renderReport(summary));

    console.log(
      `[xera:eval-report] ${passedCount}/${counted.length} PASS (avg ${(avgScore * 100).toFixed(0)}%)`,
    );
    return 0;
  } finally {
    releaseLock(paths.lock);
  }
}
