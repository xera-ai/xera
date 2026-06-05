# @xera-ai/core

## 0.21.2

### Patch Changes

- Updated dependencies []:
  - @xera-ai/web@0.21.2
  - @xera-ai/http@0.21.2

## 0.21.1

### Patch Changes

- [#229](https://github.com/xera-ai/xera/pull/229) [`cd973a8`](https://github.com/xera-ai/xera/commit/cd973a890cb374e9a2fbd33e053eb2e273e22051) Thanks [@thanhtrinity](https://github.com/thanhtrinity)! - accept --reporter=html (equals form) in exec ([#224](https://github.com/xera-ai/xera/issues/224) follow-up) (auto-generated from [#229](https://github.com/xera-ai/xera/issues/229))

- Updated dependencies []:
  - @xera-ai/web@0.21.1
  - @xera-ai/http@0.21.1

## 0.21.0

### Minor Changes

- [#227](https://github.com/xera-ai/xera/pull/227) [`5695622`](https://github.com/xera-ai/xera/commit/569562219a20f7fac0b7816e62972fb0d4c40a68) Thanks [@thanhtrinity](https://github.com/thanhtrinity)! - HTML report enablement set ([#224](https://github.com/xera-ai/xera/issues/224), [#225](https://github.com/xera-ai/xera/issues/225), [#226](https://github.com/xera-ai/xera/issues/226)) (auto-generated from [#227](https://github.com/xera-ai/xera/issues/227))

### Patch Changes

- Updated dependencies [[`5695622`](https://github.com/xera-ai/xera/commit/569562219a20f7fac0b7816e62972fb0d4c40a68)]:
  - @xera-ai/web@0.21.0
  - @xera-ai/http@0.21.0

## 0.20.6

### Patch Changes

- [#208](https://github.com/xera-ai/xera/pull/208) [`d13f7a5`](https://github.com/xera-ai/xera/commit/d13f7a57a961327923669f33dbe4c02e0ecbaa9a) Thanks [@thanhtrinity](https://github.com/thanhtrinity)! - heal-prepare uses ariaSnapshot from error-bearing after events (auto-generated from [#208](https://github.com/xera-ai/xera/issues/208))

- [#222](https://github.com/xera-ai/xera/pull/222) [`1333f43`](https://github.com/xera-ai/xera/commit/1333f433665e4f28e255dfe674262b6e50e2b05c) Thanks [@thanhtrinity](https://github.com/thanhtrinity)! - align http auth strategy handling ([#218](https://github.com/xera-ai/xera/issues/218), [#219](https://github.com/xera-ai/xera/issues/219), [#220](https://github.com/xera-ai/xera/issues/220)) (auto-generated from [#222](https://github.com/xera-ai/xera/issues/222))

- Updated dependencies []:
  - @xera-ai/web@0.20.6
  - @xera-ai/http@0.20.6

## 0.20.5

### Patch Changes

- [#216](https://github.com/xera-ai/xera/pull/216) [`9127edd`](https://github.com/xera-ai/xera/commit/9127edd26edb21426e434a650b3f420968df8ce2) Thanks [@thanhtrinity](https://github.com/thanhtrinity)! - render AC labels 1-based in graph viewer + coverage CLI (auto-generated from [#216](https://github.com/xera-ai/xera/issues/216))

- Updated dependencies []:
  - @xera-ai/web@0.20.5
  - @xera-ai/http@0.20.5

## 0.20.4

### Patch Changes

- [#214](https://github.com/xera-ai/xera/pull/214) [`a5a6aa6`](https://github.com/xera-ai/xera/commit/a5a6aa67228133e37a7d513d079f6d075c8714f2) Thanks [@thanhtrinity](https://github.com/thanhtrinity)! - skip roles with missing creds + honor XERA_HEADED ([#212](https://github.com/xera-ai/xera/issues/212), [#213](https://github.com/xera-ai/xera/issues/213)) (auto-generated from [#214](https://github.com/xera-ai/xera/issues/214))

- Updated dependencies []:
  - @xera-ai/web@0.20.4
  - @xera-ai/http@0.20.4

## 0.20.3

### Patch Changes

- [#210](https://github.com/xera-ai/xera/pull/210) [`30cdb83`](https://github.com/xera-ai/xera/commit/30cdb83fb49ad2cea8473260f5fcd46cc8e48433) Thanks [@thanhtrinity](https://github.com/thanhtrinity)! - pass baseURL into exec auth-refresh ([#209](https://github.com/xera-ai/xera/issues/209)) (auto-generated from [#210](https://github.com/xera-ai/xera/issues/210))

- Updated dependencies []:
  - @xera-ai/web@0.20.3
  - @xera-ai/http@0.20.3

## 0.20.2

### Patch Changes

- [#206](https://github.com/xera-ai/xera/pull/206) [`f3b6df3`](https://github.com/xera-ai/xera/commit/f3b6df322e9503b5b3c9485b1bf1bef7f048706b) Thanks [@thanhtrinity](https://github.com/thanhtrinity)! - resolve nine triaged bugs across http/core/cli/prompts (auto-generated from [#206](https://github.com/xera-ai/xera/issues/206))

- Updated dependencies [[`af33596`](https://github.com/xera-ai/xera/commit/af335966957b8e5ae6c60dfa1e9bd0420bbaa20b), [`f3b6df3`](https://github.com/xera-ai/xera/commit/f3b6df322e9503b5b3c9485b1bf1bef7f048706b)]:
  - @xera-ai/http@0.20.2
  - @xera-ai/web@0.20.2

## 0.20.1

### Patch Changes

- Updated dependencies []:
  - @xera-ai/web@0.20.1
  - @xera-ai/http@0.20.1

## 0.20.0

### Minor Changes

- [#183](https://github.com/xera-ai/xera/pull/183) [`f414f6b`](https://github.com/xera-ai/xera/commit/f414f6b8ca69121d8df4591fdfe9c6645d4eeaf9) Thanks [@thanhtrinity](https://github.com/thanhtrinity)! - Migrate the toolchain from Bun to Node.js + Vitest + npm. Published bins now use a `node` shebang and the runtime no longer depends on Bun APIs (Node >=22 required); builds use tsup. End-user workflows — skills, `xera init` scaffolding, `doctor`, and the graph-viewer CI template — now invoke `npx xera-internal` and npm instead of `bun run xera:*`.

### Patch Changes

- Updated dependencies [[`f414f6b`](https://github.com/xera-ai/xera/commit/f414f6b8ca69121d8df4591fdfe9c6645d4eeaf9)]:
  - @xera-ai/web@0.20.0
  - @xera-ai/http@0.20.0

## 0.19.0

### Minor Changes

- [#182](https://github.com/xera-ai/xera/pull/182) [`04074de`](https://github.com/xera-ai/xera/commit/04074de213851232a832471df34548da76b094b5) Thanks [@thanhtrinity](https://github.com/thanhtrinity)! - CONTRACT_DRIFT on web traces + self-heal (auto-generated from [#182](https://github.com/xera-ai/xera/issues/182))

### Patch Changes

- Updated dependencies [[`04074de`](https://github.com/xera-ai/xera/commit/04074de213851232a832471df34548da76b094b5)]:
  - @xera-ai/web@0.19.0
  - @xera-ai/http@0.19.0

## 0.18.0

### Minor Changes

- [#179](https://github.com/xera-ai/xera/pull/179) [`a21ca17`](https://github.com/xera-ai/xera/commit/a21ca17bff782443b22353af05c17961077101e2) Thanks [@thanhtrinity](https://github.com/thanhtrinity)! - generate features from OpenAPI (/xera-feature --from-spec) (auto-generated from [#179](https://github.com/xera-ai/xera/issues/179))

### Patch Changes

- Updated dependencies [[`a21ca17`](https://github.com/xera-ai/xera/commit/a21ca17bff782443b22353af05c17961077101e2)]:
  - @xera-ai/http@0.18.0
  - @xera-ai/web@0.18.0

## 0.17.2

### Patch Changes

- [#176](https://github.com/xera-ai/xera/pull/176) [`2e4ac79`](https://github.com/xera-ai/xera/commit/2e4ac79586a3618b9ad2a5c1bd43b44d26af1398) Thanks [@thanhtrinity](https://github.com/thanhtrinity)! - scope viewer keyboard zoom to canvas so search input accepts "-" (auto-generated from [#176](https://github.com/xera-ai/xera/issues/176))

- Updated dependencies []:
  - @xera-ai/web@0.17.2
  - @xera-ai/http@0.17.2

## 0.17.1

### Patch Changes

- [#174](https://github.com/xera-ai/xera/pull/174) [`11bbbac`](https://github.com/xera-ai/xera/commit/11bbbac873bd7eb1362c51eb936dd7e3f759433b) Thanks [@thanhtrinity](https://github.com/thanhtrinity)! - side panel shows 3-state AC coverage (verified / broken / gap) (auto-generated from [#174](https://github.com/xera-ai/xera/issues/174))

- Updated dependencies []:
  - @xera-ai/web@0.17.1
  - @xera-ai/http@0.17.1

## 0.17.0

### Minor Changes

- [#171](https://github.com/xera-ai/xera/pull/171) [`0dd3339`](https://github.com/xera-ai/xera/commit/0dd3339e246705697ce25e1e57019d8298d15665) Thanks [@thanhtrinity](https://github.com/thanhtrinity)! - enrich ticket side panel with health / coverage / linked / freshness (auto-generated from [#171](https://github.com/xera-ai/xera/issues/171))

- [#173](https://github.com/xera-ai/xera/pull/173) [`1a47775`](https://github.com/xera-ai/xera/commit/1a4777555a87a0d35f028ee549d56d8c4aab1c04) Thanks [@thanhtrinity](https://github.com/thanhtrinity)! - make similarity candidate window configurable (default 100) (auto-generated from [#173](https://github.com/xera-ai/xera/issues/173))

### Patch Changes

- Updated dependencies []:
  - @xera-ai/http@0.17.0
  - @xera-ai/web@0.17.0

## 0.16.3

### Patch Changes

- [#169](https://github.com/xera-ai/xera/pull/169) [`6c311c7`](https://github.com/xera-ai/xera/commit/6c311c7f27728552efb5dd75344734cdb0116556) Thanks [@thanhtrinity](https://github.com/thanhtrinity)! - emit uses edges for POM classes without "Page" suffix (auto-generated from [#169](https://github.com/xera-ai/xera/issues/169))

- Updated dependencies []:
  - @xera-ai/web@0.16.3
  - @xera-ai/http@0.16.3

## 0.16.2

### Patch Changes

- [#164](https://github.com/xera-ai/xera/pull/164) [`4f3a72a`](https://github.com/xera-ai/xera/commit/4f3a72aee624f678c2706c365548f2304d5ce0f9) Thanks [@thanhtrinity](https://github.com/thanhtrinity)! - anchor failure triangles + classifier-aware viewer panel & legend (auto-generated from [#164](https://github.com/xera-ai/xera/issues/164))

- Updated dependencies []:
  - @xera-ai/web@0.16.2
  - @xera-ai/http@0.16.2

## 0.16.1

### Patch Changes

- Updated dependencies []:
  - @xera-ai/web@0.16.1
  - @xera-ai/http@0.16.1

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

- Updated dependencies []:
  - @xera-ai/http@0.16.0
  - @xera-ai/web@0.16.0

## 0.15.5

### Patch Changes

- Updated dependencies []:
  - @xera-ai/web@0.15.5
  - @xera-ai/http@0.15.5

## 0.15.4

### Patch Changes

- [#144](https://github.com/xera-ai/xera/pull/144) [`8b6630d`](https://github.com/xera-ai/xera/commit/8b6630d6670c34a556636e7a665bbf9c31c66a2e) Thanks [@thanhtrinity](https://github.com/thanhtrinity)! - emit .d.ts type defs for core, http, web packages (auto-generated from [#144](https://github.com/xera-ai/xera/issues/144))

- Updated dependencies [[`8b6630d`](https://github.com/xera-ai/xera/commit/8b6630d6670c34a556636e7a665bbf9c31c66a2e)]:
  - @xera-ai/http@0.15.4
  - @xera-ai/web@0.15.4

## 0.15.3

### Patch Changes

- [#141](https://github.com/xera-ai/xera/pull/141) [`36250b3`](https://github.com/xera-ai/xera/commit/36250b3d921c9d348c89c95f0d3843321e93cab7) Thanks [@thanhtrinity](https://github.com/thanhtrinity)! - address 9 verified bugs across core, http, web packages (auto-generated from [#141](https://github.com/xera-ai/xera/issues/141))

- Updated dependencies [[`36250b3`](https://github.com/xera-ai/xera/commit/36250b3d921c9d348c89c95f0d3843321e93cab7)]:
  - @xera-ai/http@0.15.3
  - @xera-ai/web@0.15.3

## 0.15.2

### Patch Changes

- [#128](https://github.com/xera-ai/xera/pull/128) [`cc25421`](https://github.com/xera-ai/xera/commit/cc2542184ceca561ce7c62ebe4bc9b60358e9720) Thanks [@thanhtrinity](https://github.com/thanhtrinity)! - widen TICKET_RE to accept any multi-segment ticket key (auto-generated from [#128](https://github.com/xera-ai/xera/issues/128))

- Updated dependencies []:
  - @xera-ai/web@0.15.2
  - @xera-ai/http@0.15.2

## 0.15.1

### Patch Changes

- [#125](https://github.com/xera-ai/xera/pull/125) [`953e462`](https://github.com/xera-ai/xera/commit/953e462240f6c30b9a987b82b2e595ae0c49a568) Thanks [@thanhtrinity](https://github.com/thanhtrinity)! - accept SAMPLE-HTTP-NNN ticket keys (unblocks `init --samples`) (auto-generated from [#125](https://github.com/xera-ai/xera/issues/125))

- Updated dependencies []:
  - @xera-ai/web@0.15.1
  - @xera-ai/http@0.15.1

## 0.15.0

### Minor Changes

- [#123](https://github.com/xera-ai/xera/pull/123) [`e2f8694`](https://github.com/xera-ai/xera/commit/e2f8694017cc06f00515d8dc605ec7c2a8634925) Thanks [@thanhtrinity](https://github.com/thanhtrinity)! - deterministic OpenAPI loading + opt-in sample tickets (auto-generated from [#123](https://github.com/xera-ai/xera/issues/123))

### Patch Changes

- Updated dependencies []:
  - @xera-ai/http@0.15.0
  - @xera-ai/web@0.15.0

## 0.14.0

### Minor Changes

- [#121](https://github.com/xera-ai/xera/pull/121) [`f1baccd`](https://github.com/xera-ai/xera/commit/f1baccd268379b22c366ea1a2563e4d4d67ce293) Thanks [@thanhtrinity](https://github.com/thanhtrinity)! - trustworthy coverage — SKIPPED bucket, additive AC backfill, normalize emits run.completed (auto-generated from [#121](https://github.com/xera-ai/xera/issues/121))

### Patch Changes

- Updated dependencies []:
  - @xera-ai/http@0.14.0
  - @xera-ai/web@0.14.0

## 0.13.1

### Patch Changes

- Updated dependencies []:
  - @xera-ai/web@0.13.1
  - @xera-ai/http@0.13.1

## 0.13.0

### Minor Changes

- [#114](https://github.com/xera-ai/xera/pull/114) [`4fa674a`](https://github.com/xera-ai/xera/commit/4fa674acb2bcd892c48b39382dfdb606bcfe150a) Thanks [@thanhtrinity](https://github.com/thanhtrinity)! - extract AC from description body when Jira has no dedicated AC field (auto-generated from [#114](https://github.com/xera-ai/xera/issues/114))

### Patch Changes

- Updated dependencies []:
  - @xera-ai/http@0.13.0
  - @xera-ai/web@0.13.0

## 0.12.3

### Patch Changes

- [#111](https://github.com/xera-ai/xera/pull/111) [`ca549e7`](https://github.com/xera-ai/xera/commit/ca549e7d8bd67bd1f48fce41ce7fadefce81b0a4) Thanks [@thanhtrinity](https://github.com/thanhtrinity)! - surface silent modifiesAreas=[] fallback across graph-record, doctor, xera-run (auto-generated from [#111](https://github.com/xera-ai/xera/issues/111))

- Updated dependencies []:
  - @xera-ai/web@0.12.3
  - @xera-ai/http@0.12.3

## 0.12.2

### Patch Changes

- [#104](https://github.com/xera-ai/xera/pull/104) [`b0cf739`](https://github.com/xera-ai/xera/commit/b0cf739adc84559657f1381dabbc88b442a53b12) Thanks [@thanhtrinity](https://github.com/thanhtrinity)! - core: actually force `.env` to win over `.env.local` (followup to [#103](https://github.com/xera-ai/xera/issues/103))

  PR [#103](https://github.com/xera-ai/xera/issues/103) added a warning when `.env.local` exists but didn't actually
  override Bun's auto-load behavior. Bun pre-loads `.env.local` _before_
  the `xera-internal` script runs, and dotenv's default `override: false`
  meant the `config()` call couldn't replace those values — so the warning
  was technically misleading and the silent-override bug from issue [#92](https://github.com/xera-ai/xera/issues/92)
  was still present.

  The bin entry point now also reads `.env.local` and `.env` directly:
  for any key present in both files, it forces the `.env` value into
  `process.env`, overwriting whatever Bun pre-loaded. Only keys that
  actually appear in `.env.local` are touched, so shell-injected and
  CI-injected env vars remain untouched.

  A subprocess-based regression test exercises the real Bun pre-load +
  loader interaction so future drift surfaces immediately.

- Updated dependencies []:
  - @xera-ai/web@0.12.2
  - @xera-ai/http@0.12.2

## 0.12.1

### Patch Changes

- [#102](https://github.com/xera-ai/xera/pull/102) [`89e051d`](https://github.com/xera-ai/xera/commit/89e051d8f7a6e6e7aa16e73f4548c6cd1b3218bc) Thanks [@thanhtrinity](https://github.com/thanhtrinity)! - error on unknown `--role` in `xera:auth-setup` (auto-generated from [#102](https://github.com/xera-ai/xera/issues/102))

- [#99](https://github.com/xera-ai/xera/pull/99) [`e899cd4`](https://github.com/xera-ai/xera/commit/e899cd46eceb1f6e50e4cf34b6d39b8d34ee3a51) Thanks [@thanhtrinity](https://github.com/thanhtrinity)! - surface clear error when `xera:auth-setup` shape lacks matching export (auto-generated from [#99](https://github.com/xera-ai/xera/issues/99))

- [#100](https://github.com/xera-ai/xera/pull/100) [`40a1488`](https://github.com/xera-ai/xera/commit/40a1488a7f0e5bbf697361a250977c680aca0dd3) Thanks [@thanhtrinity](https://github.com/thanhtrinity)! - core,cli,skills: strict config schema + remove unwired `testOutdated` config docs

  - `XeraConfigSchema` is now `strictObject` and rejects unknown top-level keys instead of silently stripping them. This surfaces config typos and aspirational keys (e.g. `testOutdated`, `report`) at parse time with a clear Zod error ([#94](https://github.com/xera-ai/xera/issues/94)).
  - Docs (`CONFIGURATION.md`, `TROUBLESHOOTING.md`) and the `/xera-report` skill no longer reference the unwired `testOutdated.threshold` / `report.testOutdatedNotify` keys; those tuning hooks are tracked for a future release.
  - Followup to [#95](https://github.com/xera-ai/xera/issues/95) / [#92](https://github.com/xera-ai/xera/issues/92): the http-only `.env.example` template comment now references `.env` (the canonical filename) instead of `.env.local`.

- [#103](https://github.com/xera-ai/xera/pull/103) [`2a6fcf4`](https://github.com/xera-ai/xera/commit/2a6fcf49d366e7cbac273e3a78fd4dcd6a943e94) Thanks [@thanhtrinity](https://github.com/thanhtrinity)! - core,http: stop loading `.env.local` and fix stale error message (closes [#92](https://github.com/xera-ai/xera/issues/92))

  The init/doctor side of [#92](https://github.com/xera-ai/xera/issues/92) was already fixed in [#95](https://github.com/xera-ai/xera/issues/95)/[#100](https://github.com/xera-ai/xera/issues/100) — but the runtime
  still preserved the silent-override trap the bug reporter described:

  - `packages/core/bin/internal.ts` loaded `.env.local` _before_ `.env`. With
    dotenv's default `override: false`, that meant `.env.local` always won —
    so a stale empty value in `.env.local` silently masked the real value in
    `.env` (~30-minute debug session in the report).
  - `packages/http/src/auth-setup/preset.ts` raised
    `Auth env var '...' is not set. Add it to .env.local.`, contradicting
    `xera init` / `xera doctor` / `.gitignore` (all canonicalized on `.env`).

  Now:

  - `xera-internal` loads `.env` only. If `.env.local` exists, it prints a
    loud warning telling the user to merge values into `.env` and delete
    `.env.local`. Legacy users get a clear migration prompt instead of a
    silent break or a silent override.
  - The HTTP auth error message points at `.env`.
  - A regression test pins the canonical filename in the error so future
    drift is caught.

- Updated dependencies [[`2a6fcf4`](https://github.com/xera-ai/xera/commit/2a6fcf49d366e7cbac273e3a78fd4dcd6a943e94)]:
  - @xera-ai/http@0.12.1
  - @xera-ai/web@0.12.1

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
  - @xera-ai/web@0.12.0
  - @xera-ai/http@0.12.0

## 0.11.6

### Patch Changes

- [#84](https://github.com/xera-ai/xera/pull/84) [`b429632`](https://github.com/xera-ai/xera/commit/b4296322af798e81bd468c4ebb5fb6c9f4be2ed7) Thanks [@thanhtrinity](https://github.com/thanhtrinity)! - thread XERA_BASE_URL into xera:auth-setup browser context (auto-generated from [#84](https://github.com/xera-ai/xera/issues/84))

- Updated dependencies [[`b429632`](https://github.com/xera-ai/xera/commit/b4296322af798e81bd468c4ebb5fb6c9f4be2ed7)]:
  - @xera-ai/web@0.11.6
  - @xera-ai/http@0.11.6

## 0.11.5

### Patch Changes

- [#80](https://github.com/xera-ai/xera/pull/80) [`3d3d535`](https://github.com/xera-ai/xera/commit/3d3d535af464be0b28777e1a648b149a0507d9d3) Thanks [@thanhtrinity](https://github.com/thanhtrinity)! - resolve ticketId from snapshot in ac-coverage-backfill-finalize (auto-generated from [#80](https://github.com/xera-ai/xera/issues/80))

- [#82](https://github.com/xera-ai/xera/pull/82) [`9633a1d`](https://github.com/xera-ai/xera/commit/9633a1dc988627d0f06f95d00bf5a479bbf8135e) Thanks [@thanhtrinity](https://github.com/thanhtrinity)! - warn when graph-record exec/classify scenario names don't match graph (auto-generated from [#82](https://github.com/xera-ai/xera/issues/82))

- [#83](https://github.com/xera-ai/xera/pull/83) [`675ddc4`](https://github.com/xera-ai/xera/commit/675ddc4dfaf7e1f38f02808b0b7bb0fe0568bb3a) Thanks [@thanhtrinity](https://github.com/thanhtrinity)! - join run.classified onto latest_failures in graph snapshot (auto-generated from [#83](https://github.com/xera-ai/xera/issues/83))

- Updated dependencies []:
  - @xera-ai/web@0.11.5
  - @xera-ai/http@0.11.5

## 0.11.4

### Patch Changes

- Updated dependencies [[`d097516`](https://github.com/xera-ai/xera/commit/d09751623137c3bc355af27bb6d6b8fca4a7cf02)]:
  - @xera-ai/web@0.11.4
  - @xera-ai/http@0.11.4

## 0.11.3

### Patch Changes

- [#74](https://github.com/xera-ai/xera/pull/74) [`76b065f`](https://github.com/xera-ai/xera/commit/76b065f42a8748e72fe46e5e1b36150a456f7a74) Thanks [@thanhtrinity](https://github.com/thanhtrinity)! - fix(graph): viewer click freeze, panel show/hide bugs, and crash on rapid clicks

  - Pre-compute adjacency map at init; cache node/edge id arrays so neighbor lookup and batched DataSet updates are O(N) instead of O(N²)
  - Track current dim state (`dimmedFor`) so clicking the same node is a no-op, and switching nodes skips redundant updates
  - Defer the heavy dim/highlight work to `requestAnimationFrame` with debouncing — the side panel opens immediately, the dim animation runs on the next frame, and rapid clicks only apply the final state (no flicker)
  - Guard physics toggle with an internal `physicsOn` flag so `setOptions({physics:{enabled:…}})` is never called redundantly — fixes the browser crash when clicking a selected node repeatedly
  - Use `selectNode`/`deselectNode` events with a 0ms deferral instead of the generic `click` event so panning the canvas no longer spuriously closes the panel and dragging a node no longer reopens it
  - Reposition the side panel as `position: absolute` with a `transform: translateX(…)` transition so the canvas keeps its full width — eliminates the layout reflow / vis-network resize jank when the panel toggles
  - Fix the scenario pass/fail/p0 filter which was previously a no-op (`n.group` was already stripped from DataSet items)
  - Index nodes for search at init so search-as-you-type batches a single DataSet update

- [#72](https://github.com/xera-ai/xera/pull/72) [`700747f`](https://github.com/xera-ai/xera/commit/700747f10cd2d824af631b33471865ee2e74f321) Thanks [@thanhtrinity](https://github.com/thanhtrinity)! - fix(graph): viewer canvas layout and node drift on load

  - Replace first-occurrence `{{GENERATED_AT}}` substitution with a global regex so the footer timestamp renders correctly
  - Fix CSS grid: make `[data-tab-panel]` sections span full grid columns and collapse the sidebar column when the side panel is hidden
  - Hide canvas during vis-network stabilization (opacity 0→1 fade) so users never see intermediate physics frames; disable physics after stabilization completes to freeze node positions
  - Re-enable physics on `dragStart` and disable again 1500 ms after `dragEnd` so connected nodes still react when a node is dragged

- Updated dependencies []:
  - @xera-ai/web@0.11.3
  - @xera-ai/http@0.11.3

## 0.11.2

### Patch Changes

- [#70](https://github.com/xera-ai/xera/pull/70) [`7374f86`](https://github.com/xera-ai/xera/commit/7374f869a0436301fb6517c32f984482b5bde501) Thanks [@thanhtrinity](https://github.com/thanhtrinity)! - fix(core,skills): `xera:graph-enrich` now checks the graph snapshot before the input file (so an un-fetched candidate gets the actionable `/xera-fetch <TICKET>` hint), and deletes `enrichment-input.json` after a successful enrich so stray re-invocations can't replay stale LLM output. The `/xera-report` lazy-similarity step now pre-validates the candidate is in the graph and notes that the Write tool auto-creates the candidate directory.

- Updated dependencies []:
  - @xera-ai/web@0.11.2
  - @xera-ai/http@0.11.2

## 0.11.1

### Patch Changes

- Updated dependencies []:
  - @xera-ai/web@0.11.1
  - @xera-ai/http@0.11.1

## 0.11.0

### Patch Changes

- Updated dependencies []:
  - @xera-ai/web@0.11.0
  - @xera-ai/http@0.11.0

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
  - @xera-ai/web@0.10.0
  - @xera-ai/http@0.10.0

## 0.9.8

### Patch Changes

- [#61](https://github.com/xera-ai/xera/pull/61) [`5d7d137`](https://github.com/xera-ai/xera/commit/5d7d1373c100b65c9ec33777e15558a6a3ba2e65) Thanks [@thanhtrinity](https://github.com/thanhtrinity)! - downgrade vendored vis-network from 9.1.10 to 9.1.6 to fix "Ev is not a constructor" white-screen bug in graph HTML viewer

- Updated dependencies []:
  - @xera-ai/web@0.9.8
  - @xera-ai/http@0.9.8

## 0.9.7

### Patch Changes

- [#60](https://github.com/xera-ai/xera/pull/60) [`a0ac08f`](https://github.com/xera-ai/xera/commit/a0ac08fcc897e599a203c7b385a474b2ff3e4160) Thanks [@thanhtrinity](https://github.com/thanhtrinity)! - load dotenv at xera-internal entry point so all subcommands have env vars; revert dotenv from playwright.config.ts templates

- Updated dependencies []:
  - @xera-ai/web@0.9.7
  - @xera-ai/http@0.9.7

## 0.9.6

### Patch Changes

- Updated dependencies []:
  - @xera-ai/web@0.9.6
  - @xera-ai/http@0.9.6

## 0.9.5

### Patch Changes

- Updated dependencies []:
  - @xera-ai/web@0.9.5
  - @xera-ai/http@0.9.5

## 0.9.4

### Patch Changes

- [#51](https://github.com/xera-ai/xera/pull/51) [`9c77460`](https://github.com/xera-ai/xera/commit/9c77460e62c6040c4042360463c93adbb62a7dff) Thanks [@thanhtrinity](https://github.com/thanhtrinity)! - fix graph-record path resolution and xera-internal bundle version loading

- Updated dependencies []:
  - @xera-ai/web@0.9.4
  - @xera-ai/http@0.9.4

## 0.9.3

### Patch Changes

- [#49](https://github.com/xera-ai/xera/pull/49) [`f1e9d90`](https://github.com/xera-ai/xera/commit/f1e9d903a923206d3d5603e033ceb968581655c9) Thanks [@thanhtrinity](https://github.com/thanhtrinity)! - copy graph templates into dist/bin/ during build (auto-generated from [#49](https://github.com/xera-ai/xera/issues/49))

- Updated dependencies []:
  - @xera-ai/web@0.9.3
  - @xera-ai/http@0.9.3

## 0.9.2

### Patch Changes

- [#47](https://github.com/xera-ai/xera/pull/47) [`71cd48e`](https://github.com/xera-ai/xera/commit/71cd48ec88aa52d7a66c50ff1cc10cc8d23a6f71) Thanks [@thanhtrinity](https://github.com/thanhtrinity)! - replace hardcoded version strings with dynamic reads (auto-generated from [#47](https://github.com/xera-ai/xera/issues/47))

- Updated dependencies []:
  - @xera-ai/web@0.9.2
  - @xera-ai/http@0.9.2

## 0.9.1

### Patch Changes

- Updated dependencies []:
  - @xera-ai/web@0.9.1
  - @xera-ai/http@0.9.1

## 0.9.0

### Patch Changes

- Updated dependencies []:
  - @xera-ai/web@0.9.0
  - @xera-ai/http@0.9.0

## 0.8.1

### Patch Changes

- [#36](https://github.com/xera-ai/xera/pull/36) [`6589625`](https://github.com/xera-ai/xera/commit/658962579399182fcb67e6d0dbe243c46a88c654) Thanks [@thanhtrinity](https://github.com/thanhtrinity)! - three bugs found during consumer-project integration testing (auto-generated from [#36](https://github.com/xera-ai/xera/issues/36))

- Updated dependencies []:
  - @xera-ai/web@0.8.1
  - @xera-ai/http@0.8.1
