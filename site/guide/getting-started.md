# Getting started

xera is an AI-native test framework: a QA engineer scaffolds it into their own project with `xera init`, then drives the full ticket-to-test loop from their AI coding agent (Claude Code, Cursor, or OpenAI Codex CLI) via `/xera-*` slash commands.

## Prerequisites

- **Node** ≥ 22 — [installation](https://nodejs.org/)
- A supported AI coding agent:
  - [Claude Code](https://claude.ai/code)
  - [Cursor](https://cursor.com) ≥ 1.6
  - [OpenAI Codex CLI](https://github.com/openai/codex)
- An issue tracker — Atlassian-connected MCP / Jira API token **or** GitHub MCP / `gh` CLI
- A web app and/or HTTP API to test

## Install the CLI

```bash
npm install -g @xera-ai/cli
```

Or skip the install and run via `npx @xera-ai/cli init`.

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

## Try it on the sample app

If you don't have a real app to test yet, point xera at **[FlowBoard](https://github.com/xera-ai/xera-sample-app)** — the official sample target. It's a Fastify + React + SQLite project-management app with JWT auth, a Swagger-documented REST API, and intentional security surfaces, so it exercises the full classifier (`REAL_BUG`, `CONTRACT_DRIFT`, `AUTH_EXPIRED`, …) on a realistic SUT.

::: tip Reference implementation
Looking for a worked example before you scaffold your own? **[`xera-ai/xera-sample-app-tests`](https://github.com/xera-ai/xera-sample-app-tests)** is a real xera consumer project pointed at FlowBoard — concrete `xera.config.ts`, `.xera/<TICKET>/` artifacts, shared POMs, `openapi.json`. The graph it produces is published live at [xera-ai.github.io/xera-sample-app-tests](https://xera-ai.github.io/xera-sample-app-tests/).
:::

Bring FlowBoard up locally:

```bash
git clone https://github.com/xera-ai/xera-sample-app
cd xera-sample-app
npm install
npm run dev:backend &       # API → http://localhost:3000
npm run dev:frontend        # UI  → http://localhost:5173
# or: docker compose up --build
```

Then in a sibling directory, scaffold a xera project pointed at it:

```bash
cd .. && mkdir flowboard-tests && cd flowboard-tests
xera init -y --shape mixed --tracker github \
  --gr xera-ai/xera-sample-app \
  --su http://localhost:5173 \
  --au http://localhost:3000 \
  --as bearer
cp .env.example .env        # set FlowBoard credentials per the sample-app README
npm install
npx playwright install chromium
npx xera-internal auth-setup
```

Now `/xera-run SAMPLE-001` and `/xera-run SAMPLE-HTTP-001` will run against FlowBoard.

### Push it: pair `/xera-run` with `/xera-explore`

FlowBoard ships intentional security surfaces (stored XSS, JWT handling edge cases, file upload risks, SQL injection points). These map directly to the categories the experimental [`/xera-explore`](./architecture#v09-addition-adversarial-exploration-experimental) skill brainstorms — `negative`, `boundary`, `race`, `error-recovery`, `a11y`, `security-smell`, `non-functional`. The natural onboarding loop is two-step:

```
> /xera-run <TICKET>      # AC-driven happy path → test.feature
> /xera-explore <TICKET>  # adversarial scenarios → explore.feature
```

`/xera-explore` is opt-in and writes to a separate `explore.feature` tagged `@adversarial @adversarial-<category> @severity-<level>`, so PO review of `test.feature` stays AC-aligned while QA keeps drumming up edge cases on the side. It's not auto-chained from `/xera-run`, so the loop only runs when you invoke it.

## First test

```bash
cp .env.example .env            # fill in credentials
npm install
npx playwright install chromium  # web shape only
npx xera-internal auth-setup           # encrypted storageState for each role
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
