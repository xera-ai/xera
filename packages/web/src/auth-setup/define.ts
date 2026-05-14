import type { Page } from '@playwright/test';

export interface AuthRoleCreds {
  email: string;
  password: string;
}

export interface AuthSetupResult {
  /** Optional explicit expiry hint, ms since epoch. */
  expiresAt?: number;
}

export type AuthSetupFn = (
  page: Page,
  role: string,
  creds: AuthRoleCreds,
) => Promise<AuthSetupResult | void>;

/**
 * Helper to type-narrow the user's auth setup function. Users import this in
 * `shared/auth-setup.ts`.
 */
export function defineAuthSetup(fn: AuthSetupFn): AuthSetupFn {
  return fn;
}
