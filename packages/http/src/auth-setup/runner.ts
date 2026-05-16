import { join } from 'node:path';
import { request as pwRequest } from '@playwright/test';
import { writeAuthState, type XeraConfig } from '@xera-ai/core';
import type { HttpAuthRoleCreds, HttpAuthSetupFn } from './define';

export interface RunHttpAuthSetupInput {
  authDir: string;
  role: string;
  config: NonNullable<XeraConfig['http']>;
  setupFn: HttpAuthSetupFn;
  creds: HttpAuthRoleCreds;
  now?: Date;
}

export async function runHttpAuthSetup(input: RunHttpAuthSetupInput): Promise<void> {
  const baseURL = input.config.baseUrl[input.config.defaultEnv];
  const ctx = await pwRequest.newContext(baseURL ? { baseURL } : {});
  try {
    const result = await input.setupFn(ctx, input.role, input.creds);
    const now = input.now ?? new Date();
    const expiresAtMs = result.expiresAt ?? now.getTime() + 8 * 3600 * 1000;

    const payload: Record<string, unknown> = {
      type: result.type,
      token: result.token,
      header: result.header ?? (result.type === 'apiKey' ? 'X-API-Key' : 'Authorization'),
      scheme:
        result.scheme ??
        (result.type === 'bearer' ? 'Bearer' : result.type === 'basic' ? 'Basic' : ''),
    };
    if (result.cookies && result.cookies.length > 0) payload.cookies = result.cookies;

    writeAuthState(join(input.authDir, 'http'), {
      role: input.role,
      strategy: 'apiToken',
      created_at: now.toISOString(),
      expires_at: new Date(expiresAtMs).toISOString(),
      payload,
    });
  } finally {
    await ctx.dispose();
  }
}
