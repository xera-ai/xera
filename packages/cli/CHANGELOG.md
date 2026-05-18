# @xera-ai/cli

## 0.14.0

### Patch Changes

- Updated dependencies [[`f1baccd`](https://github.com/xera-ai/xera/commit/f1baccd268379b22c366ea1a2563e4d4d67ce293)]:
  - @xera-ai/core@0.14.0
  - @xera-ai/skills@0.14.0

## 0.13.1

### Patch Changes

- [#116](https://github.com/xera-ai/xera/pull/116) [`6dbee5b`](https://github.com/xera-ai/xera/commit/6dbee5bea3774cd6da43c78699eebc2f73568a7a) Thanks [@thanhtrinity](https://github.com/thanhtrinity)! - cli: scaffold skills + commands for Cursor and OpenAI Codex CLI alongside Claude Code

  `xera init` and `xera init --update` now accept `--editor <list>` where
  `<list>` is a comma-separated subset of `claude`, `cursor`, `codex`, or
  `all`. With `--yes` and no existing editor markers (`.claude/`,
  `.cursor/`, `.agents/`), the default is `all` — fresh projects get
  integration for every supported editor. With existing markers, only
  detected editors are scaffolded (treats existing layout as the user's
  choice). Interactive mode shows a multi-select with `claude` pre-checked.

  `xera init --update` without `--editor` refreshes only editors already
  present (does not surprise-add a new editor). To opt in to a new editor
  on an existing project: `xera init --update --editor cursor`.

  `xera doctor` runs per-editor checks under distinct names
  (`xera skills present (claude)`, `(cursor)`, `(codex)`) so multi-editor
  projects don't see false negatives.

  Implementation: new `packages/cli/src/editors/` module with one adapter
  per editor (`claude.ts`, `cursor.ts`, `codex.ts`) implementing a shared
  `EditorAdapter` interface. Single source of truth for skill bodies stays
  in `@xera-ai/skills`; Cursor's RULE.md frontmatter is transformed at
  scaffold time.

  Behavior change to note for users tracking local edits: `init --update`
  no longer prompts per-skill on diffs (the 3-way prompt from PR [#106](https://github.com/xera-ai/xera/issues/106)). It
  now always overwrites with the latest `@xera-ai/skills` content, after
  auto-migrating any legacy flat `.claude/skills/<name>.md` layout. Commit
  local edits in your consumer repo before running `--update` if you want
  to preserve them.

- Updated dependencies []:
  - @xera-ai/core@0.13.1
  - @xera-ai/skills@0.13.1

## 0.13.0

### Minor Changes

- [#114](https://github.com/xera-ai/xera/pull/114) [`4fa674a`](https://github.com/xera-ai/xera/commit/4fa674acb2bcd892c48b39382dfdb606bcfe150a) Thanks [@thanhtrinity](https://github.com/thanhtrinity)! - extract AC from description body when Jira has no dedicated AC field (auto-generated from [#114](https://github.com/xera-ai/xera/issues/114))

### Patch Changes

- Updated dependencies [[`4fa674a`](https://github.com/xera-ai/xera/commit/4fa674acb2bcd892c48b39382dfdb606bcfe150a)]:
  - @xera-ai/core@0.13.0
  - @xera-ai/skills@0.13.0

## 0.12.3

### Patch Changes

- [#111](https://github.com/xera-ai/xera/pull/111) [`ca549e7`](https://github.com/xera-ai/xera/commit/ca549e7d8bd67bd1f48fce41ce7fadefce81b0a4) Thanks [@thanhtrinity](https://github.com/thanhtrinity)! - surface silent modifiesAreas=[] fallback across graph-record, doctor, xera-run (auto-generated from [#111](https://github.com/xera-ai/xera/issues/111))

- Updated dependencies [[`ca549e7`](https://github.com/xera-ai/xera/commit/ca549e7d8bd67bd1f48fce41ce7fadefce81b0a4)]:
  - @xera-ai/core@0.12.3
  - @xera-ai/skills@0.12.3

## 0.12.2

### Patch Changes

- [#106](https://github.com/xera-ai/xera/pull/106) [`d8c4f78`](https://github.com/xera-ai/xera/commit/d8c4f7826ee6cec96ecf2008ef28acb9fd6ddf91) Thanks [@thanhtrinity](https://github.com/thanhtrinity)! - cli: scaffold skills at `.claude/skills/<name>/SKILL.md` so Claude Code's Skill tool discovers them

  `xera init` previously wrote skills as flat `.claude/skills/<name>.md` files.
  Claude Code's slash-command discovery (`.claude/commands/<name>.md`) found
  them, so `/xera-run` etc. worked — but the Skill tool only discovers skills
  under `.claude/skills/<name>/SKILL.md` (directory + `SKILL.md` inside). Net
  effect: when `/xera-run` told the model to invoke `/xera-fetch` mid-pipeline,
  the Skill tool couldn't find it and the user had to run the steps manually.

  This applied to **all 12 scaffolded skills** (xera-run, xera-fetch,
  xera-feature, xera-script, xera-exec, xera-report, xera-promote, xera-impact,
  xera-coverage, xera-fill-gap, xera-explore, xera-eval) — every one of them
  went through the same flat-file scaffold loop.

  Changes:

  - `xera init` writes skills to `.claude/skills/<name>/SKILL.md` (directory
    layout the Skill tool requires) and keeps the flat `.claude/commands/<name>.md`
    for slash-command discovery — both surfaces now work.
  - `xera init --update` migrates legacy flat skills in-place: if it finds the
    old `.claude/skills/<name>.md` and the new `<name>/SKILL.md` is missing, it
    moves the content into the new path (preserving any local edits) and removes
    the old file. A single overwrite prompt still applies to both targets.
  - `xera doctor` flags the legacy flat layout with a clear hint pointing users
    at `xera init --update` to migrate.
  - New integration test pins the scaffold layout; new doctor unit tests cover
    the pass / legacy-flat detection paths.

- Updated dependencies [[`b0cf739`](https://github.com/xera-ai/xera/commit/b0cf739adc84559657f1381dabbc88b442a53b12)]:
  - @xera-ai/core@0.12.2
  - @xera-ai/skills@0.12.2

## 0.12.1

### Patch Changes

- [#101](https://github.com/xera-ai/xera/pull/101) [`398ed71`](https://github.com/xera-ai/xera/commit/398ed718bbc0ee1c77d1c08362a86d21a3d90585) Thanks [@thanhtrinity](https://github.com/thanhtrinity)! - standardize `defaultEnv` to 'staging' across all init shapes (auto-generated from [#101](https://github.com/xera-ai/xera/issues/101))

- [#95](https://github.com/xera-ai/xera/pull/95) [`d304929`](https://github.com/xera-ai/xera/commit/d304929d58be65165224d9d9c123fdf39052d1f1) Thanks [@thanhtrinity](https://github.com/thanhtrinity)! - warn loudly when `init --update --shape` would change adapters (auto-generated from [#95](https://github.com/xera-ai/xera/issues/95))

- [#100](https://github.com/xera-ai/xera/pull/100) [`40a1488`](https://github.com/xera-ai/xera/commit/40a1488a7f0e5bbf697361a250977c680aca0dd3) Thanks [@thanhtrinity](https://github.com/thanhtrinity)! - core,cli,skills: strict config schema + remove unwired `testOutdated` config docs

  - `XeraConfigSchema` is now `strictObject` and rejects unknown top-level keys instead of silently stripping them. This surfaces config typos and aspirational keys (e.g. `testOutdated`, `report`) at parse time with a clear Zod error ([#94](https://github.com/xera-ai/xera/issues/94)).
  - Docs (`CONFIGURATION.md`, `TROUBLESHOOTING.md`) and the `/xera-report` skill no longer reference the unwired `testOutdated.threshold` / `report.testOutdatedNotify` keys; those tuning hooks are tracked for a future release.
  - Followup to [#95](https://github.com/xera-ai/xera/issues/95) / [#92](https://github.com/xera-ai/xera/issues/92): the http-only `.env.example` template comment now references `.env` (the canonical filename) instead of `.env.local`.

- Updated dependencies [[`89e051d`](https://github.com/xera-ai/xera/commit/89e051d8f7a6e6e7aa16e73f4548c6cd1b3218bc), [`e899cd4`](https://github.com/xera-ai/xera/commit/e899cd46eceb1f6e50e4cf34b6d39b8d34ee3a51), [`40a1488`](https://github.com/xera-ai/xera/commit/40a1488a7f0e5bbf697361a250977c680aca0dd3), [`2a6fcf4`](https://github.com/xera-ai/xera/commit/2a6fcf49d366e7cbac273e3a78fd4dcd6a943e94)]:
  - @xera-ai/core@0.12.1
  - @xera-ai/skills@0.12.1

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
  - @xera-ai/skills@0.12.0

## 0.11.6

### Patch Changes

- [#84](https://github.com/xera-ai/xera/pull/84) [`b429632`](https://github.com/xera-ai/xera/commit/b4296322af798e81bd468c4ebb5fb6c9f4be2ed7) Thanks [@thanhtrinity](https://github.com/thanhtrinity)! - thread XERA_BASE_URL into xera:auth-setup browser context (auto-generated from [#84](https://github.com/xera-ai/xera/issues/84))

- Updated dependencies [[`b429632`](https://github.com/xera-ai/xera/commit/b4296322af798e81bd468c4ebb5fb6c9f4be2ed7)]:
  - @xera-ai/core@0.11.6
  - @xera-ai/skills@0.11.6

## 0.11.5

### Patch Changes

- Updated dependencies [[`3d3d535`](https://github.com/xera-ai/xera/commit/3d3d535af464be0b28777e1a648b149a0507d9d3), [`9633a1d`](https://github.com/xera-ai/xera/commit/9633a1dc988627d0f06f95d00bf5a479bbf8135e), [`675ddc4`](https://github.com/xera-ai/xera/commit/675ddc4dfaf7e1f38f02808b0b7bb0fe0568bb3a)]:
  - @xera-ai/core@0.11.5
  - @xera-ai/skills@0.11.5

## 0.11.4

### Patch Changes

- [#76](https://github.com/xera-ai/xera/pull/76) [`d097516`](https://github.com/xera-ai/xera/commit/d09751623137c3bc355af27bb6d6b8fca4a7cf02) Thanks [@thanhtrinity](https://github.com/thanhtrinity)! - fix(cli): `xera init --update` now also refreshes `.claude/commands/` (Claude Code slash-command discovery) in addition to `.claude/skills/`, and registers the `xera:coverage-prepare` script so the v0.8.0+ Coverage tab in the PR graph viewer works after upgrade.

- Updated dependencies []:
  - @xera-ai/core@0.11.4
  - @xera-ai/skills@0.11.4

## 0.11.3

### Patch Changes

- Updated dependencies [[`76b065f`](https://github.com/xera-ai/xera/commit/76b065f42a8748e72fe46e5e1b36150a456f7a74), [`700747f`](https://github.com/xera-ai/xera/commit/700747f10cd2d824af631b33471865ee2e74f321)]:
  - @xera-ai/core@0.11.3
  - @xera-ai/skills@0.11.3

## 0.11.2

### Patch Changes

- Updated dependencies [[`7374f86`](https://github.com/xera-ai/xera/commit/7374f869a0436301fb6517c32f984482b5bde501)]:
  - @xera-ai/core@0.11.2
  - @xera-ai/skills@0.11.2

## 0.11.1

### Patch Changes

- [#68](https://github.com/xera-ai/xera/pull/68) [`2665d7b`](https://github.com/xera-ai/xera/commit/2665d7b7bfa070e9e3b205bcb72801f83d670599) Thanks [@thanhtrinity](https://github.com/thanhtrinity)! - fix(cli): `xera init --update` now also refreshes `.claude/commands/` (Claude Code slash-command discovery) in addition to `.claude/skills/`, and registers the `xera:coverage-prepare` script so the v0.8.0+ Coverage tab in the PR graph viewer works after upgrade.

- Updated dependencies []:
  - @xera-ai/core@0.11.1
  - @xera-ai/skills@0.11.1

## 0.11.0

### Minor Changes

- [#66](https://github.com/xera-ai/xera/pull/66) [`7301987`](https://github.com/xera-ai/xera/commit/73019873afe73b60a4b120d433ac315c4d94162d) Thanks [@thanhtrinity](https://github.com/thanhtrinity)! - cli: starter templates now seed v0.8 coverage block + CI viewer renders Coverage tab

  `bunx @xera-ai/cli init` now generates a `coverage` block in the scaffolded `xera.config.ts` (for all three shapes: web, api, mixed) so new users see the `staleAfterDays`, `criticalAreas`, and `autoSnapshotOnCoverage` knobs out of the box. The `xera-graph.yml` CI workflow template also runs `xera:coverage-prepare` and passes `--include-coverage` to `graph-render` so the auto-uploaded PR viewer artifact includes the Coverage tab.

### Patch Changes

- Updated dependencies []:
  - @xera-ai/core@0.11.0
  - @xera-ai/skills@0.11.0

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
  - @xera-ai/skills@0.10.0

## 0.9.8

### Patch Changes

- Updated dependencies [[`5d7d137`](https://github.com/xera-ai/xera/commit/5d7d1373c100b65c9ec33777e15558a6a3ba2e65)]:
  - @xera-ai/core@0.9.8
  - @xera-ai/skills@0.9.8

## 0.9.7

### Patch Changes

- [#60](https://github.com/xera-ai/xera/pull/60) [`a0ac08f`](https://github.com/xera-ai/xera/commit/a0ac08fcc897e599a203c7b385a474b2ff3e4160) Thanks [@thanhtrinity](https://github.com/thanhtrinity)! - load dotenv at xera-internal entry point so all subcommands have env vars; revert dotenv from playwright.config.ts templates

- [#57](https://github.com/xera-ai/xera/pull/57) [`434622d`](https://github.com/xera-ai/xera/commit/434622d22d66b1079e8c8cd3855cd4faa6d94990) Thanks [@thanhtrinity](https://github.com/thanhtrinity)! - fix mixed config template env var names to match .env.example (TEST\_ prefix, \_PWD suffix)

- [#59](https://github.com/xera-ai/xera/pull/59) [`5c080c0`](https://github.com/xera-ai/xera/commit/5c080c0cf7d6f254835bfe80e0e12f2ec942adb6) Thanks [@thanhtrinity](https://github.com/thanhtrinity)! - load .env.local then .env in playwright.config.ts so credentials are available to Playwright

- Updated dependencies [[`a0ac08f`](https://github.com/xera-ai/xera/commit/a0ac08fcc897e599a203c7b385a474b2ff3e4160)]:
  - @xera-ai/core@0.9.7
  - @xera-ai/skills@0.9.7

## 0.9.6

### Patch Changes

- [#55](https://github.com/xera-ai/xera/pull/55) [`097add0`](https://github.com/xera-ai/xera/commit/097add0eefd042d5bef864167a3dec115291ea9b) Thanks [@thanhtrinity](https://github.com/thanhtrinity)! - remove SAMPLE-HTTP-001 http sample from xera init scaffold

- Updated dependencies []:
  - @xera-ai/core@0.9.6
  - @xera-ai/skills@0.9.6

## 0.9.5

### Patch Changes

- [#53](https://github.com/xera-ai/xera/pull/53) [`1ab6a42`](https://github.com/xera-ai/xera/commit/1ab6a42085528965ccc8c293e78005cdd65deba6) Thanks [@thanhtrinity](https://github.com/thanhtrinity)! - remove SAMPLE-001 web sample from xera init scaffold

- Updated dependencies []:
  - @xera-ai/core@0.9.5
  - @xera-ai/skills@0.9.5

## 0.9.4

### Patch Changes

- Updated dependencies [[`9c77460`](https://github.com/xera-ai/xera/commit/9c77460e62c6040c4042360463c93adbb62a7dff)]:
  - @xera-ai/core@0.9.4
  - @xera-ai/skills@0.9.4

## 0.9.3

### Patch Changes

- Updated dependencies [[`f1e9d90`](https://github.com/xera-ai/xera/commit/f1e9d903a923206d3d5603e033ceb968581655c9)]:
  - @xera-ai/core@0.9.3
  - @xera-ai/skills@0.9.3

## 0.9.2

### Patch Changes

- [#47](https://github.com/xera-ai/xera/pull/47) [`71cd48e`](https://github.com/xera-ai/xera/commit/71cd48ec88aa52d7a66c50ff1cc10cc8d23a6f71) Thanks [@thanhtrinity](https://github.com/thanhtrinity)! - replace hardcoded version strings with dynamic reads (auto-generated from [#47](https://github.com/xera-ai/xera/issues/47))

- Updated dependencies [[`71cd48e`](https://github.com/xera-ai/xera/commit/71cd48ec88aa52d7a66c50ff1cc10cc8d23a6f71)]:
  - @xera-ai/core@0.9.2
  - @xera-ai/skills@0.9.2

## 0.9.1

### Patch Changes

- [#43](https://github.com/xera-ai/xera/pull/43) [`dd68ca4`](https://github.com/xera-ai/xera/commit/dd68ca4da174dfd8f18f007dd4b56dcb90649ac5) Thanks [@thanhtrinity](https://github.com/thanhtrinity)! - production-ready UX — help on no args, unknown cmd, non-TTY guard (auto-generated from [#43](https://github.com/xera-ai/xera/issues/43))

- [#43](https://github.com/xera-ai/xera/pull/43) [`dd68ca4`](https://github.com/xera-ai/xera/commit/dd68ca4da174dfd8f18f007dd4b56dcb90649ac5) Thanks [@thanhtrinity](https://github.com/thanhtrinity)! - fix(cli): production-ready UX — help on no args, unknown cmd with did-you-mean, non-TTY guard

- Updated dependencies []:
  - @xera-ai/core@0.9.1
  - @xera-ai/skills@0.9.1

## 0.9.0

### Minor Changes

- [#38](https://github.com/xera-ai/xera/pull/38) [`b3bb9b4`](https://github.com/xera-ai/xera/commit/b3bb9b46c6b304a49ba4b8e19c6eed1cc9faded5) Thanks [@thanhtrinity](https://github.com/thanhtrinity)! - add non-interactive flags and shortcuts to xera init (auto-generated from [#38](https://github.com/xera-ai/xera/issues/38))

### Patch Changes

- Updated dependencies []:
  - @xera-ai/core@0.9.0
  - @xera-ai/skills@0.9.0

## 0.8.1

### Patch Changes

- Updated dependencies [[`6589625`](https://github.com/xera-ai/xera/commit/658962579399182fcb67e6d0dbe243c46a88c654)]:
  - @xera-ai/core@0.8.1
  - @xera-ai/skills@0.8.1

## 0.3.3

### Patch Changes

- [#30](https://github.com/xera-ai/xera/pull/30) [`1913505`](https://github.com/xera-ai/xera/commit/1913505433379f23a48e94728ccd171b571829c9) Thanks [@thanhtrinity](https://github.com/thanhtrinity)! - use --packages external in build (unblock release pipeline) (auto-generated from [#30](https://github.com/xera-ai/xera/issues/30))
