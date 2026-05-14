import { describe, expect, test } from 'bun:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readStatus, writeStatus, appendHistory, type StatusJson } from '../../src/artifact/status';

describe('status.json IO', () => {
  test('round-trip', () => {
    const dir = mkdtempSync(join(tmpdir(), 'xera-status-'));
    const path = join(dir, 'status.json');
    const s: StatusJson = {
      ticket: 'JIRA-1',
      lastRun: '2026-05-14T10:30:00.000Z',
      result: 'PASS',
      classification: 'PASS',
      confidence: 'high',
      scenarios: { total: 2, passed: 2, failed: 0, skipped: 0 },
      history: [],
    };
    writeStatus(path, s);
    expect(readStatus(path)).toEqual(s);
    rmSync(dir, { recursive: true });
  });

  test('appendHistory keeps newest first, caps at 20', () => {
    const dir = mkdtempSync(join(tmpdir(), 'xera-status-'));
    const path = join(dir, 'status.json');
    const initial: StatusJson = {
      ticket: 'JIRA-1',
      lastRun: '2026-01-01T00:00:00.000Z',
      result: 'PASS',
      classification: 'PASS',
      confidence: 'high',
      scenarios: { total: 1, passed: 1, failed: 0, skipped: 0 },
      history: [],
    };
    writeStatus(path, initial);
    for (let i = 0; i < 25; i++) {
      appendHistory(path, {
        ts: `2026-01-${String(i + 2).padStart(2, '0')}T00:00:00.000Z`,
        result: 'PASS',
        class: 'PASS',
      });
    }
    const final = readStatus(path)!;
    expect(final.history.length).toBe(20);
    expect(final.history[0]?.ts).toBe('2026-01-26T00:00:00.000Z');
    rmSync(dir, { recursive: true });
  });
});
