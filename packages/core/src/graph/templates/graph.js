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
        keyboard: { enabled: true, speed: { x: 10, y: 10, zoom: 0.05 }, bindToWindow: false },
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
  // Debug hook: expose for E2E test automation (e.g. PR validation screenshots).
  // vis-network's click events fire via internal pointer handling, so external
  // scripts need access to .selectNodes()/.emit(). Stable name; small surface.
  window.__xeraNetwork__ = network;

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

  function spRow(key, value, modifier) {
    var row = document.createElement('div');
    row.className = 'sp-row';
    var k = document.createElement('span');
    k.className = 'sp-key';
    k.textContent = key;
    var v = document.createElement('span');
    v.className = `sp-val${modifier ? ` sp-val-${modifier}` : ''}`;
    v.textContent = value;
    row.appendChild(k);
    row.appendChild(v);
    return row;
  }

  // ── Ticket panel helpers ────────────────────────────────
  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }
  function chip(text, cls) {
    return el('span', `sp-chip${cls ? ` sp-chip-${cls}` : ''}`, text);
  }
  function relTime(iso) {
    if (!iso) return '';
    var t = Date.parse(iso);
    if (!Number.isFinite(t)) return iso;
    var s = Math.floor((Date.now() - t) / 1000);
    if (s < 60) return `${s}s ago`;
    if (s < 3600) return `${Math.floor(s / 60)}m ago`;
    if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
    return `${Math.floor(s / 86400)}d ago`;
  }
  function ticketSection(title, meta, opts) {
    var d = el('details', 'sp-section');
    if (opts?.open) d.open = true;
    var s = el('summary');
    s.appendChild(el('span', 'sp-sec-title', title));
    if (meta) s.appendChild(el('span', 'sp-sec-meta', meta));
    d.appendChild(s);
    var body = el('div', 'sp-sec-body');
    d.appendChild(body);
    return { details: d, body: body };
  }
  function copyButton(label, payload, opts) {
    var b = document.createElement('button');
    if (opts?.secondary) b.className = 'sp-btn-sec';
    b.textContent = label;
    b.onclick = () => {
      try {
        navigator.clipboard?.writeText(payload);
      } catch (_) {}
      var prev = b.textContent;
      b.textContent = '✓ Copied';
      b.classList.add('copied');
      setTimeout(() => {
        b.textContent = prev;
        b.classList.remove('copied');
      }, 1500);
    };
    return b;
  }

  function renderTicketPanel(orig, ticketId) {
    const m = orig.meta?.ticket || null;
    spDesc.innerHTML = '';
    spActions.innerHTML = '';
    if (!m) {
      // Fallback for older snapshots without computed meta
      spDesc.textContent = orig.title || '';
      const btn = copyButton(`Copy /xera-impact ${ticketId}`, `/xera-impact ${ticketId}`);
      spActions.appendChild(btn);
      return;
    }

    // Chip row (priority · result · top class · last run ago)
    const chips = el('div', 'sp-chip-row');
    if (m.topPriority) chips.appendChild(chip(m.topPriority.toUpperCase(), m.topPriority));
    const hasFail = m.runStats.fail > 0;
    chips.appendChild(chip(hasFail ? 'FAIL' : 'PASS', hasFail ? 'fail' : 'pass'));
    if (m.topClassification) {
      const label = m.topClassification + (m.topConfidence ? ` · ${m.topConfidence}` : '');
      chips.appendChild(chip(label, 'cls'));
    }
    if (m.runStats.lastRunTs) {
      chips.appendChild(chip(`last run ${relTime(m.runStats.lastRunTs)}`, 'ago'));
    }
    spDesc.appendChild(chips);

    // 1. Test health
    const th = ticketSection('Test health', `${m.runStats.pass}/${m.runStats.total} pass`, {
      open: true,
    });
    const bar = el('div', 'sp-health-bar');
    const total = Math.max(1, m.runStats.total);
    if (m.runStats.pass > 0) {
      const p = el('div', 'sp-bar-pass');
      p.style.width = `${((m.runStats.pass / total) * 100).toFixed(1)}%`;
      bar.appendChild(p);
    }
    if (m.runStats.fail > 0) {
      const f = el('div', 'sp-bar-fail');
      f.style.width = `${((m.runStats.fail / total) * 100).toFixed(1)}%`;
      bar.appendChild(f);
    }
    th.body.appendChild(bar);
    const counts = el('div', 'sp-health-counts');
    counts.appendChild(el('span', null, `${m.runStats.pass} pass`));
    counts.appendChild(el('span', null, `${m.runStats.fail} fail`));
    th.body.appendChild(counts);
    const mixKeys = Object.keys(m.failureMix);
    if (mixKeys.length > 0) {
      const mixBox = el('div', 'sp-mix');
      mixBox.appendChild(el('div', 'sp-mix-title', 'Failure mix (latest classifications)'));
      mixKeys
        .sort((a, b) => m.failureMix[b] - m.failureMix[a])
        .forEach((k) => {
          const row = el('div', `sp-mix-row ${k === 'PASS' ? 'p' : k === 'TEST_BUG' ? 't' : 'b'}`);
          row.appendChild(el('span', 'label', k));
          row.appendChild(el('span', 'n', String(m.failureMix[k])));
          mixBox.appendChild(row);
        });
      th.body.appendChild(mixBox);
    }
    spDesc.appendChild(th.details);

    // 2. AC coverage — 3-state (verified / broken / gap)
    if (m.acTotal > 0) {
      const states = m.acStates || [];
      const verified = states.filter((a) => a.state === 'verified').length;
      const broken = states.filter((a) => a.state === 'broken').length;
      const gap = states.filter((a) => a.state === 'gap').length;
      const headerParts = [];
      if (verified > 0) headerParts.push(`${verified} verified`);
      if (broken > 0) headerParts.push(`${broken} broken`);
      if (gap > 0) headerParts.push(`${gap} gap`);
      const cov = ticketSection(
        'AC coverage',
        headerParts.length > 0 ? headerParts.join(' · ') : `${verified}/${m.acTotal}`,
        { open: true },
      );
      // Bar reflects ONLY verified (passing) — broken counts as not-yet-verified
      const cbar = el('div', 'sp-cov-bar');
      const fill = el('div');
      fill.style.width = `${((verified / m.acTotal) * 100).toFixed(1)}%`;
      cbar.appendChild(fill);
      cov.body.appendChild(cbar);
      const acList = el('ul', 'sp-ac-list');
      const allAcs = (orig.acTexts || []).slice();
      // Render in original AC order so QA can scan against the ticket
      const ordered = states.slice().sort((a, b) => a.index - b.index);
      const marks = { verified: ['ok', '✓'], broken: ['broken', '⚠'], gap: ['gap', '!'] };
      ordered.forEach((e) => {
        const li = el('li');
        const [cls, glyph] = marks[e.state];
        li.appendChild(el('span', `sp-ac-mark ${cls}`, glyph));
        const txt = el('span', 'sp-ac-text');
        txt.appendChild(el('span', 'sp-ac-num', `AC-${e.index}`));
        const detail = allAcs[e.index];
        if (detail) txt.appendChild(document.createTextNode(` ${detail}`));
        li.appendChild(txt);
        acList.appendChild(li);
      });
      cov.body.appendChild(acList);
      spDesc.appendChild(cov.details);
    }

    // 3. Linked entities
    const linkedMeta = `${m.poms.length} POM${m.poms.length === 1 ? '' : 's'} · ${m.areas.length} areas`;
    const linked = ticketSection('Linked', linkedMeta);
    if (m.poms.length > 0) {
      const rPoms = el('div', 'sp-link-row');
      rPoms.appendChild(el('div', 'sp-link-key', 'POMs'));
      const pomBox = el('div', 'sp-link-val');
      m.poms.forEach((p) => {
        pomBox.appendChild(el('span', 'sp-pom-pill', p.fileName));
      });
      rPoms.appendChild(pomBox);
      linked.body.appendChild(rPoms);
    }
    if (m.areas.length > 0) {
      const rAreas = el('div', 'sp-link-row');
      rAreas.appendChild(el('div', 'sp-link-key', 'Areas'));
      const areaBox = el('div', 'sp-link-val');
      m.areas.forEach((a, idx) => {
        if (idx > 0) areaBox.appendChild(document.createElement('br'));
        areaBox.appendChild(document.createTextNode(`${a.id} `));
        if (a.status) {
          const tag = el(
            'span',
            `sp-area-risk ${a.status.toLowerCase()}`,
            a.status + (typeof a.risk === 'number' ? ` · risk ${a.risk}` : ''),
          );
          areaBox.appendChild(tag);
        }
      });
      rAreas.appendChild(areaBox);
      linked.body.appendChild(rAreas);
    }
    if (m.linkedTickets.length > 0) {
      const rLT = el('div', 'sp-link-row');
      rLT.appendChild(el('div', 'sp-link-key', 'Tickets'));
      const ltBox = el('div', 'sp-link-val');
      m.linkedTickets.forEach((lt, idx) => {
        if (idx > 0) ltBox.appendChild(document.createTextNode(', '));
        const span = el('span', 'sp-linked-ticket', lt.id);
        ltBox.appendChild(span);
      });
      rLT.appendChild(ltBox);
      linked.body.appendChild(rLT);
    }
    spDesc.appendChild(linked.details);

    // 4. Freshness
    const fr = ticketSection('Freshness', `fetched ${relTime(m.fetchedAt)}`);
    const fRow = (ok, label, detail) => {
      const r = el('div', 'sp-fresh-row');
      r.appendChild(el('span', `sp-fresh-ico ${ok ? 'ok' : 'warn'}`, ok ? '✓' : '!'));
      const col = el('div');
      col.appendChild(el('div', 'sp-fresh-label', label));
      if (detail) col.appendChild(el('div', 'sp-fresh-detail', detail));
      r.appendChild(col);
      return r;
    };
    fr.body.appendChild(fRow(true, `Fetched ${relTime(m.fetchedAt)}`, m.fetchedAt));
    if (m.latestScenarioAt) {
      fr.body.appendChild(
        fRow(
          true,
          `${m.scenarioCount} scenarios generated`,
          `latest at ${relTime(m.latestScenarioAt)}`,
        ),
      );
    } else {
      fr.body.appendChild(fRow(false, 'No scenarios generated yet', '/xera-script never ran'));
    }
    spDesc.appendChild(fr.details);

    // 5. Actions footer
    spActions.appendChild(copyButton(`Copy /xera-impact ${ticketId}`, `/xera-impact ${ticketId}`));
    const grid = el('div', 'sp-action-grid');
    grid.appendChild(copyButton('/xera-run', `/xera-run ${ticketId}`, { secondary: true }));
    grid.appendChild(
      copyButton('/xera-coverage', `/xera-coverage --ticket ${ticketId}`, { secondary: true }),
    );
    spActions.appendChild(grid);
  }

  // Exposed for E2E test automation alongside __xeraNetwork__ — pairs with
  // the network handle so external scripts can trigger the side-panel render
  // without relying on programmatic vis-network select events.
  window.__xeraShowPanel__ = showPanel;
  function showPanel(nodeId) {
    var orig = data.nodes.find((n) => n.id === nodeId);
    if (!orig) return;

    var isScenarioFail = orig.group === 'Scenario' && orig.color === '#EF4444';
    var isFailure = orig.group === 'Failure';
    var badgeClass =
      orig.group === 'Ticket'
        ? 'ticket'
        : orig.group === 'POM'
          ? 'pom'
          : isFailure
            ? 'failure'
            : orig.group === 'SUTArea'
              ? 'area'
              : isScenarioFail
                ? 'scenario-fail'
                : 'scenario';

    spGroup.className = `sp-group-badge ${badgeClass}`;
    spActions.innerHTML = '';

    if (isFailure) {
      const m = orig.meta || {};
      spGroup.textContent = 'Failure';
      spTitle.textContent = m.scenarioName || orig.label || nodeId;
      spDesc.innerHTML = '';
      spDesc.textContent = '';
      if (m.classification) {
        const classVal = `${m.classification}${m.confidence ? ` (${m.confidence} confidence)` : ''}`;
        spDesc.appendChild(spRow('class', classVal));
      } else {
        spDesc.appendChild(spRow('class', 'not yet classified', 'muted'));
      }
      if (m.disputed) spDesc.appendChild(spRow('status', 'disputed by QA', 'warn'));
      if (m.ts) spDesc.appendChild(spRow('when', m.ts));
      if (m.runId) spDesc.appendChild(spRow('run', m.runId));
      if (m.traceId) spDesc.appendChild(spRow('trace', m.traceId));
    } else if (orig.group === 'Ticket') {
      spGroup.textContent = 'Ticket';
      spTitle.textContent = orig.title
        ? orig.title.replace(/^[A-Z]+-\d+\s*[—–-]\s*/, '')
        : orig.label;
      renderTicketPanel(orig, nodeId);
    } else {
      spGroup.textContent = isScenarioFail ? 'Scenario · fail' : orig.group;
      spTitle.textContent = orig.title
        ? orig.title.replace(/^[A-Z]+-\d+\s*[—–-]\s*/, '')
        : orig.label;
      spDesc.innerHTML = '';
      spDesc.textContent = orig.title || '';
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

  // ── Legend modal ─────────────────────────────────────
  var legendBtn = document.getElementById('legend-btn');
  var legendModal = document.getElementById('legend-modal');
  if (legendBtn && legendModal) {
    const legendClose = document.getElementById('legend-close');
    const legendBackdrop = legendModal.querySelector('.legend-backdrop');
    const openLegend = () => {
      legendModal.classList.remove('hidden');
      legendModal.setAttribute('aria-hidden', 'false');
    };
    const closeLegend = () => {
      legendModal.classList.add('hidden');
      legendModal.setAttribute('aria-hidden', 'true');
    };
    legendBtn.addEventListener('click', openLegend);
    if (legendClose) legendClose.addEventListener('click', closeLegend);
    if (legendBackdrop) legendBackdrop.addEventListener('click', closeLegend);
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !legendModal.classList.contains('hidden')) closeLegend();
    });
  }

  // ── Cross-tab navigation hook (used by Coverage drawer) ───
  window.__xeraFocus = (id) => {
    if (!id || !nodes.get(id)) return;
    network.unselectAll();
    network.selectNodes([id]);
    showPanel(id);
    scheduleDim(id);
    network.focus(id, {
      scale: 1.3,
      animation: { duration: 450, easingFunction: 'easeInOutQuad' },
    });
  };
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

// Task 27 — coverage map: QA action queue (3 sections + drawer)
const COV_STATUS_THEME = {
  UNCOVERED: { fill: '#3d1515', border: '#f87171', glow: 'rgba(239, 68, 68, 0.45)' },
  STALE: { fill: '#3d2c0d', border: '#fbbf24', glow: 'rgba(245, 158, 11, 0.45)' },
  COVERED: { fill: '#0d3320', border: '#34d399', glow: 'rgba(16, 185, 129, 0.4)' },
  ATRISK: { fill: '#2a1e0a', border: '#fb923c', glow: 'rgba(251, 146, 60, 0.45)' },
};

function covEscape(s) {
  return String(s).replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  );
}

function covTile(a, opts) {
  const theme = COV_STATUS_THEME[opts.themeKey || a.status] || COV_STATUS_THEME.COVERED;
  const heat = opts.heat;
  const pulse = opts.pulse ? ' data-pulse="true"' : '';
  const id = covEscape(a.id);
  return (
    `<article class="cov-tile" data-area-id="${id}" data-status="${a.status}"${pulse} ` +
    `style="--fill:${theme.fill};--border:${theme.border};--glow:${theme.glow};--heat:${heat}" ` +
    `tabindex="0" role="button" aria-label="${id} — ${a.status.toLowerCase()}, risk ${a.risk}">` +
    `<header class="cov-tile-head"><span class="cov-tile-status">${opts.statusLabel || a.status.toLowerCase()}</span>` +
    `<span class="cov-tile-risk" title="risk score">${a.risk}</span></header>` +
    `<h4 class="cov-tile-name">${id}</h4>` +
    `<dl class="cov-tile-meta">` +
    `<div><dt>tickets</dt><dd>${a.breakdown.recentTickets}</dd></div>` +
    `<div><dt>bugs</dt><dd>${a.breakdown.recentBugs}</dd></div>` +
    `</dl></article>`
  );
}

function covSection(opts) {
  const tilesHtml = opts.tiles.join('');
  const head =
    `<header class="cov-section-head"><span class="cov-section-icon ${opts.iconClass}"></span>` +
    `<h3 class="cov-section-title">${opts.title}</h3>` +
    `<span class="cov-section-count">${opts.count}</span>` +
    `<span class="cov-section-desc">${opts.desc}</span></header>`;
  if (opts.collapsed) {
    return `<details class="cov-section cov-section-collapsible"><summary>${head}</summary><div class="cov-grid">${tilesHtml}</div></details>`;
  }
  return `<section class="cov-section">${head}<div class="cov-grid">${tilesHtml}</div></section>`;
}

function renderCoverageMap() {
  const cov = window.__COVERAGE__;
  if (!cov) return;
  const canvas = document.getElementById('coverage-map-canvas');
  if (!canvas) return;
  canvas.innerHTML = '';

  if (!cov.report.areas.length) {
    canvas.innerHTML =
      '<p class="cov-empty">No SUT areas tracked yet — run <code>/xera-fetch</code> on a ticket with acceptance criteria to populate.</p>';
    return;
  }

  const areas = cov.report.areas;
  const needs = areas
    .filter((a) => a.status === 'UNCOVERED' || a.status === 'STALE')
    .sort((a, b) => b.risk - a.risk);
  const covered = areas.filter((a) => a.status === 'COVERED').sort((a, b) => b.risk - a.risk);
  // "At risk": top 1/3 of covered by risk (min 1, only if risk > 0)
  const atRiskCount = covered.length ? Math.max(1, Math.ceil(covered.length / 3)) : 0;
  const atRisk = covered.slice(0, atRiskCount).filter((a) => a.risk > 0);
  const healthy = covered.filter((a) => !atRisk.includes(a));
  const topRisk = areas.reduce((m, a) => (a.risk > m.risk ? a : m), areas[0]);
  const maxRisk = Math.max(...areas.map((a) => a.risk), 1);
  const heatFor = (a) => 0.35 + 0.65 * (a.risk / maxRisk);

  // Summary bar
  const urgent = needs.length ? ' cov-summary-stat-urgent' : '';
  const summary =
    `<div class="cov-summary">` +
    `<div class="cov-summary-stat${urgent}"><span class="cov-summary-num">${needs.length}</span><span class="cov-summary-label">need action</span></div>` +
    `<div class="cov-summary-divider"></div>` +
    `<div class="cov-summary-stat"><span class="cov-summary-num">${atRisk.length}</span><span class="cov-summary-label">at risk</span></div>` +
    `<div class="cov-summary-divider"></div>` +
    `<div class="cov-summary-stat"><span class="cov-summary-num">${healthy.length}</span><span class="cov-summary-label">healthy</span></div>` +
    `<div class="cov-summary-top">` +
    `<span class="cov-summary-top-label">top risk</span>` +
    `<button class="cov-summary-top-btn" data-area-id="${covEscape(topRisk.id)}">${covEscape(topRisk.id)} <span class="cov-summary-top-risk">${topRisk.risk}</span></button>` +
    `</div>` +
    `</div>`;

  let html = summary;

  if (needs.length) {
    const tiles = needs.map((a, idx) =>
      covTile(a, { heat: heatFor(a), pulse: idx === 0 && a.risk > 0 }),
    );
    html += covSection({
      title: 'Needs attention',
      desc: 'Write new tests or refresh stale ones',
      iconClass: 'cov-section-icon-urgent',
      count: needs.length,
      tiles,
    });
  }

  if (atRisk.length) {
    const tiles = atRisk.map((a) =>
      covTile(a, {
        themeKey: 'ATRISK',
        statusLabel: 'at risk',
        heat: heatFor(a),
      }),
    );
    html += covSection({
      title: 'At risk',
      desc: 'Covered, but recently changed — re-run scenarios after each merge',
      iconClass: 'cov-section-icon-warn',
      count: atRisk.length,
      tiles,
    });
  }

  if (healthy.length) {
    const tiles = healthy.map((a) => covTile(a, { heat: heatFor(a) }));
    html += covSection({
      title: 'Healthy',
      desc: 'Low recent activity, well-covered',
      iconClass: 'cov-section-icon-ok',
      count: healthy.length,
      tiles,
      collapsed: needs.length > 0 || atRisk.length > 0, // collapse if there's anything actionable above
    });
  }

  canvas.innerHTML = html;
  attachCovHandlers();
}

// ── Coverage drawer ──────────────────────────────────────
function attachCovHandlers() {
  document.querySelectorAll('.cov-tile').forEach((t) => {
    t.addEventListener('click', () => openCovDrawer(t.dataset.areaId));
    t.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        openCovDrawer(t.dataset.areaId);
      }
    });
  });
  document.querySelectorAll('.cov-summary-top-btn').forEach((b) => {
    b.addEventListener('click', () => openCovDrawer(b.dataset.areaId));
  });
  const closeBtn = document.getElementById('cov-drawer-close');
  if (closeBtn && !closeBtn.dataset.bound) {
    closeBtn.dataset.bound = '1';
    closeBtn.addEventListener('click', closeCovDrawer);
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') closeCovDrawer();
    });
  }
}

function openCovDrawer(areaId) {
  const cov = window.__COVERAGE__;
  const graph = window.__GRAPH__;
  if (!cov || !graph) return;
  const area = cov.report.areas.find((a) => a.id === areaId);
  if (!area) return;

  const drawer = document.getElementById('cov-drawer');
  const status = document.getElementById('cov-drawer-status');
  const title = document.getElementById('cov-drawer-title');
  const body = document.getElementById('cov-drawer-body');
  if (!drawer || !status || !title || !body) return;

  const theme = COV_STATUS_THEME[area.status] || COV_STATUS_THEME.COVERED;
  status.textContent = area.status.toLowerCase();
  status.style.color = theme.border;
  status.style.background = `${theme.fill}`;
  status.style.borderColor = theme.border;
  title.textContent = area.id;

  // Find connected nodes (1-hop) from graph
  const connected = new Set();
  for (const e of graph.edges) {
    if (e.from === areaId) connected.add(e.to);
    if (e.to === areaId) connected.add(e.from);
  }
  const nodesById = {};
  for (const n of graph.nodes) nodesById[n.id] = n;
  const connectedTickets = [...connected].filter((id) => nodesById[id]?.group === 'Ticket');
  const connectedScenarios = [...connected].filter((id) => nodesById[id]?.group === 'Scenario');

  const passCount = connectedScenarios.filter((id) => nodesById[id]?.color !== '#EF4444').length;
  const failCount = connectedScenarios.length - passCount;

  // AC gaps among connected tickets
  const acGaps = (cov.report.tickets || []).filter(
    (t) => connectedTickets.includes(t.id) && t.unsatisfiedAcs?.length,
  );

  const riskBreakdown = `
    <section class="cov-drawer-section">
      <h4>Risk breakdown</h4>
      <div class="cov-drawer-risk">
        <div class="cov-drawer-risk-num">${area.risk}</div>
        <ul class="cov-drawer-risk-meta">
          <li><span>${area.breakdown.recentTickets}</span> recent tickets</li>
          <li><span>${area.breakdown.recentBugs}</span> recent bugs</li>
          ${area.breakdown.criticalBoost ? '<li class="cov-drawer-risk-crit">⚠ critical area</li>' : ''}
        </ul>
      </div>
    </section>`;

  const scenariosSection = connectedScenarios.length
    ? `<section class="cov-drawer-section">
        <h4>Scenarios <span class="cov-drawer-count">${connectedScenarios.length}</span></h4>
        <div class="cov-drawer-pillrow">
          ${passCount ? `<span class="cov-drawer-pill cov-pill-pass">${passCount} passing</span>` : ''}
          ${failCount ? `<span class="cov-drawer-pill cov-pill-fail">${failCount} failing</span>` : ''}
        </div>
        <ul class="cov-drawer-list">
          ${connectedScenarios
            .map((id) => {
              const n = nodesById[id];
              const fail = n?.color === '#EF4444';
              return `<li><button class="cov-drawer-item" data-focus-id="${covEscape(id)}"><i class="cov-dot ${fail ? 'cov-dot-fail' : 'cov-dot-pass'}"></i><span>${covEscape(n?.label || id)}</span></button></li>`;
            })
            .join('')}
        </ul>
      </section>`
    : '';

  const ticketsSection = connectedTickets.length
    ? `<section class="cov-drawer-section">
        <h4>Tickets touching this area <span class="cov-drawer-count">${connectedTickets.length}</span></h4>
        <ul class="cov-drawer-list">
          ${connectedTickets
            .map((id) => {
              const n = nodesById[id];
              return `<li><button class="cov-drawer-item" data-focus-id="${covEscape(id)}"><i class="cov-dot cov-dot-ticket"></i><span>${covEscape(id)}${n?.title ? ` — ${covEscape(n.title.replace(/^[A-Z]+-\d+\s*[—–-]\s*/, ''))}` : ''}</span></button></li>`;
            })
            .join('')}
        </ul>
      </section>`
    : '';

  const acSection = acGaps.length
    ? `<section class="cov-drawer-section">
        <h4>AC gaps <span class="cov-drawer-count">${acGaps.reduce((s, t) => s + t.unsatisfiedAcs.length, 0)}</span></h4>
        <ul class="cov-drawer-list cov-drawer-list-stack">
          ${acGaps
            .map(
              (t) =>
                `<li><div class="cov-drawer-ac"><strong>${covEscape(t.id)}</strong> — ${t.satisfiedCount}/${t.acCount} covered<div class="cov-drawer-ac-tags">${t.unsatisfiedAcs.map((ac) => `<span class="cov-drawer-ac-tag">AC-${ac.index}</span>`).join('')}</div></div></li>`,
            )
            .join('')}
        </ul>
      </section>`
    : '';

  const actions = `
    <section class="cov-drawer-actions">
      <button class="cov-drawer-action" data-focus-id="${covEscape(area.id)}">
        <span>View in graph</span>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 17L17 7"/><path d="M7 7h10v10"/></svg>
      </button>
    </section>`;

  body.innerHTML = riskBreakdown + scenariosSection + ticketsSection + acSection + actions;

  // Wire focus buttons → switch to Knowledge tab and select node
  body.querySelectorAll('[data-focus-id]').forEach((b) => {
    b.addEventListener('click', () => {
      const id = b.dataset.focusId;
      closeCovDrawer();
      const knowledgeBtn = document.querySelector('.toplevel-tabs button[data-tab="knowledge"]');
      if (knowledgeBtn && !knowledgeBtn.classList.contains('active')) knowledgeBtn.click();
      requestAnimationFrame(() => {
        if (typeof window.__xeraFocus === 'function') window.__xeraFocus(id);
      });
    });
  });

  drawer.classList.remove('hidden');
  drawer.setAttribute('aria-hidden', 'false');
}

function closeCovDrawer() {
  const drawer = document.getElementById('cov-drawer');
  if (!drawer) return;
  drawer.classList.add('hidden');
  drawer.setAttribute('aria-hidden', 'true');
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
