---
layout: home

hero:
  name: xera
  text: AI-native test framework for QA teams
  tagline: >-
    Fetch a ticket from Jira or GitHub Issues, generate Gherkin + Playwright
    spec, run the test, diagnose the failure, and post results back — driven
    by AI coding-agent skills (Claude Code, Cursor, OpenAI Codex CLI).
  actions:
    - theme: brand
      text: Get started
      link: /guide/getting-started
    - theme: alt
      text: View on GitHub
      link: https://github.com/xera-ai/xera
    - theme: alt
      text: Architecture
      link: /guide/architecture

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
| v0.1 – v0.5 | ✅ shipped | Core platform, Web adapter, eval harness, prompt-injection defense, self-healing selectors |
| v0.6 | ✅ shipped | Project knowledge graph, TEST_OUTDATED classifier, `/xera-impact`, HTML viewer |
| v0.7 | ✅ shipped | HTTP API adapter, pre-auth pattern, CONTRACT_DRIFT / RATE_LIMITED / AUTH_EXPIRED |
| v0.8 | ✅ shipped | Coverage gap & AC matrix, release infra overhaul (changesets `fixed` group) |
| v0.9 | ✅ shipped | Adversarial exploration (`/xera-explore`, experimental, opt-in) |
| v0.10–v0.15 | ✅ shipped | Multi-editor support, CLI UX hardening, cognitive AC extraction |
| v0.16 | ✅ shipped | GitHub Issues tracker, `/xera-run` first-run fix |
| v1.0 | 🚧 planned | Cross-adapter graph linkage, live dashboard |

Released under the [MIT License](https://github.com/xera-ai/xera/blob/main/README.md#license).
