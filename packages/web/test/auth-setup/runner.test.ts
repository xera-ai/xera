import { describe, expect, test } from 'bun:test';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { AUTH_KEY_ENV, generateKey } from '@xera-ai/core';
import { runAuthSetup } from '../../src/auth-setup/runner';

const definePath = resolve(import.meta.dir, '../../src/auth-setup/define.ts');

function makeFakeBrowser() {
  return {
    newContext: async () => ({
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
    }),
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
