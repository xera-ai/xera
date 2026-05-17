---
"@xera-ai/core": patch
---

fix(graph): viewer canvas layout and node drift on load

- Replace first-occurrence `{{GENERATED_AT}}` substitution with a global regex so the footer timestamp renders correctly
- Fix CSS grid: make `[data-tab-panel]` sections span full grid columns and collapse the sidebar column when the side panel is hidden
- Hide canvas during vis-network stabilization (opacity 0→1 fade) so users never see intermediate physics frames; disable physics after stabilization completes to freeze node positions
- Re-enable physics on `dragStart` and disable again 1500 ms after `dragEnd` so connected nodes still react when a node is dragged
