<p align="center">
  <img src="site/public/hero.svg" alt="xera knowledge graph" width="180" />
</p>

<h1 align="center">xera</h1>

<p align="center">
  AI-native test framework for QA teams — fetch a ticket from Jira <b>or GitHub Issues</b>, generate Gherkin + Playwright spec, run the test, diagnose the failure, and post results back to the tracker. Driven by AI coding-agent skills (Claude Code, Cursor, OpenAI Codex CLI).
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@xera-ai/cli"><img alt="npm" src="https://img.shields.io/npm/v/%40xera-ai%2Fcli?label=%40xera-ai%2Fcli&color=646cff"></a>
  <a href="https://github.com/xera-ai/xera/blob/main/LICENSE"><img alt="License" src="https://img.shields.io/badge/license-Apache--2.0-blue.svg"></a>
  <a href="https://xera-ai.github.io/xera/"><img alt="Docs" src="https://img.shields.io/badge/docs-xera--ai.github.io-41d1ff"></a>
</p>

**v0.21:** [HTML report enablement](docs/CONFIGURATION.md#html-report-v021). `xera-internal exec <TICKET> --reporter=html` writes a Playwright HTML report under the run dir; `xera show-report <TICKET>` serves it (default `127.0.0.1:9323`); `xera-internal stage-auth [--role <r>]` decrypts the stored web `storageState` into `.xera/.auth/.cache/` so `npx playwright test --ui` (or any direct Playwright invocation) works against the same session. Plus `XERA_HEADED=1` env on `auth-setup` / `exec` auth-refresh for interactive SSO / MFA.

**v0.20:** [HTTP auth strategy alignment + AC display polish](docs/CONFIGURATION.md#http-auth-strategy-none-v0206). `xera doctor --strict` no longer hard-fails on `http.auth.strategy: 'none'` (gates the per-role auth-file check on strategy); `xera update --auth-strategy custom` works; scaffolded mixed-shape `auth-setup` skips http when strategy is `none` (fresh `xera init` passes `auth-setup` + `doctor --strict` out of the box). Graph viewer + coverage CLI render AC labels 1-based (`AC-1, AC-2, …`) to match ticket-tracker convention.

**v0.19:** [Web CONTRACT_DRIFT + self-heal](docs/ARCHITECTURE.md#v019-addition-web-contract_drift-detection-and-self-heal). `/xera-report` now matches a web test's captured network calls against OpenAPI (opt-in `xeraNetwork` recorder) and flags `CONTRACT_DRIFT` per scenario on documented endpoints. When it fires, it can auto-rewrite a single `spec.ts` assertion to match the contract, re-run, and stage the fix (http-focused) — parallel to the v0.5 selector heal.

**v0.18:** [Feature-from-OpenAPI](docs/CONFIGURATION.md#xera-feature---from-spec-v018). `/xera-feature <KEY> --from-spec` generates Gherkin directly from an OpenAPI document — no fetched ticket — with `--tag` / `--operation` / `--path` filters. Also: `xera init` now scaffolds a root `AGENTS.md` orienting any AI agent (never clobbering an existing one).

**v0.16:** [GitHub Issues](docs/CONFIGURATION.md#issue-tracker-jira-vs-github) as an alternative to Jira (`xera init --tracker github`, ticket keys `GH-<n>`, no token required — uses the GitHub MCP or `gh` CLI). `/xera-run` first-run fix: the health gate is split into env-only Step 0 + ticket-specific Step 1.6 (after fetch), so a fresh ticket no longer deadlocks on its own missing artifacts.

**v0.9:** [Adversarial exploration](docs/ARCHITECTURE.md#v09-addition-adversarial-exploration-experimental) (experimental, opt-in). `/xera-explore <TICKET>` brainstorms negative / boundary / race / a11y / security-smell scenarios into a separate `explore.feature`, untouched by PO review of `test.feature`.

**v0.8:** [Coverage gap & AC matrix](docs/ARCHITECTURE.md#v08-addition-coverage-gap--ac-matrix). `/xera-coverage` reports area-level (UNCOVERED/STALE/COVERED) and AC-level gaps with risk weighting; `/xera-fill-gap` AI-drafts Gherkin for unsatisfied gaps. Release pipeline unified at a single fixed-group version via [changesets](https://github.com/changesets/changesets) — PR titles auto-generate changesets, the Version Packages PR ships every package in lockstep.

**v0.7:** [HTTP API testing](docs/ARCHITECTURE.md#packages) — `@xera-ai/http` adapter, `xera init --shape api|mixed`, pre-auth via `xera:auth-setup`, deterministic `CONTRACT_DRIFT` / `RATE_LIMITED` / `AUTH_EXPIRED` against captured HTTP traces.

Backed by a **project knowledge graph** (v0.6+) that links every ticket ↔ scenario ↔ POM ↔ SUT area ↔ AC, so xera can tell you when a test failure is actually an outdated assertion (not a real bug), what scenarios a ticket might break before you merge, and visualize the whole graph as a single self-contained HTML viewer.

## Quickstart

Prereqs: Node ≥22, a supported AI coding agent (Claude Code, Cursor ≥1.6, or OpenAI Codex CLI), an issue tracker (Atlassian-connected MCP / Jira API token **or** GitHub MCP / `gh` CLI), and a web app and/or HTTP API to test.

> **Try it without writing tests of your own:** [FlowBoard](https://github.com/xera-ai/xera-sample-app) is the official sample target (Fastify + React, both `web` and `api` shapes). [xera-sample-app-tests](https://github.com/xera-ai/xera-sample-app-tests) is a worked xera consumer project pointed at it — and its graph is published live at **[xera-ai.github.io/xera-sample-app-tests](https://xera-ai.github.io/xera-sample-app-tests/)**. See the [getting-started guide](https://xera-ai.github.io/xera/guide/getting-started#try-it-on-the-sample-app) for the full clone-and-scaffold flow.

```bash
npm install -g @xera-ai/cli     # install once globally; or use npx to run without installing

mkdir my-tests && cd my-tests
xera init                       # interactive: answers shape + tracker + ~5 prompts; scaffolds CI workflow
# or fully non-interactive (Jira):
xera init -y --shape api --pk MYPROJ --ju https://myco.atlassian.net --au https://api.example.com --as bearer
# or with GitHub Issues (no token required — uses `gh` CLI or the GitHub MCP):
xera init -y --shape web --tracker github --gr xera-ai/xera --su https://staging.example.com
cp .env.example .env            # fill in credentials
npm install
# Web shape only: npx playwright install chromium
npx xera-internal auth-setup    # pre-authenticate roles (writes encrypted .xera/.auth/)
# Then open your coding agent in this directory:
#   Claude Code:       `claude`
#   Cursor:            open this folder in Cursor
#   OpenAI Codex CLI:  `codex`
> /xera-run SAMPLE-001          # web sample (if shape is web/mixed)
> /xera-run SAMPLE-HTTP-001     # api sample (if shape is api/mixed)
> /xera-run JIRA-123            # your first real ticket (Jira key shape)
> /xera-run GH-42               # …or a GitHub issue when tracker: github
```

## What you get out of the box

| Skill | What it does |
|---|---|
| `/xera-run <TICKET>` | Full pipeline end-to-end (auto-checks impact after fetch) |
| `/xera-fetch <TICKET>` | Pull story from the configured tracker (Jira or GitHub); extract modified SUT areas |
| `/xera-feature <TICKET>` | Generate Gherkin (or `--from-spec` to generate from an OpenAPI doc with no ticket) |
| `/xera-script <TICKET>` | Generate Playwright spec + page objects (auto-detects priority) |
| `/xera-exec <TICKET>` | Run the test only (supports `--grep` for per-scenario filter) |
| `/xera-report <TICKET>` | 9-class classifier (`PASS`, `REAL_BUG`, `TEST_BUG`, `FLAKY`, `SELECTOR_DRIFT`, `TEST_OUTDATED`, `CONTRACT_DRIFT`, `RATE_LIMITED`, `AUTH_EXPIRED`) + post diagnosis to the tracker (Jira comment or GitHub issue comment) |
| `/xera-impact <TICKET>` | Pre-flight: which existing scenarios may break? Optional re-run. |
| `/xera-promote <TICKET> <POM>` | Move a POM to `shared/` |
| `/xera-coverage` | Area-level + AC-level coverage report (UNCOVERED/STALE/COVERED + AC GAPS), risk-weighted gap list, AC backfill auto-orchestration. `--viewer` opens the HTML Coverage tab (Map/List/Trend). |
| `/xera-fill-gap <area>` | AI-drafted Gherkin scenarios for UNCOVERED areas or unsatisfied ACs (`--ticket <TICKET>` for AC mode). |

Plus npm scripts auto-scaffolded for the project knowledge graph:
- `xera:graph-snapshot` — derive snapshot from event log
- `xera:graph-render` — write `.xera/graph.html` (single-file viewer)
- `xera:graph-backfill` — synthesize events from existing artifacts (pre-v0.6 projects)
- `xera:graph-enrich --ticket <ID>` — populate similarity edges via Claude
- `xera:disputes` — list QA-disputed classifications

CI workflow (`.github/workflows/xera-graph.yml`, scaffolded by `xera init`) renders the viewer on every PR and posts a sticky comment with the artifact link — managers click → open `graph.html` in a browser, no clone required.

## Architecture

See [the design spec](docs/superpowers/specs/2026-05-14-xera-core-web-design.md) for the v0.1 architecture and [the v0.6 design](docs/superpowers/specs/2026-05-16-xera-v06-project-knowledge-graph-design.md) for the project knowledge graph layer. In short:

- `@xera-ai/cli` — public CLI (`init` with `--shape web|api|mixed --tracker jira|github`, `doctor [--strict [ticket]]`, `samples remove`, `show-report <TICKET>`)
- `@xera-ai/core` — config, artifact IO, 9-class classifier (`PASS`, `REAL_BUG`, `TEST_BUG`, `FLAKY`, `SELECTOR_DRIFT`, `TEST_OUTDATED`, `CONTRACT_DRIFT`, `RATE_LIMITED`, `AUTH_EXPIRED`), Jira + GitHub Issues client behind a unified `IssueProvider` interface, auth state, shared scrub rules, **graph module**, **coverage module**, `xera-internal` binary with 37 subcommands (incl. `auth-setup`, `stage-auth`, `coverage-prepare`, `fill-gap-*`, `explore-*`, `openapi-resolve`, `feature-spec-prepare`, `contract-heal-prepare`)
- `@xera-ai/web` — Playwright adapter, browser-driven (supports `--grep` per-scenario; opt-in `xeraNetwork` recorder feeds web `CONTRACT_DRIFT` detection)
- `@xera-ai/http` — **v0.7** HTTP API adapter, no browser. Pre-auth helpers (`defineHttpAuthSetup` + `presetHttpAuth`), runtime `newAuthedContext`, OpenAPI loader for `CONTRACT_DRIFT` detection + `extractOperations` for `/xera-feature --from-spec`
- `@xera-ai/skills` — Claude Code skill `.md` files (dispatch by `meta.json.adapter`)
- `@xera-ai/prompts` — versioned LLM prompt templates including `feature-from-openapi.md`, `script-from-feature-web.md` + `script-from-feature-http.md`, and `contract-heal.md`

## Documentation

- [Quickstart + commands (this file)](#quickstart)
- [Configuration reference](docs/CONFIGURATION.md) — including graph + cost telemetry + auto-impact config
- [Troubleshooting](docs/TROUBLESHOOTING.md)
- [Architecture](docs/ARCHITECTURE.md) — condensed dev overview
- [Design specs](docs/superpowers/specs/) — authoritative design docs (v0.1 core + v0.2/0.3/0.5/0.6 features)
- [Implementation plans](docs/superpowers/plans/) — task-by-task TDD plans for each release

## Roadmap

| Version | Status | Adds |
|---|---|---|
| v0.1 | ✅ shipped | Core platform + Web adapter; local QA-trigger only |
| v0.2 | ✅ shipped | AI gen evaluation harness (`/xera-eval`) |
| v0.3 | ✅ shipped | Prompt injection defense (boundary tags + refusal label) |
| v0.5 | ✅ shipped | Self-healing selector drift (auto-fix POM locators) |
| v0.6 | ✅ shipped | Project Knowledge Graph (graph foundation · TEST_OUTDATED classifier · `/xera-impact` skill · HTML viewer + CI artifact · QA polish) |
| v0.7 | ✅ shipped | **HTTP API adapter** (`@xera-ai/http`) · init `--shape web\|api\|mixed` · pre-auth pattern (`xera:auth-setup`) · 3 new classifier buckets (`CONTRACT_DRIFT`, `RATE_LIMITED`, `AUTH_EXPIRED`) · web prompt knows `page.request` |
| v0.8 | ✅ shipped | **Release infra overhaul** — all six packages unified at a single version via changesets `fixed` group · auto-changeset workflow infers bumps from PR titles · `xera-automation` GitHub App so bot-pushed commits trigger CI · changeset-bot + branch protection on `main` · tag-triggered `bun publish` retired in favour of `release.yml`. **Coverage gap feature** — `/xera-coverage` (area + AC-level report, HTML viewer Coverage tab) · `/xera-fill-gap` (AI-drafted Gherkin for gaps) · ACNode + satisfies edge + `coverage.snapshot` event on the graph |
| v0.9 | ✅ shipped | **Adversarial exploration (experimental, opt-in)** — `/xera-explore <TICKET>` brainstorms negative / boundary / race / a11y / security-smell scenarios with `category` + `severity` metadata; writes accepted proposals to a separate `explore.feature` so PO review of `test.feature` stays undisturbed. Not auto-chained from `/xera-run` |
| v0.10–v0.15 | ✅ shipped | Multi-editor support (`xera init --editor claude\|cursor\|codex\|all`) · CLI UX hardening (help-on-no-args, did-you-mean, non-TTY guard) · cognitive AC extraction from Jira description body when no dedicated AC field is configured · `xera init --update --shape` upgrade path · http-shape `.env.example` hints `PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD` · `.d.ts` declarations emitted for all packages |
| v0.16 | ✅ shipped | **GitHub Issues tracker** (`github: { repo: 'owner/repo' }`, ticket keys `GH-<n>`, GitHub MCP + `gh` CLI fallback, no token env vars) · `/xera-run` first-run unblocked: env-only Step 0 + ticket-specific Step 1.6 after fetch (chicken-and-egg fix) · `xera doctor --strict [ticket]` accepts optional ticket arg · `samples remove` subcommand on the public CLI |
| v0.18 | ✅ shipped | **Feature-from-OpenAPI** — `/xera-feature <KEY> --from-spec [--tag/--operation/--path]` generates Gherkin straight from an OpenAPI doc (no fetched ticket) via the deterministic `feature-spec-prepare` + `feature-from-openapi.md` prompt · `xera init` scaffolds a root `AGENTS.md` when absent (never clobbers) |
| v0.19 | ✅ shipped | **Web CONTRACT_DRIFT + self-heal** — opt-in `xeraNetwork` recorder captures scrubbed page responses; `/xera-report` matches them to documented OpenAPI endpoints and stamps `CONTRACT_DRIFT` per scenario · self-heal rewrites a `spec.ts` assertion to the contract, re-runs, and stages on pass (http-focused; web refuses) via `contract-heal-prepare` + `contract-heal.md` |
| v0.20 | ✅ shipped | **HTTP auth strategy alignment** — `xera doctor --strict` skips per-role http auth-file checks when `strategy: 'none'` · CLI `VALID_AUTH_STRATEGIES` includes `'custom'` (matches the core schema enum) · scaffolded mixed-project `auth-setup` skips http when `strategy: 'none'` so a fresh `xera init` passes `auth-setup` + `doctor --strict` out of the box · `XERA_HEADED=1` honored on `auth-setup` / `exec` auth-refresh for interactive SSO/MFA · `exec` auth-refresh resolves `XERA_BASE_URL > web.baseUrl[env] > web.baseUrl[defaultEnv]` so relative `setupScript` navigation works · graph viewer + coverage CLI render AC labels 1-based |
| v0.21 | ✅ shipped | **HTML report enablement** — `xera-internal exec <TICKET> --reporter=html` appends extra reporters after the always-on `json` reporter that `normalize` depends on · new `xera-internal stage-auth [--role <r>]` decrypts the stored web `storageState` into `.xera/.auth/.cache/` so `npx playwright test --ui` works against the same session · new public `xera show-report <TICKET> [--run <id>]` wrapper that serves `<runDir>/html` via `playwright show-report` with `--host` / `--port` passthrough · `.claude/commands/xera-*.md` dual write retired (Claude Code resolves `/<name>` through the Skill tool from `.claude/skills/`) — `xera init --update` auto-removes the leftover files |
| v1.0 | planned | **Stability commitment** (semver from 1.0, frozen `TestAdapter` interface) · public [documentation site](https://xera-ai.github.io/xera/) · cross-adapter graph linkage (endpoint as first-class graph node) |
| v1.x | planned | `/xera-sprint` multi-ticket orchestration · production trace → test backfill · hosted live dashboard (graph + coverage + disputes) · messaging adapters (Kafka, AMQP, WebSocket) · GraphQL · gRPC |
| v2.0 | planned | Optional SaaS backend (only if multi-org demand) |
| Future | designed-for | Mobile, performance, and security adapters — `TestAdapter` is built to accept them; no timeline or owner yet (see [`AGENTS.md`](AGENTS.md#adapter-pattern)) |

## License

Apache 2.0 — see [LICENSE](LICENSE).

## Contact

thanh@trinity-technology.com
