import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { resolveEvalPaths } from '../eval/paths';
import { generateRunId } from '../eval/run-id';
import { type Manifest, ManifestSchema, STAGES, type Stage } from '../eval/types';
import { acquireLock } from '../lock/file-lock';

export interface EvalPrepareOpts {
  cwd?: string;
  now?: () => Date;
  getGitSha?: () => string | null;
}

interface ParsedFlags {
  force: boolean;
  only_prompt: Stage | null;
  only_ticket: string | null;
}

function parseFlags(argv: string[]): ParsedFlags | { error: string } {
  const flags: ParsedFlags = { force: false, only_prompt: null, only_ticket: null };
  for (const arg of argv) {
    if (arg === '--force') flags.force = true;
    else if (arg.startsWith('--prompt=')) {
      const v = arg.slice('--prompt='.length);
      if (!STAGES.includes(v as Stage)) {
        return { error: `Unknown stage: ${v}. Valid: ${STAGES.join(', ')}.` };
      }
      flags.only_prompt = v as Stage;
    } else if (arg.startsWith('--ticket=')) {
      flags.only_ticket = arg.slice('--ticket='.length);
    } else {
      return { error: `Unknown argument: ${arg}` };
    }
  }
  return flags;
}

function readPromptVersion(repoRoot: string, name: string): string {
  const path = join(repoRoot, 'packages/prompts', `${name}.md`);
  if (!existsSync(path)) return '0.0.0';
  const text = readFileSync(path, 'utf8');
  const m = /^version:\s*(\S+)\s*$/m.exec(text);
  return m?.[1] ?? '0.0.0';
}

function discoverEvalTickets(repoRoot: string): { id: string; dir: string; stages: Stage[] }[] {
  const root = join(repoRoot, 'fixtures/golden-eval');
  if (!existsSync(root)) return [];
  const out: { id: string; dir: string; stages: Stage[] }[] = [];
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    if (entry.name === 'README.md' || entry.name.startsWith('.')) continue;
    const dir = join(root, entry.name);
    const metaPath = join(dir, 'meta.json');
    if (!existsSync(metaPath)) continue;
    const meta = JSON.parse(readFileSync(metaPath, 'utf8')) as { id: string; stages: Stage[] };
    out.push({ id: meta.id, dir, stages: meta.stages });
  }
  return out.sort((a, b) => a.id.localeCompare(b.id));
}

function discoverClassifierTickets(repoRoot: string): { id: string; path: string }[] {
  const root = join(repoRoot, 'fixtures/golden-tickets');
  if (!existsSync(root)) return [];
  const out: { id: string; path: string }[] = [];
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith('.json')) continue;
    const path = join(root, entry.name);
    const data = JSON.parse(readFileSync(path, 'utf8')) as { ticket?: string };
    if (typeof data.ticket === 'string') out.push({ id: data.ticket, path });
  }
  return out.sort((a, b) => a.id.localeCompare(b.id));
}

export async function evalPrepareCmd(argv: string[], opts: EvalPrepareOpts = {}): Promise<number> {
  const repoRoot = opts.cwd ?? process.cwd();

  const flags = parseFlags(argv);
  if ('error' in flags) {
    console.error(`[xera:eval-prepare] ${flags.error}`);
    return 1;
  }

  const evalTickets = discoverEvalTickets(repoRoot);
  const classifierTickets = discoverClassifierTickets(repoRoot);

  // Determine which stages to run.
  const stages: Stage[] = flags.only_prompt ? [flags.only_prompt] : [...STAGES];

  // Determine which tickets are relevant.
  const wantsEval = stages.some((s) => s !== 'diagnose-failure');
  const wantsClassifier = stages.includes('diagnose-failure');

  let selectedTickets: string[] = [];
  if (wantsEval) selectedTickets.push(...evalTickets.map((t) => t.id));
  if (wantsClassifier) selectedTickets.push(...classifierTickets.map((t) => t.id));
  selectedTickets = [...new Set(selectedTickets)].sort();

  if (flags.only_ticket) {
    if (!selectedTickets.includes(flags.only_ticket)) {
      console.error(`[xera:eval-prepare] No golden fixture for ${flags.only_ticket}`);
      return 1;
    }
    selectedTickets = [flags.only_ticket];
  }

  if (selectedTickets.length === 0) {
    console.error('[xera:eval-prepare] No tickets selected (after filters).');
    return 1;
  }

  const runId = generateRunId({
    ...(opts.now ? { now: opts.now } : {}),
    ...(opts.getGitSha ? { getGitSha: opts.getGitSha } : {}),
  });
  const paths = resolveEvalPaths(repoRoot, runId);

  if (existsSync(paths.root) && !flags.force) {
    console.error(
      `[xera:eval-prepare] run dir already exists: ${paths.root}. Pass --force to re-run.`,
    );
    return 1;
  }
  mkdirSync(paths.inputsDir, { recursive: true });
  mkdirSync(paths.actualDir, { recursive: true });

  // Copy inputs.
  for (const ticket of selectedTickets) {
    const ticketInputs = paths.ticketInputsDir(ticket);
    mkdirSync(ticketInputs, { recursive: true });
    const evalT = evalTickets.find((t) => t.id === ticket);
    const classT = classifierTickets.find((t) => t.id === ticket);
    if (evalT) {
      copyFileSync(join(evalT.dir, 'story.md'), join(ticketInputs, 'story.md'));
      const featurePath = join(evalT.dir, 'golden/test.feature');
      if (existsSync(featurePath)) copyFileSync(featurePath, join(ticketInputs, 'test.feature'));
    }
    if (classT) {
      copyFileSync(classT.path, join(ticketInputs, 'classifier-input.json'));
    }
  }

  // Build manifest.
  const now = (opts.now ?? (() => new Date()))();
  const manifest: Manifest = {
    run_id: runId,
    started_at: now.toISOString(),
    git_sha: runId.split('-')[2] ?? 'nogit',
    tickets: selectedTickets,
    stages,
    prompt_versions: {
      'feature-from-story': readPromptVersion(repoRoot, 'feature-from-story'),
      'script-from-feature': readPromptVersion(repoRoot, 'script-from-feature'),
      'diagnose-failure': readPromptVersion(repoRoot, 'diagnose-failure'),
      'eval-rubric': readPromptVersion(repoRoot, 'eval-rubric'),
    },
    flags: {
      force: flags.force,
      only_prompt: flags.only_prompt,
      only_ticket: flags.only_ticket,
      judge_only: false,
    },
  };

  // Validate before writing.
  ManifestSchema.parse(manifest);
  writeFileSync(paths.manifest, JSON.stringify(manifest, null, 2));

  if (!acquireLock(paths.lock, runId)) {
    console.error(`[xera:eval-prepare] failed to acquire lock at ${paths.lock}`);
    return 4;
  }

  console.log(
    `[xera:eval-prepare] prepared ${selectedTickets.length} ticket(s) for stages: ${stages.join(', ')}`,
  );
  console.log(`RUN_ID=${runId}`);
  return 0;
}
