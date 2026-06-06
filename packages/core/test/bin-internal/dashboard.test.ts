import { cpSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { dashboardCmd } from '../../src/bin-internal/dashboard';

const FIXTURE = join(__dirname, '..', '..', '..', '..', 'fixtures/golden-dashboard/5-tickets');

let dir: string;
const origCwd = process.cwd();

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'xera-dash-bin-'));
  cpSync(FIXTURE, dir, { recursive: true });
  process.chdir(dir);
});
afterEach(() => {
  process.chdir(origCwd);
  rmSync(dir, { recursive: true, force: true });
});

describe('dashboard binary', () => {
  test('text mode (default) exits 0 and prints header', async () => {
    const out: string[] = [];
    const origLog = console.log;
    console.log = (s?: unknown) => out.push(String(s));
    try {
      expect(await dashboardCmd([])).toBe(0);
    } finally {
      console.log = origLog;
    }
    expect(out.join('\n')).toContain('xera Dashboard');
  });

  test('--json prints valid DashboardSnapshot JSON', async () => {
    const out: string[] = [];
    const origLog = console.log;
    console.log = (s?: unknown) => out.push(String(s));
    try {
      expect(await dashboardCmd(['--json'])).toBe(0);
    } finally {
      console.log = origLog;
    }
    const json = JSON.parse(out.join(''));
    expect(json.totals.tickets).toBe(5);
  });

  test('--html writes file', async () => {
    const target = join(dir, 'dashboard.html');
    expect(await dashboardCmd(['--html', target])).toBe(0);
    const html = readFileSync(target, 'utf8');
    expect(html).toMatch(/^<!DOCTYPE html>/);
  });

  test('--failing-only filter is applied', async () => {
    const out: string[] = [];
    const origLog = console.log;
    console.log = (s?: unknown) => out.push(String(s));
    try {
      expect(await dashboardCmd(['--json', '--failing-only'])).toBe(0);
    } finally {
      console.log = origLog;
    }
    const json = JSON.parse(out.join(''));
    expect(json.tickets.every((t: { result: string }) => t.result === 'FAIL')).toBe(true);
  });

  test('--classification filter accepts repeat', async () => {
    const out: string[] = [];
    const origLog = console.log;
    console.log = (s?: unknown) => out.push(String(s));
    try {
      expect(
        await dashboardCmd([
          '--json',
          '--classification',
          'REAL_BUG',
          '--classification',
          'SELECTOR_DRIFT',
        ]),
      ).toBe(0);
    } finally {
      console.log = origLog;
    }
    const json = JSON.parse(out.join(''));
    const cs = json.tickets.map((t: { classification: string | null }) => t.classification);
    expect(cs.every((c: string | null) => c === 'REAL_BUG' || c === 'SELECTOR_DRIFT')).toBe(true);
  });

  test('invalid --since returns 1 with actionable error', async () => {
    const errs: string[] = [];
    const origErr = console.error;
    console.error = (...a: unknown[]) => errs.push(a.join(' '));
    try {
      expect(await dashboardCmd(['--since', 'foo'])).toBe(1);
    } finally {
      console.error = origErr;
    }
    expect(errs.join('\n')).toMatch(/since/i);
  });
});
