---
layout: home

hero:
  name: xera
  text: AI-native test framework for QA teams
  tagline: >-
    Fetch a ticket from Jira or GitHub Issues, generate Gherkin + Playwright
    spec, run the test, diagnose the failure, and post results back — driven
    by AI coding-agent skills (Claude Code, Cursor, OpenAI Codex CLI).
  image:
    src: /hero.svg
    alt: xera knowledge graph
  actions:
    - theme: brand
      text: Get started
      link: /guide/getting-started
    - theme: alt
      text: Try the sample app
      link: '#try-it-on-a-real-app'
    - theme: alt
      text: View on GitHub
      link: https://github.com/xera-ai/xera

features:
  - icon: 🎫
    title: Two trackers, one workflow
    details: >-
      Jira (REST or MCP) and GitHub Issues (gh CLI or GitHub MCP) behind a
      single IssueProvider interface. Pick at `xera init --tracker`.
  - icon: 🌐
    title: Web and HTTP API
    details: >-
      Playwright adapter for browser flows, dedicated HTTP adapter for API
      testing — no browser required. Mix both in the same project.
  - icon: 🔍
    title: 9-class failure classifier
    details: >-
      REAL_BUG, TEST_BUG, FLAKY, SELECTOR_DRIFT, TEST_OUTDATED, CONTRACT_DRIFT,
      RATE_LIMITED, AUTH_EXPIRED, PASS — diagnoses are posted back to the
      tracker automatically.
  - icon: 🩹
    title: Self-healing selectors
    details: >-
      When the UI shifts, xera proposes locator fixes from the Playwright trace
      instead of just marking the test broken.
  - icon: 🕸️
    title: Project knowledge graph
    details: >-
      Tickets ↔ scenarios ↔ POMs ↔ SUT areas ↔ ACs, with an HTML viewer you
      can attach to any PR. Pre-flight impact analysis before merge.
    link: https://xera-ai.github.io/xera-sample-app-tests/
    linkText: See a live one →
  - icon: 📈
    title: Coverage gap & AC matrix
    details: >-
      Area-level (UNCOVERED / STALE / COVERED) and AC-level gap reports with
      risk weighting, plus AI-drafted Gherkin to fill the holes.
  - icon: 🤖
    title: Editor-agnostic
    details: >-
      `xera init --editor claude|cursor|codex|all` scaffolds the same skills
      under `.claude/`, `.cursor/`, and `.agents/`.
  - icon: 🔐
    title: Encrypted auth state
    details: >-
      AES-256-GCM at-rest encryption for `storageState`; pre-auth via
      `xera:auth-setup` keeps secrets out of test fixtures.
---

<style>
.VPHero .name { background-image: linear-gradient(120deg, #646cff 30%, #41d1ff); -webkit-background-clip: text; background-clip: text; color: transparent; }
</style>

## Quickstart

```bash
bun add -g @xera-ai/cli         # install once globally; or use bunx

mkdir my-tests && cd my-tests
xera init                       # interactive: shape + tracker + ~5 prompts
# or fully non-interactive (GitHub Issues, no token required):
xera init -y --shape web --tracker github \
  --gr xera-ai/xera --su https://staging.example.com

cp .env.example .env            # fill in credentials
bun install
# Web shape only:
bunx playwright install chromium
bun run xera:auth-setup         # pre-authenticate roles
```

Then in your AI coding agent (Claude Code, Cursor, or Codex CLI):

```
> /xera-run SAMPLE-001          # web sample
> /xera-run SAMPLE-HTTP-001     # api sample
> /xera-run JIRA-123            # your first real ticket
> /xera-run GH-42               # …or a GitHub issue
```

## Try it on a real app

<a href="https://xera-ai.github.io/xera-sample-app-tests/" target="_blank" rel="noopener noreferrer">
  <img src="/img/graph-viewer-hero.png" alt="xera knowledge graph viewer — three FlowBoard tickets, their POMs, passing and failing scenarios, and failure classes around the periphery" />
</a>

There's a complete demo loop you can poke at without writing a single line of code or hosting an app:

| Repo | Role |
|---|---|
| [`xera-ai/xera-sample-app`](https://github.com/xera-ai/xera-sample-app) | **FlowBoard** — the SUT. Full-stack project-management app (Fastify + React + SQLite, JWT auth, Swagger REST API, intentional security surfaces). |
| [`xera-ai/xera-sample-app-tests`](https://github.com/xera-ai/xera-sample-app-tests) | **Reference tests** — a working xera consumer project pointed at FlowBoard. Look here for a real `xera.config.ts`, `.xera/<TICKET>/` artifacts, shared POMs, and `openapi.json`. |
| [xera-ai.github.io/xera-sample-app-tests](https://xera-ai.github.io/xera-sample-app-tests/) | **Live knowledge graph** — the actual `.xera/graph.html` viewer produced from the reference tests above. Click around: tickets ↔ scenarios ↔ POMs ↔ areas, Coverage tab (Map / List / Trend), failure classes. |

Spin FlowBoard + the tests up locally:

```bash
# 1. Bring FlowBoard up
git clone https://github.com/xera-ai/xera-sample-app
cd xera-sample-app && npm install && npm run dev:backend & npm run dev:frontend
# UI on http://localhost:5173, API on http://localhost:3000

# 2. Clone the reference tests in a sibling directory and run a ticket
cd .. && git clone https://github.com/xera-ai/xera-sample-app-tests
cd xera-sample-app-tests
cp .env.example .env && bun install && bunx playwright install chromium
bun run xera:fetch XFB-6 && bun run xera:exec XFB-6
```

Or start from scratch with your own xera project pointed at the same FlowBoard:

```bash
mkdir flowboard-tests && cd flowboard-tests
xera init -y --shape mixed --tracker github \
  --gr xera-ai/xera-sample-app \
  --su http://localhost:5173 \
  --au http://localhost:3000
```

::: tip Pair `/xera-run` with `/xera-explore`
FlowBoard's intentional surfaces (stored XSS, JWT edge cases, file upload risks, SQL injection points) are exactly the territory the experimental [`/xera-explore`](/guide/architecture#v09-addition-adversarial-exploration-experimental) skill brainstorms:

```
> /xera-run <TICKET>      # AC-driven happy path → test.feature
> /xera-explore <TICKET>  # negative / boundary / race / a11y / security-smell → explore.feature
```

`/xera-explore` writes to a separate `explore.feature` (tagged `@adversarial`) so PO review of `test.feature` stays undisturbed.
:::

## What you get out of the box

| Skill | What it does |
|---|---|
| `/xera-run <TICKET>` | Full pipeline end-to-end (auto-checks impact after fetch) |
| `/xera-fetch <TICKET>` | Pull story from Jira **or** GitHub Issues; extract modified SUT areas |
| `/xera-feature <TICKET>` | Generate Gherkin |
| `/xera-script <TICKET>` | Generate Playwright spec + page objects |
| `/xera-exec <TICKET>` | Run the test (supports `--grep` per-scenario) |
| `/xera-report <TICKET>` | 9-class classifier + post diagnosis to the tracker |
| `/xera-impact <TICKET>` | Pre-flight: which existing scenarios may break? |
| `/xera-coverage` | Area + AC-level coverage with risk weighting |
| `/xera-fill-gap <area>` | AI-drafted Gherkin for UNCOVERED areas or unsatisfied ACs |
| `/xera-explore <TICKET>` | Brainstorm negative / boundary / race / a11y scenarios |
| `/xera-promote <TICKET> <POM>` | Move a POM to `shared/` |

## Roadmap

| Version | Status | Highlights |
|---|---|---|
| v0.1 – v0.5 | ✅ shipped | Core platform, Web adapter, eval harness (`/xera-eval`), prompt-injection defense, self-healing selectors |
| v0.6 | ✅ shipped | Project knowledge graph, TEST_OUTDATED classifier, `/xera-impact`, HTML viewer + CI artifact |
| v0.7 | ✅ shipped | HTTP API adapter (`@xera-ai/http`), pre-auth pattern, CONTRACT_DRIFT / RATE_LIMITED / AUTH_EXPIRED classifiers |
| v0.8 | ✅ shipped | Coverage gap & AC matrix (`/xera-coverage`, `/xera-fill-gap`), release infra overhaul (changesets `fixed` group, auto-changeset from PR titles, `xera-automation` GitHub App) |
| v0.9 | ✅ shipped | Adversarial exploration (`/xera-explore`, experimental, opt-in) |
| v0.10–v0.15 | ✅ shipped | Multi-editor support (Claude / Cursor / Codex), cognitive AC extraction from Jira description, `xera init --update --shape` upgrade path, `.d.ts` declarations for all packages |
| v0.16 | ✅ shipped | GitHub Issues tracker (`xera init --tracker github`, no token required), `samples remove` subcommand |
| v1.0 | 🚧 planned | **Stability commitment** (semver from 1.0, frozen `TestAdapter` interface), public documentation site, cross-adapter graph linkage (endpoint as first-class graph node) |
| v1.x | 🔭 planned | `/xera-sprint` multi-ticket orchestration, production trace → test backfill, hosted live dashboard (graph + coverage + disputes), messaging adapters (Kafka, AMQP, WebSocket), GraphQL, gRPC |
| v2.0 | 🔭 planned | Optional SaaS backend (only if multi-org demand) |
| Future | 💡 designed-for | Mobile, performance, and security adapters — the `TestAdapter` interface is built to accept them; no timeline or owner yet |

Released under the [Apache 2.0 License](https://github.com/xera-ai/xera/blob/main/LICENSE).
