import { describe, expect, test } from 'vitest';
import { renderText } from '../../src/dashboard/render-text';
import type { DashboardSnapshot } from '../../src/dashboard/types';

const snap: DashboardSnapshot = {
  generated_at: '2026-06-06T09:00:00.000Z',
  totals: {
    tickets: 5,
    last_pass: 2,
    last_fail: 2,
    never_run: 1,
    scenarios_pass: 15,
    scenarios_fail: 4,
  },
  classifications: [
    { classification: 'PASS', count: 2 },
    { classification: 'REAL_BUG', count: 1 },
    { classification: 'SELECTOR_DRIFT', count: 1 },
  ],
  tickets: [],
  recent_failures: [
    {
      ticketId: 'TICKET-002',
      classification: 'REAL_BUG',
      confidence: 'high',
      lastRun: '2026-06-06T07:00:00.000Z',
      scenarios_failed: 2,
      scenarios_total: 5,
      areas: ['checkout'],
    },
  ],
  stale: [
    {
      ticketId: 'TICKET-004',
      result: 'PASS',
      classification: 'PASS',
      confidence: 'high',
      scenarios: { total: 3, passed: 3, failed: 0 },
      lastRun: '2026-05-27T12:00:00.000Z',
      areas: ['reports'],
      has_html_report: false,
    },
  ],
  critical_alerts: [{ area: 'checkout', failing_tickets: ['TICKET-002'], is_critical: true }],
  top_failing_areas: [{ area: 'checkout', failing_tickets: ['TICKET-002'], is_critical: true }],
  filters_applied: {},
};

describe('renderText', () => {
  test('contains the dashboard header', () => {
    const out = renderText(snap, { color: false });
    expect(out).toContain('xera Dashboard');
    expect(out).toContain('5 tickets');
  });

  test('shows totals percentages', () => {
    const out = renderText(snap, { color: false });
    expect(out).toMatch(/PASS:\s*2/);
    expect(out).toMatch(/FAIL:\s*2/);
  });

  test('shows recent failures section', () => {
    const out = renderText(snap, { color: false });
    expect(out).toContain('Recent failures');
    expect(out).toContain('TICKET-002');
    expect(out).toContain('REAL_BUG');
  });

  test('shows critical alerts', () => {
    const out = renderText(snap, { color: false });
    expect(out).toContain('Critical areas');
    expect(out).toContain('checkout');
  });

  test('suppresses empty sections', () => {
    const empty: DashboardSnapshot = {
      ...snap,
      recent_failures: [],
      stale: [],
      critical_alerts: [],
    };
    const out = renderText(empty, { color: false });
    expect(out).not.toContain('Recent failures');
    expect(out).not.toContain('Stale');
    expect(out).not.toContain('Critical areas');
  });

  test('no tickets → friendly empty message', () => {
    const e: DashboardSnapshot = { ...snap, totals: { ...snap.totals, tickets: 0 } };
    const out = renderText(e, { color: false });
    expect(out).toContain('no tickets');
  });
});
