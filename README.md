# xera

AI-native test framework for QA teams — fetch a Jira ticket, generate Gherkin + Playwright spec, run the test, diagnose the failure, and post results back to Jira. Driven entirely by Claude Code skills.

## Quickstart

Prereqs: Bun ≥1.1.0, Claude Code, an Atlassian-connected MCP **or** a Jira API token, a web app to test.

```bash
mkdir my-tests && cd my-tests
bunx xera init                  # answers ~5 prompts
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
| `/xera-run <TICKET>` | Full pipeline end-to-end |
| `/xera-fetch <TICKET>` | Pull story from Jira |
| `/xera-feature <TICKET>` | Generate Gherkin |
| `/xera-script <TICKET>` | Generate Playwright spec + page objects |
| `/xera-exec <TICKET>` | Run the test only |
| `/xera-report <TICKET>` | Classify + post diagnosis to Jira |
| `/xera-promote <TICKET> <POM>` | Move a POM to `shared/` |

## Architecture

See [the design spec](docs/superpowers/specs/2026-05-14-xera-core-web-design.md) for the full architecture. In short:

- `@xera/cli` — public CLI (`init`, `doctor`)
- `@xera/core` — config, artifact IO, classifier, Jira client, auth state, `xera-internal` binary
- `@xera/web` — Playwright adapter
- `@xera/skills` — Claude Code skill `.md` files
- `@xera/prompts` — versioned LLM prompt templates

## Documentation

- [Quickstart + commands (this file)](#quickstart)
- [Configuration reference](docs/CONFIGURATION.md)
- [Troubleshooting](docs/TROUBLESHOOTING.md)
- [Architecture (design spec)](docs/superpowers/specs/2026-05-14-xera-core-web-design.md)

## Roadmap

| Version | Adds |
|---|---|
| v0.1 (current) | Core + Web adapter; local QA-trigger only |
| v0.2 | CI mode; self-healing auto-fix; AI gen evaluation harness |
| v0.3 | API adapter |
| v0.5 | Mobile adapter |
| v0.6 | Performance adapter |
| v0.7 | Security adapter |
| v1.0 | Read-only static dashboard |
| v2.0 | Optional SaaS backend (only if multi-org demand) |

## License

MIT.

## Contact

thanh@trinity-technology.com
