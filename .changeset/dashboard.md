---
"@xera-ai/core": minor
"@xera-ai/cli": minor
"@xera-ai/web": patch
"@xera-ai/http": patch
"@xera-ai/skills": patch
"@xera-ai/prompts": patch
---

feat: xera dashboard — cross-ticket aggregate of latest test results

New `xera dashboard` command aggregates `.xera/<TICKET>/status.json` across the project. Renders text (default, ANSI colors when TTY), `--json` (CI integration), `--html <path>` (file), and `--serve` (interactive HTML at 127.0.0.1:9323 with sortable/filterable table + click-through to per-ticket Playwright reports).

Filters: `--since`, `--classification` (repeatable), `--area` (repeatable), `--failing-only`. New optional `dashboard: { staleAfterDays, recentFailureLimit }` config block.

Companion to the v0.6 graph viewer (structure) and v0.8 coverage report (AC satisfaction). Closes the "no project-level test result view" gap surfaced by QA leads needing a daily standup readout.

Refactor: `serveHtmlFile` extracted from `xera show-report` into shared `packages/cli/src/serve.ts` so both commands use the same static-server implementation (and the `open` package dep is replaced with platform-native `open`/`start`/`xdg-open` spawn).
