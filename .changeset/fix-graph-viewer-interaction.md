---
"@xera-ai/core": patch
---

fix(graph): viewer click freeze, panel show/hide bugs, and crash on rapid clicks

- Pre-compute adjacency map at init; cache node/edge id arrays so neighbor lookup and batched DataSet updates are O(N) instead of O(N²)
- Track current dim state (`dimmedFor`) so clicking the same node is a no-op, and switching nodes skips redundant updates
- Defer the heavy dim/highlight work to `requestAnimationFrame` with debouncing — the side panel opens immediately, the dim animation runs on the next frame, and rapid clicks only apply the final state (no flicker)
- Guard physics toggle with an internal `physicsOn` flag so `setOptions({physics:{enabled:…}})` is never called redundantly — fixes the browser crash when clicking a selected node repeatedly
- Use `selectNode`/`deselectNode` events with a 0ms deferral instead of the generic `click` event so panning the canvas no longer spuriously closes the panel and dragging a node no longer reopens it
- Reposition the side panel as `position: absolute` with a `transform: translateX(…)` transition so the canvas keeps its full width — eliminates the layout reflow / vis-network resize jank when the panel toggles
- Fix the scenario pass/fail/p0 filter which was previously a no-op (`n.group` was already stripped from DataSet items)
- Index nodes for search at init so search-as-you-type batches a single DataSet update
