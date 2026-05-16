# xera

AI-native test framework for QA teams — fetch a Jira ticket, generate Gherkin + Playwright spec, run the test, diagnose the failure, and post results back to Jira. Driven entirely by Claude Code skills.

Now with a **project knowledge graph** that links every ticket ↔ scenario ↔ POM ↔ SUT area, so xera can tell you when a test failure is actually an outdated assertion (not a real bug), what scenarios a ticket might break before you merge, and visualize the whole graph as a single self-contained HTML viewer.

## Quickstart

Prereqs: Bun ≥1.1.0, Claude Code, an Atlassian-connected MCP **or** a Jira API token, a web app to test.

```bash
mkdir my-tests && cd my-tests
bunx xera init                  # answers ~5 prompts; scaffolds CI workflow
cp .env.example .env            # fill in credentials
bun install
bunx playwright install chromium
# Then open Claude Code in this directory:
claude
> /xera-run SAMPLE-001          # smoke test — runs against playwright.dev
> /xera-run JIRA-123            # your first real ticket
```

## What you get out of the box

| Skill | What it does |
|---|---|
| `/xera-run <TICKET>` | Full pipeline end-to-end (auto-checks impact after fetch) |
| `/xera-fetch <TICKET>` | Pull story from Jira; extract modified SUT areas |
| `/xera-feature <TICKET>` | Generate Gherkin |
| `/xera-script <TICKET>` | Generate Playwright spec + page objects (auto-detects priority) |
| `/xera-exec <TICKET>` | Run the test only (supports `--grep` for per-scenario filter) |
| `/xera-report <TICKET>` | Classify (5 buckets incl. TEST_OUTDATED) + post diagnosis to Jira |
| `/xera-impact <TICKET>` | Pre-flight: which existing scenarios may break? Optional re-run. |
| `/xera-promote <TICKET> <POM>` | Move a POM to `shared/` |

Plus npm scripts auto-scaffolded for the project knowledge graph:
- `xera:graph-snapshot` — derive snapshot from event log
- `xera:graph-render` — write `.xera/graph.html` (single-file viewer)
- `xera:graph-backfill` — synthesize events from existing artifacts (pre-v0.6 projects)
- `xera:graph-enrich --ticket <ID>` — populate similarity edges via Claude
- `xera:disputes` — list QA-disputed classifications

CI workflow (`.github/workflows/xera-graph.yml`, scaffolded by `xera init`) renders the viewer on every PR and posts a sticky comment with the artifact link — managers click → open `graph.html` in a browser, no clone required.

## Architecture

See [the design spec](docs/superpowers/specs/2026-05-14-xera-core-web-design.md) for the v0.1 architecture and [the v0.6 design](docs/superpowers/specs/2026-05-16-xera-v06-project-knowledge-graph-design.md) for the project knowledge graph layer. In short:

- `@xera-ai/cli` — public CLI (`init`, `doctor`)
- `@xera-ai/core` — config, artifact IO, classifier, Jira client, auth state, **graph module** (events, snapshot, similarity, classify, render), `xera-internal` binary with 19 subcommands
- `@xera-ai/web` — Playwright adapter (supports `--grep` for per-scenario execution)
- `@xera-ai/skills` — Claude Code skill `.md` files (8 user-facing skills)
- `@xera-ai/prompts` — versioned LLM prompt templates (7 templates including `extract-areas`, `similarity-match`, `classify-outdated`, `heal-locator`)

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
| v0.6 | ✅ shipped | Project Knowledge Graph (graph foundation · TEST_OUTDATED classifier · `/xera-impact` skill · HTML viewer + CI artifact · QA polish: per-scenario `--grep`, priority auto-detect, dispute event capture) |
| v0.7 | planned | `/xera-sprint` (multi-ticket orchestration) · production trace → test backfill |
| v0.8 | planned | API adapter |
| v0.9 | planned | Mobile adapter |
| v1.0 | planned | Live dashboard (replaces static HTML viewer when multi-user demand emerges) |
| v2.0 | planned | Optional SaaS backend (only if multi-org demand) |

## License

MIT.

## Contact

thanh@trinity-technology.com
