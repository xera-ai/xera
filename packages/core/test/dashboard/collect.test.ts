import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { cpSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { collectDashboard } from '../../src/dashboard/collect';

const FIXTURE = join(__dirname, '..', '..', '..', '..', 'fixtures/golden-dashboard/5-tickets');

let dir: string;
const origCwd = process.cwd();

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'xera-dash-'));
  cpSync(FIXTURE, dir, { recursive: true });
  process.chdir(dir);
});

afterEach(() => {
  process.chdir(origCwd);
  rmSync(dir, { recursive: true, force: true });
});

describe('collectDashboard — 5-ticket fixture', () => {
  test('aggregates totals correctly', async () => {
    const snap = await collectDashboard(dir, {});
    expect(snap.totals).toEqual({
      tickets: 5,
      last_pass: 2,
      last_fail: 2,
      never_run: 1,
      scenarios_pass: 15,
      scenarios_fail: 4,
    });
  });

  test('classifications sorted by count desc', async () => {
    const snap = await collectDashboard(dir, {});
    expect(snap.classifications[0]?.classification).toBe('PASS');
    expect(snap.classifications[0]?.count).toBe(2);
  });

  test('recent_failures excludes PASS + NEVER_RUN, sorted by lastRun desc', async () => {
    const snap = await collectDashboard(dir, {});
    expect(snap.recent_failures.map((f) => f.ticketId)).toEqual(['TICKET-002', 'TICKET-003']);
  });

  test('stale identifies TICKET-004 (10d ago > 7d threshold)', async () => {
    const snap = await collectDashboard(dir, {});
    expect(snap.stale.map((t) => t.ticketId)).toContain('TICKET-004');
  });

  test('critical_alerts surfaces checkout', async () => {
    const snap = await collectDashboard(dir, {});
    const checkout = snap.critical_alerts.find((a) => a.area === 'checkout');
    expect(checkout).toBeDefined();
    expect(checkout?.is_critical).toBe(true);
    expect(checkout?.failing_tickets).toContain('TICKET-002');
  });

  test('--failing-only filter', async () => {
    const snap = await collectDashboard(dir, { failingOnly: true });
    expect(snap.tickets.map((t) => t.ticketId).sort()).toEqual(['TICKET-002', 'TICKET-003']);
  });

  test('--classification filter', async () => {
    const snap = await collectDashboard(dir, { classifications: ['REAL_BUG'] });
    expect(snap.tickets.map((t) => t.ticketId)).toEqual(['TICKET-002']);
  });

  test('--area filter', async () => {
    const snap = await collectDashboard(dir, { areas: ['checkout'] });
    expect(snap.tickets.map((t) => t.ticketId)).toEqual(['TICKET-002']);
  });

  test('--since limits recent_failures only', async () => {
    const snap = await collectDashboard(dir, { since: '1h' });
    expect(snap.recent_failures).toEqual([]);
    expect(snap.tickets.length).toBeGreaterThan(0);
  });

  test('NEVER_RUN ticket has null classification', async () => {
    const snap = await collectDashboard(dir, {});
    const t5 = snap.tickets.find((t) => t.ticketId === 'TICKET-005');
    expect(t5?.result).toBe('NEVER_RUN');
    expect(t5?.classification).toBeNull();
  });

  test('missing .xera dir returns empty snapshot', async () => {
    const empty = mkdtempSync(join(tmpdir(), 'xera-dash-empty-'));
    try {
      // copy just xera.config.ts so loadConfig succeeds
      cpSync(join(FIXTURE, 'xera.config.ts'), join(empty, 'xera.config.ts'));
      const snap = await collectDashboard(empty, {});
      expect(snap.totals.tickets).toBe(0);
      expect(snap.tickets).toEqual([]);
    } finally {
      rmSync(empty, { recursive: true, force: true });
    }
  });

  test('corrupt status.json is surfaced as UNKNOWN, does not throw', async () => {
    writeFileSync(join(dir, '.xera/TICKET-002/status.json'), '{"corrupt"}');
    const snap = await collectDashboard(dir, {});
    const t2 = snap.tickets.find((t) => t.ticketId === 'TICKET-002');
    expect(t2?.result).toBe('UNKNOWN');
  });
});
