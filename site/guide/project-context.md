# xera — Project Context

A single-page brief on **what xera is, who it is for, and where it is going**. Read this first if you are new to the project; then dive into `ARCHITECTURE.md` for the how.

## 1. One-paragraph vision

xera is an **AI-native test framework** for QA teams. A QA opens their AI coding agent (Claude Code, Cursor, or OpenAI Codex CLI), types `/xera-run JIRA-123` (or `/xera-run GH-42` against a GitHub issue), and the framework fetches the story from the configured tracker (Jira or GitHub Issues), generates Gherkin scenarios, writes Playwright `spec.ts` + page objects, executes the run, classifies the outcome (real bug vs. test rot vs. flake vs. contract drift vs. auth/rate-limit issue), and posts a diagnosis back to the tracker — all driven by AI coding-agent skills calling deterministic helpers in `xera-internal`. The same loop works for browser-driven web tests (`@xera-ai/web`) and HTTP API tests (`@xera-ai/http`).

The non-obvious bet: keep the AI work inside the user's Claude Code session, and keep everything else in plain, deterministic, file-in/file-out binaries that any QA can read, debug, and trust.

## 2. The problem

QA teams in product orgs typically face three hand-offs:

1. **Ticket → test idea.** PM/BA writes a Jira story or GitHub issue with acceptance criteria; QA has to translate AC into scenarios. This is interpretive work and is often done twice (once by QA writing scenarios, once by a reviewer cross-checking AC).
2. **Test idea → executable.** Scenarios become Playwright/HTTP tests, page objects, fixtures. Hours of repetitive scaffolding.
3. **Result → diagnosis.** When a test fails, was it a real bug, a stale selector, an auth issue, a flake, or an outdated assertion against a still-correct system? Today the answer is "QA reads the trace and guesses."

LLMs can shorten each hop, but only if the framework around them is deterministic enough to be auditable, idempotent enough to be re-runnable, and integrated enough to be honest about what is AI-generated versus human-reviewed.

That is xera.

## 3. Audiences

| Audience | Why they touch xera |
|---|---|
| **QA engineer (primary)** | Runs `/xera-*` skills in their AI coding agent (Claude Code, Cursor, or Codex CLI); reviews + commits Gherkin and generated `spec.ts`; disputes classifications they disagree with. |
| **PO / BA (secondary)** | Reviews `test.feature` as the contract between AC and tests; never needs to read `spec.ts`. |
| **Eng manager / QA lead** | Opens the graph HTML viewer (built in CI, sticky-commented on PRs) to see coverage, impact, and disputes without cloning the repo. |
| **Dev** | Sees Jira / GitHub issue comments posted by xera; occasionally chases a `CONTRACT_DRIFT` finding against an OpenAPI change. |
| **xera contributor (this repo)** | Edits skills, prompts, deterministic helpers, adapters — see `AGENTS.md` and `CLAUDE.md`. |

End users **never** install xera via `npm install @xera-ai/core`. They use `bunx @xera-ai/cli init` once and from then on interact through `/xera-*` slash commands.

## 4. System at a glance

A high-level mental model of the moving parts. For details (subcommand list, classifier classes, graph schema) jump to [`ARCHITECTURE.md`](./architecture).

### 4.1 The three-layer triad

xera is built on a deliberate split between **what to do**, **how to think**, and **how to act on disk**:

```
   ┌──────────────────────────────────────────────────────────┐
   │ Skills  (packages/skills/*.md)   — workflows             │
   │   "Call this binary, then read this file, then call      │
   │    this prompt, then write that file."                   │
   └────────────────┬─────────────────────────────────────────┘
                    │ skill points at ↓ in same session
   ┌────────────────▼─────────────────────────────────────────┐
   │ Prompts (packages/prompts/*.md) — LLM instructions       │
   │   "Here is how to generate Gherkin / diagnose a          │
   │    failure / classify outdatedness."                     │
   └────────────────┬─────────────────────────────────────────┘
                    │ skill also calls ↓ via `bun run xera:*`
   ┌────────────────▼─────────────────────────────────────────┐
   │ xera-internal (packages/core/src/bin-internal/)          │
   │   Deterministic file-in / file-out binaries.             │
   │   No AI shell-out, no network except Jira + the SUT.     │
   └──────────────────────────────────────────────────────────┘
```

A skill is data the LLM reads to know the *workflow*. A prompt is data the LLM reads to know *how to generate*. A binary is the deterministic seam that touches disk, Jira, traces, and the graph. **Mixing these layers is the most common design mistake.**

### 4.2 Packages

Six packages, one fixed-group version (currently `0.16.x`). All bump in lockstep via changesets.

| Package | One-line role |
|---|---|
| `@xera-ai/core` | Config, paths, hashing, `IssueProvider` (Jira + GitHub Issues behind one interface, v0.16+), 9-class classifier, auth-state crypto, **graph module**, **coverage module**, and the `xera-internal` binary (deterministic helpers). |
| `@xera-ai/cli` | Public CLI — `init` (`--tracker jira\|github`), `doctor` (`--strict [ticket]`), and `samples remove`. Everything else is via skills. |
| `@xera-ai/web` | Browser adapter — Playwright + trace normalizer + POM-scan + Gherkin lint. |
| `@xera-ai/http` | HTTP API adapter — Playwright `APIRequestContext`, OpenAPI loader, pre-auth helpers, `CONTRACT_DRIFT` detection. |
| `@xera-ai/skills` | The 12 user-facing `.md` workflows that drive everything from an AI coding-agent session (Claude Code, Cursor, or Codex CLI). Scaffolded per editor by `xera init`. |
| `@xera-ai/prompts` | The 12 versioned LLM prompt templates the skills point at. |

### 4.3 Where data lives

Three categories of artifact, with very different lifecycles:

```
.xera/<TICKET>/                  per-ticket scratch (mostly gitignored)
  story.md, meta.json            ◄── from xera:fetch
  test.feature                   ◄── LLM-generated, human-reviewed, COMMITTED
  spec.ts, page-objects/         ◄── LLM-generated, human-reviewed, COMMITTED
  runs/<ts>/                     ◄── Playwright outputs (gitignored)
  normalized.json, report.json   ◄── derived (gitignored)

.xera/graph/
  events/<session>.jsonl         ◄── append-only, sharded, COMMITTED
  snapshot.json                  ◄── derived from events (gitignored)
  graph.html                     ◄── viewer artifact (gitignored, CI publishes)

.xera/.auth/{web,http}/<role>.json   AES-256-GCM encrypted storage state
                                     (gitignored; never logged)
```

Commit-friendly text wins; everything derived is rebuildable from what is committed.

### 4.4 The pipeline a QA actually triggers

`/xera-run <TICKET>` orchestrates the full loop. Each arrow is a skill step that calls one or more `xera-internal` subcommands, often with an LLM-in-the-loop generation step in between.

```
   Jira ticket OR GitHub issue
       │
       ▼
   fetch ──► story.md + meta.json     (deterministic; MCP or REST/gh CLI)
       │
       ▼
   feature  ──► test.feature           (LLM via feature-from-story.md)
       │        (validate-feature gate)
       ▼
   script   ──► spec.ts + POMs         (LLM via script-from-feature-{web,http}.md)
       │        (typecheck + lint gate)
       ▼
   exec     ──► runs/<ts>/             (Playwright run; trace.zip)
       │
       ▼
   normalize ─► normalized.json        (parse trace + secret-scrub)
       │
       ▼
   report   ──► classification         (9 classes; in-session LLM uses
       │                                diagnose-failure.md +
       │                                classify-outdated.md against graph)
       ▼
   post     ──► tracker comment        (deterministic; Jira REST/MCP or
                                        GitHub MCP/`gh issue comment`)
```

Skill steps emit `graph-record` events at every relevant boundary, so the project knowledge graph stays current without any extra QA action.

### 4.5 The graph and its consumers

The v0.6 project knowledge graph is the most under-appreciated component. It is a **commit-friendly event log** (`events/*.jsonl`, one file per skill invocation) plus a **derived snapshot** (`snapshot.json`, gitignored). Five read-only consumers stand on top of it:

- **classify** — detects `TEST_OUTDATED` by reading recent run history; bumps `/xera-report` confidence.
- **impact** — BFS over `modifies`/`covers` edges; answers "which scenarios may break if I merge ticket X?"
- **coverage** (v0.8) — three-state area model + AC matrix; risk-weighted gap list.
- **render** — single-file HTML viewer (vis-network); CI artifact + sticky comment.
- **disputes** — CLI report of QA-overridden classifications; weekly QA-lead signal.

## 5. Product principles

These are the guardrails that decide design trade-offs. When in doubt, fall back to these:

1. **Determinism owns the seams.** Anything that touches disk, Jira, the trace, the graph, or the classifier is a `xera-internal` subcommand. AI is only allowed in two places: the QA's Claude Code session, and the eval harness.
2. **Skills are workflows, prompts are instructions.** A skill says *"call this binary, read this file, then call this prompt"*. A prompt says *"here is how to generate Gherkin / diagnose a failure / classify outdatedness"*. Do not blur the two.
3. **Every artifact is git-friendly.** `test.feature`, `spec.ts`, `meta.json`, graph events — all commit-friendly text. Snapshots, viewer HTML, traces — derived and gitignored.
4. **One adapter pattern, many adapters.** Web today, HTTP today, mobile/perf/security tomorrow. The classifier, reporter, graph, coverage engine, and skills are adapter-agnostic by design.
5. **Cheap to audit.** A QA who does not trust the AI output must be able to (a) read the prompt that produced it, (b) re-run the exact same input through `xera-internal`, and (c) dispute a classification with one CLI call.
6. **CI is a viewer, not a gate.** xera does not block PRs by default. It renders graph HTML + coverage tabs and posts sticky comments. Adoption beats enforcement.
7. **No vendor lock to a cloud backend.** Everything lives in the user's repo. SaaS is a v2.x option contingent on multi-org demand, not a foundational assumption.

## 6. Scope

### In scope

- **Web E2E** via Playwright (browser-driven, with auth-state refresh).
- **HTTP API** via Playwright `APIRequestContext` (no browser, OpenAPI-aware).
- **Issue trackers (v0.16+)** — Jira (REST + MCP) and GitHub Issues (`gh` CLI + GitHub MCP) behind a unified `IssueProvider` interface. Exactly one is configured per project.
- **AI coding agents** — Claude Code, Cursor ≥1.6, and OpenAI Codex CLI — as the supported skill runners (`/xera-*` skills are scaffolded per editor by `xera init --editor <list>`).
- **Project knowledge graph** — ticket ↔ scenario ↔ POM ↔ SUT-area ↔ AC links, kept as committed event JSONL.
- **Coverage & AC matrix** — three-state area model (UNCOVERED / STALE / COVERED) + AC-level gaps.
- **Self-heal of selector drift** — auto-fix POM locators when the SUT moved.
- **Adversarial exploration (v0.9, experimental)** — separate `explore.feature` for negative / boundary / race / security-smell scenarios, opt-in only.

### Out of scope

- **Other AI clients.** ChatGPT, Gemini CLI, and similar tools are not supported. xera targets Claude Code, Cursor ≥1.6, and OpenAI Codex CLI only.
- **Mobile, performance, security, messaging adapters.** Designed for via the adapter pattern but not built (planned v1.x for messaging; mobile/perf/security have no current owner).
- **Cloud backend / multi-tenant SaaS.** Considered v2.0 only if multi-org demand emerges.
- **Test data factories / cleanup automation.** Out of scope — QA's responsibility via fixtures and `auth-setup`.
- **CI-side test authoring.** xera generates tests **in the QA's local session**; CI only renders the graph viewer and runs the tests QA has already committed.
- **Issue trackers beyond Jira and GitHub Issues** (Linear, Notion, etc.). Possible via the same `IssueProvider` interface but not committed.

## 7. Version journey

xera releases under a single fixed-group version — all six packages bump in lockstep via changesets. Roadmap and reasons:

| Version | Status | Why this release exists |
|---|---|---|
| v0.1 | ✅ | MVP. Prove the loop: ticket → Gherkin → spec → run → diagnose → Jira, locally, for one QA, on a web app. |
| v0.2 | ✅ | An eval harness so we can measure AI generation quality before shipping prompt changes. |
| v0.3 | ✅ | Prompt-injection defense — Jira tickets are external input; treat them as untrusted with boundary tags + refusal label. |
| v0.5 | ✅ | Self-heal selector drift — failing tests should fix themselves when the SUT moved, not page the QA. |
| v0.6 | ✅ | Project knowledge graph — the foundational data layer that makes `TEST_OUTDATED`, `/xera-impact`, and the HTML viewer possible. |
| v0.7 | ✅ | HTTP API adapter — second adapter validates the extension model; adds three classifier classes (`CONTRACT_DRIFT`, `RATE_LIMITED`, `AUTH_EXPIRED`). |
| v0.8 | ✅ | Coverage gap & AC matrix — turn the graph into a coverage and AC-completeness consumer; AI-drafted gap fill. Release infra unified at fixed-group version. |
| v0.9 | ✅ | Adversarial exploration (experimental, opt-in). Brainstorming partner for negative / boundary / race / security-smell scenarios — kept in a separate `explore.feature` so PO review of `test.feature` is undisturbed. |
| v0.10–v0.15 | ✅ | Multi-editor support (`--editor claude\|cursor\|codex\|all`); CLI UX hardening (help-on-no-args, did-you-mean, non-TTY guard); cognitive AC extraction from Jira description body; `init --update --shape` upgrade path. |
| v0.16 | ✅ | **GitHub Issues** as an alternative tracker (no token, `gh` CLI + GitHub MCP); `/xera-run` first-run unblocked (split env-only Step 0 + ticket-specific Step 1.6); `samples remove` public subcommand. |
| v1.0 | planned | Cross-adapter graph linkage (endpoint as first-class graph node) · live dashboard. |
| v1.x | planned | Messaging adapters (Kafka, AMQP, WebSocket) · GraphQL · gRPC. |
| v2.0 | planned | Optional SaaS backend (only if multi-org demand). |

Skip-numbering (v0.4 was rolled into v0.5; v0.8 absorbed release-infra) is deliberate — versions are scoped to ship a coherent user-visible bundle, not a single sub-feature.

## 8. Where to go next

| If you want to… | Read |
|---|---|
| Understand the runtime layers, packages, and subcommand count | [`ARCHITECTURE.md`](./architecture) |
| Configure `xera.config.ts` for your project | [`CONFIGURATION.md`](./configuration) |
| Debug a specific failure mode | [`TROUBLESHOOTING.md`](./troubleshooting) |
| See the authoritative design for any release | [`superpowers/specs/`](https://github.com/xera-ai/xera/tree/main/docs/superpowers/specs/) |
| See task-by-task TDD plans + postmortems | [`superpowers/plans/`](https://github.com/xera-ai/xera/tree/main/docs/superpowers/plans/) |
| Contribute code (conventions, publish flow, commit style) | [`../AGENTS.md`](https://github.com/xera-ai/xera/blob/main/AGENTS.md) |
| Contribute code as Claude Code (vendored skills, MCP usage) | [`../CLAUDE.md`](https://github.com/xera-ai/xera/blob/main/CLAUDE.md) |
