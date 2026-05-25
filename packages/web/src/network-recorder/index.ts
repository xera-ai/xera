/**
 * Opt-in web network recorder. When `XERA_NETWORK_LOG` is set (by `xera:exec`),
 * `attachNetworkRecorder` subscribes to `page.on('response')` and appends one
 * scrubbed JSONL line per response to that file. The xera trace normalizer
 * prefers this sidecar over Playwright's native trace `.network` (which does not
 * reliably carry response bodies) to feed CONTRACT_DRIFT detection.
 *
 * Unlike the HTTP adapter's `APIRequestContext` proxy (which drains the body),
 * `page.on('response')` bodies are buffered by Playwright and safe to read.
 */
import { appendFileSync } from 'node:fs';
import { scrubBodyJson } from '@xera-ai/core';

export interface NetworkLogEntry {
  scenario: string;
  method: string;
  url: string;
  status: number;
  respBody?: unknown;
}

/** Minimal structural views of the Playwright objects we touch (keeps this unit-testable). */
interface ResponseLike {
  url(): string;
  status(): number;
  request(): { method(): string };
  json(): Promise<unknown>;
}
interface PageLike {
  on(event: 'response', handler: (res: ResponseLike) => void | Promise<void>): void;
}

export interface AttachNetworkRecorderInput {
  /** Destination JSONL path (typically process.env.XERA_NETWORK_LOG). Falsy → no-op. */
  logPath: string | undefined;
  /** Scenario/test title used to correlate calls to a scenario in the normalizer. */
  scenario: string;
  /** Active web baseUrl; stripped so `url` is a path that the classifier can template-match. */
  baseUrl?: string;
}

/** Reduce an absolute response URL to a path (+ query) the OpenAPI matcher understands. */
export function stripBase(url: string, baseUrl?: string): string {
  if (baseUrl && url.startsWith(baseUrl)) {
    const rest = url.slice(baseUrl.length);
    return rest.startsWith('/') ? rest : `/${rest}`;
  }
  try {
    const u = new URL(url);
    return u.pathname + u.search;
  } catch {
    return url;
  }
}

export function formatNetworkLine(entry: NetworkLogEntry): string {
  return `${JSON.stringify(entry)}\n`;
}

/** Append one network entry to logPath. No-op when logPath is falsy. */
export function recordResponseLine(logPath: string | undefined, entry: NetworkLogEntry): void {
  if (!logPath) return;
  appendFileSync(logPath, formatNetworkLine(entry));
}

/** Build a scrubbed log entry from a response. JSON body is scrubbed; non-JSON omits respBody. */
export async function captureResponse(
  res: ResponseLike,
  scenario: string,
  baseUrl?: string,
): Promise<NetworkLogEntry> {
  const entry: NetworkLogEntry = {
    scenario,
    method: res.request().method(),
    url: stripBase(res.url(), baseUrl),
    status: res.status(),
  };
  try {
    entry.respBody = scrubBodyJson(await res.json());
  } catch {
    // non-JSON / binary response → omit respBody (classifier falls back to status/path)
  }
  return entry;
}

/**
 * Subscribe to page responses and append scrubbed entries to `input.logPath`.
 * No-op when logPath is falsy. Never throws into the test.
 */
export function attachNetworkRecorder(page: PageLike, input: AttachNetworkRecorderInput): void {
  if (!input.logPath) return;
  page.on('response', async (res) => {
    try {
      recordResponseLine(input.logPath, await captureResponse(res, input.scenario, input.baseUrl));
    } catch {
      // capture/scrub failures must never fail the test under record
    }
  });
}
