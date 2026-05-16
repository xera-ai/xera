import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

interface TraceLine {
  ts: string;
  scenario: string;
  method: string;
  url: string;
  reqHeaders: Record<string, string>;
  reqBody?: unknown;
  status: number;
  respHeaders: Record<string, string>;
  respBody: unknown;
  durationMs: number;
}

export interface NormalizedHttpScenario {
  name: string;
  outcome: 'PASS' | 'FAIL' | 'SKIPPED';
  failure?: { errorMessage?: string };
}

export interface NormalizedHttpRun {
  runId: string;
  outcome: 'PASS' | 'FAIL';
  scenarios: NormalizedHttpScenario[];
  http: {
    calls: Array<TraceLine & { curl: string }>;
  };
}

function buildCurl(line: TraceLine): string {
  const headerParts = Object.entries(line.reqHeaders).map(
    ([k, v]) => `-H ${JSON.stringify(`${k}: ${v}`)}`,
  );
  const body =
    line.reqBody === undefined ? '' : ` -d ${JSON.stringify(JSON.stringify(line.reqBody))}`;
  const headers = headerParts.length > 0 ? ` ${headerParts.join(' ')}` : '';
  return `curl -X ${line.method}${headers} $BASE${line.url}${body}`;
}

interface PwSpec {
  title: string;
  tests: Array<{ results: Array<{ status: string; error?: { message?: string } }> }>;
}
interface PwSuite {
  specs?: PwSpec[];
  suites?: PwSuite[];
}

function walkSuite(s: PwSuite, out: NormalizedHttpScenario[]): boolean {
  let anyFail = false;
  for (const spec of s.specs ?? []) {
    const result = spec.tests[0]?.results[0];
    const outcome: NormalizedHttpScenario['outcome'] = !result
      ? 'SKIPPED'
      : result.status === 'passed'
        ? 'PASS'
        : result.status === 'skipped'
          ? 'SKIPPED'
          : 'FAIL';
    if (outcome === 'FAIL') anyFail = true;
    const sc: NormalizedHttpScenario = { name: spec.title, outcome };
    if (outcome === 'FAIL' && result?.error?.message) {
      sc.failure = { errorMessage: result.error.message };
    }
    out.push(sc);
  }
  for (const sub of s.suites ?? []) {
    if (walkSuite(sub, out)) anyFail = true;
  }
  return anyFail;
}

export interface NormalizeHttpRunInput {
  runId: string;
  runDir: string;
}

export async function normalizeHttpRun(input: NormalizeHttpRunInput): Promise<NormalizedHttpRun> {
  const tracePath = join(input.runDir, 'http-trace.jsonl');
  const rawReportPath = join(input.runDir, 'raw-report.json');

  const calls: Array<TraceLine & { curl: string }> = [];
  if (existsSync(tracePath)) {
    const text = readFileSync(tracePath, 'utf8');
    for (const raw of text.split('\n')) {
      if (!raw.trim()) continue;
      const parsed = JSON.parse(raw) as TraceLine;
      calls.push({ ...parsed, curl: buildCurl(parsed) });
    }
  }

  const raw = existsSync(rawReportPath)
    ? (JSON.parse(readFileSync(rawReportPath, 'utf8')) as { suites?: PwSuite[] })
    : { suites: [] };

  const scenarios: NormalizedHttpScenario[] = [];
  let anyFail = false;
  for (const top of raw.suites ?? []) {
    if (walkSuite(top, scenarios)) anyFail = true;
  }

  const out: NormalizedHttpRun = {
    runId: input.runId,
    outcome: anyFail ? 'FAIL' : 'PASS',
    scenarios,
    http: { calls },
  };
  writeFileSync(join(input.runDir, 'normalized.json'), JSON.stringify(out, null, 2));
  return out;
}
