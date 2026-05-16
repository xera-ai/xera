import { beforeEach, describe, expect, test } from 'bun:test';
import type { XeraConfig } from '@xera-ai/core';
import { presetHttpAuth } from '../../src/auth-setup/preset';

const fakeRequest = {} as unknown as Parameters<typeof presetHttpAuth>[0]['request'];

function makeConfig(
  overrides: Partial<NonNullable<XeraConfig['http']>>,
): NonNullable<XeraConfig['http']> {
  return {
    baseUrl: { dev: 'https://api.x.com' },
    defaultEnv: 'dev',
    auth: { strategy: 'none', ttl: '8h', refreshBuffer: '30m', roles: {} },
    ...overrides,
  };
}

describe('presetHttpAuth', () => {
  beforeEach(() => {
    delete process.env.TEST_TOKEN_ENV;
    delete process.env.TEST_USER_ENV;
    delete process.env.TEST_PASS_ENV;
  });

  test('bearer strategy reads tokenEnv', async () => {
    process.env.TEST_TOKEN_ENV = 'abc123';
    const result = await presetHttpAuth({
      request: fakeRequest,
      role: 'admin',
      config: makeConfig({
        auth: {
          strategy: 'bearer',
          ttl: '8h',
          refreshBuffer: '30m',
          roles: { admin: { tokenEnv: 'TEST_TOKEN_ENV' } },
        },
      }),
    });
    expect(result.token).toBe('abc123');
    expect(result.type).toBe('bearer');
    expect(result.expiresAt).toBeGreaterThan(Date.now());
  });

  test('apiKey strategy sets header to X-API-Key', async () => {
    process.env.TEST_TOKEN_ENV = 'key-xyz';
    const result = await presetHttpAuth({
      request: fakeRequest,
      role: 'user',
      config: makeConfig({
        auth: {
          strategy: 'apiKey',
          ttl: '8h',
          refreshBuffer: '30m',
          roles: { user: { tokenEnv: 'TEST_TOKEN_ENV' } },
        },
      }),
    });
    expect(result.type).toBe('apiKey');
    expect(result.header).toBe('X-API-Key');
    expect(result.token).toBe('key-xyz');
  });

  test('basic strategy base64-encodes user:pass', async () => {
    process.env.TEST_USER_ENV = 'alice';
    process.env.TEST_PASS_ENV = 'wonderland';
    const result = await presetHttpAuth({
      request: fakeRequest,
      role: 'user',
      config: makeConfig({
        auth: {
          strategy: 'basic',
          ttl: '8h',
          refreshBuffer: '30m',
          roles: { user: { userEnv: 'TEST_USER_ENV', passEnv: 'TEST_PASS_ENV' } },
        },
      }),
    });
    expect(result.type).toBe('basic');
    expect(Buffer.from(result.token, 'base64').toString()).toBe('alice:wonderland');
  });

  test('bearer throws helpful error when env var missing', async () => {
    expect(
      presetHttpAuth({
        request: fakeRequest,
        role: 'admin',
        config: makeConfig({
          auth: {
            strategy: 'bearer',
            ttl: '8h',
            refreshBuffer: '30m',
            roles: { admin: { tokenEnv: 'MISSING_ENV' } },
          },
        }),
      }),
    ).rejects.toThrow(/MISSING_ENV/);
  });

  test('throws when role not configured', async () => {
    expect(
      presetHttpAuth({
        request: fakeRequest,
        role: 'guest',
        config: makeConfig({
          auth: {
            strategy: 'bearer',
            ttl: '8h',
            refreshBuffer: '30m',
            roles: { admin: { tokenEnv: 'X' } },
          },
        }),
      }),
    ).rejects.toThrow(/role 'guest'/);
  });

  test('strategy custom throws — must use defineHttpAuthSetup body', async () => {
    expect(
      presetHttpAuth({
        request: fakeRequest,
        role: 'admin',
        config: makeConfig({
          auth: { strategy: 'custom', ttl: '8h', refreshBuffer: '30m', roles: { admin: {} } },
        }),
      }),
    ).rejects.toThrow(/custom/);
  });

  test('strategy none throws', async () => {
    expect(
      presetHttpAuth({
        request: fakeRequest,
        role: 'admin',
        config: makeConfig({
          auth: { strategy: 'none', ttl: '8h', refreshBuffer: '30m', roles: { admin: {} } },
        }),
      }),
    ).rejects.toThrow(/none/);
  });
});
