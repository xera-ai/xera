import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
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

const LOCATOR_LINE_RE = /(?:^|\n)Locator:\s*(.+?)(?:\n|$)/;

function classifyKind(raw: string): FailedLocatorKind {
  if (/^getByRole\b/.test(raw)) return 'role';
  if (/^getByTestId\b/.test(raw)) return 'test-id';
  if (/^getByLabel\b/.test(raw)) return 'label';
  if (/^getByText\b/.test(raw)) return 'text';
  if (/^locator\(\s*['"`]\s*\.[A-Za-z_-]/.test(raw)) return 'css-class';
  return 'other';
}

function extractDomSnapshot(tracePath: string): string {
  if (!existsSync(tracePath)) return '';
  const buf = readFileSync(tracePath);
  const entries = unzipSync(buf);
  // Strategy: take the LAST .html resource in the zip. Playwright stores
  // DOM frame snapshots under resources/<hash>.html; the most recent one
  // is the closest to the failure point in the absence of finer-grained
  // event correlation. v0.5.x can swap in event-correlated snapshot
  // selection if needed.
  let bestKey: string | null = null;
  for (const name of Object.keys(entries)) {
    if (name.endsWith('.html')) bestKey = name;
  }
  if (!bestKey) return '';
  const html = new TextDecoder().decode(entries[bestKey]!);
  // Apply free-text scrub (JWT + credit card redaction). HTML structure
  // preserved; only matched secrets in text content are redacted. v0.5.x
  // may add HTML-aware scrubbing if richer redaction is needed.
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

  const domSnapshotAtFailure = extractDomSnapshot(join(runDir, 'trace.zip'));

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
