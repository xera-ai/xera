import { describe, expect, test } from 'bun:test';
import { mkdtempSync, rmSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { generateKey } from '@xera/core';
import { AUTH_KEY_ENV } from '@xera/core';
import { runAuthSetup } from '../../src/auth-setup/runner';

const definePath = resolve(import.meta.dir, '../../src/auth-setup/define.ts');

describe('runAuthSetup', () => {
  test('writes encrypted state with role payload', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'xera-arun-'));
    process.env[AUTH_KEY_ENV] = generateKey();

    // Stub script that just returns expiry hint
    const scriptPath = join(dir, 'auth-setup.ts');
    writeFileSync(
      scriptPath,
      `
      import { defineAuthSetup } from '${definePath}';
      export default defineAuthSetup(async (_page, _role, _creds) => ({ expiresAt: 1900000000000 }));
    `,
    );

    // Provide a fake browser/context factory the runner accepts via DI.
    const fakeBrowser = {
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

    await runAuthSetup({
      role: 'admin',
      creds: { email: 'a@b.com', password: 'p' },
      setupScriptPath: scriptPath,
      authDir: join(dir, '.auth'),
      browser: fakeBrowser as any,
      now: new Date('2026-05-14T10:00:00Z'),
    });

    const onDisk = readFileSync(join(dir, '.auth', 'admin.json'), 'utf8');
    expect(onDisk).not.toContain('secret');

    delete process.env[AUTH_KEY_ENV];
    rmSync(dir, { recursive: true });
  });
});
