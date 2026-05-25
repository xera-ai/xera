import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  attachNetworkRecorder,
  captureResponse,
  recordResponseLine,
  stripBase,
} from '../../src/network-recorder';

let dir: string;
let logPath: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'xera-netrec-'));
  logPath = join(dir, 'network.jsonl');
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

function fakeResponse(opts: {
  url: string;
  method: string;
  status: number;
  json?: unknown;
  throws?: boolean;
}) {
  return {
    url: () => opts.url,
    status: () => opts.status,
    request: () => ({ method: () => opts.method }),
    json: async () => {
      if (opts.throws) throw new Error('not json');
      return opts.json;
    },
  };
}

function readLines(): Array<Record<string, unknown>> {
  if (!existsSync(logPath)) return [];
  return readFileSync(logPath, 'utf8')
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((l) => JSON.parse(l) as Record<string, unknown>);
}

describe('stripBase', () => {
  test('strips a configured base to a path', () => {
    expect(stripBase('http://localhost:3000/api/login', 'http://localhost:3000')).toBe(
      '/api/login',
    );
  });
  test('falls back to the URL pathname + query when base does not match', () => {
    expect(stripBase('https://x.test/users/1?q=2', 'http://other')).toBe('/users/1?q=2');
  });
});

describe('recordResponseLine', () => {
  test('no-op when logPath is falsy', () => {
    recordResponseLine(undefined, { scenario: 's', method: 'GET', url: '/x', status: 200 });
    expect(existsSync(logPath)).toBe(false);
  });
  test('appends one JSONL line', () => {
    recordResponseLine(logPath, { scenario: 's', method: 'GET', url: '/x', status: 200 });
    expect(readLines()).toEqual([{ scenario: 's', method: 'GET', url: '/x', status: 200 }]);
  });
});

describe('captureResponse', () => {
  test('scrubs sensitive body keys', async () => {
    const entry = await captureResponse(
      fakeResponse({
        url: 'http://h/api/login',
        method: 'POST',
        status: 201,
        json: { token: 'abc', id: '1' },
      }),
      'Login works',
      'http://h',
    );
    expect(entry).toMatchObject({
      scenario: 'Login works',
      method: 'POST',
      url: '/api/login',
      status: 201,
    });
    expect((entry.respBody as Record<string, unknown>).token).toBe('[REDACTED]');
    expect((entry.respBody as Record<string, unknown>).id).toBe('1');
  });
  test('omits respBody for non-JSON responses', async () => {
    const entry = await captureResponse(
      fakeResponse({ url: 'http://h/page', method: 'GET', status: 200, throws: true }),
      's',
      'http://h',
    );
    expect('respBody' in entry).toBe(false);
  });
});

describe('attachNetworkRecorder', () => {
  test('records a scrubbed line per response when logPath is set', async () => {
    let handler: ((res: unknown) => Promise<void>) | undefined;
    const page = {
      on: (_e: 'response', h: (res: unknown) => Promise<void>) => {
        handler = h;
      },
    };
    attachNetworkRecorder(page as never, { logPath, scenario: 'Create user', baseUrl: 'http://h' });
    expect(handler).toBeDefined();
    await handler!(
      fakeResponse({ url: 'http://h/users', method: 'POST', status: 201, json: { id: '1' } }),
    );
    expect(readLines()).toEqual([
      {
        scenario: 'Create user',
        method: 'POST',
        url: '/users',
        status: 201,
        respBody: { id: '1' },
      },
    ]);
  });

  test('does not subscribe when logPath is undefined', () => {
    let subscribed = false;
    const page = {
      on: () => {
        subscribed = true;
      },
    };
    attachNetworkRecorder(page as never, { logPath: undefined, scenario: 's' });
    expect(subscribed).toBe(false);
  });
});
