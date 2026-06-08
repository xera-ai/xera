import type { DashboardSnapshot, TicketRow } from './types';

/**
 * Escape user-controlled strings for HTML attribute / text contexts.
 * Handles &, <, >, ", '.
 */
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function pct(n: number, total: number): number {
  return total === 0 ? 0 : Math.round((n / total) * 100);
}

function ticketRow(t: TicketRow): string {
  const ticketIdEsc = escapeHtml(t.ticketId);
  const resultEsc = escapeHtml(t.result);
  const classEsc = escapeHtml(t.classification ?? '');
  const areasEsc = escapeHtml(t.areas.join(', '));
  const areasAttrEsc = escapeHtml(t.areas.join(','));
  const lastRunEsc = escapeHtml(t.lastRun ?? '');
  const confidenceEsc = escapeHtml(t.confidence ?? '');

  // `runs/latest/` is NOT a real on-disk path; use the actual ULID.
  const runIdEsc = t.latest_run_id ? escapeHtml(t.latest_run_id) : '';
  const ticketCell =
    t.has_html_report && runIdEsc
      ? `<a href=".xera/${ticketIdEsc}/runs/${runIdEsc}/playwright-report/index.html" target="_blank" rel="noopener">${ticketIdEsc}</a>`
      : `<span title="No Playwright report — run xera-internal exec ${ticketIdEsc} --reporter=html">${ticketIdEsc}</span>`;

  // confRank lets the Confidence column sort by severity (high > medium > low).
  // scenariosFailedAttr lets the Scenarios column sort by failure count, not by
  // ticketId (the previous data-sort="ticket" was wrong).
  const confRank = t.confidence === 'high' ? 2 : t.confidence === 'medium' ? 1 : 0;
  const scenariosFailedAttr = t.scenarios.failed;

  return [
    `<tr data-ticket="${ticketIdEsc}" data-result="${resultEsc}" data-class="${classEsc}" data-confidence="${confRank}" data-scenarios="${scenariosFailedAttr}" data-areas="${areasAttrEsc}" data-lastrun="${lastRunEsc}">`,
    `  <td>${ticketCell}</td>`,
    `  <td class="result-${resultEsc.toLowerCase()}">${resultEsc}</td>`,
    `  <td>${classEsc || '<span class="muted">—</span>'}</td>`,
    `  <td>${confidenceEsc || '<span class="muted">—</span>'}</td>`,
    `  <td>${t.scenarios.passed}/${t.scenarios.total}</td>`,
    `  <td title="${lastRunEsc}">${lastRunEsc || '<span class="muted">never</span>'}</td>`,
    `  <td>${areasEsc}</td>`,
    `</tr>`,
  ].join('\n');
}

function classificationBars(snap: DashboardSnapshot): string {
  if (snap.classifications.length === 0) {
    return '<p class="muted">No classifications yet.</p>';
  }
  const max = Math.max(...snap.classifications.map((c) => c.count), 1);
  return [
    '<ul class="bins">',
    ...snap.classifications.map((c) => {
      const widthPct = Math.max(2, Math.round((c.count / max) * 100));
      const labelEsc = escapeHtml(c.classification);
      return `<li><span class="label">${labelEsc}</span><span class="bar" style="width:${widthPct}%"></span><span class="count">${c.count}</span></li>`;
    }),
    '</ul>',
  ].join('\n');
}

function criticalAlertsSection(snap: DashboardSnapshot): string {
  if (snap.critical_alerts.length === 0) return '';
  const items = snap.critical_alerts
    .map((a) => {
      const areaEsc = escapeHtml(a.area);
      const ticketsEsc = a.failing_tickets.map(escapeHtml).join(', ');
      return `<li><strong>${areaEsc}</strong> — ${a.failing_tickets.length} failing: ${ticketsEsc}</li>`;
    })
    .join('\n');
  return `
  <section class="critical-alerts">
    <h2>Critical alerts</h2>
    <ul>${items}</ul>
  </section>`;
}

function totalsSection(snap: DashboardSnapshot): string {
  const t = snap.totals;
  return `
  <section class="totals">
    <div class="totals-card pass">
      <div class="label">PASS</div>
      <div class="value">${t.last_pass} <span class="pct">(${pct(t.last_pass, t.tickets)}%)</span></div>
    </div>
    <div class="totals-card fail">
      <div class="label">FAIL</div>
      <div class="value">${t.last_fail} <span class="pct">(${pct(t.last_fail, t.tickets)}%)</span></div>
    </div>
    <div class="totals-card never">
      <div class="label">NEVER_RUN</div>
      <div class="value">${t.never_run} <span class="pct">(${pct(t.never_run, t.tickets)}%)</span></div>
    </div>
    <div class="totals-card scenarios">
      <div class="label">Scenarios</div>
      <div class="value">${t.scenarios_pass} pass / ${t.scenarios_fail} fail</div>
    </div>
  </section>`;
}

function classificationOptions(snap: DashboardSnapshot): string {
  return snap.classifications
    .map((c) => {
      const v = escapeHtml(c.classification);
      return `<option value="${v}">${v}</option>`;
    })
    .join('');
}

const CSS = `
  :root {
    --bg: #0f1115;
    --panel: #181b22;
    --panel-2: #1f232c;
    --border: #2a2f3a;
    --fg: #e6e6e6;
    --muted: #8a8f99;
    --pass: #4caf50;
    --fail: #ef5350;
    --never: #9e9e9e;
    --warn: #ffb74d;
    --accent: #66b3ff;
  }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif;
    background: var(--bg);
    color: var(--fg);
    font-size: 14px;
    line-height: 1.4;
  }
  header {
    padding: 16px 24px;
    border-bottom: 1px solid var(--border);
    background: var(--panel);
  }
  header h1 { margin: 0 0 4px; font-size: 20px; }
  header .generated { color: var(--muted); font-size: 12px; }
  main { padding: 16px 24px; max-width: 1400px; margin: 0 auto; }
  section { margin-bottom: 24px; }
  h2 { font-size: 14px; text-transform: uppercase; letter-spacing: 0.05em; color: var(--muted); margin: 0 0 8px; }
  .muted { color: var(--muted); }
  .totals { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 12px; }
  .totals-card {
    background: var(--panel);
    border: 1px solid var(--border);
    border-radius: 6px;
    padding: 12px 14px;
  }
  .totals-card .label { font-size: 11px; text-transform: uppercase; color: var(--muted); }
  .totals-card .value { font-size: 22px; font-weight: 600; margin-top: 4px; }
  .totals-card .pct { font-size: 13px; color: var(--muted); font-weight: 400; }
  .totals-card.pass .value { color: var(--pass); }
  .totals-card.fail .value { color: var(--fail); }
  .totals-card.never .value { color: var(--never); }
  .bins { list-style: none; padding: 0; margin: 0; }
  .bins li {
    display: grid;
    grid-template-columns: 180px 1fr auto;
    gap: 8px;
    align-items: center;
    padding: 4px 0;
  }
  .bins .label { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 12px; }
  .bins .bar { background: var(--accent); height: 12px; border-radius: 2px; display: inline-block; }
  .bins .count { font-variant-numeric: tabular-nums; color: var(--muted); min-width: 32px; text-align: right; }
  .critical-alerts {
    background: rgba(239, 83, 80, 0.08);
    border: 1px solid var(--fail);
    border-radius: 6px;
    padding: 12px 16px;
  }
  .critical-alerts h2 { color: var(--fail); }
  .critical-alerts ul { margin: 0; padding-left: 20px; }
  .filters {
    display: flex;
    gap: 8px;
    align-items: center;
    flex-wrap: wrap;
    background: var(--panel);
    padding: 10px 12px;
    border-radius: 6px;
    border: 1px solid var(--border);
  }
  .filters input[type="search"] {
    flex: 1;
    min-width: 200px;
    background: var(--panel-2);
    border: 1px solid var(--border);
    color: var(--fg);
    padding: 6px 10px;
    border-radius: 4px;
    font-size: 13px;
  }
  .filters button {
    background: var(--panel-2);
    border: 1px solid var(--border);
    color: var(--fg);
    padding: 6px 12px;
    border-radius: 4px;
    cursor: pointer;
    font-size: 13px;
  }
  .filters button.active { background: var(--accent); color: #000; border-color: var(--accent); }
  .filters select {
    background: var(--panel-2);
    border: 1px solid var(--border);
    color: var(--fg);
    padding: 6px 10px;
    border-radius: 4px;
    font-size: 13px;
  }
  table.tickets {
    width: 100%;
    border-collapse: collapse;
    background: var(--panel);
    border: 1px solid var(--border);
    border-radius: 6px;
    overflow: hidden;
  }
  table.tickets th, table.tickets td {
    padding: 8px 12px;
    text-align: left;
    border-bottom: 1px solid var(--border);
    font-size: 13px;
  }
  table.tickets th {
    background: var(--panel-2);
    cursor: pointer;
    user-select: none;
    font-weight: 600;
    color: var(--muted);
    text-transform: uppercase;
    font-size: 11px;
    letter-spacing: 0.05em;
  }
  table.tickets th:hover { color: var(--fg); }
  table.tickets th.sort-asc::after { content: " ▲"; }
  table.tickets th.sort-desc::after { content: " ▼"; }
  table.tickets tbody tr:hover { background: var(--panel-2); }
  table.tickets td a { color: var(--accent); text-decoration: none; }
  table.tickets td a:hover { text-decoration: underline; }
  td.result-pass { color: var(--pass); font-weight: 600; }
  td.result-fail { color: var(--fail); font-weight: 600; }
  td.result-never_run, td.result-unknown { color: var(--never); }
  .empty { text-align: center; padding: 32px; color: var(--muted); }
`;

const CLIENT_JS = `
  (function () {
    const table = document.getElementById('tickets-table');
    if (!table) return;
    const tbody = table.querySelector('tbody');
    const search = document.getElementById('search');
    const failingBtn = document.querySelector('[data-filter="failing-only"]');
    const staleBtn = document.querySelector('[data-filter="stale"]');
    const classSel = document.getElementById('class-filter');

    const state = {
      sortKey: null,
      sortDir: 1,
      search: '',
      failingOnly: false,
      staleOnly: false,
      classifications: [],
    };

    const staleIds = new Set((window.SNAPSHOT && window.SNAPSHOT.stale || []).map(function (t) { return t.ticketId; }));

    function applyFilters() {
      const q = state.search.trim().toLowerCase();
      const rows = tbody.querySelectorAll('tr');
      rows.forEach(function (row) {
        const ticketId = (row.dataset.ticket || '').toLowerCase();
        const cls = (row.dataset.class || '').toLowerCase();
        const areas = (row.dataset.areas || '').toLowerCase();
        const result = row.dataset.result;
        let show = true;
        if (q && !(ticketId.indexOf(q) >= 0 || cls.indexOf(q) >= 0 || areas.indexOf(q) >= 0)) show = false;
        if (state.failingOnly && result !== 'FAIL') show = false;
        if (state.staleOnly && !staleIds.has(row.dataset.ticket)) show = false;
        if (state.classifications.length > 0 && state.classifications.indexOf(row.dataset.class) < 0) show = false;
        row.style.display = show ? '' : 'none';
      });
    }

    function applySort() {
      if (!state.sortKey) return;
      const numericKeys = { confidence: 1, scenarios: 1 };
      const isNum = !!numericKeys[state.sortKey];
      const rows = Array.from(tbody.querySelectorAll('tr'));
      rows.sort(function (a, b) {
        const rawA = a.dataset[state.sortKey] || '';
        const rawB = b.dataset[state.sortKey] || '';
        const av = isNum ? Number(rawA) : rawA;
        const bv = isNum ? Number(rawB) : rawB;
        if (av < bv) return -state.sortDir;
        if (av > bv) return state.sortDir;
        return 0;
      });
      rows.forEach(function (r) { tbody.appendChild(r); });
    }

    table.querySelectorAll('th[data-sort]').forEach(function (th) {
      th.addEventListener('click', function () {
        const key = th.dataset.sort;
        if (state.sortKey === key) state.sortDir = -state.sortDir;
        else { state.sortKey = key; state.sortDir = 1; }
        table.querySelectorAll('th').forEach(function (h) { h.classList.remove('sort-asc', 'sort-desc'); });
        th.classList.add(state.sortDir === 1 ? 'sort-asc' : 'sort-desc');
        applySort();
      });
    });

    if (search) {
      search.addEventListener('input', function (e) {
        state.search = e.target.value;
        applyFilters();
      });
    }
    if (failingBtn) {
      failingBtn.addEventListener('click', function () {
        state.failingOnly = !state.failingOnly;
        failingBtn.classList.toggle('active', state.failingOnly);
        applyFilters();
      });
    }
    if (staleBtn) {
      staleBtn.addEventListener('click', function () {
        state.staleOnly = !state.staleOnly;
        staleBtn.classList.toggle('active', state.staleOnly);
        applyFilters();
      });
    }
    if (classSel) {
      classSel.addEventListener('change', function () {
        state.classifications = Array.from(classSel.selectedOptions).map(function (o) { return o.value; });
        applyFilters();
      });
    }
  })();
`;

/**
 * Render a full self-contained HTML page from a DashboardSnapshot.
 *
 * No external assets, no CDN. CSS inlined in a <style>, vanilla JS for
 * sort/search/filter. The full snapshot is embedded as `window.SNAPSHOT`
 * so client filters can run without re-fetching.
 *
 * When `has_html_report: true`, ticket IDs link (relative path) to the
 * Playwright HTML report — resolves under `--serve` or when the file
 * sits at the project root.
 */
export function renderHtml(snap: DashboardSnapshot): string {
  // JSON.stringify already escapes most things, but `</script>` inside any
  // string value would break out of our inline script. Defensive guard:
  const snapshotJson = JSON.stringify(snap).replace(/<\/script/gi, '<\\/script');

  const generatedEsc = escapeHtml(snap.generated_at);
  const ticketCount = snap.totals.tickets;
  const rows =
    snap.tickets.length === 0
      ? '<tr><td colspan="7" class="empty">No tickets match the current filters.</td></tr>'
      : snap.tickets.map(ticketRow).join('\n');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>xera Dashboard</title>
  <style>${CSS}</style>
</head>
<body>
  <header>
    <h1>xera Dashboard</h1>
    <div class="generated">Generated ${generatedEsc} · ${ticketCount} ticket${ticketCount === 1 ? '' : 's'}</div>
  </header>
  <main>
${totalsSection(snap)}

    <section class="classifications">
      <h2>Classifications</h2>
      ${classificationBars(snap)}
    </section>
${criticalAlertsSection(snap)}

    <section class="filters">
      <input type="search" id="search" placeholder="Filter ticket ID, classification, area...">
      <button data-filter="failing-only">Failing only</button>
      <button data-filter="stale">Stale only</button>
      <select multiple id="class-filter" title="Filter by classification (cmd/ctrl-click for multi)">${classificationOptions(snap)}</select>
    </section>

    <section class="tickets-section">
      <table class="tickets" id="tickets-table">
        <thead>
          <tr>
            <th data-sort="ticket">Ticket</th>
            <th data-sort="result">Result</th>
            <th data-sort="class">Classification</th>
            <th data-sort="confidence">Confidence</th>
            <th data-sort="scenarios">Scenarios (failed)</th>
            <th data-sort="lastrun">Last run</th>
            <th data-sort="areas">Areas</th>
          </tr>
        </thead>
        <tbody>
${rows}
        </tbody>
      </table>
    </section>
  </main>
  <script>
    const SNAPSHOT = ${snapshotJson};
    window.SNAPSHOT = SNAPSHOT;
${CLIENT_JS}
  </script>
</body>
</html>
`;
}
