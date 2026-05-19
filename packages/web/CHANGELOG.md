# @xera-ai/web

## 0.15.5

### Patch Changes

- Updated dependencies []:
  - @xera-ai/core@0.15.5

## 0.15.4

### Patch Changes

- [#144](https://github.com/xera-ai/xera/pull/144) [`8b6630d`](https://github.com/xera-ai/xera/commit/8b6630d6670c34a556636e7a665bbf9c31c66a2e) Thanks [@thanhtrinity](https://github.com/thanhtrinity)! - emit .d.ts type defs for core, http, web packages (auto-generated from [#144](https://github.com/xera-ai/xera/issues/144))

- Updated dependencies [[`8b6630d`](https://github.com/xera-ai/xera/commit/8b6630d6670c34a556636e7a665bbf9c31c66a2e)]:
  - @xera-ai/core@0.15.4

## 0.15.3

### Patch Changes

- [#141](https://github.com/xera-ai/xera/pull/141) [`36250b3`](https://github.com/xera-ai/xera/commit/36250b3d921c9d348c89c95f0d3843321e93cab7) Thanks [@thanhtrinity](https://github.com/thanhtrinity)! - address 9 verified bugs across core, http, web packages (auto-generated from [#141](https://github.com/xera-ai/xera/issues/141))

- Updated dependencies [[`36250b3`](https://github.com/xera-ai/xera/commit/36250b3d921c9d348c89c95f0d3843321e93cab7)]:
  - @xera-ai/core@0.15.3

## 0.15.2

### Patch Changes

- Updated dependencies [[`cc25421`](https://github.com/xera-ai/xera/commit/cc2542184ceca561ce7c62ebe4bc9b60358e9720)]:
  - @xera-ai/core@0.15.2

## 0.15.1

### Patch Changes

- Updated dependencies [[`953e462`](https://github.com/xera-ai/xera/commit/953e462240f6c30b9a987b82b2e595ae0c49a568)]:
  - @xera-ai/core@0.15.1

## 0.15.0

### Patch Changes

- Updated dependencies [[`e2f8694`](https://github.com/xera-ai/xera/commit/e2f8694017cc06f00515d8dc605ec7c2a8634925)]:
  - @xera-ai/core@0.15.0

## 0.14.0

### Patch Changes

- Updated dependencies [[`f1baccd`](https://github.com/xera-ai/xera/commit/f1baccd268379b22c366ea1a2563e4d4d67ce293)]:
  - @xera-ai/core@0.14.0

## 0.13.1

### Patch Changes

- Updated dependencies []:
  - @xera-ai/core@0.13.1

## 0.13.0

### Patch Changes

- Updated dependencies [[`4fa674a`](https://github.com/xera-ai/xera/commit/4fa674acb2bcd892c48b39382dfdb606bcfe150a)]:
  - @xera-ai/core@0.13.0

## 0.12.3

### Patch Changes

- Updated dependencies [[`ca549e7`](https://github.com/xera-ai/xera/commit/ca549e7d8bd67bd1f48fce41ce7fadefce81b0a4)]:
  - @xera-ai/core@0.12.3

## 0.12.2

### Patch Changes

- Updated dependencies [[`b0cf739`](https://github.com/xera-ai/xera/commit/b0cf739adc84559657f1381dabbc88b442a53b12)]:
  - @xera-ai/core@0.12.2

## 0.12.1

### Patch Changes

- Updated dependencies [[`89e051d`](https://github.com/xera-ai/xera/commit/89e051d8f7a6e6e7aa16e73f4548c6cd1b3218bc), [`e899cd4`](https://github.com/xera-ai/xera/commit/e899cd46eceb1f6e50e4cf34b6d39b8d34ee3a51), [`40a1488`](https://github.com/xera-ai/xera/commit/40a1488a7f0e5bbf697361a250977c680aca0dd3), [`2a6fcf4`](https://github.com/xera-ai/xera/commit/2a6fcf49d366e7cbac273e3a78fd4dcd6a943e94)]:
  - @xera-ai/core@0.12.1

## 0.12.0

### Minor Changes

- [#86](https://github.com/xera-ai/xera/pull/86) [`7ba0b72`](https://github.com/xera-ai/xera/commit/7ba0b723dc43faa4a5046c9c992c023d3003b360) Thanks [@thanhtrinity](https://github.com/thanhtrinity)! - skills: add /xera-explore (experimental) — opt-in adversarial scenario generator beyond AC

  Introduces `/xera-explore <TICKET>`, a QA-internal skill that proposes 5-10 adversarial Gherkin scenarios beyond the ticket's acceptance criteria (negative paths, boundaries, races, a11y, security smells, etc.). Output lands in `.xera/<TICKET>/explore.feature` (separate from `test.feature`) tagged `@adversarial` for selective execution. The skill is opt-in and NOT auto-chained from `/xera-run`.

  - New prompt: `adversarial-scenarios.md` v0.1.0 — 8-category heuristic checklist, concrete-value rule, NONCE-wrapped untrusted input handling.
  - New skill: `xera-explore.md` — interactive UX with two QA checkpoints (category focus + concrete concern hint, then per-proposal acceptance).
  - New binaries: `explore-prepare`, `explore-finalize`.
  - Status: experimental. No golden-eval coverage yet; no `xera.config.ts.explore` knobs yet (both deferred). Graph event emission deferred to next release.

### Patch Changes

- Updated dependencies [[`7ba0b72`](https://github.com/xera-ai/xera/commit/7ba0b723dc43faa4a5046c9c992c023d3003b360)]:
  - @xera-ai/core@0.12.0

## 0.11.6

### Patch Changes

- [#84](https://github.com/xera-ai/xera/pull/84) [`b429632`](https://github.com/xera-ai/xera/commit/b4296322af798e81bd468c4ebb5fb6c9f4be2ed7) Thanks [@thanhtrinity](https://github.com/thanhtrinity)! - thread XERA_BASE_URL into xera:auth-setup browser context (auto-generated from [#84](https://github.com/xera-ai/xera/issues/84))

- Updated dependencies [[`b429632`](https://github.com/xera-ai/xera/commit/b4296322af798e81bd468c4ebb5fb6c9f4be2ed7)]:
  - @xera-ai/core@0.11.6

## 0.11.5

### Patch Changes

- Updated dependencies [[`3d3d535`](https://github.com/xera-ai/xera/commit/3d3d535af464be0b28777e1a648b149a0507d9d3), [`9633a1d`](https://github.com/xera-ai/xera/commit/9633a1dc988627d0f06f95d00bf5a479bbf8135e), [`675ddc4`](https://github.com/xera-ai/xera/commit/675ddc4dfaf7e1f38f02808b0b7bb0fe0568bb3a)]:
  - @xera-ai/core@0.11.5

## 0.11.4

### Patch Changes

- [#76](https://github.com/xera-ai/xera/pull/76) [`d097516`](https://github.com/xera-ai/xera/commit/d09751623137c3bc355af27bb6d6b8fca4a7cf02) Thanks [@thanhtrinity](https://github.com/thanhtrinity)! - Use bunx instead of npx to invoke tsc in typecheckTicket, fixing reliability in bun-managed workspaces

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
