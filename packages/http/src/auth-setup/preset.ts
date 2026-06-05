import type { APIRequestContext } from '@playwright/test';
import { readAuthState, type XeraConfig } from '@xera-ai/core';
import type { HttpAuthSetupResult } from './define';
import { pickOne, serializeMatch, type CookieMatch } from './match';

export interface PresetHttpAuthInput {
  request: APIRequestContext;
  role: string;
  config: NonNullable<XeraConfig['http']>;
  webAuthDir?: string;
}

function readEnv(name: string | undefined): string {
  if (!name) throw new Error(`Auth env-var name not configured in role`);
  const v = process.env[name];
  if (v === undefined || v === '') {
    throw new Error(`Auth env var '${name}' is not set. Add it to .env.`);
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
    case 'reuse-web-session': {
      if (!input.webAuthDir) {
        throw new Error(
          `Strategy 'reuse-web-session' requires webAuthDir to be passed by the caller.`,
        );
      }
      const rws = role.reuseWebSession;
      if (!rws) {
        throw new Error(
          `Role '${input.role}' has http.auth.strategy='reuse-web-session' but missing reuseWebSession block (should have been caught by schema).`,
        );
      }
      const webEntry = readAuthState(input.webAuthDir, input.role);
      if (!webEntry || webEntry.strategy !== 'storageState') {
        throw new Error(
          `Strategy 'reuse-web-session' requires a web auth file at ${input.webAuthDir}/${input.role}.json (strategy='storageState'). Run: npx xera-internal auth-setup --role ${input.role} --shape web`,
        );
      }
      const allCookies = (webEntry.payload.cookies ?? []) as Array<{
        name: string;
        value: string;
        domain: string;
        path: string;
        expires?: number;
      }>;
      const domainCookies = allCookies.filter((c) => c.domain.includes(rws.domainContains));
      if (domainCookies.length === 0) {
        throw new Error(
          `No cookies for domainContains='${rws.domainContains}' in web auth file for role '${input.role}'. Re-run web auth-setup with XERA_HEADED=1 to complete SSO/MFA.`,
        );
      }
      const accessCookie = pickOne(domainCookies, rws.cookies.access.match as CookieMatch);
      if (!accessCookie) {
        throw new Error(
          `No cookie matched access.match in web auth file for role '${input.role}'. Captured names: ${domainCookies.map((c) => c.name).join(', ')}.`,
        );
      }
      const refreshCookie = rws.cookies.refresh
        ? pickOne(domainCookies, rws.cookies.refresh.match as CookieMatch)
        : undefined;
      if (refreshCookie && refreshCookie.name === accessCookie.name) {
        throw new Error(
          `access.match and refresh.match resolve to the same cookie '${accessCookie.name}'. Tighten one of the matchers.`,
        );
      }
      const csrfCookie = rws.cookies.csrf
        ? pickOne(domainCookies, rws.cookies.csrf.match as CookieMatch)
        : undefined;
      const selected = [accessCookie, refreshCookie, csrfCookie].filter(Boolean) as typeof allCookies;
      const driveExpiry = rws.cookies.access.driveExpiry ?? true;
      const reuseExpiresAt = driveExpiry
        ? accessCookie.expires && accessCookie.expires > 0
          ? accessCookie.expires * 1000
          : Date.now() + 15 * 60 * 1000
        : Date.now() + parseDuration(input.config.auth.ttl);
      const meta: Record<string, unknown> = {
        accessMatch: serializeMatch(rws.cookies.access.match as CookieMatch),
      };
      if (refreshCookie && rws.cookies.refresh) {
        const refreshable: Record<string, unknown> = {
          match: serializeMatch(rws.cookies.refresh.match as CookieMatch),
        };
        if (rws.cookies.refresh.path) refreshable.path = rws.cookies.refresh.path;
        meta.refreshable = refreshable;
      }
      if (csrfCookie && rws.cookies.csrf) {
        meta.csrf = { cookieName: csrfCookie.name, header: rws.cookies.csrf.header };
      }
      return {
        type: 'cookie',
        token: '',
        cookies: selected,
        expiresAt: reuseExpiresAt,
        meta,
      };
    }
  }
}
