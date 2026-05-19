# xera

AI-native test framework for QA teams — fetch a ticket from Jira **or GitHub Issues**, generate Gherkin + Playwright spec, run the test, diagnose the failure, and post results back to the tracker. Driven by AI coding-agent skills (Claude Code, Cursor, OpenAI Codex CLI).

**v0.8:** [Release pipeline](AGENTS.md#workspace-deps) is now fully automated and unified. All six packages move in lockstep at a single version (currently `0.8.0`) via a [changesets](https://github.com/changesets/changesets) `fixed` group; PR titles in conventional-commits form auto-generate changesets; merging to `main` opens a "Version Packages" PR; merging that publishes every package to npm with per-package git tags — zero manual `bun publish`, zero manual tags.

**v0.7:** [HTTP API testing](docs/ARCHITECTURE.md#packages) is now first-class. A new `@xera-ai/http` adapter sibles the web adapter — QA teams can scaffold api-only or mixed projects (`bunx @xera-ai/cli init --shape api|mixed`), pre-authenticate via `bun run xera:auth-setup`, and the classifier deterministically detects `CONTRACT_DRIFT` / `RATE_LIMITED` / `AUTH_EXPIRED` against captured HTTP traces.

Backed by a **project knowledge graph** that links every ticket ↔ scenario ↔ POM ↔ SUT area, so xera can tell you when a test failure is actually an outdated assertion (not a real bug), what scenarios a ticket might break before you merge, and visualize the whole graph as a single self-contained HTML viewer.

## Quickstart

Prereqs: Bun ≥1.1.0, a supported AI coding agent (Claude Code, Cursor ≥1.6, or OpenAI Codex CLI), an issue tracker (Atlassian-connected MCP / Jira API token **or** GitHub MCP / `gh` CLI), and a web app and/or HTTP API to test.

```bash
bun add -g @xera-ai/cli         # install once globally; or use bunx to run without installing

mkdir my-tests && cd my-tests
xera init                       # interactive: answers shape + tracker + ~5 prompts; scaffolds CI workflow
# or fully non-interactive (Jira):
xera init -y --shape api --pk MYPROJ --ju https://myco.atlassian.net --au https://api.example.com --as bearer
# or with GitHub Issues (no token required — uses `gh` CLI or the GitHub MCP):
xera init -y --shape web --tracker github --gr xera-ai/xera --su https://staging.example.com
cp .env.example .env            # fill in credentials
bun install
# Web shape only: bunx playwright install chromium
bun run xera:auth-setup         # pre-authenticate roles (writes encrypted .xera/.auth/)
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
| `/xera-feature <TICKET>` | Generate Gherkin |
| `/xera-script <TICKET>` | Generate Playwright spec + page objects (auto-detects priority) |
| `/xera-exec <TICKET>` | Run the test only (supports `--grep` for per-scenario filter) |
| `/xera-report <TICKET>` | Classify (5 buckets incl. TEST_OUTDATED) + post diagnosis to the tracker (Jira comment or GitHub issue comment) |
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

- `@xera-ai/cli` — public CLI (`init` with `--shape web|api|mixed`, `doctor`)
- `@xera-ai/core` — config, artifact IO, classifier (8 buckets incl. v0.7 `CONTRACT_DRIFT` / `RATE_LIMITED` / `AUTH_EXPIRED`), Jira client, auth state, shared scrub rules, **graph module**, `xera-internal` binary with 20 subcommands (incl. `auth-setup`)
- `@xera-ai/web` — Playwright adapter, browser-driven (supports `--grep` per-scenario)
- `@xera-ai/http` — **v0.7** HTTP API adapter, no browser. Pre-auth helpers (`defineHttpAuthSetup` + `presetHttpAuth`), runtime `newAuthedContext`, OpenAPI loader for `CONTRACT_DRIFT` detection
- `@xera-ai/skills` — Claude Code skill `.md` files (dispatch by `meta.json.adapter`)
- `@xera-ai/prompts` — versioned LLM prompt templates including `script-from-feature-web.md` + `script-from-feature-http.md`

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
| v0.9 | planned | `xera-feature --from-spec openapi.yaml` (generate tickets from spec) · auto-detect adapter from story · `CONTRACT_DRIFT` on web traces (network ↔ OpenAPI matching) · self-heal auto-PR |
| v1.0 | planned | Cross-adapter graph linkage (endpoint as first-class graph node) · live dashboard |
| v1.x | planned | Messaging adapters (Kafka, AMQP, WebSocket) · GraphQL · gRPC |
| v2.0 | planned | Optional SaaS backend (only if multi-org demand) |

## License

MIT.

## Contact

thanh@trinity-technology.com
