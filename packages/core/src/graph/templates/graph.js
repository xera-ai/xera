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

  // ── Progress bar ─────────────────────────────────────
  var progressBar = document.getElementById('progress-bar');
  network.on('stabilizationProgress', (p) => {
    progressBar.style.width = `${Math.round((p.iterations / p.total) * 100)}%`;
  });
  network.once('stabilizationIterationsDone', () => {
    progressBar.style.width = '100%';
    setTimeout(() => {
      progressBar.style.transition = 'opacity .4s';
      progressBar.style.opacity = '0';
    }, 300);
    network.fit({ animation: { duration: 500, easingFunction: 'easeInOutQuad' } });
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

  function dimOthers(nodeId) {
    var hop1 = new Set(network.getConnectedNodes(nodeId));
    var hop2 = new Set();
    for (const id of hop1) {
      for (const x of network.getConnectedNodes(id)) {
        hop2.add(x);
      }
    }
    var keep = new Set([nodeId, ...hop1, ...hop2]);
    for (const n of nodes.get()) {
      nodes.update({ id: n.id, opacity: keep.has(n.id) ? 1 : 0.1 });
    }
    for (const e of edges.get()) {
      const visible = keep.has(e.from) && keep.has(e.to);
      edges.update({
        id: e.id,
        color: Object.assign({}, e.color, { opacity: visible ? 0.8 : 0.06 }),
      });
    }
  }

  function resetView() {
    for (const n of nodes.get()) {
      nodes.update({ id: n.id, opacity: 1 });
    }
    for (const e of edges.get()) {
      edges.update({ id: e.id, color: Object.assign({}, e.color, { opacity: 0.8 }) });
    }
    sidepanel.classList.add('hidden');
  }

  network.on('click', (params) => {
    if (params.nodes.length === 0) {
      resetView();
      return;
    }
    showPanel(params.nodes[0]);
    dimOthers(params.nodes[0]);
  });

  // ── Controls ─────────────────────────────────────────
  document.getElementById('reset-btn').onclick = () => {
    resetView();
    network.fit({ animation: { duration: 350, easingFunction: 'easeInOutQuad' } });
  };

  document.getElementById('search').oninput = (e) => {
    const q = e.target.value.toLowerCase();
    if (!q) {
      resetView();
      return;
    }
    for (const n of nodes.get()) {
      const orig = data.nodes.find((x) => x.id === n.id);
      const hit =
        String(n.id).toLowerCase().includes(q) ||
        (orig?.label ?? '').toLowerCase().includes(q) ||
        (orig?.title ?? '').toLowerCase().includes(q);
      nodes.update({ id: n.id, opacity: hit ? 1 : 0.08 });
    }
  };

  ['filter-pass', 'filter-fail', 'filter-p0'].forEach((id) => {
    document.getElementById(id).onchange = () => {
      const pass = document.getElementById('filter-pass').checked;
      const fail = document.getElementById('filter-fail').checked;
      for (const n of nodes.get()) {
        if (n.group !== 'Scenario') continue;
        const orig = data.nodes.find((x) => x.id === n.id);
        const isPass = orig?.color === '#10B981';
        const isFail = orig?.color === '#EF4444';
        const hidden = (isPass && !pass) || (isFail && !fail);
        nodes.update({ id: n.id, hidden });
      }
    };
  });
})();
