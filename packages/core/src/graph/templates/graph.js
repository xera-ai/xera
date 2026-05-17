(() => {
  var data = window.__GRAPH__ || { nodes: [], edges: [], stats: {} };
  var container = document.getElementById('canvas');
  if (!container || typeof vis === 'undefined') {
    container.innerHTML =
      '<p style="padding:40px;color:#4b5563;font-size:13px">Failed to load vis-network.</p>';
    return;
  }

  // ── Populate stats chips ─────────────────────────────
  var statsBar = document.getElementById('stats-bar');
  var s = data.stats || {};
  var chips = [
    { label: `${s.tickets ?? 0} tickets`, color: '#3b82f6' },
    { label: `${s.scenarios ?? 0} scenarios`, color: '#3fb950' },
    { label: `${s.poms ?? 0} POMs`, color: '#e3b341' },
    { label: `${s.edges ?? 0} edges`, color: '#475569' },
  ];
  if (s.failures) chips.splice(2, 0, { label: `${s.failures} failures`, color: '#f85149' });
  chips.forEach((c) => {
    var el = document.createElement('div');
    el.className = 'stat-chip';
    el.innerHTML = `<span class="dot" style="background:${c.color}"></span>${c.label}`;
    statsBar.appendChild(el);
  });

  // ── Active filter labels ─────────────────────────────
  ['pass', 'fail', 'p0'].forEach((key) => {
    var label = document.getElementById(`label-${key}`);
    var cb = document.getElementById(`filter-${key}`);
    if (cb.checked) label.classList.add('active');
    cb.addEventListener('change', () => {
      label.classList.toggle('active', cb.checked);
    });
  });

  // ── Node visual enhancement ──────────────────────────
  function trunc(str, n) {
    return str && str.length > n ? `${str.slice(0, n - 1)}…` : str;
  }

  var NODE_STYLES = {
    Ticket: {
      shape: 'dot',
      sizeBase: 20,
      color: {
        background: '#112240',
        border: '#4d94ff',
        highlight: { background: '#1a3a6e', border: '#82b4ff' },
        hover: { background: '#152d5a', border: '#5fa3ff' },
      },
      font: { size: 12, color: '#93c5fd', strokeWidth: 3, strokeColor: '#050810', bold: true },
      borderWidth: 2,
    },
    Scenario: {
      shape: 'box',
      sizeBase: 10,
      color: {
        background: '#0a2218',
        border: '#2ea44f',
        highlight: { background: '#0d3320', border: '#3fb950' },
        hover: { background: '#0d2a1a', border: '#3fb950' },
      },
      font: { size: 10, color: '#86efac', strokeWidth: 2, strokeColor: '#050810' },
      borderWidth: 1.5,
    },
    'Scenario-fail': {
      shape: 'box',
      sizeBase: 10,
      color: {
        background: '#2d1214',
        border: '#cf3939',
        highlight: { background: '#3d1515', border: '#f85149' },
        hover: { background: '#3a1416', border: '#f85149' },
      },
      font: { size: 10, color: '#fca5a5', strokeWidth: 2, strokeColor: '#050810' },
      borderWidth: 1.5,
    },
    POM: {
      shape: 'diamond',
      sizeBase: 16,
      color: {
        background: '#2a1e0a',
        border: '#c99a20',
        highlight: { background: '#3d2c0d', border: '#e3b341' },
        hover: { background: '#332410', border: '#e3b341' },
      },
      font: { size: 11, color: '#fde68a', strokeWidth: 2, strokeColor: '#050810' },
      borderWidth: 2,
    },
    Area: {
      shape: 'hexagon',
      sizeBase: 14,
      color: {
        background: '#1a2035',
        border: '#4b5563',
        highlight: { background: '#232d47', border: '#6b7280' },
        hover: { background: '#1e2840', border: '#6b7280' },
      },
      font: { size: 10, color: '#9ca3af', strokeWidth: 2, strokeColor: '#050810' },
      borderWidth: 1.5,
    },
  };

  var nodeData = data.nodes.map((n) => {
    var styleKey = n.group === 'Scenario' && n.color === '#EF4444' ? 'Scenario-fail' : n.group;
    var style = NODE_STYLES[styleKey] || {};
    var mapped = Object.assign({}, n, {
      label: trunc(n.label, 30),
      shape: style.shape ?? n.shape,
      size: (style.sizeBase ?? 12) + (n.size ?? 12) * 0.4,
      color: style.color ?? n.color,
      font: style.font,
      borderWidth: style.borderWidth ?? 1.5,
      shadow: { enabled: true, color: 'rgba(0,0,0,.6)', size: 10, x: 0, y: 3 },
      margin: n.group === 'Scenario' ? 6 : undefined,
    });
    delete mapped.group;
    return mapped;
  });

  // ── Edge enhancement ─────────────────────────────────
  var edgeData = data.edges.map((e) => {
    var isTests = e.label === 'tests';
    return Object.assign({}, e, {
      color: {
        color: isTests ? '#1e3a6e' : '#1e2d3d',
        highlight: isTests ? '#3b82f6' : '#60a5fa',
        hover: isTests ? '#2563eb' : '#60a5fa',
        opacity: 0.8,
      },
      width: isTests ? 1.5 : 1,
      dashes: !isTests,
      font: {
        size: 8,
        color: '#2d3f5f',
        strokeWidth: 0,
        align: 'middle',
      },
    });
  });

  var nodes = new vis.DataSet(nodeData);
  var edges = new vis.DataSet(edgeData);

  // ── Pre-compute adjacency + cache arrays for O(1) lookups ───
  var adjacency = Object.create(null);
  for (const n of nodeData) adjacency[n.id] = new Set();
  for (const er of edgeData) {
    if (adjacency[er.from]) adjacency[er.from].add(er.to);
    if (adjacency[er.to]) adjacency[er.to].add(er.from);
  }
  var allNodeIds = nodeData.map((n) => n.id);
  var edgeIndex = edgeData.map((e) => ({ id: e.id, from: e.from, to: e.to, baseColor: e.color }));

  // ── Network init ─────────────────────────────────────
  var network = new vis.Network(
    container,
    { nodes, edges },
    {
      physics: {
        barnesHut: {
          gravitationalConstant: -10000,
          centralGravity: 0.15,
          springLength: 160,
          springConstant: 0.025,
          damping: 0.18,
          avoidOverlap: 0.5,
        },
        stabilization: { iterations: 400, updateInterval: 20 },
      },
      interaction: {
        hover: true,
        navigationButtons: false,
        keyboard: { enabled: true, speed: { x: 10, y: 10, zoom: 0.05 } },
        tooltipDelay: 200,
        zoomSpeed: 0.8,
      },
      edges: {
        smooth: { type: 'curvedCW', forceDirection: 'none', roundness: 0.2 },
        arrows: { to: { enabled: true, scaleFactor: 0.5, type: 'arrow' } },
        selectionWidth: 2,
      },
      nodes: {
        chosen: true,
      },
    },
  );

  container.style.opacity = '0';

  // ── Physics state machine (guarded to avoid redundant setOptions) ───
  var physicsOn = true; // initially true during stabilization
  function setPhysics(on) {
    if (physicsOn === on) return;
    physicsOn = on;
    network.setOptions({ physics: { enabled: on } });
  }

  // ── Progress bar ─────────────────────────────────────
  var progressBar = document.getElementById('progress-bar');
  network.on('stabilizationProgress', (p) => {
    progressBar.style.width = `${Math.round((p.iterations / p.total) * 100)}%`;
  });
  network.once('stabilizationIterationsDone', () => {
    setPhysics(false);
    network.fit();
    container.style.transition = 'opacity 0.3s';
    container.style.opacity = '1';
    progressBar.style.width = '100%';
    setTimeout(() => {
      progressBar.style.transition = 'opacity .4s';
      progressBar.style.opacity = '0';
    }, 300);
  });

  // ── Drag → temporarily enable physics so connected nodes react ───
  var _disableTimer = null;
  var _enableTimer = null;
  network.on('dragStart', (params) => {
    if (!params.nodes.length) return;
    clearTimeout(_disableTimer);
    clearTimeout(_enableTimer);
    // Only enable on real drags (held > ~80ms) — clicks fire dragStart+dragEnd instantly
    _enableTimer = setTimeout(() => {
      setPhysics(true);
    }, 80);
  });
  network.on('dragEnd', (params) => {
    clearTimeout(_enableTimer);
    if (!params.nodes.length) return;
    _disableTimer = setTimeout(() => {
      setPhysics(false);
    }, 1200);
  });

  // ── Side panel ───────────────────────────────────────
  var sidepanel = document.getElementById('sidepanel');
  var spTitle = document.getElementById('sp-title');
  var spGroup = document.getElementById('sp-group');
  var spDesc = document.getElementById('sp-desc');
  var spActions = document.getElementById('sp-actions');

  function showPanel(nodeId) {
    var orig = data.nodes.find((n) => n.id === nodeId);
    if (!orig) return;

    var isFail = orig.group === 'Scenario' && orig.color === '#EF4444';
    var badgeClass =
      orig.group === 'Ticket'
        ? 'ticket'
        : orig.group === 'POM'
          ? 'pom'
          : isFail
            ? 'scenario-fail'
            : 'scenario';

    spGroup.className = `sp-group-badge ${badgeClass}`;
    spGroup.textContent = isFail ? 'Scenario · fail' : orig.group;
    spTitle.textContent = orig.title
      ? orig.title.replace(/^[A-Z]+-\d+\s*[—–-]\s*/, '')
      : orig.label;
    spDesc.textContent = orig.title || '';
    spActions.innerHTML = '';
    var btn = null;

    if (orig.group === 'Ticket') {
      btn = document.createElement('button');
      btn.textContent = `Copy /xera-impact ${nodeId}`;
      btn.onclick = () => {
        navigator.clipboard?.writeText(`/xera-impact ${nodeId}`);
        btn.textContent = '✓ Copied!';
        btn.classList.add('copied');
        setTimeout(() => {
          btn.textContent = `Copy /xera-impact ${nodeId}`;
          btn.classList.remove('copied');
        }, 1800);
      };
      spActions.appendChild(btn);
    }

    sidepanel.classList.remove('hidden');
  }

  // ── Highlight / dim state machine ────────────────────────────
  // Uses pre-computed adjacency + cached id arrays for O(1) neighbor lookup
  // and a single batched DataSet update per state change.
  var dimmedFor = null; // currently dimmed-for node id, or null
  var pendingDim; // undefined = no pending; null = clear; string = dim for id
  var pendingRaf = 0;

  function neighborSet(nodeId) {
    var keep = new Set([nodeId]);
    var hop1 = adjacency[nodeId];
    if (!hop1) return keep;
    hop1.forEach((x) => {
      keep.add(x);
      var a = adjacency[x];
      if (a)
        a.forEach((y) => {
          keep.add(y);
        });
    });
    return keep;
  }

  function applyDim(nodeId) {
    if (dimmedFor === nodeId) return;
    dimmedFor = nodeId;
    var keep = neighborSet(nodeId);
    nodes.update(allNodeIds.map((id) => ({ id: id, opacity: keep.has(id) ? 1 : 0.15 })));
    edges.update(
      edgeIndex.map((e) => ({
        id: e.id,
        color: Object.assign({}, e.baseColor, {
          opacity: keep.has(e.from) && keep.has(e.to) ? 0.8 : 0.04,
        }),
      })),
    );
  }

  function clearDim() {
    if (dimmedFor === null) return;
    dimmedFor = null;
    nodes.update(allNodeIds.map((id) => ({ id: id, opacity: 1 })));
    edges.update(edgeIndex.map((e) => ({ id: e.id, color: e.baseColor })));
  }

  // Schedule dim work in next animation frame so the panel renders first.
  // Debounced: if multiple state changes happen before the frame, only the
  // latest wins (prevents flicker on rapid clicks).
  function scheduleDim(nodeIdOrNull) {
    pendingDim = nodeIdOrNull;
    if (pendingRaf) return;
    pendingRaf = requestAnimationFrame(() => {
      pendingRaf = 0;
      var target = pendingDim;
      pendingDim = undefined;
      if (target === null) clearDim();
      else if (typeof target === 'string') applyDim(target);
    });
  }

  function hidePanel() {
    sidepanel.classList.add('hidden');
  }

  // ── Selection events ─────────────────────────────────
  // Use selectNode/deselectNode — these only fire on actual selection changes,
  // unlike `click` which also fires after pan/drag.
  var _deselectTimer = null;

  network.on('selectNode', (params) => {
    clearTimeout(_deselectTimer);
    var id = params.nodes[0];
    showPanel(id); // synchronous, fast — panel appears immediately
    scheduleDim(id); // heavy dim work deferred to next frame
  });

  network.on('deselectNode', () => {
    // Defer so that switching directly between nodes (deselect→select)
    // doesn't flash the panel closed in between.
    _deselectTimer = setTimeout(() => {
      hidePanel();
      scheduleDim(null);
    }, 0);
  });

  function resetView() {
    network.unselectAll();
    clearTimeout(_deselectTimer);
    hidePanel();
    scheduleDim(null);
  }

  // ── Controls ─────────────────────────────────────────
  document.getElementById('reset-btn').onclick = () => {
    resetView();
    network.fit({ animation: { duration: 350, easingFunction: 'easeInOutQuad' } });
  };

  // Index for fast search lookup
  var searchIndex = data.nodes.map((n) => ({
    id: n.id,
    hay: `${String(n.id)} ${n.label || ''} ${n.title || ''}`.toLowerCase(),
  }));
  document.getElementById('search').oninput = (e) => {
    const q = e.target.value.toLowerCase().trim();
    if (!q) {
      resetView();
      return;
    }
    nodes.update(searchIndex.map((n) => ({ id: n.id, opacity: n.hay.includes(q) ? 1 : 0.08 })));
  };

  // Index scenarios by pass/fail for fast filtering
  var scenarioIndex = data.nodes
    .filter((n) => n.group === 'Scenario')
    .map((n) => ({ id: n.id, isPass: n.color === '#10B981', isFail: n.color === '#EF4444' }));
  function applyFilters() {
    var pass = document.getElementById('filter-pass').checked;
    var fail = document.getElementById('filter-fail').checked;
    if (!scenarioIndex.length) return;
    nodes.update(
      scenarioIndex.map((n) => ({ id: n.id, hidden: (n.isPass && !pass) || (n.isFail && !fail) })),
    );
  }
  ['filter-pass', 'filter-fail', 'filter-p0'].forEach((id) => {
    document.getElementById(id).onchange = applyFilters;
  });
})();

// v0.8.1 — top-level tab switching
(function setupTabs() {
  const tabButtons = document.querySelectorAll('.toplevel-tabs button');
  if (!tabButtons.length) return;
  tabButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      tabButtons.forEach((b) => {
        b.classList.remove('active');
      });
      btn.classList.add('active');
      const tab = btn.getAttribute('data-tab');
      document.querySelectorAll('[data-tab-panel]').forEach((panel) => {
        if (panel.getAttribute('data-tab-panel') === tab) {
          panel.classList.add('active');
          panel.removeAttribute('hidden');
        } else {
          panel.classList.remove('active');
        }
      });
      if (tab === 'coverage' && window.__COVERAGE__) {
        renderCoverageOnce();
      }
    });
  });
})();

// v0.8.1 — coverage subtab switching
(function setupSubtabs() {
  const subButtons = document.querySelectorAll('.subtabs button');
  subButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      subButtons.forEach((b) => {
        b.classList.remove('active');
      });
      btn.classList.add('active');
      const sub = btn.getAttribute('data-subtab');
      document.querySelectorAll('[data-subpanel]').forEach((panel) => {
        if (panel.getAttribute('data-subpanel') === sub) {
          panel.removeAttribute('hidden');
          panel.classList.add('active');
        } else {
          panel.setAttribute('hidden', '');
          panel.classList.remove('active');
        }
      });
    });
  });
})();

let _coverageRendered = false;
function renderCoverageOnce() {
  if (_coverageRendered) return;
  _coverageRendered = true;
  renderCoverageList();
  renderCoverageTrend();
  renderCoverageMap();
}

// Task 27 — coverage map: areas as a heat-map grid
function renderCoverageMap() {
  const cov = window.__COVERAGE__;
  if (!cov || !window.__GRAPH__) return;
  const canvas = document.getElementById('coverage-map-canvas');
  if (!canvas) return;

  const STATUS_THEME = {
    UNCOVERED: { fill: '#3d1515', border: '#f87171', glow: 'rgba(239, 68, 68, 0.45)' },
    STALE: { fill: '#3d2c0d', border: '#fbbf24', glow: 'rgba(245, 158, 11, 0.45)' },
    COVERED: { fill: '#0d3320', border: '#34d399', glow: 'rgba(16, 185, 129, 0.4)' },
  };

  // Clear any previous render (subtab switching may re-invoke us)
  canvas.innerHTML = '';

  if (!cov.report.areas.length) {
    canvas.innerHTML =
      '<p style="padding:48px;text-align:center;color:#64748b;font-size:13px">' +
      'No SUT areas tracked yet — run /xera-fetch on a ticket with acceptance criteria to populate.' +
      '</p>';
    return;
  }

  // Sort: UNCOVERED first, then STALE, then COVERED — within each by risk desc
  const STATUS_RANK = { UNCOVERED: 0, STALE: 1, COVERED: 2 };
  const areas = [...cov.report.areas].sort((a, b) => {
    const r = STATUS_RANK[a.status] - STATUS_RANK[b.status];
    if (r !== 0) return r;
    return b.risk - a.risk;
  });

  const maxRisk = Math.max(...areas.map((a) => a.risk), 1);

  const tiles = areas
    .map((a) => {
      const theme = STATUS_THEME[a.status] || STATUS_THEME.COVERED;
      const heat = 0.35 + 0.65 * (a.risk / maxRisk); // 0.35–1.0
      return `
        <article class="cov-tile" data-status="${a.status}" style="--fill:${theme.fill};--border:${theme.border};--glow:${theme.glow};--heat:${heat}">
          <header class="cov-tile-head">
            <span class="cov-tile-status">${a.status.toLowerCase()}</span>
            <span class="cov-tile-risk" title="risk score">${a.risk}</span>
          </header>
          <h4 class="cov-tile-name">${a.id}</h4>
          <dl class="cov-tile-meta">
            <div><dt>tickets</dt><dd>${a.breakdown.recentTickets}</dd></div>
            <div><dt>bugs</dt><dd>${a.breakdown.recentBugs}</dd></div>
          </dl>
        </article>`;
    })
    .join('');

  // Legend
  const legend = `
    <div class="cov-legend">
      <span><i class="cov-dot" style="--c:#ef4444"></i>uncovered</span>
      <span><i class="cov-dot" style="--c:#f59e0b"></i>stale</span>
      <span><i class="cov-dot" style="--c:#10b981"></i>covered</span>
      <span class="cov-legend-hint">size & glow ∝ risk</span>
    </div>`;

  canvas.innerHTML = legend + `<div class="cov-grid">${tiles}</div>`;
}

// Task 28 — coverage list: sortable area + AC gap tables
function renderCoverageList() {
  const cov = window.__COVERAGE__;
  if (!cov) return;
  const listBody = document.querySelector('#coverage-list-table tbody');
  if (listBody) {
    listBody.innerHTML = '';
    for (const a of cov.report.areas) {
      const tr = document.createElement('tr');
      tr.classList.add(`status-${a.status.toLowerCase()}`);
      const cells = [
        a.status,
        a.id,
        String(a.risk),
        String(a.breakdown.recentTickets),
        String(a.breakdown.recentBugs),
      ];
      for (const c of cells) {
        const td = document.createElement('td');
        td.textContent = c;
        tr.appendChild(td);
      }
      listBody.appendChild(tr);
    }
  }

  const acBody = document.querySelector('#coverage-ac-table tbody');
  if (acBody) {
    acBody.innerHTML = '';
    for (const t of cov.report.tickets) {
      const tr = document.createElement('tr');
      const cells = [
        t.id,
        `${t.satisfiedCount}/${t.acCount}`,
        String(t.gapScore),
        t.unsatisfiedAcs.map((ac) => `AC-${ac.index}`).join(', '),
      ];
      for (const c of cells) {
        const td = document.createElement('td');
        td.textContent = c;
        tr.appendChild(td);
      }
      acBody.appendChild(tr);
    }
  }
}

// Task 29 — coverage trend: inline SVG line chart
function renderCoverageTrend() {
  const cov = window.__COVERAGE__;
  if (!cov) return;
  const container = document.getElementById('coverage-trend-svg');
  if (!container) return;

  // Dedup by day (latest snapshot per day wins), sort asc.
  const byDay = {};
  for (const s of cov.snapshots) {
    const day = s.ts.slice(0, 10);
    byDay[day] = s;
  }
  const days = Object.keys(byDay).sort();
  if (days.length === 0) {
    container.innerHTML =
      '<p class="subpanel-hint">No snapshots yet — run /xera-coverage on multiple days to build a trend.</p>';
    return;
  }

  const points = days.map((d) => {
    const snap = byDay[d];
    const n = snap.areas.filter((a) => a.status === 'UNCOVERED' || a.status === 'STALE').length;
    return { day: d, value: n };
  });

  // Single data point — render a quiet placeholder rather than a degenerate chart
  if (points.length === 1) {
    container.innerHTML =
      `<div class="cov-trend-single">` +
      `<span class="cov-trend-value">${points[0].value}</span>` +
      `<span class="cov-trend-unit">uncovered + stale areas</span>` +
      `<span class="cov-trend-date">${points[0].day}</span>` +
      `<p class="cov-trend-hint">Run /xera-coverage on subsequent days to build a trend line.</p>` +
      `</div>`;
    return;
  }

  const W = 800;
  const H = 260;
  const PAD_L = 40;
  const PAD_R = 24;
  const PAD_T = 16;
  const PAD_B = 32;
  const innerW = W - PAD_L - PAD_R;
  const innerH = H - PAD_T - PAD_B;
  const rawMax = Math.max(...points.map((p) => p.value), 1);
  // Round maxValue up to a "nice" integer so y-axis labels are clean integers
  const niceMax = rawMax <= 4 ? rawMax : Math.ceil(rawMax / 5) * 5;
  const stepX = innerW / (points.length - 1);
  const xy = points.map((p, idx) => ({
    x: PAD_L + idx * stepX,
    y: PAD_T + innerH - (p.value / niceMax) * innerH,
    v: p.value,
    d: p.day,
  }));
  const linePath = xy.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ');
  const areaPath = `${linePath} L${xy[xy.length - 1].x},${PAD_T + innerH} L${xy[0].x},${PAD_T + innerH} Z`;

  // Horizontal grid lines — pick step that yields integer labels
  const tickCount = Math.min(niceMax, 4);
  const tickStep = niceMax / tickCount;
  const seenTicks = new Set();
  const grid = [];
  for (let i = 1; i <= tickCount; i++) {
    const v = Math.round(tickStep * i);
    if (seenTicks.has(v)) continue;
    seenTicks.add(v);
    const y = PAD_T + innerH - (v / niceMax) * innerH;
    grid.push(
      `<line x1="${PAD_L}" y1="${y}" x2="${W - PAD_R}" y2="${y}" stroke="#1a2540" stroke-width="1" stroke-dasharray="2 4"/>` +
        `<text x="${PAD_L - 8}" y="${y + 3}" font-size="10" text-anchor="end">${v}</text>`,
    );
  }
  // Baseline 0 tick
  grid.push(
    `<line x1="${PAD_L}" y1="${PAD_T + innerH}" x2="${W - PAD_R}" y2="${PAD_T + innerH}" stroke="#1e2d45" stroke-width="1"/>` +
      `<text x="${PAD_L - 8}" y="${PAD_T + innerH + 3}" font-size="10" text-anchor="end">0</text>`,
  );

  const dots = xy
    .map(
      (p) =>
        `<circle cx="${p.x}" cy="${p.y}" r="3" fill="#ef4444" stroke="#080c14" stroke-width="1.5"><title>${p.d}: ${p.v} uncovered/stale</title></circle>`,
    )
    .join('');

  const labelFirst = points[0].day;
  const labelLast = points[points.length - 1].day;
  container.innerHTML =
    `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet">` +
    `<defs><linearGradient id="trendFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#ef4444" stop-opacity="0.25"/><stop offset="100%" stop-color="#ef4444" stop-opacity="0"/></linearGradient></defs>` +
    grid.join('') +
    `<path d="${areaPath}" fill="url(#trendFill)" stroke="none"/>` +
    `<path d="${linePath}" fill="none" stroke="#ef4444" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>` +
    dots +
    `<text x="${PAD_L}" y="${H - 8}" font-size="10">${labelFirst}</text>` +
    `<text x="${W - PAD_R}" y="${H - 8}" font-size="10" text-anchor="end">${labelLast}</text>` +
    `</svg>`;
}
