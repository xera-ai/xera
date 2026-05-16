import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { attachTraceRecorder } from '../../src/executor/trace-recorder';

let tmp: string;
beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), 'http-trace-'));
});
afterEach(() => rmSync(tmp, { recursive: true, force: true }));

type FakeMethod = (...args: unknown[]) => unknown;

function fakeCtx(impl: { post?: FakeMethod; get?: FakeMethod }) {
  return {
    post: impl.post ?? (async () => fakeRes(200, '{}')),
    get: impl.get ?? (async () => fakeRes(200, '{}')),
    put: async () => fakeRes(200, '{}'),
    delete: async () => fakeRes(200, '{}'),
    fetch: async () => fakeRes(200, '{}'),
  } as unknown as Parameters<typeof attachTraceRecorder>[0];
}

function fakeRes(status: number, bodyText: string) {
  return {
    status: () => status,
    headers: () => ({ 'content-type': 'application/json' }),
    text: async () => bodyText,
  };
}

describe('attachTraceRecorder', () => {
  test('logs a JSONL line per call with scrubbed headers', async () => {
    const traceFile = join(tmp, 'http-trace.jsonl');
    const ctx = fakeCtx({});
    const wrapped = attachTraceRecorder(ctx, { traceFile, scenario: 'demo' });
    await wrapped.post('/users', {
      data: { email: 'a@b.com' },
      headers: { Authorization: 'Bearer secret' },
    });
    await wrapped.get('/users/1');
    expect(existsSync(traceFile)).toBe(true);
    const lines = readFileSync(traceFile, 'utf8').trim().split('\n');
    expect(lines.length).toBe(2);
    const post = JSON.parse(lines[0]!);
    expect(post.method).toBe('POST');
    expect(post.url).toBe('/users');
    expect(post.reqHeaders.Authorization).toBe('[REDACTED]');
    const get = JSON.parse(lines[1]!);
    expect(get.method).toBe('GET');
    expect(get.url).toBe('/users/1');
  });

  test('returns the underlying response unchanged so test code works', async () => {
    const traceFile = join(tmp, 'http-trace.jsonl');
    const ctx = fakeCtx({ post: async () => fakeRes(422, JSON.stringify({ errors: ['x'] })) });
    const wrapped = attachTraceRecorder(ctx, { traceFile, scenario: 'demo' });
    const res = await wrapped.post('/users', { data: {} });
    expect(res.status()).toBe(422);
    expect(JSON.parse(await res.text()).errors).toEqual(['x']);
  });

  test('captures form bodies', async () => {
    const traceFile = join(tmp, 'http-trace.jsonl');
    const ctx = fakeCtx({});
    const wrapped = attachTraceRecorder(ctx, { traceFile, scenario: 'demo' });
    await wrapped.post('/login', { form: { username: 'alice', password: 'p' } });
    const line = JSON.parse(readFileSync(traceFile, 'utf8').trim());
    expect(line.reqBody.password).toBe('[REDACTED]');
    expect(line.reqBody.username).toBe('alice');
  });
});
