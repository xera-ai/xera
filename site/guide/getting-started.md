# Getting started

xera is an AI-native test framework: a QA engineer scaffolds it into their own project with `xera init`, then drives the full ticket-to-test loop from their AI coding agent (Claude Code, Cursor, or OpenAI Codex CLI) via `/xera-*` slash commands.

## Prerequisites

- **Bun** ≥ 1.1.0 — [installation](https://bun.sh/docs/installation)
- A supported AI coding agent:
  - [Claude Code](https://claude.ai/code)
  - [Cursor](https://cursor.com) ≥ 1.6
  - [OpenAI Codex CLI](https://github.com/openai/codex)
- An issue tracker — Atlassian-connected MCP / Jira API token **or** GitHub MCP / `gh` CLI
- A web app and/or HTTP API to test

## Install the CLI

```bash
bun add -g @xera-ai/cli
```

Or skip the install and run via `bunx @xera-ai/cli init`.

## Scaffold a project

```bash
mkdir my-tests && cd my-tests
xera init
```

`xera init` is interactive: it asks for the project **shape** (`web`, `api`, or `mixed`), the **tracker** (`jira` or `github`), and a handful of follow-up prompts (project key, app URL, auth strategy, editor target).

For CI or scripting, every prompt has a flag:

```bash
# Web + Jira:
xera init -y --shape web --tracker jira \
  --pk MYPROJ \
  --ju https://myco.atlassian.net \
  --su https://staging.example.com

# HTTP API + GitHub Issues (no token required):
xera init -y --shape api --tracker github \
  --gr xera-ai/xera \
  --au https://api.example.com \
  --as bearer

# Mixed shape, scaffold for all editors:
xera init -y --shape mixed --tracker jira --editor all
```

Run `xera init --help` for the full flag reference.

## First test

```bash
cp .env.example .env            # fill in credentials
bun install
bunx playwright install chromium  # web shape only
bun run xera:auth-setup           # encrypted storageState for each role
```

Then open your coding agent in the project directory:

| Agent | How |
|---|---|
| Claude Code | run `claude` |
| Cursor | open the folder in Cursor |
| OpenAI Codex CLI | run `codex` |

And try the bundled samples:

```
> /xera-run SAMPLE-001          # web sample (shape: web | mixed)
> /xera-run SAMPLE-HTTP-001     # api sample (shape: api | mixed)
```

When the samples pass, point xera at a real ticket:

```
> /xera-run JIRA-123            # Jira key
> /xera-run GH-42               # GitHub issue (tracker: github)
```

`/xera-run` is the end-to-end pipeline; the underlying skills (`/xera-fetch`, `/xera-feature`, `/xera-script`, `/xera-exec`, `/xera-report`) can also be invoked individually when you want to iterate on one stage.

## What's next

- [Configuration reference](./configuration) — `xera.config.ts` knobs, env vars, graph + coverage settings
- [Architecture](./architecture) — layers, packages, the `xera-internal` binary, project knowledge graph
- [Troubleshooting](./troubleshooting) — common failure modes and fixes
- [Project context](./project-context) — the "why" behind xera, mental model for new contributors
