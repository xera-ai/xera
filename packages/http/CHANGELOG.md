# @xera-ai/http

## 0.11.5

### Patch Changes

- Updated dependencies [[`3d3d535`](https://github.com/xera-ai/xera/commit/3d3d535af464be0b28777e1a648b149a0507d9d3), [`9633a1d`](https://github.com/xera-ai/xera/commit/9633a1dc988627d0f06f95d00bf5a479bbf8135e), [`675ddc4`](https://github.com/xera-ai/xera/commit/675ddc4dfaf7e1f38f02808b0b7bb0fe0568bb3a)]:
  - @xera-ai/core@0.11.5

## 0.11.4

### Patch Changes

- Updated dependencies []:
  - @xera-ai/core@0.11.4

## 0.11.3

### Patch Changes

- Updated dependencies [[`76b065f`](https://github.com/xera-ai/xera/commit/76b065f42a8748e72fe46e5e1b36150a456f7a74), [`700747f`](https://github.com/xera-ai/xera/commit/700747f10cd2d824af631b33471865ee2e74f321)]:
  - @xera-ai/core@0.11.3

## 0.11.2

### Patch Changes

- Updated dependencies [[`7374f86`](https://github.com/xera-ai/xera/commit/7374f869a0436301fb6517c32f984482b5bde501)]:
  - @xera-ai/core@0.11.2

## 0.11.1

### Patch Changes

- Updated dependencies []:
  - @xera-ai/core@0.11.1

## 0.11.0

### Patch Changes

- Updated dependencies []:
  - @xera-ai/core@0.11.0

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

### Patch Changes

- Updated dependencies [[`c5aca3c`](https://github.com/xera-ai/xera/commit/c5aca3c95362ca99de6b072e68173933a4a23035)]:
  - @xera-ai/core@0.10.0

## 0.9.8

### Patch Changes

- Updated dependencies [[`5d7d137`](https://github.com/xera-ai/xera/commit/5d7d1373c100b65c9ec33777e15558a6a3ba2e65)]:
  - @xera-ai/core@0.9.8

## 0.9.7

### Patch Changes

- Updated dependencies [[`a0ac08f`](https://github.com/xera-ai/xera/commit/a0ac08fcc897e599a203c7b385a474b2ff3e4160)]:
  - @xera-ai/core@0.9.7

## 0.9.6

### Patch Changes

- Updated dependencies []:
  - @xera-ai/core@0.9.6

## 0.9.5

### Patch Changes

- Updated dependencies []:
  - @xera-ai/core@0.9.5

## 0.9.4

### Patch Changes

- Updated dependencies [[`9c77460`](https://github.com/xera-ai/xera/commit/9c77460e62c6040c4042360463c93adbb62a7dff)]:
  - @xera-ai/core@0.9.4

## 0.9.3

### Patch Changes

- Updated dependencies [[`f1e9d90`](https://github.com/xera-ai/xera/commit/f1e9d903a923206d3d5603e033ceb968581655c9)]:
  - @xera-ai/core@0.9.3

## 0.9.2

### Patch Changes

- Updated dependencies [[`71cd48e`](https://github.com/xera-ai/xera/commit/71cd48ec88aa52d7a66c50ff1cc10cc8d23a6f71)]:
  - @xera-ai/core@0.9.2

## 0.9.1

### Patch Changes

- Updated dependencies []:
  - @xera-ai/core@0.9.1

## 0.9.0

### Patch Changes

- Updated dependencies []:
  - @xera-ai/core@0.9.0

## 0.8.1

### Patch Changes

- Updated dependencies [[`6589625`](https://github.com/xera-ai/xera/commit/658962579399182fcb67e6d0dbe243c46a88c654)]:
  - @xera-ai/core@0.8.1
