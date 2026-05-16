/**
 * attachTraceRecorder — wraps an APIRequestContext via Proxy to capture each HTTP
 * call into a JSONL trace file.
 *
 * IMPORTANT v0.7 trade-off: the wrapper reads the response body (res.text()) to
 * scrub and record it. After the wrapper consumes the body stream, callers MUST
 * NOT call res.text() or res.json() again on the returned response, as the
 * underlying Playwright stream is already drained. Tests should assert via
 * res.status() and the JSONL trace file under respBody.
 */
import { appendFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import type { APIRequestContext, APIResponse } from '@playwright/test';
import { scrubBodyJson, scrubFreeText, scrubHeaders } from '@xera-ai/core';

export interface AttachTraceRecorderInput {
  traceFile: string;
  scenario: string;
}

const HTTP_METHODS = ['get', 'post', 'put', 'patch', 'delete', 'fetch', 'head'] as const;
type HttpMethod = (typeof HTTP_METHODS)[number];

function isHttpMethod(m: string | symbol): m is HttpMethod {
  return typeof m === 'string' && (HTTP_METHODS as readonly string[]).includes(m);
}

async function parseBody(text: string): Promise<unknown> {
  if (!text) return undefined;
  try {
    return JSON.parse(text);
  } catch {
    return scrubFreeText(text);
  }
}

type HttpCallOptions = {
  data?: unknown;
  form?: Record<string, string>;
  headers?: Record<string, string>;
};

/**
 * Wrap an APIRequestContext with a proxy that captures each HTTP call to a JSONL trace file.
 * Returns a Proxy that behaves identically to the original context for status/header access.
 * See the module-level JSDoc for the body-consumption caveat.
 */
export function attachTraceRecorder(
  ctx: APIRequestContext,
  input: AttachTraceRecorderInput,
): APIRequestContext {
  mkdirSync(dirname(input.traceFile), { recursive: true });

  return new Proxy(ctx, {
    get(target, prop: string | symbol, receiver) {
      if (!isHttpMethod(prop)) return Reflect.get(target, prop, receiver);
      const orig = Reflect.get(target, prop, receiver) as (
        url: string,
        opts?: HttpCallOptions,
      ) => Promise<APIResponse>;
      return async (url: string, opts?: HttpCallOptions): Promise<APIResponse> => {
        const startedAt = Date.now();
        const method = (prop as string).toUpperCase();
        const reqHeaders = scrubHeaders((opts?.headers ?? {}) as Record<string, string>);
        const reqBody =
          opts?.data !== undefined
            ? scrubBodyJson(opts.data)
            : opts?.form !== undefined
              ? scrubBodyJson(opts.form)
              : undefined;

        const res = await orig.call(target, url, opts);
        const status = res.status();
        const respHeaders = scrubHeaders(res.headers() as Record<string, string>);
        const respText = await res.text();
        const respBody = scrubBodyJson(await parseBody(respText));

        const line: Record<string, unknown> = {
          ts: new Date().toISOString(),
          scenario: input.scenario,
          method,
          url,
          reqHeaders,
          status,
          respHeaders,
          respBody,
          durationMs: Date.now() - startedAt,
        };
        if (reqBody !== undefined) {
          line['reqBody'] = reqBody;
        }

        appendFileSync(input.traceFile, `${JSON.stringify(line)}\n`);
        return res;
      };
    },
  });
}
