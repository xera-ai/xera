# @xera-ai/prompts

## 0.24.1

## 0.24.0

### Patch Changes

- [#239](https://github.com/xera-ai/xera/pull/239) [`01bbd81`](https://github.com/xera-ai/xera/commit/01bbd81a95a90a868405ff59a78952721859fdf0) Thanks [@thanhtrinity](https://github.com/thanhtrinity)! - feat: auth refresh for reuse-web-session (closes [#221](https://github.com/xera-ai/xera/issues/221))

  Two complementary refresh mechanisms eliminate the "auth expired mid-suite" failure mode for reuse-web-session projects:

  **Pre-flight refresh (automatic, always on):** `xera-internal exec` and `xera-internal stage-auth` check the http auth file at Step 0. If it's within `http.auth.refreshBuffer` of expiring AND the web auth file is still fresh, they auto-re-derive the http file from the still-valid web `storageState`. No IDP calls; just a fresh AES-encrypted file. Covers ~80% of pain (single-ticket runs under 15 minutes).

  **Mid-suite refresh (opt-in):** new `reuseWebSession.refresh: { endpoint, method, csrfHeader? }` config block enables a runtime proxy on `newAuthedContext`. The proxy auto-refreshes via your configured endpoint before each request that would arrive after expiry. Updates cookies in place via `Set-Cookie` parsing, persists encrypted, re-lifts CSRF header per request. Generic IDP-agnostic — works with any endpoint that returns 2xx with a new access cookie via `Set-Cookie` (Microsoft Entra, Okta). Auth0 (body-returned tokens) falls back to pre-flight only.

  Concurrent refreshes guarded by a process-local mutex. Single attempt; failure throws typed `RefreshFailedError` with response status + endpoint. Includes in-house `parseSetCookie` (RFC 6265 minimal), mock IDP fixture for integration testing.

  New env vars: `XERA_REFRESH_BUFFER_MS` (default 60_000), `XERA_REFRESH_TTL_MS` (default 900_000).

  Backwards-compat: projects without `refresh` config behave exactly as v0.23.

## 0.23.0

### Patch Changes

- [#237](https://github.com/xera-ai/xera/pull/237) [`fa9adc4`](https://github.com/xera-ai/xera/commit/fa9adc4a2e1bd1ff851a1fbe7321cf72804d2f36) Thanks [@thanhtrinity](https://github.com/thanhtrinity)! - feat: xera dashboard — cross-ticket aggregate of latest test results

  New `xera dashboard` command aggregates `.xera/<TICKET>/status.json` across the project. Renders text (default, ANSI colors when TTY), `--json` (CI integration), `--html <path>` (file), and `--serve` (interactive HTML at 127.0.0.1:9323 with sortable/filterable table + click-through to per-ticket Playwright reports).

  Filters: `--since`, `--classification` (repeatable), `--area` (repeatable), `--failing-only`. New optional `dashboard: { staleAfterDays, recentFailureLimit }` config block.

  Companion to the v0.6 graph viewer (structure) and v0.8 coverage report (AC satisfaction). Closes the "no project-level test result view" gap surfaced by QA leads needing a daily standup readout.

  Refactor: `serveHtmlFile` extracted from `xera show-report` into shared `packages/cli/src/serve.ts` so both commands use the same static-server implementation (and the `open` package dep is replaced with platform-native `open`/`start`/`xdg-open` spawn).

## 0.22.0

### Minor Changes

- [#235](https://github.com/xera-ai/xera/pull/235) [`45c215b`](https://github.com/xera-ai/xera/commit/45c215b15dc4117b05fa5c49e2b393ef933ab5f6) Thanks [@thanhtrinity](https://github.com/thanhtrinity)! - reuse-web-session strategy + AI cookie discovery (auto-generated from [#235](https://github.com/xera-ai/xera/issues/235))

## 0.21.2

## 0.21.1

## 0.21.0

## 0.20.6

## 0.20.5

## 0.20.4

## 0.20.3

## 0.20.2

### Patch Changes

- [#196](https://github.com/xera-ai/xera/pull/196) [`af33596`](https://github.com/xera-ai/xera/commit/af335966957b8e5ae6c60dfa1e9bd0420bbaa20b) Thanks [@thanhtrinity](https://github.com/thanhtrinity)! - CONTRACT_DRIFT URL matching + apiPath helper ([#193](https://github.com/xera-ai/xera/issues/193), [#194](https://github.com/xera-ai/xera/issues/194)) (auto-generated from [#196](https://github.com/xera-ai/xera/issues/196))

- [#206](https://github.com/xera-ai/xera/pull/206) [`f3b6df3`](https://github.com/xera-ai/xera/commit/f3b6df322e9503b5b3c9485b1bf1bef7f048706b) Thanks [@thanhtrinity](https://github.com/thanhtrinity)! - resolve nine triaged bugs across http/core/cli/prompts (auto-generated from [#206](https://github.com/xera-ai/xera/issues/206))

## 0.20.1

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

### Minor Changes

- [#173](https://github.com/xera-ai/xera/pull/173) [`1a47775`](https://github.com/xera-ai/xera/commit/1a4777555a87a0d35f028ee549d56d8c4aab1c04) Thanks [@thanhtrinity](https://github.com/thanhtrinity)! - make similarity candidate window configurable (default 100) (auto-generated from [#173](https://github.com/xera-ai/xera/issues/173))

## 0.16.3

## 0.16.2

## 0.16.1

## 0.16.0

## 0.15.5

## 0.15.4

## 0.15.3

## 0.15.2

## 0.15.1

## 0.15.0

## 0.14.0

### Minor Changes

- [#121](https://github.com/xera-ai/xera/pull/121) [`f1baccd`](https://github.com/xera-ai/xera/commit/f1baccd268379b22c366ea1a2563e4d4d67ce293) Thanks [@thanhtrinity](https://github.com/thanhtrinity)! - trustworthy coverage — SKIPPED bucket, additive AC backfill, normalize emits run.completed (auto-generated from [#121](https://github.com/xera-ai/xera/issues/121))

## 0.13.1

## 0.13.0

## 0.12.3

## 0.12.2

## 0.12.1

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

## 0.9.2

## 0.9.1

## 0.9.0

## 0.8.1
