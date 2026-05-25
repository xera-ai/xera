import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { AUTH_KEY_ENV, generateKey } from '@xera-ai/core';
import { describe, expect, test } from 'vitest';
import { runAuthSetup } from '../../src/auth-setup/runner';

const definePath = resolve(import.meta.dirname, '../../src/auth-setup/define.ts');

function makeFakeBrowser(capture?: { contextOptions?: unknown }) {
  return {
    newContext: async (options?: unknown) => {
      if (capture) capture.contextOptions = options;
      return {
        newPage: async () => ({}) as any,
        storageState: async () => ({
          cookies: [
            {
              name: 's',
              value: 'secret',
              domain: 'x',
              path: '/',
              expires: -1,
              httpOnly: false,
              secure: false,
              sameSite: 'Lax' as const,
            },
          ],
          origins: [],
        }),
        close: async () => {},
      };
    },
    close: async () => {},
  };
}

describe('runAuthSetup', () => {
  test('writes encrypted state with role payload (default export)', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'xera-arun-'));
    process.env[AUTH_KEY_ENV] = generateKey();

    const scriptPath = join(dir, 'auth-setup.ts');
    writeFileSync(
      scriptPath,
      `
      import { defineAuthSetup } from '${definePath}';
      export default defineAuthSetup(async (_page, _role, _creds) => ({ expiresAt: 1900000000000 }));
    `,
    );

    await runAuthSetup({
      role: 'admin',
      creds: { email: 'a@b.com', password: 'p' },
      setupScriptPath: scriptPath,
      authDir: join(dir, '.auth'),
      browser: makeFakeBrowser() as any,
      now: new Date('2026-05-14T10:00:00Z'),
    });

    const onDisk = readFileSync(join(dir, '.auth', 'admin.json'), 'utf8');
    expect(onDisk).not.toContain('secret');

    delete process.env[AUTH_KEY_ENV];
    rmSync(dir, { recursive: true });
  });

  test('propagates baseURL to newContext so shared/auth-setup.ts can use relative paths', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'xera-arun-'));
    process.env[AUTH_KEY_ENV] = generateKey();

    const scriptPath = join(dir, 'auth-setup.ts');
    writeFileSync(
      scriptPath,
      `
      import { defineAuthSetup } from '${definePath}';
      export default defineAuthSetup(async (_page, _role, _creds) => ({ expiresAt: 1900000000000 }));
    `,
    );

    const capture: { contextOptions?: unknown } = {};
    await runAuthSetup({
      role: 'admin',
      creds: { email: 'a@b.com', password: 'p' },
      setupScriptPath: scriptPath,
      authDir: join(dir, '.auth'),
      browser: makeFakeBrowser(capture) as any,
      baseURL: 'http://localhost:4321',
      now: new Date('2026-05-14T10:00:00Z'),
    });

    expect(capture.contextOptions).toEqual({ baseURL: 'http://localhost:4321' });

    delete process.env[AUTH_KEY_ENV];
    rmSync(dir, { recursive: true });
  });

  test('omits baseURL from newContext options when not provided (back-compat)', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'xera-arun-'));
    process.env[AUTH_KEY_ENV] = generateKey();

    const scriptPath = join(dir, 'auth-setup.ts');
    writeFileSync(
      scriptPath,
      `
      import { defineAuthSetup } from '${definePath}';
      export default defineAuthSetup(async (_page, _role, _creds) => ({ expiresAt: 1900000000000 }));
    `,
    );

    const capture: { contextOptions?: unknown } = {};
    await runAuthSetup({
      role: 'admin',
      creds: { email: 'a@b.com', password: 'p' },
      setupScriptPath: scriptPath,
      authDir: join(dir, '.auth'),
      browser: makeFakeBrowser(capture) as any,
      now: new Date('2026-05-14T10:00:00Z'),
    });

    expect(capture.contextOptions).toEqual({});

    delete process.env[AUTH_KEY_ENV];
    rmSync(dir, { recursive: true });
  });

  test('accepts named "web" export (scaffold template shape)', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'xera-arun-'));
    process.env[AUTH_KEY_ENV] = generateKey();

    const scriptPath = join(dir, 'auth-setup.ts');
    writeFileSync(
      scriptPath,
      `
      import { defineAuthSetup } from '${definePath}';
      export const web = defineAuthSetup(async (_page, _role, _creds) => ({ expiresAt: 1900000000000 }));
    `,
    );

    await runAuthSetup({
      role: 'regular',
      creds: { email: 'u@b.com', password: 'p' },
      setupScriptPath: scriptPath,
      authDir: join(dir, '.auth'),
      browser: makeFakeBrowser() as any,
      now: new Date('2026-05-14T10:00:00Z'),
    });

    const onDisk = readFileSync(join(dir, '.auth', 'regular.json'), 'utf8');
    expect(onDisk).not.toContain('secret');

    delete process.env[AUTH_KEY_ENV];
    rmSync(dir, { recursive: true });
  });
});
