import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { parse as parseYaml } from 'yaml';
import { resolveArtifactPaths } from '../artifact/paths';
import { appendEvents, deriveSnapshot, loadAllEvents } from '../graph/store';
import type {
  Classification,
  ClassificationDisputedPayload,
  EdgeDiscoveredPayload,
  Event,
  PomPromotedPayload,
  RunClassifiedPayload,
  RunCompletedPayload,
  ScenarioNode,
  TicketFetchedPayload,
} from '../graph/types';
import { SCHEMA_VERSION } from '../graph/types';
import { ulid } from '../graph/ulid';

function nowIso(): string {
  return new Date().toISOString();
}
function sha1(s: string): string {
  return createHash('sha1').update(s).digest('hex');
}
function scenarioId(ticket: string, name: string): string {
  return sha1(`${ticket}:${name.trim().toLowerCase().replace(/\s+/g, ' ')}`);
}
function pomId(filePath: string): string {
  return sha1(basename(filePath));
}
function makeEvent<T extends Event['type']>(
  actor: string,
  type: T,
  payload: Extract<Event, { type: T }>['payload'],
): Event {
  return {
    event_id: ulid(),
    schema_version: SCHEMA_VERSION,
    ts: nowIso(),
    actor,
    type,
    payload,
  } as Event;
}

interface StoryFrontmatter {
  ticketId: string;
  summary: string;
  storyHash: string;
  acceptanceCriteria?: string[];
  linked_issues?: Array<{
    ticketId: string;
    relation: 'blocks' | 'duplicates' | 'relates' | 'supersedes';
  }>;
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;
  const m = a.length;
  const n = b.length;
  let prev = new Array<number>(n + 1);
  let curr = new Array<number>(n + 1);
  for (let j = 0; j <= n; j++) prev[j] = j;
  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(prev[j]! + 1, curr[j - 1]! + 1, prev[j - 1]! + cost);
    }
    [prev, curr] = [curr, prev];
  }
  return prev[n]!;
}

function findClosestName(target: string, candidates: string[]): string | undefined {
  if (candidates.length === 0) return undefined;
  const norm = target.trim().toLowerCase();
  let best: { name: string; dist: number } | undefined;
  for (const c of candidates) {
    const d = levenshtein(norm, c.trim().toLowerCase());
    if (best === undefined || d < best.dist) best = { name: c, dist: d };
  }
  if (!best) return undefined;
  // Only suggest when the candidate is within 50% edit distance of the target —
  // otherwise the "Did you mean" line is noise.
  const maxLen = Math.max(norm.length, best.name.trim().length);
  if (maxLen > 0 && best.dist > maxLen * 0.5) return undefined;
  return best.name;
}

function warnUnmatchedScenarios(
  context: 'exec' | 'classify',
  source: string,
  ticket: string,
  total: number,
  unmatched: Array<{ name: string; suggestion?: string }>,
): void {
  if (unmatched.length === 0) return;
  console.warn(
    `[graph-record ${context}] ${unmatched.length} of ${total} scenario name(s) in ${source} could not be matched to graph scenarios for ${ticket}.`,
  );
  for (const u of unmatched) {
    console.warn(`  Unmatched: "${u.name}"`);
    if (u.suggestion) console.warn(`    Did you mean: "${u.suggestion}"?`);
  }
}

function knownScenariosForTicket(repoRoot: string, ticket: string): ScenarioNode[] {
  const snap = deriveSnapshot(loadAllEvents(repoRoot));
  return Object.values(snap.scenarios).filter((s) => s.ticketId === ticket);
}

function readStoryFrontmatter(repoRoot: string, ticket: string): StoryFrontmatter | null {
  const path = join(repoRoot, '.xera', ticket, 'story.md');
  if (!existsSync(path)) return null;
  const raw = readFileSync(path, 'utf8');
  const m = raw.match(/^---\n([\s\S]*?)\n---/);
  if (!m) return null;
  return parseYaml(m[1]!) as StoryFrontmatter;
}

function readGraphInput(repoRoot: string, ticket: string): { modifiesAreas: string[] } {
  const path = join(repoRoot, '.xera', ticket, 'graph-input.json');
  if (!existsSync(path)) return { modifiesAreas: [] };
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return { modifiesAreas: [] };
  }
}

export async function recordFetch(repoRoot: string, ticket: string): Promise<number> {
  const fm = readStoryFrontmatter(repoRoot, ticket);
  if (!fm) {
    console.error(`[graph-record fetch] story.md not found for ${ticket}`);
    return 1;
  }
  const { modifiesAreas } = readGraphInput(repoRoot, ticket);
  const events: Event[] = [];
  const fetchedPayload: TicketFetchedPayload = {
    ticketId: fm.ticketId,
    summary: fm.summary,
    ac: fm.acceptanceCriteria ?? [],
    jiraLinks: fm.linked_issues ?? [],
    storyHash: fm.storyHash,
    modifiesAreas,
  };
  events.push(makeEvent('xera-fetch', 'ticket.fetched', fetchedPayload));
  for (const link of fm.linked_issues ?? []) {
    const p: EdgeDiscoveredPayload = {
      kind: 'jira-linked',
      from: fm.ticketId,
      to: link.ticketId,
      source: `jira:${link.relation}`,
    };
    events.push(makeEvent('xera-fetch', 'edge.discovered', p));
  }
  for (const area of modifiesAreas) {
    const p: EdgeDiscoveredPayload = {
      kind: 'modifies',
      from: fm.ticketId,
      to: area,
      source: 'extract-areas',
    };
    events.push(makeEvent('xera-fetch', 'edge.discovered', p));
  }
  appendEvents(repoRoot, events, { skill: 'xera-fetch', ticketId: ticket });
  return 0;
}

async function recordScript(repoRoot: string, ticket: string): Promise<number> {
  const { recordScriptImpl } = await import('./graph-record-script');
  return recordScriptImpl(repoRoot, ticket);
}

async function recordExec(repoRoot: string, ticket: string, runId: string): Promise<number> {
  const { normalizedPath } = resolveArtifactPaths(repoRoot, ticket).runPath(runId);
  if (!existsSync(normalizedPath)) {
    console.error(`[graph-record exec] normalized.json missing`);
    return 1;
  }
  const data = JSON.parse(readFileSync(normalizedPath, 'utf8')) as {
    scenarios: Array<{ name: string; outcome: 'PASS' | 'FAIL' | 'SKIPPED' }>;
  };
  const known = knownScenariosForTicket(repoRoot, ticket);
  const knownIds = new Set(known.map((s) => s.id));
  const knownNames = known.map((s) => s.name);
  const events: Event[] = [];
  const unmatched: Array<{ name: string; suggestion?: string }> = [];
  let considered = 0;
  for (const s of data.scenarios) {
    if (s.outcome === 'SKIPPED') continue;
    considered++;
    const sid = scenarioId(ticket, s.name);
    if (known.length > 0 && !knownIds.has(sid)) {
      const suggestion = findClosestName(s.name, knownNames);
      unmatched.push(suggestion ? { name: s.name, suggestion } : { name: s.name });
    }
    const p: RunCompletedPayload = {
      scenarioId: sid,
      ticketId: ticket,
      runId,
      status: s.outcome === 'PASS' ? 'pass' : 'fail',
      runtime: 0,
    };
    events.push(makeEvent('xera-exec', 'run.completed', p));
  }
  warnUnmatchedScenarios('exec', 'normalized.json', ticket, considered, unmatched);
  appendEvents(repoRoot, events, { skill: 'xera-exec', ticketId: ticket });
  return 0;
}

async function recordClassify(repoRoot: string, ticket: string, runId: string): Promise<number> {
  const { ticketDir } = resolveArtifactPaths(repoRoot, ticket);
  const classifyPath = join(ticketDir, 'classifier-input.json');
  if (!existsSync(classifyPath)) {
    console.error(`[graph-record classify] classifier-input.json missing`);
    return 1;
  }
  const data = JSON.parse(readFileSync(classifyPath, 'utf8')) as {
    scenarios: Array<{ name: string; class: string; confidence: 'low' | 'medium' | 'high' }>;
  };
  const known = knownScenariosForTicket(repoRoot, ticket);
  const knownIds = new Set(known.map((s) => s.id));
  const knownNames = known.map((s) => s.name);
  const events: Event[] = [];
  const unmatched: Array<{ name: string; suggestion?: string }> = [];
  for (const s of data.scenarios) {
    const sid = scenarioId(ticket, s.name);
    if (known.length > 0 && !knownIds.has(sid)) {
      const suggestion = findClosestName(s.name, knownNames);
      unmatched.push(suggestion ? { name: s.name, suggestion } : { name: s.name });
    }
    const p: RunClassifiedPayload = {
      scenarioId: sid,
      runId,
      classification: s.class as RunClassifiedPayload['classification'],
      confidence: s.confidence,
    };
    events.push(makeEvent('xera-report', 'run.classified', p));
  }
  warnUnmatchedScenarios(
    'classify',
    'classifier-input.json',
    ticket,
    data.scenarios.length,
    unmatched,
  );
  appendEvents(repoRoot, events, { skill: 'xera-report', ticketId: ticket });
  return 0;
}

async function recordPromote(repoRoot: string, args: Map<string, string>): Promise<number> {
  const from = args.get('--from');
  const to = args.get('--to');
  const pomIdArg = args.get('--pom-id');
  if (!from || !to) {
    console.error(`[graph-record promote] --from and --to required`);
    return 1;
  }
  const id = pomIdArg ?? pomId(from);
  const p: PomPromotedPayload = { pomId: id, fromPath: from, toPath: to };
  const e = makeEvent('xera-promote', 'pom.promoted', p);
  appendEvents(repoRoot, [e], { skill: 'xera-promote', ticketId: 'shared' });
  return 0;
}

function parseFlags(args: string[]): Map<string, string> {
  const m = new Map<string, string>();
  for (let i = 0; i < args.length; i++) {
    if (args[i]!.startsWith('--')) {
      m.set(args[i]!, args[i + 1] ?? '');
      i++;
    }
  }
  return m;
}

export async function graphRecordCmd(argv: string[]): Promise<number> {
  const [action, ...rest] = argv;
  if (!action) {
    console.error(
      `Usage: xera-internal graph-record <fetch|script|exec|classify|promote|dispute> [args]`,
    );
    return 1;
  }
  const repoRoot = process.cwd();
  switch (action) {
    case 'fetch': {
      const ticket = rest[0];
      if (!ticket) {
        console.error('ticket required');
        return 1;
      }
      return recordFetch(repoRoot, ticket);
    }
    case 'script': {
      const ticket = rest[0];
      if (!ticket) {
        console.error('ticket required');
        return 1;
      }
      return recordScript(repoRoot, ticket);
    }
    case 'exec': {
      const ticket = rest[0];
      const flags = parseFlags(rest);
      const runId = flags.get('--run-id');
      if (!ticket || !runId) {
        console.error('ticket + --run-id required');
        return 1;
      }
      return recordExec(repoRoot, ticket, runId);
    }
    case 'classify': {
      const ticket = rest[0];
      const flags = parseFlags(rest);
      const runId = flags.get('--run-id');
      if (!ticket || !runId) {
        console.error('ticket + --run-id required');
        return 1;
      }
      return recordClassify(repoRoot, ticket, runId);
    }
    case 'promote': {
      return recordPromote(repoRoot, parseFlags(rest));
    }
    case 'dispute': {
      const flags = parseFlags(rest);
      const runId = flags.get('--run-id');
      const scenarioIdArg = flags.get('--scenario-id');
      const from = flags.get('--from');
      const to = flags.get('--to');
      const actor = flags.get('--actor');
      const reason = flags.get('--reason');
      if (!runId || !scenarioIdArg || !from || !to || !actor) {
        console.error(
          '[graph-record dispute] required: --run-id --scenario-id --from --to --actor [--reason]',
        );
        return 1;
      }
      const validClass = [
        'REAL_BUG',
        'TEST_BUG',
        'SELECTOR_DRIFT',
        'FLAKY',
        'PASS',
        'TEST_OUTDATED',
        'CONTRACT_DRIFT',
        'RATE_LIMITED',
        'AUTH_EXPIRED',
      ];
      if (!validClass.includes(from) || !validClass.includes(to)) {
        console.error(
          `[graph-record dispute] --from and --to must be one of: ${validClass.join(', ')}`,
        );
        return 1;
      }
      const payload: ClassificationDisputedPayload = {
        runId,
        scenarioId: scenarioIdArg,
        originalClassification: from as Classification,
        disputedTo: to as Classification,
        qaActor: actor,
      };
      if (reason) payload.qaReason = reason;
      const e = makeEvent('xera-report', 'classification.disputed', payload);
      appendEvents(repoRoot, [e], { skill: 'xera-report', ticketId: scenarioIdArg.slice(0, 12) });
      return 0;
    }
    default:
      console.error(`Unknown action: ${action}`);
      return 1;
  }
}
