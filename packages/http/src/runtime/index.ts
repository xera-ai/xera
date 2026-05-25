import { join } from 'node:path';
import type { APIRequestContext, request as pwRequestNs } from '@playwright/test';
import { readAuthState } from '@xera-ai/core';
import { attachTraceRecorder } from '../executor/trace-recorder';

const DEFAULT_AUTH_DIR = '.xera/.auth';

export interface AuthFilePayload {
  type: 'bearer' | 'apiKey' | 'basic' | 'cookie';
  token: string;
  header: string;
  scheme: string;
  cookies?: Array<{ name: string; value: string; domain: string; path: string; expires?: number }>;
}

interface PlaywrightLike {
  request: typeof pwRequestNs;
}

export async function newAuthedContext(
  playwright: PlaywrightLike,
  role: string,
): Promise<APIRequestContext> {
  const authDir = process.env.XERA_AUTH_DIR ?? DEFAULT_AUTH_DIR;
  const baseURL = process.env.XERA_BASE_URL;
  if (!baseURL) {
    throw new Error('XERA_BASE_URL is not set. Run xera through the regular skill flow.');
  }
  const entry = readAuthState(join(authDir, 'http'), role);
  if (!entry) {
    throw new Error(
      `Auth file not found for role '${role}'. Run: npx xera-internal auth-setup --role ${role}`,
    );
  }
  if (new Date(entry.expires_at).getTime() < Date.now()) {
    throw new Error(
      `Auth file expired for role '${role}'. Run: npx xera-internal auth-setup --role ${role}`,
    );
  }
  const payload = entry.payload as unknown as AuthFilePayload;
  const extraHTTPHeaders: Record<string, string> = {};
  if (payload.type !== 'cookie') {
    const headerName = payload.header || 'Authorization';
    const headerValue = payload.scheme ? `${payload.scheme} ${payload.token}` : payload.token;
    extraHTTPHeaders[headerName] = headerValue;
  }
  const opts: Parameters<typeof playwright.request.newContext>[0] = {
    baseURL,
    extraHTTPHeaders,
  };
  if (payload.cookies && payload.cookies.length > 0) {
    opts.storageState = {
      cookies: payload.cookies.map((c) => ({
        name: c.name,
        value: c.value,
        domain: c.domain,
        path: c.path,
        expires: c.expires ?? -1,
        httpOnly: false,
        secure: false,
        sameSite: 'Lax' as const,
      })),
      origins: [],
    };
  }
  const ctx = await playwright.request.newContext(opts);
  const traceFile = process.env.XERA_HTTP_TRACE;
  if (traceFile) {
    return attachTraceRecorder(ctx, {
      traceFile,
      scenario: process.env.XERA_CURRENT_SCENARIO ?? 'unknown',
    });
  }
  return ctx;
}
