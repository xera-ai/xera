import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { normalizeHttpRun } from '../../src/trace-normalizer/normalize';

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'http-norm-'));
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe('normalizeHttpRun', () => {
  test('produces normalized.json with calls array and curl reproducer', async () => {
    writeFileSync(
      join(dir, 'http-trace.jsonl'),
      JSON.stringify({
        ts: 't1',
        scenario: 'reject malformed',
        method: 'POST',
        url: '/users',
        reqHeaders: { Authorization: '[REDACTED]' },
        reqBody: { email: 'bad' },
        status: 422,
        respHeaders: {},
        respBody: { errors: ['email must be valid'] },
        durationMs: 10,
      }),
    );
    writeFileSync(
      join(dir, 'raw-report.json'),
      JSON.stringify({
        suites: [
          {
            specs: [
              {
                title: 'reject malformed',
                tests: [
                  { results: [{ status: 'failed', error: { message: 'expected 200, got 422' } }] },
                ],
              },
            ],
          },
        ],
      }),
    );
    const out = await normalizeHttpRun({ runId: 'RUN-1', runDir: dir });
    expect(out.outcome).toBe('FAIL');
    expect(out.scenarios[0]?.name).toBe('reject malformed');
    expect(out.scenarios[0]?.outcome).toBe('FAIL');
    expect(out.scenarios[0]?.failure?.errorMessage).toContain('expected');
    expect(out.http.calls[0]?.method).toBe('POST');
    expect(out.http.calls[0]?.curl).toContain('curl -X POST');
    expect(out.http.calls[0]?.curl).toContain('/users');

    // Also writes normalized.json on disk
    const onDisk = JSON.parse(readFileSync(join(dir, 'normalized.json'), 'utf8'));
    expect(onDisk.outcome).toBe('FAIL');
  });

  test('walks nested suites', async () => {
    writeFileSync(join(dir, 'http-trace.jsonl'), '');
    writeFileSync(
      join(dir, 'raw-report.json'),
      JSON.stringify({
        suites: [
          {
            suites: [
              {
                specs: [
                  { title: 'inner-1', tests: [{ results: [{ status: 'passed' }] }] },
                  { title: 'inner-2', tests: [{ results: [{ status: 'passed' }] }] },
                ],
              },
            ],
          },
        ],
      }),
    );
    const out = await normalizeHttpRun({ runId: 'RUN-2', runDir: dir });
    expect(out.outcome).toBe('PASS');
    expect(out.scenarios.length).toBe(2);
  });

  test('handles missing trace file (empty calls)', async () => {
    writeFileSync(
      join(dir, 'raw-report.json'),
      JSON.stringify({
        suites: [{ specs: [{ title: 'x', tests: [{ results: [{ status: 'passed' }] }] }] }],
      }),
    );
    const out = await normalizeHttpRun({ runId: 'RUN-3', runDir: dir });
    expect(out.http.calls).toEqual([]);
  });
});
