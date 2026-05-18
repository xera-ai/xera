# xera — Project Context

A single-page brief on **what xera is, who it is for, and where it is going**. Read this first if you are new to the project; then dive into `ARCHITECTURE.md` for the how.

## 1. One-paragraph vision

xera is an **AI-native test framework** for QA teams. A QA opens Claude Code, types `/xera-run JIRA-123`, and the framework fetches the story from Jira, generates Gherkin scenarios, writes Playwright `spec.ts` + page objects, executes the run, classifies the outcome (real bug vs. test rot vs. flake vs. contract drift vs. auth/rate-limit issue), and posts a diagnosis back to Jira — all driven by Claude Code skills calling deterministic helpers in `xera-internal`. The same loop works for browser-driven web tests (`@xera-ai/web`) and HTTP API tests (`@xera-ai/http`).

The non-obvious bet: keep the AI work inside the user's Claude Code session, and keep everything else in plain, deterministic, file-in/file-out binaries that any QA can read, debug, and trust.

## 2. The problem

QA teams in product orgs typically face three hand-offs:

1. **Ticket → test idea.** PM/BA writes a Jira story with acceptance criteria; QA has to translate AC into scenarios. This is interpretive work and is often done twice (once by QA writing scenarios, once by a reviewer cross-checking AC).
2. **Test idea → executable.** Scenarios become Playwright/HTTP tests, page objects, fixtures. Hours of repetitive scaffolding.
3. **Result → diagnosis.** When a test fails, was it a real bug, a stale selector, an auth issue, a flake, or an outdated assertion against a still-correct system? Today the answer is "QA reads the trace and guesses."

LLMs can shorten each hop, but only if the framework around them is deterministic enough to be auditable, idempotent enough to be re-runnable, and integrated enough to be honest about what is AI-generated versus human-reviewed.

That is xera.

## 3. Audiences

| Audience | Why they touch xera |
|---|---|
| **QA engineer (primary)** | Runs `/xera-*` skills in Claude Code; reviews + commits Gherkin and generated `spec.ts`; disputes classifications they disagree with. |
| **PO / BA (secondary)** | Reviews `test.feature` as the contract between AC and tests; never needs to read `spec.ts`. |
| **Eng manager / QA lead** | Opens the graph HTML viewer (built in CI, sticky-commented on PRs) to see coverage, impact, and disputes without cloning the repo. |
| **Dev** | Sees Jira comments posted by xera; occasionally chases a `CONTRACT_DRIFT` finding against an OpenAPI change. |
| **xera contributor (this repo)** | Edits skills, prompts, deterministic helpers, adapters — see `AGENTS.md` and `CLAUDE.md`. |

End users **never** install xera via `npm install @xera-ai/core`. They use `bunx @xera-ai/cli init` once and from then on interact through `/xera-*` slash commands.

## 4. Product principles

These are the guardrails that decide design trade-offs. When in doubt, fall back to these:

1. **Determinism owns the seams.** Anything that touches disk, Jira, the trace, the graph, or the classifier is a `xera-internal` subcommand. AI is only allowed in two places: the QA's Claude Code session, and the eval harness.
2. **Skills are workflows, prompts are instructions.** A skill says *"call this binary, read this file, then call this prompt"*. A prompt says *"here is how to generate Gherkin / diagnose a failure / classify outdatedness"*. Do not blur the two.
3. **Every artifact is git-friendly.** `test.feature`, `spec.ts`, `meta.json`, graph events — all commit-friendly text. Snapshots, viewer HTML, traces — derived and gitignored.
4. **One adapter pattern, many adapters.** Web today, HTTP today, mobile/perf/security tomorrow. The classifier, reporter, graph, coverage engine, and skills are adapter-agnostic by design.
5. **Cheap to audit.** A QA who does not trust the AI output must be able to (a) read the prompt that produced it, (b) re-run the exact same input through `xera-internal`, and (c) dispute a classification with one CLI call.
6. **CI is a viewer, not a gate.** xera does not block PRs by default. It renders graph HTML + coverage tabs and posts sticky comments. Adoption beats enforcement.
7. **No vendor lock to a cloud backend.** Everything lives in the user's repo. SaaS is a v2.x option contingent on multi-org demand, not a foundational assumption.

## 5. Scope

### In scope

- **Web E2E** via Playwright (browser-driven, with auth-state refresh).
- **HTTP API** via Playwright `APIRequestContext` (no browser, OpenAPI-aware).
- **Jira** as the ticket source of record (REST + MCP backends).
- **Claude Code** as the only supported AI session (`/xera-*` skills are Claude Code skills).
- **Project knowledge graph** — ticket ↔ scenario ↔ POM ↔ SUT-area ↔ AC links, kept as committed event JSONL.
- **Coverage & AC matrix** — three-state area model (UNCOVERED / STALE / COVERED) + AC-level gaps.
- **Self-heal of selector drift** — auto-fix POM locators when the SUT moved.
- **Adversarial exploration (v0.9, experimental)** — separate `explore.feature` for negative / boundary / race / security-smell scenarios, opt-in only.

### Out of scope

- **Other AI clients.** Codex CLI, Cursor, ChatGPT — not supported. Skills assume Claude Code's tool-use loop.
- **Mobile, performance, security, messaging adapters.** Designed for via the adapter pattern but not built (planned v1.x for messaging; mobile/perf/security have no current owner).
- **Cloud backend / multi-tenant SaaS.** Considered v2.0 only if multi-org demand emerges.
- **Test data factories / cleanup automation.** Out of scope — QA's responsibility via fixtures and `auth-setup`.
- **CI-side test authoring.** xera generates tests **in the QA's local session**; CI only renders the graph viewer and runs the tests QA has already committed.
- **Sources other than Jira** (Linear, GitHub Issues, Notion). Possible via the same client interface but not committed.

## 6. Version journey

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
| v1.0 | planned | Cross-adapter graph linkage (endpoint as first-class graph node) · live dashboard. |
| v1.x | planned | Messaging adapters (Kafka, AMQP, WebSocket) · GraphQL · gRPC. |
| v2.0 | planned | Optional SaaS backend (only if multi-org demand). |

Skip-numbering (v0.4 was rolled into v0.5; v0.8 absorbed release-infra) is deliberate — versions are scoped to ship a coherent user-visible bundle, not a single sub-feature.

## 7. Where to go next

| If you want to… | Read |
|---|---|
| Understand the runtime layers, packages, and subcommand count | [`ARCHITECTURE.md`](ARCHITECTURE.md) |
| Configure `xera.config.ts` for your project | [`CONFIGURATION.md`](CONFIGURATION.md) |
| Debug a specific failure mode | [`TROUBLESHOOTING.md`](TROUBLESHOOTING.md) |
| See the authoritative design for any release | [`superpowers/specs/`](superpowers/specs/) |
| See task-by-task TDD plans + postmortems | [`superpowers/plans/`](superpowers/plans/) |
| Contribute code (conventions, publish flow, commit style) | [`../AGENTS.md`](../AGENTS.md) |
| Contribute code as Claude Code (vendored skills, MCP usage) | [`../CLAUDE.md`](../CLAUDE.md) |
