import type { APIRequestContext } from '@playwright/test';

export interface HttpAuthRoleCreds {
  email: string;
  password: string;
}

export interface HttpAuthSetupResult {
  type: 'bearer' | 'apiKey' | 'basic' | 'cookie';
  token: string;
  header?: string;
  scheme?: string;
  cookies?: Array<{
    name: string;
    value: string;
    domain: string;
    path: string;
    expires?: number;
  }>;
  expiresAt?: number;
}

export type HttpAuthSetupFn = (
  request: APIRequestContext,
  role: string,
  creds: HttpAuthRoleCreds,
) => Promise<HttpAuthSetupResult>;

export function defineHttpAuthSetup(fn: HttpAuthSetupFn): HttpAuthSetupFn {
  return fn;
}
