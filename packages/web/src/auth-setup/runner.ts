import { pathToFileURL } from 'node:url';
import type { Browser } from '@playwright/test';
import { writeAuthState } from '@xera-ai/core';
import type { AuthRoleCreds } from './define';

export interface RunAuthSetupInput {
  role: string;
  creds: AuthRoleCreds;
  setupScriptPath: string;
  authDir: string;
  browser: Browser;
  now?: Date;
}

export async function runAuthSetup(input: RunAuthSetupInput): Promise<void> {
  const mod = await import(pathToFileURL(input.setupScriptPath).href);
  // Support both `export default defineAuthSetup(...)` and `export const web = defineAuthSetup(...)`.
  // The named `web` export is the scaffold default for mixed-shape projects (web + http in one file).
  const fn = mod.default ?? mod.web;
  if (typeof fn !== 'function') {
    throw new Error(
      `Auth setup script at ${input.setupScriptPath} must export a defineAuthSetup function as default or named "web" export.`,
    );
  }
  const context = await input.browser.newContext();
  try {
    const page = await context.newPage();
    const result = (await fn(page, input.role, input.creds)) ?? {};
    const storageState = await context.storageState();
    const now = input.now ?? new Date();
    const expiresAtMs = result.expiresAt ?? now.getTime() + 8 * 3600 * 1000;
    writeAuthState(input.authDir, {
      role: input.role,
      strategy: 'storageState',
      created_at: now.toISOString(),
      expires_at: new Date(expiresAtMs).toISOString(),
      payload: storageState as unknown as Record<string, unknown>,
    });
  } finally {
    await context.close();
  }
}
