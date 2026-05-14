# xera

AI-native test framework for QA teams — fetch a Jira ticket, generate Gherkin + Playwright spec, run the test, diagnose the failure, and post results back to Jira. Driven entirely by Claude Code skills.

> **Status:** Design phase. v0.1 spec is complete; implementation has not started. See [the design spec](docs/superpowers/specs/2026-05-14-xera-core-web-design.md) for the full architecture.

## What it does (v0.1, planned)

```
BA writes a user story in Jira
   ↓
QA opens Claude Code in the test repo
   ↓
QA: /xera-run JIRA-123
   ↓
xera:
  1. Fetches story from Jira
  2. Generates Gherkin scenarios
  3. Generates Playwright spec + page objects
  4. Type-checks and lints generated code
  5. Refreshes auth state (login once, reuse cookies)
  6. Runs the test
  7. Parses the trace, scrubs secrets
  8. Classifies the failure (PASS | REAL_BUG | SELECTOR_DRIFT | FLAKY | TEST_BUG)
  9. Posts a diagnosis comment back to Jira
```

QA never needs an API key — the AI work runs inside the QA's Claude Code session.

## Surface

End users only run two CLI commands directly:

```bash
bunx xera init      # one-time scaffold of a project
bunx xera doctor    # health check
```

Everything else is done via slash commands inside Claude Code:

| Skill | Purpose |
|---|---|
| `/xera-run <TICKET>` | Full pipeline end-to-end |
| `/xera-fetch <TICKET>` | Just pull the story from Jira |
| `/xera-feature <TICKET>` | (Re)generate Gherkin |
| `/xera-script <TICKET>` | (Re)generate Playwright spec + POMs |
| `/xera-exec <TICKET>` | Run the test only |
| `/xera-report <TICKET>` | Classify the latest run and post to Jira |
| `/xera-promote <TICKET> <POM>` | Move a page object to `shared/` |

## Architecture at a glance

| Package | Role |
|---|---|
| `@xera/cli` | Public CLI — `init` and `doctor` |
| `@xera/core` | Config, artifact paths, Jira client, classifier, auth state manager, logging, internal CLI binary |
| `@xera/web` | Playwright adapter — generator helpers, executor wrapper, trace normalizer, secret scrubber |
| `@xera/skills` | Claude Code skill `.md` files, copied to `.claude/skills/` at init |
| `@xera/prompts` | Versioned LLM prompt templates |

A `xera-starter` template repo (separate) provides project boilerplate.

## Scope of v0.1

**In:**
- Web E2E testing with Playwright
- Local QA-triggered runs via Claude Code
- Jira fetch + comment write-back (via Atlassian MCP or REST)
- Diagnose + classify (no auto-fix)
- Auth state persistence (storageState + API token)
- Secret scrubbing
- Sample ticket seeded by `xera init`

**Out (separate future specs):**
- Mobile / API / Performance / Security adapters
- CI mode (GitHub Actions, webhooks)
- Self-healing auto-fix
- SaaS backend, multi-tenant workspace

## Roadmap

| Version | Adds |
|---|---|
| v0.1 (this spec) | Core + Web adapter; local QA-trigger only |
| v0.2 | CI mode; self-healing auto-fix with PR gate; AI gen evaluation harness |
| v0.3 | API adapter |
| v0.4 | Visual regression |
| v0.5 | Mobile adapter (Maestro) |
| v0.6 | Performance adapter (k6) |
| v0.7 | Security adapter (ZAP) |
| v1.0 | Read-only static dashboard generated from `.xera/` |
| v2.0 | Optional SaaS backend (multi-org), only if demand validates |

## Repository layout (planned)

```
xera/
├── packages/
│   ├── core/                   # @xera/core
│   ├── cli/                    # @xera/cli
│   ├── web/                    # @xera/web
│   ├── skills/                 # @xera/skills (.md files)
│   └── prompts/                # @xera/prompts (versioned)
├── fixtures/
│   ├── sample-app/             # Next.js fixture for integration tests
│   └── golden-tickets/         # JSON fixtures for classifier tests
├── docs/
│   └── superpowers/specs/      # design docs live here
├── .github/workflows/
└── package.json                # bun workspace root
```

## Documents

- [Design spec — Core + Web (v0.1)](docs/superpowers/specs/2026-05-14-xera-core-web-design.md)

## Contact

thanh@trinity-technology.com
