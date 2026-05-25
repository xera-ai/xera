import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { disputesCmd } from '../../src/bin-internal/disputes';
import { appendEvents } from '../../src/graph/store';
import type { Event } from '../../src/graph/types';
import { ulid } from '../../src/graph/ulid';

let root: string;
let prevCwd: string;
beforeEach(() => {
  prevCwd = process.cwd();
  root = mkdtempSync(join(tmpdir(), 'xera-disp-'));
  process.chdir(root);
});
afterEach(() => {
  process.chdir(prevCwd);
  rmSync(root, { recursive: true, force: true });
});

function captureStdout(fn: () => Promise<number>): Promise<{ exit: number; out: string }> {
  return new Promise((resolve) => {
    let out = '';
    const orig = process.stdout.write.bind(process.stdout);
    (process.stdout as unknown as { write: (chunk: unknown) => boolean }).write = (
      chunk: unknown,
    ) => {
      out += String(chunk);
      return true;
    };
    fn().then((exit) => {
      (process.stdout as unknown as { write: typeof orig }).write = orig;
      resolve({ exit, out });
    });
  });
}

function seedDispute(ts: string, runId: string, scenarioId: string) {
  const event: Event = {
    event_id: ulid(),
    schema_version: 1,
    ts,
    actor: 'xera-report',
    type: 'classification.disputed',
    payload: {
      runId,
      scenarioId,
      originalClassification: 'TEST_OUTDATED',
      disputedTo: 'REAL_BUG',
      qaActor: 'qa@example.com',
      qaReason: 'looks like a real bug',
    },
  };
  appendEvents(root, [event], { skill: 'test', ticketId: scenarioId.slice(0, 12) });
}

describe('disputes subcommand', () => {
  test('lists all classification.disputed events in text format by default', async () => {
    seedDispute('2026-05-15T08:00:00Z', 'r1', 'sc-100');
    seedDispute('2026-05-16T08:00:00Z', 'r2', 'sc-200');
    const { exit, out } = await captureStdout(() => disputesCmd([]));
    expect(exit).toBe(0);
    expect(out).toContain('sc-100');
    expect(out).toContain('sc-200');
    expect(out).toContain('TEST_OUTDATED');
    expect(out).toContain('REAL_BUG');
  });

  test('--format json outputs JSON array', async () => {
    seedDispute('2026-05-16T08:00:00Z', 'r1', 'sc-1');
    const { exit, out } = await captureStdout(() => disputesCmd(['--format', 'json']));
    expect(exit).toBe(0);
    const parsed = JSON.parse(out);
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed.length).toBe(1);
    expect(parsed[0].scenarioId).toBe('sc-1');
  });

  test('--since filters by cutoff', async () => {
    seedDispute('2026-04-01T00:00:00Z', 'r-old', 'sc-old');
    seedDispute(new Date().toISOString(), 'r-new', 'sc-new');
    const { exit, out } = await captureStdout(() =>
      disputesCmd(['--since', '7d', '--format', 'json']),
    );
    expect(exit).toBe(0);
    const parsed = JSON.parse(out);
    const ids = parsed.map((d: { scenarioId: string }) => d.scenarioId);
    expect(ids).toContain('sc-new');
    expect(ids).not.toContain('sc-old');
  });
});
