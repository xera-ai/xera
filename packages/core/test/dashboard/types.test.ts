import { describe, expect, test } from 'vitest';
import { type DashboardSnapshot, DashboardSnapshotSchema } from '../../src/dashboard/types';

const minimal: DashboardSnapshot = {
  generated_at: '2026-06-06T00:00:00.000Z',
  totals: {
    tickets: 0,
    last_pass: 0,
    last_fail: 0,
    never_run: 0,
    scenarios_pass: 0,
    scenarios_fail: 0,
  },
  classifications: [],
  tickets: [],
  recent_failures: [],
  stale: [],
  critical_alerts: [],
  top_failing_areas: [],
  filters_applied: {},
};

describe('DashboardSnapshotSchema', () => {
  test('round-trips a minimal snapshot', () => {
    const parsed = DashboardSnapshotSchema.parse(minimal);
    expect(parsed.totals.tickets).toBe(0);
  });

  test('round-trips a full snapshot with one ticket', () => {
    const full: DashboardSnapshot = {
      ...minimal,
      totals: {
        tickets: 1,
        last_pass: 0,
        last_fail: 1,
        never_run: 0,
        scenarios_pass: 3,
        scenarios_fail: 2,
      },
      classifications: [{ classification: 'REAL_BUG', count: 1 }],
      tickets: [
        {
          ticketId: 'TICKET-001',
          result: 'FAIL',
          classification: 'REAL_BUG',
          confidence: 'high',
          scenarios: { total: 5, passed: 3, failed: 2 },
          lastRun: '2026-06-06T08:23:14.000Z',
          areas: ['checkout'],
          has_html_report: true,
        },
      ],
      recent_failures: [
        {
          ticketId: 'TICKET-001',
          classification: 'REAL_BUG',
          confidence: 'high',
          lastRun: '2026-06-06T08:23:14.000Z',
          scenarios_failed: 2,
          scenarios_total: 5,
          areas: ['checkout'],
        },
      ],
      critical_alerts: [{ area: 'checkout', failing_tickets: ['TICKET-001'], is_critical: true }],
      top_failing_areas: [{ area: 'checkout', failing_tickets: ['TICKET-001'], is_critical: true }],
      filters_applied: { failing_only: true },
    };
    const parsed = DashboardSnapshotSchema.parse(full);
    expect(parsed.tickets[0]?.ticketId).toBe('TICKET-001');
  });

  test('rejects invalid result enum', () => {
    const bad = {
      ...minimal,
      tickets: [
        {
          ticketId: 'X',
          result: 'WAT',
          classification: null,
          confidence: null,
          scenarios: { total: 0, passed: 0, failed: 0 },
          lastRun: null,
          areas: [],
          has_html_report: false,
        },
      ],
    };
    expect(DashboardSnapshotSchema.safeParse(bad).success).toBe(false);
  });
});
