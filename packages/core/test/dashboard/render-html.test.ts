import { describe, expect, test } from 'vitest';
import { renderHtml } from '../../src/dashboard/render-html';
import type { DashboardSnapshot } from '../../src/dashboard/types';

const snap: DashboardSnapshot = {
  generated_at: '2026-06-06T09:00:00.000Z',
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
      latest_run_id: '01K0EXAMPLE0000000000000RUN',
    },
  ],
  recent_failures: [],
  stale: [],
  critical_alerts: [],
  top_failing_areas: [],
  filters_applied: {},
};

describe('renderHtml', () => {
  test('emits a complete HTML document', () => {
    const html = renderHtml(snap);
    expect(html).toMatch(/^<!DOCTYPE html>/);
    expect(html).toContain('</html>');
  });

  test('includes ticket IDs in the table', () => {
    const html = renderHtml(snap);
    expect(html).toContain('TICKET-001');
    expect(html).toContain('REAL_BUG');
  });

  test('embeds the snapshot JSON for client filters', () => {
    const html = renderHtml(snap);
    const match = html.match(/const SNAPSHOT = (\{[\s\S]+?\});/);
    expect(match).toBeTruthy();
    expect(() => JSON.parse(match![1]!)).not.toThrow();
  });

  test('links to Playwright report using the actual run ULID, not "latest"', () => {
    const html = renderHtml(snap);
    // The link must use the real run ID — `runs/latest/` is not on disk.
    expect(html).toContain(
      '.xera/TICKET-001/runs/01K0EXAMPLE0000000000000RUN/playwright-report/index.html',
    );
    expect(html).not.toContain('runs/latest/playwright-report');
  });

  test('does NOT link when has_html_report=false', () => {
    const noReport = {
      ...snap,
      tickets: [{ ...snap.tickets[0]!, has_html_report: false, latest_run_id: null }],
    };
    const html = renderHtml(noReport);
    expect(html).not.toContain('playwright-report/index.html');
  });

  test('Confidence + Scenarios columns use their own sort keys (not classification/ticket)', () => {
    const html = renderHtml(snap);
    expect(html).toContain('data-sort="confidence"');
    expect(html).toContain('data-sort="scenarios"');
    expect(html).toContain('data-confidence=');
    expect(html).toContain('data-scenarios=');
  });

  test('inlines CSS (no external stylesheets)', () => {
    const html = renderHtml(snap);
    expect(html).not.toMatch(/<link.*rel=.stylesheet/);
    expect(html).toContain('<style>');
  });
});
