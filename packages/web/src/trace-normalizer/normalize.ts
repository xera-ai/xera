import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parsePlaywrightReport } from './parse';
import { type NormalizedNetworkEntry, type NormalizedRun, scrub } from './scrub';
import { unzipTrace } from './unzip';

export interface NormalizeRunInput {
  runId: string;
  runDir: string;
}

interface TraceNetworkEntry {
  type: 'request';
  method: string;
  url: string;
  status: number;
  requestHeaders?: Record<string, string>;
  responseHeaders?: Record<string, string>;
  requestBody?: unknown;
  responseBody?: unknown;
}

interface TraceConsoleEntry {
  type: 'console';
  text: string;
}

interface SidecarNetworkEntry {
  scenario: string;
  method: string;
  url: string;
  status: number;
  respBody?: unknown;
}

export async function normalizeRun(input: NormalizeRunInput): Promise<NormalizedRun> {
  const reportPath = join(input.runDir, 'report.json');
  const report = JSON.parse(readFileSync(reportPath, 'utf8'));
  let normalized = parsePlaywrightReport(report, input.runId);

  // The opt-in xeraNetwork recorder writes a network.jsonl sidecar with response
  // bodies + a per-scenario tag. Prefer it over Playwright's native trace .network
  // (which doesn't reliably carry bodies) when present.
  const sidecarPath = join(input.runDir, 'network.jsonl');
  const sidecar: SidecarNetworkEntry[] = existsSync(sidecarPath)
    ? readFileSync(sidecarPath, 'utf8')
        .trim()
        .split('\n')
        .filter(Boolean)
        .map((l) => JSON.parse(l) as SidecarNetworkEntry)
    : [];

  // Enrich with trace.zip if present
  const tracePath = join(input.runDir, 'trace.zip');
  let traceNetwork: TraceNetworkEntry[] = [];
  let consoleEvents: TraceConsoleEntry[] = [];
  if (existsSync(tracePath)) {
    const { files } = unzipTrace(tracePath);
    const networkFile = Object.entries(files).find(([k]) => k.endsWith('.network'))?.[1];
    const traceFile = Object.entries(files).find(([k]) => k.endsWith('.trace'))?.[1];
    traceNetwork = networkFile
      ? networkFile
          .trim()
          .split('\n')
          .filter(Boolean)
          .map((l) => JSON.parse(l))
          .filter((e: any) => e.type === 'request')
      : [];
    consoleEvents = traceFile
      ? traceFile
          .trim()
          .split('\n')
          .filter(Boolean)
          .map((l) => JSON.parse(l))
          .filter((e: any) => e.type === 'console')
      : [];
  }

  if (sidecar.length > 0 || traceNetwork.length > 0 || consoleEvents.length > 0) {
    for (const sc of normalized.scenarios) {
      if (sc.outcome !== 'FAIL') continue;
      sc.failure = sc.failure ?? {};
      if (sidecar.length > 0) {
        // Correlate captured calls to this scenario by title.
        sc.failure.networkAtFailure = sidecar
          .filter((e) => e.scenario === sc.name)
          .map((e) => {
            const entry: NormalizedNetworkEntry = {
              method: e.method,
              url: e.url,
              status: e.status,
            };
            if (e.respBody !== undefined) entry.responseBody = e.respBody;
            return entry;
          });
      } else {
        // Fallback: native trace .network, attached to all failing scenarios.
        sc.failure.networkAtFailure = traceNetwork.map((n) => {
          const entry: NormalizedNetworkEntry = { method: n.method, url: n.url, status: n.status };
          if (n.requestHeaders !== undefined) entry.requestHeaders = n.requestHeaders;
          if (n.responseHeaders !== undefined) entry.responseHeaders = n.responseHeaders;
          if (n.requestBody !== undefined) entry.requestBody = n.requestBody;
          if (n.responseBody !== undefined) entry.responseBody = n.responseBody;
          return entry;
        });
      }
      sc.failure.consoleAtFailure = consoleEvents.map((c) => c.text);
    }
  }

  normalized = scrub(normalized);
  writeFileSync(join(input.runDir, 'normalized.json'), JSON.stringify(normalized, null, 2));
  return normalized;
}
