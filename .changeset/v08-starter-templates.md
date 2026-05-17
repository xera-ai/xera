---
"@xera-ai/cli": minor
---

cli: starter templates now seed v0.8 coverage block + CI viewer renders Coverage tab

`bunx @xera-ai/cli init` now generates a `coverage` block in the scaffolded `xera.config.ts` (for all three shapes: web, api, mixed) so new users see the `staleAfterDays`, `criticalAreas`, and `autoSnapshotOnCoverage` knobs out of the box. The `xera-graph.yml` CI workflow template also runs `xera:coverage-prepare` and passes `--include-coverage` to `graph-render` so the auto-uploaded PR viewer artifact includes the Coverage tab.
