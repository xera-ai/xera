(() => {
  var data = window.__GRAPH__ || { nodes: [], edges: [] };
  var container = document.getElementById('canvas');
  if (!container || typeof vis === 'undefined') {
    document.body.innerHTML =
      '<p style="padding:20px;color:#6B7280">Failed to load vis-network. Check console.</p>';
    return;
  }

  function trunc(s, n) {
    return s && s.length > n ? s.slice(0, n - 1) + '…' : s;
  }

  var nodeData = data.nodes.map(function(n) {
    return Object.assign({}, n, { label: trunc(n.label, 28) });
  });

  var nodes = new vis.DataSet(nodeData);
  var edges = new vis.DataSet(data.edges);
  var network = new vis.Network(
    container,
    { nodes: nodes, edges: edges },
    {
      physics: {
        barnesHut: {
          gravitationalConstant: -8000,
          springLength: 140,
          springConstant: 0.03,
          damping: 0.2,
        },
        stabilization: { iterations: 300, updateInterval: 25 },
      },
      interaction: {
        hover: true,
        navigationButtons: false,
        keyboard: true,
        tooltipDelay: 150,
      },
      edges: {
        smooth: { type: 'continuous', forceDirection: 'none', roundness: 0.3 },
        font: { size: 9, color: '#475569', strokeWidth: 0, align: 'middle' },
        color: { color: '#334155', highlight: '#60a5fa', hover: '#60a5fa' },
        width: 1.2,
        arrows: { to: { enabled: true, scaleFactor: 0.6 } },
      },
      nodes: {
        font: { size: 11, color: '#f1f5f9', strokeWidth: 2, strokeColor: '#0f172a' },
        borderWidth: 1.5,
        borderWidthSelected: 3,
        shadow: { enabled: true, color: 'rgba(0,0,0,.5)', size: 8, x: 2, y: 2 },
      },
    },
  );

  network.once('stabilizationIterationsDone', () => network.fit({ animation: { duration: 400, easingFunction: 'easeInOutQuad' } }));

  var sidepanel = document.getElementById('sidepanel');
  var spTitle = document.getElementById('sp-title');
  var spGroup = document.getElementById('sp-group');
  var spDesc = document.getElementById('sp-desc');
  var spActions = document.getElementById('sp-actions');

  network.on('click', (params) => {
    if (params.nodes.length === 0) {
      sidepanel.classList.add('hidden');
      resetOpacity();
      return;
    }
    var nodeId = params.nodes[0];
    var node = data.nodes.find(function(n) { return n.id === nodeId; });
    if (!node) return;
    spTitle.textContent = node.label;
    spGroup.textContent = node.group || '';
    spDesc.textContent = node.title || '';
    spActions.innerHTML = '';
    if (node.group === 'Ticket') {
      var btn = document.createElement('button');
      btn.textContent = 'Copy /xera-impact ' + nodeId;
      btn.onclick = () => {
        navigator.clipboard?.writeText('/xera-impact ' + nodeId);
        btn.textContent = 'Copied!';
        setTimeout(() => { btn.textContent = 'Copy /xera-impact ' + nodeId; }, 1500);
      };
      spActions.appendChild(btn);
    }
    sidepanel.classList.remove('hidden');
    highlightEgo(nodeId);
  });

  function highlightEgo(nodeId) {
    var connected = network.getConnectedNodes(nodeId);
    var connected2 = [];
    connected.forEach(function(id) {
      Array.prototype.push.apply(connected2, network.getConnectedNodes(id));
    });
    var keep = new Set([nodeId].concat(connected).concat(connected2));
    nodes.forEach(function(n) {
      nodes.update({ id: n.id, opacity: keep.has(n.id) ? 1 : 0.12 });
    });
  }

  function resetOpacity() {
    nodes.forEach(function(n) { nodes.update({ id: n.id, opacity: 1 }); });
  }

  document.getElementById('reset').onclick = () => {
    resetOpacity();
    sidepanel.classList.add('hidden');
    network.fit({ animation: { duration: 300, easingFunction: 'easeInOutQuad' } });
  };

  document.getElementById('search').oninput = (e) => {
    var q = e.target.value.toLowerCase();
    if (!q) { resetOpacity(); return; }
    nodes.forEach(function(n) {
      var orig = data.nodes.find(function(x) { return x.id === n.id; });
      var matches =
        (orig && (orig.label || '').toLowerCase().includes(q)) ||
        String(n.id || '').toLowerCase().includes(q);
      nodes.update({ id: n.id, opacity: matches ? 1 : 0.12 });
    });
  };

  ['filter-pass', 'filter-fail', 'filter-p0'].forEach((id) => {
    document.getElementById(id).onchange = () => {
      var pass = document.getElementById('filter-pass').checked;
      var fail = document.getElementById('filter-fail').checked;
      nodes.forEach(function(n) {
        if (n.group !== 'Scenario') return;
        var visible = true;
        if (n.color === '#10B981' && !pass) visible = false;
        if (n.color === '#EF4444' && !fail) visible = false;
        nodes.update({ id: n.id, hidden: !visible });
      });
    };
  });
})();
