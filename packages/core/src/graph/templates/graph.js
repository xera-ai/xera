(() => {
  var data = window.__GRAPH__ || { nodes: [], edges: [] };
  var container = document.getElementById('canvas');
  if (!container || typeof vis === 'undefined') {
    document.body.innerHTML =
      '<p style="padding:20px;color:#6B7280">Failed to load vis-network. Check console.</p>';
    return;
  }

  var nodes = new vis.DataSet(data.nodes);
  var edges = new vis.DataSet(data.edges);
  var network = new vis.Network(
    container,
    { nodes: nodes, edges: edges },
    {
      physics: { stabilization: { iterations: 200 } },
      interaction: { hover: true, navigationButtons: true, keyboard: true },
      edges: {
        smooth: { type: 'continuous', forceDirection: 'none', roundness: 0.4 },
        font: { size: 9, color: '#6B7280' },
      },
      nodes: { font: { size: 11, color: '#1F2937' } },
    },
  );

  network.once('stabilizationIterationsDone', () => network.fit());

  var sidepanel = document.getElementById('sidepanel');
  var spTitle = document.getElementById('sp-title');
  var spDesc = document.getElementById('sp-desc');
  var spActions = document.getElementById('sp-actions');

  network.on('click', (params) => {
    if (params.nodes.length === 0) {
      sidepanel.classList.add('hidden');
      return;
    }
    var nodeId = params.nodes[0];
    var node = nodes.get(nodeId);
    spTitle.textContent = node.label;
    spDesc.textContent = node.title || '';
    spActions.innerHTML = '';
    var btn = null;
    if (node.group === 'Ticket') {
      btn = document.createElement('button');
      btn.textContent = 'Copy /xera-impact command';
      btn.onclick = () => {
        navigator.clipboard?.writeText(`/xera-impact ${nodeId}`);
      };
      spActions.appendChild(btn);
    }
    sidepanel.classList.remove('hidden');

    // Highlight ego-graph (depth 2)
    var connected = network.getConnectedNodes(nodeId);
    var connected2 = [];
    connected.forEach((id) => {
      Array.prototype.push.apply(connected2, network.getConnectedNodes(id));
    });
    var keep = new Set([nodeId].concat(connected).concat(connected2));
    nodes.forEach((n) => {
      var update = { id: n.id, opacity: keep.has(n.id) ? 1 : 0.2 };
      nodes.update(update);
    });
  });

  document.getElementById('reset').onclick = () => {
    nodes.forEach((n) => {
      nodes.update({ id: n.id, opacity: 1 });
    });
    sidepanel.classList.add('hidden');
    network.fit();
  };

  document.getElementById('search').oninput = (e) => {
    var q = e.target.value.toLowerCase();
    if (!q) {
      nodes.forEach((n) => {
        nodes.update({ id: n.id, opacity: 1 });
      });
      return;
    }
    nodes.forEach((n) => {
      var matches =
        (n.label || '').toLowerCase().includes(q) || (n.id || '').toLowerCase().includes(q);
      nodes.update({ id: n.id, opacity: matches ? 1 : 0.2 });
    });
  };

  ['filter-pass', 'filter-fail', 'filter-p0'].forEach((id) => {
    document.getElementById(id).onchange = () => {
      var pass = document.getElementById('filter-pass').checked;
      var fail = document.getElementById('filter-fail').checked;
      nodes.forEach((n) => {
        if (n.group !== 'Scenario') return;
        var visible = true;
        if (n.color === '#10B981' && !pass) visible = false;
        if (n.color === '#EF4444' && !fail) visible = false;
        nodes.update({ id: n.id, hidden: !visible });
      });
    };
  });
})();
