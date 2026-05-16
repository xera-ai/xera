import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import type { Stage } from '../eval/types';
import { verifyPrompts } from './verify-prompts';
import { summarizeCost } from '../graph/cost';
import { loadAllEvents } from '../graph/store';

export interface DoctorOpts {
  cwd?: string;
}

interface CheckResult {
  ok: boolean;
  message: string;
}

const REQUIRED_FILES_PER_STAGE: Record<Stage, string[]> = {
  'feature-from-story': ['golden/test.feature'],
  'script-from-feature': ['golden/spec-requirements.md'],
  'diagnose-failure': [],
};

const REQUIRED_SCRIPTS = [
  'xera:eval-prepare',
  'xera:eval-deterministic',
  'xera:eval-report',
  'xera:verify-prompts',
  'xera:doctor',
];

function frontmatterField(content: string, field: string): string | null {
  const m = content.match(new RegExp(`^${field}:\\s*(\\S+)\\s*$`, 'm'));
  return m?.[1] ?? null;
}

function checkGoldenEvalDir(repoRoot: string): CheckResult[] {
  const root = join(repoRoot, 'fixtures/golden-eval');
  if (!existsSync(root)) return [{ ok: false, message: 'fixtures/golden-eval/ does not exist' }];
  const dirs = readdirSync(root, { withFileTypes: true }).filter(
    (e) => e.isDirectory() && !e.name.startsWith('.'),
  );
  const results: CheckResult[] = [];
  if (dirs.length < 3) {
    results.push({
      ok: false,
      message: `fixtures/golden-eval/ has ${dirs.length} ticket dir(s); need ≥ 3`,
    });
  }
  for (const entry of dirs) {
    const dir = join(root, entry.name);
    const metaPath = join(dir, 'meta.json');
    if (!existsSync(metaPath)) {
      results.push({ ok: false, message: `${entry.name}: meta.json missing` });
      continue;
    }
    let meta: { id?: string; stages?: unknown[] };
    try {
      meta = JSON.parse(readFileSync(metaPath, 'utf8')) as { id?: string; stages?: unknown[] };
    } catch (err) {
      results.push({
        ok: false,
        message: `${entry.name}: meta.json parse error: ${(err as Error).message}`,
      });
      continue;
    }
    const stages = Array.isArray(meta.stages) ? (meta.stages as Stage[]) : [];
    if (stages.length === 0)
      results.push({ ok: false, message: `${entry.name}: meta.stages is empty` });
    if (!existsSync(join(dir, 'story.md')))
      results.push({ ok: false, message: `${entry.name}: story.md missing` });
    for (const stage of stages) {
      const required = REQUIRED_FILES_PER_STAGE[stage] ?? [];
      for (const rel of required) {
        if (!existsSync(join(dir, rel))) {
          results.push({
            ok: false,
            message: `${meta.id ?? entry.name}: stage "${stage}" declared but ${rel} missing`,
          });
        }
      }
    }
  }
  return results;
}

function checkRubricPrompt(repoRoot: string): CheckResult[] {
  const path = join(repoRoot, 'packages/prompts/eval-rubric.md');
  if (!existsSync(path)) return [{ ok: false, message: 'packages/prompts/eval-rubric.md missing' }];
  const text = readFileSync(path, 'utf8');
  const id = frontmatterField(text, 'id');
  const version = frontmatterField(text, 'version');
  if (id !== 'eval-rubric')
    return [{ ok: false, message: 'eval-rubric.md frontmatter "id" must be "eval-rubric"' }];
  if (!version) return [{ ok: false, message: 'eval-rubric.md frontmatter "version" missing' }];
  return [];
}

function checkEvalSkill(repoRoot: string): CheckResult[] {
  const path = join(repoRoot, 'packages/skills/xera-eval.md');
  if (!existsSync(path)) return [{ ok: false, message: 'packages/skills/xera-eval.md missing' }];
  const text = readFileSync(path, 'utf8');
  if (!frontmatterField(text, 'name'))
    return [{ ok: false, message: 'xera-eval.md frontmatter "name" missing' }];
  return [];
}

function checkPromptInjectionPreamble(repoRoot: string): CheckResult[] {
  return verifyPrompts(repoRoot);
}

function checkRootScripts(repoRoot: string): CheckResult[] {
  const path = join(repoRoot, 'package.json');
  if (!existsSync(path)) return [{ ok: false, message: 'root package.json missing' }];
  const pkg = JSON.parse(readFileSync(path, 'utf8'));
  const scripts = pkg.scripts ?? {};
  const missing = REQUIRED_SCRIPTS.filter((s) => typeof scripts[s] !== 'string');
  return missing.map((s) => ({ ok: false, message: `root package.json missing script: ${s}` }));
}

export async function doctorCmd(_argv: string[], opts: DoctorOpts = {}): Promise<number> {
  const repoRoot = opts.cwd ?? process.cwd();
  const results: CheckResult[] = [
    ...checkGoldenEvalDir(repoRoot),
    ...checkRubricPrompt(repoRoot),
    ...checkEvalSkill(repoRoot),
    ...checkPromptInjectionPreamble(repoRoot),
    ...checkRootScripts(repoRoot),
  ];
  // Cost summary (past 7 days)
  const cost = summarizeCost(repoRoot, 7);
  if (cost.totalCalls > 0) {
    console.log('');
    console.log('LLM cost (past 7 days):');
    console.log(`  Total calls: ${cost.totalCalls}`);
    console.log(`  Estimated:   $${cost.totalUsd.toFixed(2)} USD`);
    const top = Object.entries(cost.bySkill).sort((a, b) => b[1].usd - a[1].usd)[0];
    if (top) console.log(`  Top skill:   ${top[0]} (${top[1].calls} calls, $${top[1].usd.toFixed(2)})`);
  }

  // Backfill detection
  const xeraDir = join(repoRoot, '.xera');
  if (existsSync(xeraDir)) {
    const ticketDirs = readdirSync(xeraDir, { withFileTypes: true }).filter(
      (e) => e.isDirectory() && /^[A-Z]+-\d+$/.test(e.name),
    );
    if (ticketDirs.length > 0) {
      const events = loadAllEvents(repoRoot);
      const fetchedTickets = new Set(
        events.filter((e) => e.type === 'ticket.fetched').map((e) => e.payload.ticketId),
      );
      const unbackfilled = ticketDirs.map((d) => d.name).filter((t) => !fetchedTickets.has(t));
      if (unbackfilled.length > 0) {
        console.log('');
        console.log(`⚠ Graph: ${unbackfilled.length} ticket(s) not yet in graph.`);
        console.log(
          `  These won't participate in v0.6.1+ features (TEST_OUTDATED, /xera-impact).`,
        );
        console.log(`  Run: bun run xera:graph-backfill`);
        console.log(`  (Use --dry-run to preview.)`);
      }
    }
  }

  if (results.length === 0) {
    console.log('[xera:doctor] ok');
    return 0;
  }
  for (const r of results) console.error(`[xera:doctor] ${r.message}`);
  return 1;
}
