import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { scrubFreeText } from '@xera-ai/web';
import { unzipSync } from 'fflate';
import { resolveArtifactPaths } from '../artifact/paths';

export type FailedLocatorKind = 'role' | 'test-id' | 'css-class' | 'text' | 'label' | 'other';

export interface HealInput {
  ticket: string;
  runId: string;
  scenarioName: string;
  failedLocator: {
    raw: string;
    kind: FailedLocatorKind;
    pomFile: string;
    pomLine: number;
    pomLineContent: string;
    pomMethodName: string;
  };
  gherkinStep: string;
  domSnapshotAtFailure: string;
}

interface ClassifierInput {
  runId: string;
  scenarios: Array<{
    name: string;
    outcome: string;
    class: string;
    confidence: string;
    rationale: string;
  }>;
}

interface NormalizedRunFile {
  runId: string;
  scenarios: Array<{
    name: string;
    outcome: 'PASS' | 'FAIL' | 'SKIPPED';
    failure?: { errorMessage?: string };
  }>;
}

const LOCATOR_LINE_RE = /^Locator:\s*(.+)$/m;

function classifyKind(raw: string): FailedLocatorKind {
  if (/^getByRole\b/.test(raw)) return 'role';
  if (/^getByTestId\b/.test(raw)) return 'test-id';
  if (/^getByLabel\b/.test(raw)) return 'label';
  if (/^getByText\b/.test(raw)) return 'text';
  if (/^locator\(\s*['"`]\s*\.[A-Za-z_-]/.test(raw)) return 'css-class';
  return 'other';
}

// Extract the page state at the moment the failing assertion or action raised
// an error. Playwright 1.60 stores rendered DOM inline as a JSON tree on
// `frame-snapshot` events (no `resourceName`) plus, for matcher-based
// assertions, an `ariaSnapshot` of the page in `result.received` on the
// error-bearing `after` event. The aria tree is semantic (role + name + level)
// and maps directly to what `heal-locator` needs to propose a `getByRole(...)`,
// so we prefer it. Falls back to the served `.html` resource (lex-sort) only
// when no aria snapshot is recorded — useful for traces of non-SPA targets
// where the response body IS the rendered DOM. (#207)
function extractDomSnapshot(tracePath: string): string {
  if (!existsSync(tracePath)) return '';
  const buf = readFileSync(tracePath);
  const entries = unzipSync(buf);

  // A trace.zip can carry multiple `.trace` files: a test-runner trace
  // (`test.trace`) and one or more library traces (`<idx>-trace.trace`). The
  // library trace is where matcher errors with `ariaSnapshot` live, but its
  // filename is not fixed, so scan every `.trace` entry.
  const traceKeys = Object.keys(entries).filter((name) => name.endsWith('.trace'));
  for (const traceKey of traceKeys) {
    const traceText = new TextDecoder().decode(entries[traceKey]!);
    for (const line of traceText.split('\n')) {
      if (!line) continue;
      let evt: Record<string, unknown>;
      try {
        evt = JSON.parse(line) as Record<string, unknown>;
      } catch {
        continue;
      }
      if (evt.type !== 'after') continue;
      if ((evt as { error?: unknown }).error === undefined) continue;
      const received = (evt as { result?: { received?: { ariaSnapshot?: unknown } } }).result
        ?.received;
      const aria = received?.ariaSnapshot;
      if (typeof aria === 'string' && aria.length > 0) {
        return scrubFreeText(aria);
      }
    }
  }

  // Fallback: last .html by lexicographic sort. For non-SPA targets this is
  // typically the served response body, which is the rendered DOM. For SPA
  // targets with no ariaSnapshot recorded this returns the pre-hydration shell
  // — better than nothing, but `heal-locator` will likely refuse with
  // `low-confidence` from lack of evidence.
  const htmlKeys = Object.keys(entries)
    .filter((name) => name.endsWith('.html'))
    .sort();
  const chosenKey = htmlKeys[htmlKeys.length - 1];
  if (!chosenKey) return '';
  const html = new TextDecoder().decode(entries[chosenKey]!);
  return scrubFreeText(html);
}

function findPomLine(
  ticketDir: string,
  rawLocator: string,
): { pomFile: string; pomLine: number; pomLineContent: string; pomMethodName: string } {
  const pomDir = join(ticketDir, 'page-objects');
  const candidates: string[] = [];
  if (existsSync(pomDir)) {
    for (const name of readdirSync(pomDir)) {
      if (name.endsWith('.ts')) candidates.push(join(pomDir, name));
    }
  }
  for (const file of candidates) {
    const text = readFileSync(file, 'utf8');
    const lines = text.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]!;
      if (line.includes(rawLocator)) {
        const methodMatch = /^\s*(\w+)\s*=/.exec(line);
        return {
          pomFile: file,
          pomLine: i + 1,
          pomLineContent: line,
          pomMethodName: methodMatch?.[1] ?? '<anonymous>',
        };
      }
    }
  }
  throw new Error(`POM line not found for locator: ${rawLocator}`);
}

interface PwAttachment {
  name: string;
  path?: string;
}
interface PwReportSuite {
  specs?: Array<{
    title: string;
    tests?: Array<{ results?: Array<{ attachments?: PwAttachment[] }> }>;
  }>;
  suites?: PwReportSuite[];
}

function collectTracePaths(suite: PwReportSuite, scenarioName: string, out: string[]): void {
  for (const spec of suite.specs ?? []) {
    if (spec.title !== scenarioName) continue;
    for (const t of spec.tests ?? []) {
      for (const r of t.results ?? []) {
        for (const a of r.attachments ?? []) {
          if (a.name === 'trace' && a.path) out.push(a.path);
        }
      }
    }
  }
  for (const sub of suite.suites ?? []) collectTracePaths(sub, scenarioName, out);
}

// Playwright writes each test's trace under a per-test subdirectory
// (runDir/<slug>/trace.zip), never at runDir/trace.zip. Resolve the trace for
// the failing scenario from the JSON report's attachment paths, falling back
// to a one-level glob, then the legacy top-level path. (#200)
function findTraceZip(runDir: string, scenarioName: string): string | null {
  const reportPath = join(runDir, 'report.json');
  if (existsSync(reportPath)) {
    try {
      const report = JSON.parse(readFileSync(reportPath, 'utf8')) as { suites?: PwReportSuite[] };
      const found: string[] = [];
      for (const top of report.suites ?? []) collectTracePaths(top, scenarioName, found);
      const hit = found.find((p) => existsSync(p));
      if (hit) return hit;
    } catch {
      // Malformed report — fall through to globbing.
    }
  }
  if (existsSync(runDir)) {
    for (const entry of readdirSync(runDir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const candidate = join(runDir, entry.name, 'trace.zip');
      if (existsSync(candidate)) return candidate;
    }
  }
  const legacy = join(runDir, 'trace.zip');
  return existsSync(legacy) ? legacy : null;
}

function findGherkinStep(featureText: string, rawLocator: string): string {
  // Best-effort: find the first step line that mentions a quoted string
  // appearing in the locator (e.g. a button name). Falls back to the
  // first When/Then line if no match.
  const quoteMatch = /['"`]([^'"`]{2,})['"`]/.exec(rawLocator);
  if (quoteMatch) {
    const needle = quoteMatch[1]!;
    for (const line of featureText.split('\n')) {
      if (line.includes(needle) && /^\s*(When|Then|And|Given)\b/.test(line)) {
        return line.trim();
      }
    }
  }
  for (const line of featureText.split('\n')) {
    if (/^\s*(When|Then)\b/.test(line)) return line.trim();
  }
  return '';
}

export function healPrepare(
  repoRoot: string,
  ticket: string,
  runId: string,
  scenarioName: string,
): HealInput {
  const paths = resolveArtifactPaths(repoRoot, ticket);
  const classifierPath = join(paths.ticketDir, 'classifier-input.json');
  const classifier: ClassifierInput = JSON.parse(readFileSync(classifierPath, 'utf8'));
  const cls = classifier.scenarios.find((s) => s.name === scenarioName);
  if (!cls) throw new Error(`scenario not found in classifier-input: "${scenarioName}"`);

  const runDir = join(paths.runsDir, runId);
  const normalized: NormalizedRunFile = JSON.parse(
    readFileSync(join(runDir, 'normalized.json'), 'utf8'),
  );
  const normSc = normalized.scenarios.find((s) => s.name === scenarioName);
  if (!normSc?.failure) throw new Error(`no failure recorded for scenario "${scenarioName}"`);
  const errorMessage = normSc.failure.errorMessage ?? '';
  const m = LOCATOR_LINE_RE.exec(errorMessage);
  if (!m) throw new Error(`cannot extract locator from errorMessage: ${errorMessage.slice(0, 80)}`);
  const raw = m[1]!.trim();
  const kind = classifyKind(raw);

  const pomLoc = findPomLine(paths.ticketDir, raw);

  const featureText = readFileSync(paths.featurePath, 'utf8');
  const gherkinStep = findGherkinStep(featureText, raw);

  const tracePath = findTraceZip(runDir, scenarioName);
  const domSnapshotAtFailure = tracePath ? extractDomSnapshot(tracePath) : '';

  return {
    ticket,
    runId,
    scenarioName,
    failedLocator: { raw, kind, ...pomLoc },
    gherkinStep,
    domSnapshotAtFailure,
  };
}

export async function healPrepareCmd(argv: string[]): Promise<number> {
  const [ticket, runId, ...scenarioParts] = argv;
  if (!ticket || !runId || scenarioParts.length === 0) {
    console.error('[xera:heal-prepare] usage: heal-prepare <TICKET> <RUN_ID> <SCENARIO_NAME>');
    return 1;
  }
  const scenarioName = scenarioParts.join(' ');
  try {
    const result = healPrepare(process.cwd(), ticket, runId, scenarioName);
    const paths = resolveArtifactPaths(process.cwd(), ticket);
    const outPath = join(paths.runsDir, runId, 'heal-input.json');
    writeFileSync(outPath, JSON.stringify(result, null, 2));
    console.log(`[xera:heal-prepare] wrote ${outPath}`);
    return 0;
  } catch (err) {
    console.error(`[xera:heal-prepare] ${(err as Error).message}`);
    return 1;
  }
}
