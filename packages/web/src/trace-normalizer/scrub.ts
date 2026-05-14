import { scrubHeaders, scrubBodyJson, scrubFreeText } from './scrub-rules';

export interface NormalizedNetworkEntry {
  method: string;
  url: string;
  status: number;
  requestHeaders?: Record<string, string>;
  requestBody?: unknown;
  responseHeaders?: Record<string, string>;
  responseBody?: unknown;
}

export interface NormalizedScenario {
  name: string;
  outcome: 'PASS' | 'FAIL' | 'SKIPPED';
  failure?: {
    step?: string;
    errorMessage?: string;
    domSnapshotAtFailure?: string;
    networkAtFailure?: NormalizedNetworkEntry[];
    consoleAtFailure?: string[];
    screenshotPath?: string;
  };
}

export interface NormalizedRun {
  runId: string;
  outcome: 'PASS' | 'FAIL';
  scenarios: NormalizedScenario[];
  scrubbed_fields_count: number;
}

function countScrubbed(before: unknown, after: unknown): number {
  if (typeof before === 'string' && typeof after === 'string') return before !== after ? 1 : 0;
  if (Array.isArray(before) && Array.isArray(after)) {
    return before.reduce((acc, b, i) => acc + countScrubbed(b, after[i]), 0);
  }
  if (before && after && typeof before === 'object' && typeof after === 'object') {
    let n = 0;
    for (const k of Object.keys(before as Record<string, unknown>)) {
      n += countScrubbed((before as Record<string, unknown>)[k], (after as Record<string, unknown>)[k]);
    }
    return n;
  }
  return 0;
}

export function scrub(run: NormalizedRun): NormalizedRun {
  const out: NormalizedRun = { ...run, scrubbed_fields_count: 0, scenarios: [] };
  let totalScrubs = 0;
  for (const sc of run.scenarios) {
    const newSc: NormalizedScenario = { ...sc };
    if (sc.failure) {
      const f = sc.failure;
      const newF = { ...f };
      if (f.errorMessage) {
        newF.errorMessage = scrubFreeText(f.errorMessage);
        totalScrubs += countScrubbed(f.errorMessage, newF.errorMessage);
      }
      if (f.consoleAtFailure) {
        newF.consoleAtFailure = f.consoleAtFailure.map(scrubFreeText);
        totalScrubs += f.consoleAtFailure.reduce(
          (acc, b, i) => acc + countScrubbed(b, newF.consoleAtFailure![i]),
          0,
        );
      }
      if (f.networkAtFailure) {
        newF.networkAtFailure = f.networkAtFailure.map(n => {
          const reqHeaders = n.requestHeaders ? scrubHeaders(n.requestHeaders) : undefined;
          const resHeaders = n.responseHeaders ? scrubHeaders(n.responseHeaders) : undefined;
          const reqBody = n.requestBody !== undefined ? scrubBodyJson(n.requestBody) : undefined;
          const resBody = n.responseBody !== undefined ? scrubBodyJson(n.responseBody) : undefined;
          totalScrubs += countScrubbed(n.requestHeaders ?? {}, reqHeaders ?? {});
          totalScrubs += countScrubbed(n.responseHeaders ?? {}, resHeaders ?? {});
          totalScrubs += countScrubbed(n.requestBody ?? {}, reqBody ?? {});
          totalScrubs += countScrubbed(n.responseBody ?? {}, resBody ?? {});
          return { ...n, requestHeaders: reqHeaders, responseHeaders: resHeaders, requestBody: reqBody, responseBody: resBody };
        });
      }
      newSc.failure = newF;
    }
    out.scenarios.push(newSc);
  }
  out.scrubbed_fields_count = totalScrubs;
  return out;
}
