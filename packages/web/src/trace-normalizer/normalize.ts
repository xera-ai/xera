import { readFileSync, existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parsePlaywrightReport } from './parse';
import { scrub, type NormalizedNetworkEntry, type NormalizedRun } from './scrub';
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

interface TraceConsoleEntry { type: 'console'; text: string; }

export async function normalizeRun(input: NormalizeRunInput): Promise<NormalizedRun> {
  const reportPath = join(input.runDir, 'report.json');
  const report = JSON.parse(readFileSync(reportPath, 'utf8'));
  let normalized = parsePlaywrightReport(report, input.runId);

  // Enrich with trace.zip if present
  const tracePath = join(input.runDir, 'trace.zip');
  if (existsSync(tracePath)) {
    const { files } = unzipTrace(tracePath);
    const networkFile = Object.entries(files).find(([k]) => k.endsWith('.network'))?.[1];
    const traceFile = Object.entries(files).find(([k]) => k.endsWith('.trace'))?.[1];
    const network: TraceNetworkEntry[] = networkFile
      ? networkFile.trim().split('\n').filter(Boolean).map(l => JSON.parse(l)).filter((e: any) => e.type === 'request')
      : [];
    const consoleEvents: TraceConsoleEntry[] = traceFile
      ? traceFile.trim().split('\n').filter(Boolean).map(l => JSON.parse(l)).filter((e: any) => e.type === 'console')
      : [];

    // Attach to each failing scenario (all entries — v0.1 doesn't yet correlate by step time)
    for (const sc of normalized.scenarios) {
      if (sc.outcome !== 'FAIL') continue;
      sc.failure = sc.failure ?? {};
      sc.failure.networkAtFailure = network.map(n => {
        const entry: NormalizedNetworkEntry = { method: n.method, url: n.url, status: n.status };
        if (n.requestHeaders !== undefined) entry.requestHeaders = n.requestHeaders;
        if (n.responseHeaders !== undefined) entry.responseHeaders = n.responseHeaders;
        if (n.requestBody !== undefined) entry.requestBody = n.requestBody;
        if (n.responseBody !== undefined) entry.responseBody = n.responseBody;
        return entry;
      });
      sc.failure.consoleAtFailure = consoleEvents.map(c => c.text);
    }
  }

  normalized = scrub(normalized);
  writeFileSync(join(input.runDir, 'normalized.json'), JSON.stringify(normalized, null, 2));
  return normalized;
}
