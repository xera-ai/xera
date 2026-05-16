import type { APIRequestContext } from '@playwright/test';
import type { XeraConfig } from '@xera-ai/core';
import type { HttpAuthSetupResult } from './define';

export interface PresetHttpAuthInput {
  request: APIRequestContext;
  role: string;
  config: NonNullable<XeraConfig['http']>;
}

function readEnv(name: string | undefined): string {
  if (!name) throw new Error(`Auth env-var name not configured in role`);
  const v = process.env[name];
  if (v === undefined || v === '') {
    throw new Error(`Auth env var '${name}' is not set. Add it to .env.local.`);
  }
  return v;
}

function parseDuration(s: string): number {
  const m = s.match(/^(\d+)([smhd])$/);
  if (!m) return 8 * 3600 * 1000;
  const n = Number(m[1]);
  switch (m[2]) {
    case 's':
      return n * 1000;
    case 'm':
      return n * 60 * 1000;
    case 'h':
      return n * 3600 * 1000;
    case 'd':
      return n * 24 * 3600 * 1000;
    default:
      return 8 * 3600 * 1000;
  }
}

export async function presetHttpAuth(input: PresetHttpAuthInput): Promise<HttpAuthSetupResult> {
  const role = input.config.auth.roles[input.role];
  if (!role) throw new Error(`Auth role '${input.role}' not configured under http.auth.roles`);
  const ttlMs = parseDuration(input.config.auth.ttl);
  const expiresAt = Date.now() + ttlMs;

  switch (input.config.auth.strategy) {
    case 'bearer':
      return { type: 'bearer', token: readEnv(role.tokenEnv), expiresAt };
    case 'apiKey':
      return {
        type: 'apiKey',
        token: readEnv(role.tokenEnv),
        header: 'X-API-Key',
        expiresAt,
      };
    case 'basic':
      return {
        type: 'basic',
        token: Buffer.from(`${readEnv(role.userEnv)}:${readEnv(role.passEnv)}`).toString('base64'),
        scheme: 'Basic',
        expiresAt,
      };
    case 'oauth-cc': {
      const tokenUrl = role.tokenUrl;
      if (!tokenUrl) throw new Error(`oauth-cc role '${input.role}' missing tokenUrl`);
      const formObj: Record<string, string> = {
        grant_type: 'client_credentials',
        client_id: readEnv(role.clientIdEnv),
        client_secret: readEnv(role.clientSecretEnv),
      };
      if (role.scope) formObj.scope = role.scope;
      const res = await input.request.post(tokenUrl, { form: formObj });
      if (res.status() !== 200) throw new Error(`OAuth token endpoint returned ${res.status()}`);
      const body = (await res.json()) as { access_token: string; expires_in?: number };
      return {
        type: 'bearer',
        token: body.access_token,
        expiresAt: body.expires_in ? Date.now() + body.expires_in * 1000 : expiresAt,
      };
    }
    case 'custom':
      throw new Error(
        `Strategy 'custom' requires a user-defined defineHttpAuthSetup body, not presetHttpAuth.`,
      );
    case 'none':
      throw new Error(`Strategy 'none' should not call presetHttpAuth.`);
  }
}
