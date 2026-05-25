# @xera-ai/skills

## 0.20.0

### Minor Changes

- [#183](https://github.com/xera-ai/xera/pull/183) [`f414f6b`](https://github.com/xera-ai/xera/commit/f414f6b8ca69121d8df4591fdfe9c6645d4eeaf9) Thanks [@thanhtrinity](https://github.com/thanhtrinity)! - Migrate the toolchain from Bun to Node.js + Vitest + npm. Published bins now use a `node` shebang and the runtime no longer depends on Bun APIs (Node >=22 required); builds use tsup. End-user workflows — skills, `xera init` scaffolding, `doctor`, and the graph-viewer CI template — now invoke `npx xera-internal` and npm instead of `bun run xera:*`.

## 0.19.0

### Minor Changes

- [#182](https://github.com/xera-ai/xera/pull/182) [`04074de`](https://github.com/xera-ai/xera/commit/04074de213851232a832471df34548da76b094b5) Thanks [@thanhtrinity](https://github.com/thanhtrinity)! - CONTRACT_DRIFT on web traces + self-heal (auto-generated from [#182](https://github.com/xera-ai/xera/issues/182))

## 0.18.0

### Minor Changes

- [#179](https://github.com/xera-ai/xera/pull/179) [`a21ca17`](https://github.com/xera-ai/xera/commit/a21ca17bff782443b22353af05c17961077101e2) Thanks [@thanhtrinity](https://github.com/thanhtrinity)! - generate features from OpenAPI (/xera-feature --from-spec) (auto-generated from [#179](https://github.com/xera-ai/xera/issues/179))

## 0.17.2

## 0.17.1

## 0.17.0

## 0.16.3

## 0.16.2

## 0.16.1

## 0.16.0

### Minor Changes

- [#146](https://github.com/xera-ai/xera/pull/146) [`5990dde`](https://github.com/xera-ai/xera/commit/5990dde002d3a9a9dfc6b095fba9666f831bd5de) Thanks [@thanhtrinity](https://github.com/thanhtrinity)! - feat: support GitHub Issues as an alternative issue tracker

  Adds a tracker-agnostic `IssueProvider` abstraction so projects can use
  either Jira (existing default) or GitHub Issues. The GitHub backend uses
  the GitHub MCP when available and falls back to the `gh` CLI — no token
  env vars are required.

  Configure via `xera.config.ts`:

  ```ts
  export default defineConfig({
    github: { repo: "owner/repo" }, // instead of `jira: { ... }`
    // ...rest unchanged
  });
  ```

  `xera init` adds a `--tracker github` flag (and an interactive prompt) so
  scaffolds can target GitHub Issues from day one. GitHub ticket keys take
  the form `GH-<number>` (e.g. `/xera-fetch GH-42`).

  `xera doctor` checks `gh auth status` when the github tracker is configured
  and the GitHub MCP is not in use, so auth issues surface before pipeline
  runs. `xera-report` posts comments via `mcp__github__add_issue_comment` or
  falls back to `gh issue comment`. `xera-promote` is tracker-agnostic.

  Backwards-compatible: existing Jira configs are unchanged.

### Patch Changes

- [#151](https://github.com/xera-ai/xera/pull/151) [`f3d8906`](https://github.com/xera-ai/xera/commit/f3d8906403ec362cd75ffe13a09730494819cc5d) Thanks [@thanhtrinity](https://github.com/thanhtrinity)! - unblock /xera-run on first invocation ([#149](https://github.com/xera-ai/xera/issues/149)) (auto-generated from [#151](https://github.com/xera-ai/xera/issues/151))

## 0.15.5

## 0.15.4

## 0.15.3

## 0.15.2

## 0.15.1

## 0.15.0

### Minor Changes

- [#123](https://github.com/xera-ai/xera/pull/123) [`e2f8694`](https://github.com/xera-ai/xera/commit/e2f8694017cc06f00515d8dc605ec7c2a8634925) Thanks [@thanhtrinity](https://github.com/thanhtrinity)! - deterministic OpenAPI loading + opt-in sample tickets (auto-generated from [#123](https://github.com/xera-ai/xera/issues/123))

## 0.14.0

### Minor Changes

- [#121](https://github.com/xera-ai/xera/pull/121) [`f1baccd`](https://github.com/xera-ai/xera/commit/f1baccd268379b22c366ea1a2563e4d4d67ce293) Thanks [@thanhtrinity](https://github.com/thanhtrinity)! - trustworthy coverage — SKIPPED bucket, additive AC backfill, normalize emits run.completed (auto-generated from [#121](https://github.com/xera-ai/xera/issues/121))

## 0.13.1

## 0.13.0

### Minor Changes

- [#114](https://github.com/xera-ai/xera/pull/114) [`4fa674a`](https://github.com/xera-ai/xera/commit/4fa674acb2bcd892c48b39382dfdb606bcfe150a) Thanks [@thanhtrinity](https://github.com/thanhtrinity)! - extract AC from description body when Jira has no dedicated AC field (auto-generated from [#114](https://github.com/xera-ai/xera/issues/114))

## 0.12.3

### Patch Changes

- [#111](https://github.com/xera-ai/xera/pull/111) [`ca549e7`](https://github.com/xera-ai/xera/commit/ca549e7d8bd67bd1f48fce41ce7fadefce81b0a4) Thanks [@thanhtrinity](https://github.com/thanhtrinity)! - surface silent modifiesAreas=[] fallback across graph-record, doctor, xera-run (auto-generated from [#111](https://github.com/xera-ai/xera/issues/111))

## 0.12.2

## 0.12.1

### Patch Changes

- [#100](https://github.com/xera-ai/xera/pull/100) [`40a1488`](https://github.com/xera-ai/xera/commit/40a1488a7f0e5bbf697361a250977c680aca0dd3) Thanks [@thanhtrinity](https://github.com/thanhtrinity)! - core,cli,skills: strict config schema + remove unwired `testOutdated` config docs

  - `XeraConfigSchema` is now `strictObject` and rejects unknown top-level keys instead of silently stripping them. This surfaces config typos and aspirational keys (e.g. `testOutdated`, `report`) at parse time with a clear Zod error ([#94](https://github.com/xera-ai/xera/issues/94)).
  - Docs (`CONFIGURATION.md`, `TROUBLESHOOTING.md`) and the `/xera-report` skill no longer reference the unwired `testOutdated.threshold` / `report.testOutdatedNotify` keys; those tuning hooks are tracked for a future release.
  - Followup to [#95](https://github.com/xera-ai/xera/issues/95) / [#92](https://github.com/xera-ai/xera/issues/92): the http-only `.env.example` template comment now references `.env` (the canonical filename) instead of `.env.local`.

## 0.12.0

### Minor Changes

- [#86](https://github.com/xera-ai/xera/pull/86) [`7ba0b72`](https://github.com/xera-ai/xera/commit/7ba0b723dc43faa4a5046c9c992c023d3003b360) Thanks [@thanhtrinity](https://github.com/thanhtrinity)! - skills: add /xera-explore (experimental) — opt-in adversarial scenario generator beyond AC

  Introduces `/xera-explore <TICKET>`, a QA-internal skill that proposes 5-10 adversarial Gherkin scenarios beyond the ticket's acceptance criteria (negative paths, boundaries, races, a11y, security smells, etc.). Output lands in `.xera/<TICKET>/explore.feature` (separate from `test.feature`) tagged `@adversarial` for selective execution. The skill is opt-in and NOT auto-chained from `/xera-run`.

  - New prompt: `adversarial-scenarios.md` v0.1.0 — 8-category heuristic checklist, concrete-value rule, NONCE-wrapped untrusted input handling.
  - New skill: `xera-explore.md` — interactive UX with two QA checkpoints (category focus + concrete concern hint, then per-proposal acceptance).
  - New binaries: `explore-prepare`, `explore-finalize`.
  - Status: experimental. No golden-eval coverage yet; no `xera.config.ts.explore` knobs yet (both deferred). Graph event emission deferred to next release.

## 0.11.6

## 0.11.5

## 0.11.4

## 0.11.3

## 0.11.2

### Patch Changes

- [#70](https://github.com/xera-ai/xera/pull/70) [`7374f86`](https://github.com/xera-ai/xera/commit/7374f869a0436301fb6517c32f984482b5bde501) Thanks [@thanhtrinity](https://github.com/thanhtrinity)! - fix(core,skills): `xera:graph-enrich` now checks the graph snapshot before the input file (so an un-fetched candidate gets the actionable `/xera-fetch <TICKET>` hint), and deletes `enrichment-input.json` after a successful enrich so stray re-invocations can't replay stale LLM output. The `/xera-report` lazy-similarity step now pre-validates the candidate is in the graph and notes that the Write tool auto-creates the candidate directory.

## 0.11.1

## 0.11.0

## 0.10.0

### Minor Changes

- [#64](https://github.com/xera-ai/xera/pull/64) [`c5aca3c`](https://github.com/xera-ai/xera/commit/c5aca3c95362ca99de6b072e68173933a4a23035) Thanks [@thanhtrinity](https://github.com/thanhtrinity)! - v0.8 — Coverage gap & AC matrix

  QA teams now get an actionable "where to write tests next" surface built on top of the v0.6 project knowledge graph.

  **New skills:**

  - `/xera-coverage` — area-level + AC-level coverage report. Areas classify as UNCOVERED (no POM covers it), STALE (POM exists but no PASS in 30d), or COVERED. Risk-weighted gap list with `--why` drill-down. AC backfill auto-orchestrates on first invocation to map legacy scenarios → ACs via `map-ac-to-scenarios.md` prompt.
  - `/xera-fill-gap <area>` and `/xera-fill-gap --ticket <TICKET>` — AI-drafted Gherkin scenarios for UNCOVERED areas or unsatisfied ACs. Atomic boundary — produces `.xera/<TICKET>/feature.draft.md`, user iterates and invokes `/xera-script` when ready.

  **HTML viewer Coverage tab** (`/xera-coverage --viewer`):

  - Map sub-tab — vis-network recolors area nodes by status (red/amber/green)
  - List sub-tab — sortable area table + per-ticket AC gap matrix
  - Trend sub-tab — inline SVG line chart of UNCOVERED+STALE count over time

  **Graph schema additions:**

  - New node kind `ACNode` (id = `${ticketId}#ac-${index}`)
  - New edge kind `satisfies` (Scenario → AC, eager from `/xera-script` or lazy from backfill)
  - New `Snapshot` projections: `acNodes`, `classifications`
  - New event types `coverage.snapshot` (history for Trend) and `ac-coverage.backfilled` (materializes satisfies edges idempotently)

  **Config additions** (`xera.config.ts`):

  ```ts
  coverage: {
    staleAfterDays: 30,           // default
    criticalAreas: [],             // boost ×2 in risk formula
    autoSnapshotOnCoverage: true,  // emit trend snapshots
  }
  ```

  **Doctor checks added:**

  - Warns when `coverage.staleAfterDays > 90`
  - Warns when `criticalAreas` slug is missing from snapshot
  - Warns when a ticket has ACs but no `ACNode` materialized

  **Internals:**

  - 5 new xera-internal subcommands: `coverage-prepare`, `ac-coverage-backfill-{prepare,finalize}`, `fill-gap-{prepare,finalize}`
  - 2 new prompt templates: `map-ac-to-scenarios.md`, `propose-scenarios.md` (in-scope prompt count now 11)
  - New `packages/core/src/coverage/` module (pure functions: status, risk, report, why)
  - 6 golden fixtures in `fixtures/golden-coverage/` covering UNCOVERED, STALE, COVERED, critical-boost, bug-history, AC gap scenarios

  See full spec at `docs/superpowers/specs/2026-05-17-xera-v08-coverage-gap-design.md`.

## 0.9.8

## 0.9.7

## 0.9.6

## 0.9.5

## 0.9.4

## 0.9.3

### Patch Changes

- [#49](https://github.com/xera-ai/xera/pull/49) [`f1e9d90`](https://github.com/xera-ai/xera/commit/f1e9d903a923206d3d5603e033ceb968581655c9) Thanks [@thanhtrinity](https://github.com/thanhtrinity)! - copy graph templates into dist/bin/ during build (auto-generated from [#49](https://github.com/xera-ai/xera/issues/49))

## 0.9.2

## 0.9.1

## 0.9.0

## 0.8.1
