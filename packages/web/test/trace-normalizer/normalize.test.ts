import { mkdirSync, mkdtempSync, rmSync, writeFileSync as wfs, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { strToU8, zipSync } from 'fflate';
import { describe, expect, test } from 'vitest';
import { normalizeRun } from '../../src/trace-normalizer/normalize';

function makeFakeTrace(dest: string, networkLines: object[], traceLines: object[]) {
  const zipped = zipSync({
    'test.network': strToU8(networkLines.map((o) => JSON.stringify(o)).join('\n')),
    'test.trace': strToU8(traceLines.map((o) => JSON.stringify(o)).join('\n')),
  });
  wfs(dest, zipped);
}

describe('normalizeRun', () => {
  test('attaches network entries from trace.zip to failed scenario', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'xera-norm-'));
    const runDir = join(dir, 'run');
    mkdirSync(runDir, { recursive: true });
    writeFileSync(
      join(runDir, 'report.json'),
      JSON.stringify({
        stats: { unexpected: 1 },
        suites: [
          {
            title: 's',
            specs: [
              {
                title: 'Login fails',
                ok: false,
                tests: [
                  { results: [{ status: 'failed', duration: 1, error: { message: 'err' } }] },
                ],
              },
            ],
          },
        ],
      }),
    );
    makeFakeTrace(
      join(runDir, 'trace.zip'),
      [
        {
          type: 'request',
          method: 'POST',
          url: '/api/login',
          status: 500,
          requestHeaders: { Authorization: 'Bearer abc' },
        },
      ],
      [{ type: 'console', text: 'fetch failed: token=eyJhbGciOi.eyJzdWIiOi.SflKxw' }],
    );

    const out = await normalizeRun({ runId: 'r1', runDir });

    const failing = out.scenarios.find((s) => s.outcome === 'FAIL')!;
    expect(failing.failure?.networkAtFailure?.length).toBe(1);
    // Header should be scrubbed
    expect(failing.failure?.networkAtFailure?.[0]?.requestHeaders?.Authorization).toBe(
      '[REDACTED]',
    );
    // Console scrubbed
    expect(failing.failure?.consoleAtFailure?.[0]).not.toContain('SflKxw');
    expect(out.scrubbed_fields_count).toBeGreaterThan(0);

    rmSync(dir, { recursive: true });
  });

  test('prefers the network.jsonl sidecar and correlates by scenario title', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'xera-norm-side-'));
    const runDir = join(dir, 'run');
    mkdirSync(runDir, { recursive: true });
    writeFileSync(
      join(runDir, 'report.json'),
      JSON.stringify({
        stats: { unexpected: 1 },
        suites: [
          {
            title: 's',
            specs: [
              {
                title: 'Login fails',
                ok: false,
                tests: [
                  { results: [{ status: 'failed', duration: 1, error: { message: 'err' } }] },
                ],
              },
            ],
          },
        ],
      }),
    );
    // Trace .network would attach a different (login) call; the sidecar must win.
    makeFakeTrace(
      join(runDir, 'trace.zip'),
      [{ type: 'request', method: 'GET', url: '/trace-only', status: 200 }],
      [],
    );
    writeFileSync(
      join(runDir, 'network.jsonl'),
      [
        {
          scenario: 'Login fails',
          method: 'POST',
          url: '/api/login',
          status: 201,
          respBody: { id: '1' },
        },
        { scenario: 'Other scenario', method: 'GET', url: '/elsewhere', status: 200 },
      ]
        .map((o) => JSON.stringify(o))
        .join('\n'),
    );

    const out = await normalizeRun({ runId: 'r1', runDir });
    const failing = out.scenarios.find((s) => s.outcome === 'FAIL')!;
    // Only the matching sidecar entry, with its body — not the trace .network call.
    expect(failing.failure?.networkAtFailure?.length).toBe(1);
    expect(failing.failure?.networkAtFailure?.[0]?.url).toBe('/api/login');
    expect(failing.failure?.networkAtFailure?.[0]?.status).toBe(201);
    expect(failing.failure?.networkAtFailure?.[0]?.responseBody).toEqual({ id: '1' });

    rmSync(dir, { recursive: true });
  });
});
