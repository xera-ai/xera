# xera — Core Platform + Web Adapter (v0.1) Design

**Status:** Draft for review
**Date:** 2026-05-14
**Author:** thanh@trinity-technology.com
**Scope:** MVP (v0.1) — Core platform + Web testing adapter only
**Out of scope (separate specs):** Mobile, API, Performance, Security adapters; CI mode; self-healing auto-fix; SaaS backend

---

## 1. Goals & Non-Goals

### 1.1 Goals

- Build an **AI-native test framework** for QA teams in which the AI generates Gherkin scenarios, Playwright specs, and diagnoses failures, with no per-QA API key required.
- Make test artifacts (Gherkin, code, results) collaborative across BA, PM, Dev, and QA via git + Jira.
- Provide a working end-to-end MVP for **Web E2E testing** that a QA can install and use within an hour.
- Architect for adapter extensibility (Mobile, API, Performance, Security) without locking those into v0.1.

### 1.2 Non-Goals (v0.1)

- Mobile, API, Performance, Security testing.
- CI / scheduled / webhook-triggered runs.
- Cloud backend, multi-tenant workspace, SaaS dashboard.
- Authenticated cross-org sync.
- Test data factories / cleanup automation.
- Auto-healing of failing tests (diagnose only).
- Codex CLI compatibility (Claude Code only for v0.1).

### 1.3 Definition of "Ready to Use"

A QA on a real product team can:

1. Run `bunx xera init` in a fresh project and answer ≤ 5 prompts.
2. Open Claude Code, type `/xera-run SAMPLE-001`, see a green E2E pass against a seeded sample.
3. Run `/xera-run <real-jira-key>` against their own Jira ticket — story is fetched, Gherkin generated, Playwright spec generated, test executed against their staging app (with login), failure diagnosed if any, comment posted to Jira.
4. Iterate on the same ticket — re-run, edit Gherkin manually, re-generate spec, see updated status.

If any of those breaks for a typical user, MVP is not ready.

---

## 2. Architecture Overview

### 2.1 System diagram

```
┌─────────────────────────────────────────────────────────────────┐
│ QA's machine — Claude Code session running in project repo      │
│                                                                 │
│  /xera-run JIRA-123     ◄── only user-facing entry point        │
│         │                                                       │
│         ▼                                                       │
│  Skill xera-run.md      ◄── prompts session LLM to orchestrate  │
│         │                                                       │
│         ├──► bun run xera:fetch JIRA-123    ──► story.md        │
│         │       (deterministic, calls Jira via MCP or REST)     │
│         │                                                       │
│         ├──► session LLM writes test.feature from story.md      │
│         │       (uses @xera-ai/prompts/feature-from-story.md)      │
│         │                                                       │
│         ├──► bun run xera:validate-feature                      │
│         │                                                       │
│         ├──► session LLM writes spec.ts + page-objects/         │
│         │       (uses @xera-ai/prompts/script-from-feature.md)     │
│         │                                                       │
│         ├──► bun run xera:typecheck + xera:lint                 │
│         │                                                       │
│         ├──► bun run xera:exec    ──► runs/<ts>/...             │
│         │       (Playwright runs; auth state refresh inside)    │
│         │                                                       │
│         ├──► bun run xera:normalize ──► normalized.json         │
│         │       (parse trace.zip + deterministic secret scrub)  │
│         │                                                       │
│         ├──► session LLM classifies failure(s) + writes         │
│         │       status.json + Jira comment text                 │
│         │       (uses @xera-ai/prompts/diagnose-failure.md)        │
│         │                                                       │
│         └──► bun run xera:post     ──► Jira comment posted      │
│                                                                 │
│  All artifacts live in: .xera/JIRA-123/                         │
└─────────────────────────────────────────────────────────────────┘
                            │
                            ▼
                    ┌───────────────┐
                    │  Jira ticket  │
                    │  (BA's story  │
                    │   + comments) │
                    └───────────────┘
```

### 2.2 Layered responsibilities

| Layer | Role | Implementation |
|---|---|---|
| **Public CLI** | Bootstrap project, health check | `@xera-ai/cli` — only `xera init` and `xera doctor` |
| **Skills** | Primary user interface; orchestrate AI + deterministic steps | `@xera-ai/skills` — `.md` files copied to project's `.claude/skills/` |
| **Prompt templates** | Versioned LLM instructions for each AI step | `@xera-ai/prompts` — independently versioned package |
| **Internal CLI** | Deterministic helpers invoked by skills via `bun run xera:*`; also available for advanced/recovery use (replay, unlock, prune) | `@xera-ai/core` — `xera-internal` binary |
| **Adapter implementations** | Test-type-specific generation, execution, parsing | `@xera-ai/web` for v0.1 |
| **Adapter interface** | Contract for new adapters | `TestAdapter` interface in `@xera-ai/core` |

### 2.3 Why this split

- **AI invocation problem solved:** The Claude Code session that runs the skill IS the LLM. Skills do not call out to `claude` binary; deterministic helpers do not call LLM.
- **No surface ambiguity:** End users invoke `xera init` once and skills from then on. There is no `bunx xera feature` or similar in the public CLI; `xera-internal` is callable directly for advanced/recovery cases (replay, unlock, prune) but is not the primary workflow.
- **Single source of truth per concern:** Each `bun run xera:*` script wraps one focused function in `@xera-ai/core`. Skills orchestrate by composing them.
- **Testability:** `xera-internal` is pure functions wrapped in a bin. Unit-testable without LLM.

---

## 3. Repository Structure

### 3.1 `xera-ai/xera` (the framework repo)

```
xera/
├── packages/
│   ├── core/                       # @xera-ai/core
│   │   ├── src/
│   │   │   ├── config/             # xera.config.ts loader, schema, validation (zod)
│   │   │   ├── artifact/           # .xera/<TICKET>/ path resolution, IO, hashing
│   │   │   ├── jira/               # fetch + post via Atlassian MCP, REST fallback
│   │   │   ├── classifier/         # adapter-agnostic classification framework
│   │   │   ├── adapter/types.ts    # TestAdapter interface
│   │   │   ├── orchestrator/       # used by xera-run skill steps
│   │   │   ├── reporter/           # Jira comment builder, status.json writer
│   │   │   ├── logging/            # NDJSON xera.log writer
│   │   │   ├── lock/               # concurrent run lock
│   │   │   └── auth/               # storageState manager, encryption
│   │   ├── bin/internal.ts         # `xera-internal` (called by `bun run xera:*`)
│   │   └── test/
│   │
│   ├── cli/                        # @xera-ai/cli — public CLI: init + doctor only
│   │   ├── src/commands/init.ts
│   │   ├── src/commands/doctor.ts
│   │   └── bin/xera
│   │
│   ├── web/                        # @xera-ai/web — Playwright adapter
│   │   ├── src/
│   │   │   ├── generator/          # spec.ts + POM gen helpers
│   │   │   ├── executor/           # playwright runner wrapper
│   │   │   ├── trace-normalizer/   # parse trace.zip → normalized.json + scrub
│   │   │   ├── auth-setup/         # storageState refresh runner
│   │   │   └── index.ts            # implements TestAdapter
│   │   └── test/
│   │
│   ├── skills/                     # @xera-ai/skills — .md files for .claude/skills/
│   │   ├── xera-run.md
│   │   ├── xera-fetch.md
│   │   ├── xera-feature.md
│   │   ├── xera-script.md
│   │   ├── xera-exec.md
│   │   ├── xera-report.md
│   │   └── xera-promote.md
│   │
│   └── prompts/                    # @xera-ai/prompts — versioned LLM templates
│       ├── feature-from-story.md
│       ├── script-from-feature.md
│       ├── diagnose-failure.md
│       └── package.json            # own semver
│
├── fixtures/
│   ├── sample-app/                 # Next.js fixture web app for E2E tests
│   └── golden-tickets/             # JSON fixtures for classifier tests
│
├── docs/
│   ├── superpowers/specs/          # this spec lives here
│   ├── TROUBLESHOOTING.md
│   └── CONFIGURATION.md
│
├── .github/workflows/
│   ├── ci.yml                      # unit + snapshot + integration on every PR
│   └── nightly-e2e.yml             # full E2E against sample-app
│
├── package.json                    # bun workspace root
├── bunfig.toml
├── tsconfig.base.json
└── README.md
```

### 3.2 `xera-ai/xera-starter` (template repo, separate)

Boilerplate consumed via `gh repo create --template`. Contains a pre-`init`'d project (Playwright config, tsconfig, sample `.xera/SAMPLE-001/`). Optional — `bunx xera init` in an empty project does the same.

### 3.3 Project repo (after `xera init`)

```
my-test-project/
├── xera.config.ts             # generated
├── playwright.config.ts       # generated
├── package.json               # deps + xera:* scripts added
├── tsconfig.json              # generated
├── .env.example               # generated
├── .env                       # gitignored, user-created
├── .gitignore                 # updated (adds .env, .xera/**/runs/, .xera/.auth/)
├── .claude/skills/            # 7 skills copied from @xera-ai/skills (committed)
├── .xera/
│   ├── .auth/                 # gitignored — storageState cache
│   ├── SAMPLE-001/            # seeded sample (offline-friendly)
│   └── <real tickets>/        # created on first /xera-run
├── shared/
│   ├── page-objects/          # team-promoted POMs
│   └── auth-setup.ts          # generated if user enabled auth at init
└── tsconfig.json
```

---

## 4. CLI Surface

### 4.1 Public CLI commands

| Command | Purpose |
|---|---|
| `bunx xera init` | Interactive scaffold of a new project (generates config, installs deps, copies skills, seeds sample ticket, optionally generates auth setup) |
| `bunx xera init --update` | Non-destructive refresh of an existing project: bump deps, refresh skills with 3-way merge, update prompts version; never overwrite `xera.config.ts`, `.xera/`, `shared/` |
| `bunx xera doctor` | Read-only health check: bun + Playwright + browsers + config validity + Jira reachability + MCP detection + skill versions vs `@xera-ai/skills` |
| `bunx xera doctor --strict [TICKET]` | Same as doctor but exits non-zero on any failing check. `--strict` alone: env-only strict (invoked by `xera-run` skill Step 0). `--strict <TICKET>`: env + ticket-specific strict (invoked by Step 1.6 after fetch materializes `.xera/<TICKET>/`). |
| `bunx xera doctor --logs <TICKET>` | Pretty-print `.xera/<TICKET>/xera.log` |

### 4.2 Internal CLI (invoked only by skills via `bun run xera:*`)

| npm script | Binary | Purpose |
|---|---|---|
| `xera:fetch <TICKET>` | `xera-internal fetch` | Pull story from Jira, write `story.md` + `meta.json` |
| `xera:validate-feature <TICKET>` | `xera-internal validate-feature` | Parse `test.feature`, exit non-zero on Gherkin errors |
| `xera:typecheck <TICKET>` | `xera-internal typecheck` | `tsc --noEmit` on `spec.ts` + POMs in ticket dir |
| `xera:lint <TICKET>` | `xera-internal lint` | Project ESLint config + xera rules (selector strategy, naming) |
| `xera:exec <TICKET>` | `xera-internal exec` | Refresh auth state if needed, run Playwright, write `runs/<ts>/` |
| `xera:normalize <TICKET>` | `xera-internal normalize` | Parse trace.zip into `normalized.json`, run secret scrubber |
| `xera:post <TICKET>` | `xera-internal post` | Read `status.json` + Jira comment text, post via MCP/REST |
| `xera:status <TICKET>` | `xera-internal status` | Pretty-print `status.json` |
| `xera:unlock <TICKET>` | `xera-internal unlock` | Force-remove `.lock` (only if stale per heuristics) |

### 4.3 Init flow

```
$ bunx xera init
xera v0.1.0 — project setup

? Project name: my-tests
? Jira workspace URL: https://thanhtrinity.atlassian.net
? Jira project key(s) (comma-separated): JIRA
  ▸ Probing Jira (using Atlassian MCP if available, else asking for token)...
  ✓ Fetched sample ticket fields
? Which field contains the user story?
  ▸ description ✓
  ▸ customfield_10001 (Acceptance Criteria)
  ▸ <custom>
? Which field contains acceptance criteria (if separate)?
  ▸ customfield_10001 ✓
  ▸ (use story field)
? Web app staging URL: https://staging.example.com
? Does your app require login to test most pages? (Y/n) Y
? Which auth strategy?
  ▸ Browser login form (Playwright storageState) ✓
  ▸ API token (Bearer)
  ▸ OAuth (manual setup)
? Test user roles to support (comma-separated, e.g. admin,regular): admin,regular
  ▸ Generating shared/auth-setup.ts stub for these roles...
? Install Playwright + chromium now? (Y/n) Y
  ▸ Installing...
? Commit .claude/skills/ to repo (so team uses same versions)? (Y/n) Y

✓ Created xera.config.ts
✓ Created playwright.config.ts
✓ Created .env.example with required env vars
✓ Updated .gitignore
✓ Installed 7 skills in .claude/skills/
✓ Seeded .xera/SAMPLE-001/ (offline sample)
✓ Generated shared/auth-setup.ts (please customize for your login flow)

Next steps:
  1. Edit .env (copy from .env.example, fill credentials)
  2. Edit shared/auth-setup.ts to match your login flow
  3. Open Claude Code in this directory
  4. Try the sample: /xera-run SAMPLE-001
  5. Run on a real ticket: /xera-run <YOUR-JIRA-KEY>
```

### 4.4 Doctor output

```
$ bunx xera doctor
xera v0.1.0
─────────────────────────────────────────────────
✓ bun 1.x
✓ playwright 1.x + chromium installed
✓ xera.config.ts found and valid
✓ Atlassian MCP connected (Jira reachable)
✓ Web baseUrl 'staging' (https://staging.example.com) → 200 OK
✓ shared/auth-setup.ts present
✓ .env has all required vars: JIRA_EMAIL, JIRA_API_TOKEN, TEST_ADMIN_EMAIL, ...
✓ .xera/.auth/ exists, encrypted with XERA_AUTH_KEY
✓ .claude/skills/ has 7 xera skills, versions match @xera-ai/skills@0.1.0
✓ secret scrubber smoke test passed
ℹ @xera-ai/prompts@1.0.0 (latest)

Ready. Open Claude Code and try `/xera-run SAMPLE-001`.
```

---

## 5. Skills

### 5.1 Skill catalog

Each skill is a Claude Code `.md` file shipped in `@xera-ai/skills`, copied to `.claude/skills/` at init. End users invoke skills via `/<name>` in Claude Code.

| Skill | Purpose |
|---|---|
| `xera-fetch` | Pull a ticket from Jira → `story.md`. Standalone or invoked by `xera-run`. |
| `xera-feature` | Read `story.md` → write `test.feature` (Gherkin). Standalone or invoked. |
| `xera-script` | Read `test.feature` + `shared/page-objects/` → write `spec.ts` + new POMs. |
| `xera-exec` | Run `bun run xera:exec`, summarize result. |
| `xera-report` | Read normalized trace + history → classify, write `status.json`, draft Jira comment, post. |
| `xera-run` | Orchestrator running all of the above in sequence with health gate. |
| `xera-promote` | Explicit promotion of a POM from `.xera/<TICKET>/page-objects/` to `shared/page-objects/`, with reuse audit. |

### 5.2 `xera-run` skill (reference implementation)

```markdown
---
name: xera-run
description: Run the full xera pipeline for a Jira ticket end-to-end — fetch story, generate Gherkin, generate Playwright spec, execute, diagnose, and post results back to Jira. Use when QA wants to test a ticket from scratch.
---

You will run the xera pipeline for ticket {{TICKET}}.

Step 0 — Health gate (environment only)
  Run: `bunx xera doctor --strict`
  Env-level checks only (bun, xera.config.ts, baseUrl reachability, auth files, OpenAPI, .env, editor skill layout). The ticket-specific gate runs as Step 1.6 below; Step 0 must not require `.xera/{{TICKET}}/` since that dir doesn't exist on the very first invocation (chicken-and-egg, see #149).
  If non-zero exit → STOP. Show the doctor output to the user and ask them to fix env before retrying.

Step 1 — Fetch
  Run: `bun run xera:fetch {{TICKET}}`
  On success, .xera/{{TICKET}}/story.md and meta.json now exist.
  On exit 1 (Jira auth / config): show error, ask user to fix .env or xera.config.ts; STOP.
  On exit 4 (Jira reachable but ticket not found): confirm ticket key with user; STOP.

Step 1.6 — Ticket health gate
  Run: `bunx xera doctor --strict {{TICKET}}`
  Re-runs doctor with the ticket arg now that `/xera-fetch` has materialized `.xera/{{TICKET}}/`. Validates artifact dir present, graph-input.json parses with valid modifiesAreas array, and story.md frontmatter has acceptanceCriteria.
  If non-zero exit → STOP. Most failures are recoverable in-place by re-running a single substep of `/xera-fetch`.

Step 2 — Generate test.feature
  Read .xera/{{TICKET}}/story.md.
  Read .xera/{{TICKET}}/meta.json (check story_hash, prompts_version).
  If meta.feature_generated_from_story_hash matches story_hash AND test.feature exists: ask user whether to regenerate. Default: skip.
  Otherwise follow the instructions in @xera-ai/prompts/feature-from-story.md to produce a Gherkin file.
  Write to .xera/{{TICKET}}/test.feature.
  Update meta.json with feature_generated_from_story_hash, prompts_version.

Step 3 — Validate Gherkin
  Run: `bun run xera:validate-feature {{TICKET}}`
  On non-zero: re-read error, fix test.feature in place, retry. Max 2 retries; on 3rd failure, escalate to user.

Step 4 — Generate spec + POMs
  Read .xera/{{TICKET}}/test.feature.
  Scan shared/page-objects/ for reusable POMs (match by name and exported class).
  Follow @xera-ai/prompts/script-from-feature.md.
  Write spec.ts and any new POMs to .xera/{{TICKET}}/.

Step 5 — Type-check + lint
  Run: `bun run xera:typecheck {{TICKET}}` → fix loop (max 2 retries).
  Run: `bun run xera:lint {{TICKET}}` → fix loop (max 2 retries).

Step 6 — Execute
  Run: `bun run xera:exec {{TICKET}}`
  This refreshes auth state if needed, then runs Playwright.
  Capture the run timestamp from output.

Step 7 — Normalize
  Run: `bun run xera:normalize {{TICKET}}`
  Read .xera/{{TICKET}}/runs/<latest>/normalized.json.

Step 8 — Classify and report
  Follow @xera-ai/prompts/diagnose-failure.md using normalized.json + status.json history.
  Write updated status.json.
  Draft Jira comment (English; see prompt for format).

Step 9 — Post to Jira
  If xera.config.ts has reporting.postToJira === true:
    Run: `bun run xera:post {{TICKET}}`
  Else: print "Jira posting disabled in config" + show the drafted comment.

Step 10 — Summarize to user
  Print: result, classification, scenario pass/fail counts, link to Jira comment, command to re-run.
```

Other skills follow the same prompt-and-orchestrate pattern, scoped to a single step.

---

## 6. Artifact Layout

### 6.1 Project structure under `.xera/`

```
.xera/
├── .auth/                        # gitignored, encrypted storageState cache
│   ├── admin.json
│   ├── regular.json
│   ├── api-tokens.json
│   └── .meta.json
├── SAMPLE-001/                   # seeded by `xera init`
│   ├── story.md
│   ├── test.feature
│   ├── spec.ts
│   ├── page-objects/
│   ├── meta.json
│   ├── status.json
│   └── xera.log
├── JIRA-123/
│   ├── story.md                  # fetched from Jira
│   ├── test.feature              # generated by xera-feature skill
│   ├── spec.ts                   # generated by xera-script skill
│   ├── page-objects/             # POMs not yet promoted to shared/
│   ├── runs/                     # gitignored
│   │   └── 2026-05-14T10-30-00/
│   │       ├── report.json
│   │       ├── trace.zip
│   │       ├── normalized.json   # produced by xera:normalize
│   │       ├── screenshots/
│   │       └── video.webm
│   ├── meta.json                 # ticket metadata + hashes + versions
│   ├── status.json               # latest run + history
│   ├── xera.log                  # NDJSON activity log
│   └── .lock                     # transient, removed on completion
└── ...
```

### 6.2 `meta.json` shape

```json
{
  "ticket": "JIRA-123",
  "fetched_at": "2026-05-14T10:00:00Z",
  "story_hash": "sha256:abc...",
  "feature_generated_at": "2026-05-14T10:02:00Z",
  "feature_generated_from_story_hash": "sha256:abc...",
  "feature_hash": "sha256:def...",
  "script_generated_at": "2026-05-14T10:04:00Z",
  "script_generated_from_feature_hash": "sha256:def...",
  "xera_version": "0.1.0",
  "prompts_version": "1.0.0",
  "adapter": "web"
}
```

### 6.3 `status.json` shape

```json
{
  "ticket": "JIRA-123",
  "lastRun": "2026-05-14T10:30:00Z",
  "result": "FAIL",
  "classification": "REAL_BUG",
  "confidence": "high",
  "scenarios": { "total": 2, "passed": 1, "failed": 1, "skipped": 0 },
  "history": [
    { "ts": "2026-05-14T10:30:00Z", "result": "FAIL", "class": "REAL_BUG" },
    { "ts": "2026-05-13T14:20:00Z", "result": "PASS" }
  ],
  "last_jira_comment_id": "10042"
}
```

### 6.4 `xera.log` shape (NDJSON, append-only)

```
{"ts":"2026-05-14T10:30:00Z","step":"fetch","cmd":"xera:fetch","ticket":"JIRA-123","exit":0,"ms":1234}
{"ts":"2026-05-14T10:30:01Z","step":"feature","prompt":"feature-from-story.md@1.0.0","tokens_in":3200,"tokens_out":800}
{"ts":"2026-05-14T10:30:05Z","step":"validate-feature","cmd":"xera:validate-feature","exit":0,"ms":120}
{"ts":"2026-05-14T10:30:15Z","step":"exec","cmd":"xera:exec","exit":3,"ms":45000,"scenarios_fail":1}
{"ts":"2026-05-14T10:30:30Z","step":"normalize","scrubbed_fields":4,"ms":900}
```

`bunx xera doctor --logs JIRA-123` pretty-prints this.

### 6.5 Data flow

```
story.md ──hash──► meta.story_hash
   │
   ▼ (xera-feature skill)
test.feature ──hash──► meta.feature_hash, meta.feature_generated_from_story_hash
   │
   ▼ (xera-script skill)
spec.ts + POMs ──► meta.script_generated_from_feature_hash
   │
   ▼ (xera:exec)
runs/<ts>/{report.json, trace.zip, screenshots, video}
   │
   ▼ (xera:normalize)
runs/<ts>/normalized.json (secrets scrubbed)
   │
   ▼ (xera-report skill: LLM classifies)
status.json ──► Jira comment (xera:post)
```

Hash-based drift detection: if any upstream hash changes, downstream steps prompt to regenerate.

---

## 7. Web Adapter (`@xera-ai/web`)

### 7.1 Generation strategy

Inputs to spec.ts generation:

- `.xera/<TICKET>/test.feature` (Gherkin source of truth)
- `.xera/<TICKET>/story.md` (business context for ambiguity)
- `shared/page-objects/*.ts` (POMs available for reuse)
- `xera.config.ts` (baseUrl, auth, env)
- Optional: live page snapshot via Playwright MCP (defaults on when `ai.livePageSnapshot: true`)

Output:

- `.xera/<TICKET>/spec.ts`
- `.xera/<TICKET>/page-objects/*.ts` (new POMs only — never modifies `shared/`)

### 7.2 Selector strategy (enforced via lint rule)

Priority order; lint warns on lower-priority choices when a higher one is available in the live page snapshot:

1. `getByRole(...)` — accessible, stable
2. `getByLabel(...)` / `getByText(...)`
3. `getByTestId(...)` — when `data-testid` exists
4. CSS / XPath — last resort, requires `// xera-allow-css: <reason>` comment

Auto-generated class names (Tailwind hash, MUI `MuiButton-root-xyz`) are always rejected.

### 7.3 Gherkin → spec mapping

| Gherkin | Playwright |
|---|---|
| `Feature` | `test.describe()` |
| `Background` | `test.beforeEach()` |
| `Scenario` | `test()` |
| `Scenario Outline` + `Examples` | `for (const example of examples) test(name, ...)` |
| `Given/When/Then` step | Inline Playwright action; no Cucumber step definitions in v0.1 |
| `@skip` tag | `test.skip()` |
| `@only` tag | `test.only()` |
| `@env:staging` tag | Conditional skip based on `XERA_ENV` |

### 7.4 POM reuse and promotion

- On `xera-script`, scan `shared/page-objects/` for class names referenced in the Gherkin (e.g., "login page" → LoginPage).
- If matching POM found and its interface satisfies needed actions → reuse via import.
- If mismatch or absent → generate new POM under `.xera/<TICKET>/page-objects/`.
- Promotion to `shared/` is **explicit only**: `bunx xera-internal promote <TICKET> <POM>` via `/xera-promote` skill, with a diff shown to user for review. Never automatic.

### 7.5 Live page snapshot (default on)

When generating a new POM:

1. Skill instructs session to use Playwright MCP (if connected) to navigate to baseUrl + guessed route from story.
2. Dump accessible tree.
3. Generate POM using actual selectors from the tree.
4. If MCP unavailable → fall back to best-guess from story.md + flag `meta.script_warnings: ["best-guess-selectors"]`.

### 7.6 Quality gates (must-have #4)

In sequence after generation:

1. **Gherkin validate** — `xera:validate-feature` uses `@cucumber/gherkin` parser.
2. **TypeScript compile** — `xera:typecheck` runs `tsc --noEmit` against ticket dir.
3. **Lint** — `xera:lint` runs project ESLint + xera-specific rules (selector strategy, no auto-class selectors, POM naming).

Any failure → skill re-prompts session with the error, retries max 2 times. On 3rd failure → escalate to user with full diagnostic.

### 7.7 Trace normalizer

`@xera-ai/web/trace-normalizer` processes Playwright trace.zip into `normalized.json`:

```json
{
  "runId": "2026-05-14T10-30-00",
  "outcome": "FAIL",
  "scenarios": [
    {
      "name": "Login fails with invalid password",
      "outcome": "FAIL",
      "failure": {
        "step": "expect(login.errorMessage).toContainText(...)",
        "errorMessage": "...",
        "domSnapshotAtFailure": "...",
        "networkAtFailure": [
          { "method": "POST", "url": "/api/login", "status": 500 }
        ],
        "consoleAtFailure": ["..."],
        "screenshotPath": "screenshots/scenario-2-failure.png"
      }
    }
  ],
  "scrubbed_fields_count": 4
}
```

Secret scrubber (must-have #8) runs **before** any of this is exposed:

- Strips `Authorization`, `Cookie`, `Set-Cookie`, `X-API-Key`, `X-Auth-Token` headers.
- Masks request body fields matching regex: `password`, `token`, `secret`, `apiKey`, `accessKey`, credit card patterns.
- Masks input values from any element where `type="password"`.
- Strips localStorage / sessionStorage dumps containing JWT-like patterns.
- Scrubber has its own unit test suite with golden fixtures.

---

## 8. Classification (`@xera-ai/core/classifier`)

### 8.1 Classification buckets

| Class | Definition |
|---|---|
| **PASS** | All scenarios passed |
| **REAL_BUG** | App behavior diverges from story (wrong values, server errors, missing required features) |
| **SELECTOR_DRIFT** | UI changed, expected element not found but similar element nearby in DOM |
| **FLAKY** | Inconsistent across runs (passed recently, no spec change, timing/race indicators) |
| **TEST_BUG** | Gherkin/spec logic error; spec contradicts story |

### 8.2 Algorithm

```
1. Read run report.json → if all PASS → status=PASS, exit.

2. For each failed scenario:
   a. From normalized.json, extract failed step + error + DOM state at failure.
   b. Compare DOM state with what spec expected:
      - Element NOT in DOM:
        - Re-read story.md: was element supposed to exist?
        - Search DOM with relaxed selector (text/role variants).
        - Found similar nearby → SELECTOR_DRIFT.
        - Not found at all → REAL_BUG.
      - Element IN DOM but assertion mismatch → REAL_BUG.
      - Timeout / network error → check video timing + retry indicator → FLAKY if prior run passed.
      - Spec internal contradiction → TEST_BUG.

3. Cross-check with status.json history:
   - First run + ambiguous → lean conservative (TEST_BUG or SELECTOR_DRIFT).
   - 3+ consecutive fails + no spec changes → REAL_BUG with high confidence.

4. Compute confidence: low / medium / high based on signal strength.

5. Produce classification + per-scenario diagnosis text.
```

LLM does steps 1–4 reasoning; classifier framework in `@xera-ai/core` provides utility functions (DOM diff, history comparison, hash check).

### 8.3 Jira comment format (English, must-have)

```
## 🔴 xera test FAILED — JIRA-123 (run 2026-05-14T10:30 UTC)

**Classification:** REAL_BUG (confidence: high)
**Scenarios:** 1 / 2 passed

### Scenario: Login fails with invalid password
- **Expected** (from Gherkin): "I should see an error 'Invalid email or password'"
- **Actual:** No alert element found; page redirected to /500.
- **Diagnosis:** App returned HTTP 500 from POST /api/login on invalid password
  instead of 401 with error message. Likely a regression in backend error handling.
- **Evidence:**
  - Screenshot: <link>
  - Network log: POST /api/login → 500
  - Trace: <link>

### Suggested next action
- Assign a developer to inspect the `/api/login` error handler.
- Re-run after fix: open Claude Code and run `/xera-run JIRA-123`.

### Reproduce locally
```
bunx xera-internal exec JIRA-123 --replay=2026-05-14T10-30
```

---
xera v0.1.0 • prompts v1.0.0 • [Classification feedback](mailto:thanh@trinity-technology.com)
```

### 8.4 Status transitions

- v0.1: NO automatic Jira status transitions. Comment posting only.
- `xera.config.ts.reporting.transition` field exists but defaults to `null` — opt-in per team.

---

## 9. Configuration

### 9.1 `xera.config.ts` full schema

```ts
import { defineConfig } from '@xera-ai/core';

export default defineConfig({
  jira: {
    baseUrl: 'https://thanhtrinity.atlassian.net',
    projectKeys: ['JIRA', 'XERA'],
    fields: {
      story: 'description',
      acceptanceCriteria: 'customfield_10001',
      attachments: 'attachment',
    },
    // Auth: Atlassian MCP preferred; env JIRA_EMAIL + JIRA_API_TOKEN fallback
  },
  web: {
    baseUrl: {
      local:   'http://localhost:3000',
      staging: 'https://staging.example.com',
      prod:    'https://example.com',
    },
    defaultEnv: 'staging',
    auth: {
      strategy: 'storageState',     // 'storageState' | 'apiToken' | 'none'
      ttl: '8h',
      refreshBuffer: '30m',
      setupScript: './shared/auth-setup.ts',
      roles: {
        admin:   { envEmail: 'TEST_ADMIN_EMAIL',   envPassword: 'TEST_ADMIN_PWD' },
        regular: { envEmail: 'TEST_USER_EMAIL',    envPassword: 'TEST_USER_PWD' },
      },
    },
    testData: {
      users: {
        admin:   { fromAuth: 'admin' },
        regular: { fromAuth: 'regular' },
      },
    },
  },
  ai: {
    livePageSnapshot: true,
    confidenceThreshold: 'medium',
    maxRetries: { typecheck: 2, lint: 2, validateFeature: 2 },
  },
  reporting: {
    language: 'en',
    postToJira: true,
    transition: { onPass: null, onFail: null },
    artifactLinks: 'git',          // 'git' | 'local'
  },
  adapters: ['web'],
});
```

### 9.2 Environment variables (`.env.example`)

```bash
# Jira (skip if Atlassian MCP is connected)
JIRA_EMAIL=
JIRA_API_TOKEN=                    # https://id.atlassian.com/manage-profile/security/api-tokens

# Web app test credentials (per role)
TEST_ADMIN_EMAIL=
TEST_ADMIN_PWD=
TEST_USER_EMAIL=
TEST_USER_PWD=

# xera internal — generated by `xera init`; do not regenerate or auth state cache is lost
XERA_AUTH_KEY=

# Optional
XERA_ENV=staging
```

### 9.3 Precedence

CLI flag > ENV var > `.env` > `xera.config.ts` > built-in default.

---

## 10. Auth State Persistence (must-have #1 + extension)

### 10.1 Why this matters

Most real apps require login. Without persistent auth state, every test scenario re-logs in → slow, flaky, hits rate limits, masks real bugs.

### 10.2 Mechanism

```
xera:exec
  ├─► For each role referenced by spec:
  │    1. Read .xera/.auth/<role>.json + .meta.json
  │    2. If file missing OR meta.expires_at < now + refreshBuffer
  │       OR mtime > config.auth.ttl ago:
  │       a. Run shared/auth-setup.ts with role + env credentials
  │       b. Save Playwright storageState to <role>.json
  │       c. Update .meta.json (created_at, expires_at, source)
  │    3. Else reuse existing state
  │
  └─► Playwright config injects storageState per project/test
```

### 10.3 `shared/auth-setup.ts` template (generated by `xera init`)

```ts
import { Page } from '@playwright/test';
import { defineAuthSetup } from '@xera-ai/web';

export default defineAuthSetup(async (page: Page, role, creds) => {
  await page.goto('/login');
  await page.getByLabel('Email').fill(creds.email);
  await page.getByLabel('Password').fill(creds.password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL(/.*\/dashboard/);

  return {
    // Optional: provide expiry hint so xera knows when to refresh
    expiresAt: Date.now() + 8 * 3600 * 1000,
  };
});
```

The user customizes this for their actual login flow.

### 10.4 API token strategy (alternative)

For apps using Bearer tokens:

- Setup script calls the login API endpoint, returns `{ token, expiresAt }`.
- xera saves to `.xera/.auth/api-tokens.json`.
- Playwright config injects `extraHTTPHeaders.Authorization` automatically per project.

### 10.5 Security

- `.xera/.auth/` is gitignored at init.
- Files encrypted at rest with AES-256-GCM. Key = `XERA_AUTH_KEY` (random 256-bit, generated by `xera init`, saved to `.env`).
- Decryption only in `xera-internal exec` process; never logged.
- Scrubber blacklist extended to match cookie / JWT / Bearer formats so no auth artifact leaks into normalized.json or Jira comments.
- `xera doctor` does not print decrypted content.

---

## 11. Sample Ticket (must-have #2)

`xera init` seeds `.xera/SAMPLE-001/` with a full, offline pipeline:

- `story.md` — a small user story for testing https://playwright.dev (public site, always reachable).
- `test.feature` — corresponding Gherkin.
- `spec.ts` — corresponding Playwright test.
- `meta.json` — pre-filled hashes.

After init, user runs `/xera-run SAMPLE-001` in Claude Code:

- Skill detects SAMPLE-001 is local-only (no Jira fetch) and skips fetch step.
- Otherwise full pipeline runs.
- Validates: skill discovery works, Playwright runs, classifier runs, log writer works.

If SAMPLE-001 passes, the user knows their environment is set up correctly before attempting their own ticket.

---

## 12. Concurrency Lock (should-have #13)

`.xera/<TICKET>/.lock` is a JSON file:

```json
{ "pid": 12345, "hostname": "alice-mbp", "started_at": "...", "run_id": "..." }
```

`xera:exec` and `xera-run` skill check for the lock at start:

- If absent → create lock, proceed.
- If present and PID alive on this host → error: "Run already in progress (PID 12345). Wait or `bunx xera-internal unlock JIRA-123` if confident stale."
- If present but PID dead or hostname different from this host → warn, ask user to confirm before unlocking.

Lock is removed on completion (success or failure).

---

## 13. Update Flow (should-have #11)

`bunx xera init --update` performs a non-destructive refresh:

- Compare installed versions of `@xera-ai/core`, `@xera-ai/cli`, `@xera-ai/web`, `@xera-ai/skills`, `@xera-ai/prompts` against latest.
- For deps: bump `package.json` to latest minor (semver-respecting).
- For skills: diff each `.claude/skills/xera-*.md` against `@xera-ai/skills`. If unchanged in user repo → overwrite. If changed → show diff, ask user (keep / overwrite / merge).
- For prompts: bump version, log changelog summary.
- For `playwright.config.ts`: regenerate alongside (`.new` extension) if shape changed; user merges manually.
- Never touches: `xera.config.ts`, `.xera/`, `shared/`, `.env`.

Run `xera doctor` after update to verify.

---

## 14. Token & Cost Transparency (should-have #14)

`xera.log` records `tokens_in` and `tokens_out` per LLM-invoking step (skills append to log).

`bunx xera doctor --usage` shows aggregated last-30-days estimate:

```
Recent xera-run token usage (best effort from local logs):
  Average per run: ~52,000 tokens
  Last 7 days: 12 runs, ~620,000 tokens total
  Last 30 days: 41 runs, ~2,100,000 tokens total

Note: actual billing is via your Claude Code subscription; this is a local estimate.
```

Skills include guidance for handling very large stories (truncate, summarize, ask user to scope down).

---

## 15. Logging & Debugging (must-have #7)

- `.xera/<TICKET>/xera.log` NDJSON, append-only, every skill and every `xera-internal` command emits a line.
- Schema covers: timestamp, step name, command (if any), exit code, duration, LLM token counts, prompt version, scrubber field count.
- `bunx xera doctor --logs <TICKET>` pretty-prints in chronological table view.
- `bunx xera doctor --logs <TICKET> --since=24h` filters.

---

## 16. Error UX & Exit Codes (must-have #6)

All `xera-internal` subcommands and skill steps follow:

| Exit code | Meaning |
|---|---|
| 0 | Success |
| 1 | User error (config invalid, missing env var, bad ticket key) |
| 2 | AI generation error (LLM produced unusable output despite retries) |
| 3 | Test failure (Playwright exit non-zero — this is expected, not an infra error) |
| 4 | Infra error (Jira unreachable, MCP not responding, Playwright crashed) |

Error message format on stderr:

```
[xera:fetch] failed (exit 1): Jira authentication rejected.
  Cause:  401 Unauthorized when calling GET /rest/api/3/issue/JIRA-123
  Fix:    Check JIRA_EMAIL and JIRA_API_TOKEN in .env, or reconnect Atlassian MCP.
  Docs:   docs/TROUBLESHOOTING.md#jira-401
```

Skills interpret exit codes to decide retry vs escalate.

---

## 17. Documentation (should-have #15)

Ship with `xera-ai/xera`:

- **README.md** — 30-second pitch, install (`bunx xera init`), 5-minute quickstart (SAMPLE-001 + first real ticket), config snippet, links.
- **docs/CONFIGURATION.md** — every `xera.config.ts` option documented with type, default, example.
- **docs/TROUBLESHOOTING.md** — top 10 errors with cause + fix:
  1. Jira 401 / missing token
  2. Atlassian MCP not connecting
  3. Playwright browser not installed
  4. baseUrl unreachable
  5. tsc errors in generated spec
  6. Gherkin parse errors
  7. Auth setupScript failing
  8. `.lock` file stale
  9. Skill not found in Claude Code
  10. `XERA_AUTH_KEY` mismatch (regenerated → cache invalid)
- **docs/ARCHITECTURE.md** — this design doc, summarized.
- **One GIF / video** in README showing `/xera-run` in action.

---

## 18. Testing Strategy for xera Itself

xera is a testing framework, so it must be testable to a high standard.

### 18.1 Test layers

| Layer | Tool | What it covers |
|---|---|---|
| **Unit** | `bun test` | Pure functions in `@xera-ai/core`: config parse, artifact paths, hash compare, lock logic, log writer, scrubber rules, Gherkin mapping helpers |
| **Snapshot** | `bun test` | `xera-internal` commands against canned fixtures: feed story → assert feature output matches snapshot; feed feature → assert spec output matches snapshot. Snapshots are smoke-level (structural), not exact-match (LLM is non-deterministic) |
| **Classifier golden** | `bun test` | Curated set of `runs/<ts>/normalized.json` fixtures with known correct classification → assert classifier reaches correct verdict. Most important suite — guards diagnose-failure prompt regressions |
| **Integration** | `bun test` + real Playwright | Run actual `xera-internal` pipeline against fixture sample-app (Next.js) with mocked Jira |
| **E2E** | GitHub Action nightly | Clone xera-starter, run `xera init` + `/xera-run SAMPLE-001` end-to-end, assert PASS |
| **AI gen quality** | Custom harness (deferred to v0.2) | Rubric-based scoring of generated Gherkin / spec; LLM-as-judge with reference outputs |

### 18.2 Fixtures

- `fixtures/sample-app/` — small Next.js app: login, dashboard, form submit, list, detail, error states. Used by integration + E2E.
- `fixtures/golden-tickets/` — JSON fixtures with `(story, feature, spec, normalized.json, expected_classification)` tuples. Used by classifier golden tests.

### 18.3 Quality gates in CI

- All unit + snapshot + classifier-golden tests pass.
- Type check on all packages.
- Lint on all packages.
- Nightly E2E passes against sample-app.

### 18.4 Secret scrubber test suite (must-have #8)

Required for v0.1 release:

- Golden fixture trace.zip files containing: password POST body, Authorization header, Set-Cookie, JWT in localStorage, credit card number, API key in URL query.
- Scrubber test asserts every sensitive field is masked.
- Adversarial fixtures (variants of token formats, unicode names) to prevent regex bypass.

---

## 19. Roadmap

### 19.1 v0.1 (this spec)

Everything specified above. Local QA-trigger only.

### 19.2 v0.2

- CI mode: GitHub Action template, runner-side `claude --print` invocation, Jira webhook integration.
- Self-healing auto-fix with PR gate (classification = SELECTOR_DRIFT or TEST_BUG → AI proposes fix on branch `xera/fix-<TICKET>`).
- AI gen evaluation rubric harness (LLM-as-judge across golden tickets).
- Test data factories + cleanup.

### 19.3 v0.3+

- API adapter (`@xera-ai/api`).
- Visual regression integration.
- Mobile adapter (`@xera-ai/mobile`, Maestro-based).
- Performance adapter (`@xera-ai/performance`, k6-based).
- Security adapter (`@xera-ai/security`, ZAP-based).
- Codex compatibility once Codex stabilizes.

### 19.4 v1.0+

- Read-only static web dashboard generated from `.xera/` (no backend).
- Cross-ticket aggregate views.

### 19.5 v2.0 (only if multi-org demand)

- Optional SaaS backend with `xera auth login`, cloud run history.

---

## 20. Adapter Extension Contract

For future adapters (Mobile, API, Performance, Security):

```ts
// @xera-ai/core/src/adapter/types.ts
export interface TestAdapter {
  readonly id: string;                  // 'web', 'mobile', 'api', ...

  generate(input: GenerateInput): Promise<GenerateResult>;
  execute(input: ExecuteInput): Promise<RunResult>;
  classify?(run: RunResult, ctx: ClassifyContext): Partial<Classification>;
  doctor(): Promise<DoctorReport>;
}

export interface GenerateInput {
  ticketDir: string;
  feature: string;
  story: string;
  config: XeraConfig;
}

export interface GenerateResult { artifacts: string[]; warnings: string[]; }

export interface ExecuteInput {
  ticketDir: string;
  config: XeraConfig;
  runId: string;
}

export interface RunResult {
  runId: string;
  outcome: 'PASS' | 'FAIL';
  scenarios: ScenarioResult[];
  artifactsDir: string;
  rawReportPath: string;
  normalizedReportPath: string;
}
```

Selection at runtime is via `xera.config.ts.adapters: ['web']` and optional per-ticket `meta.json.adapter` override.

Adding a new adapter is a new package + spec; v0.1 does not pre-create placeholder packages (YAGNI).

---

## 21. Open Questions / Risks

1. **LLM non-determinism for spec gen** — same story may produce different specs across runs. Mitigations: prompt versioning + hash recording, snapshot tests structural-only, evaluation rubric harness in v0.2.
2. **Jira custom field variance** — every Jira instance is different. `xera init` field detection covers the common case but exotic setups will need manual config edits. Documented in TROUBLESHOOTING.
3. **Live page snapshot requires accessible staging URL** — for protected pages, the auth setup must run first. If staging is offline at init time, fallback warnings flag the risk.
4. **Atlassian MCP feature parity with REST** — if MCP can't post comments or transition statuses, REST fallback covers it; both paths kept in `@xera-ai/core/jira`.
5. **Claude Code skill API stability** — skill format is relatively new; if format breaks, `xera init --update` regenerates skills.
6. **`.xera/` repo growth** — over time `.xera/` accumulates many tickets. `runs/` is gitignored but `screenshots/` from last run might be kept for context. Track size; document cleanup pattern (`bunx xera-internal prune --older-than=90d`).
7. **Local-only MVP means no enforcement of "must run before merge"** — QAs can ignore xera. This is intentional: v0.2 CI mode enables enforcement.

---

## Appendix A — Example user flow (annotated)

```
$ cd ~/projects/my-app-tests
$ bunx xera init
# answers ~5 prompts; gets a working project in 2 minutes
$ cp .env.example .env
$ vim .env  # fill in credentials
$ vim shared/auth-setup.ts  # adjust to actual login flow

$ claude  # opens Claude Code

> /xera-run SAMPLE-001
# skill runs end-to-end against playwright.dev, all green
# user confirms environment is good

> /xera-run JIRA-123
# fetch:   pulls story from Jira (description + acceptance criteria)
# feature: writes .xera/JIRA-123/test.feature (Gherkin)
# script:  writes spec.ts + new LoginPage POM
# exec:    runs Playwright (auth state refreshed automatically)
# normalize: parses trace, scrubs secrets
# report:  classifies "REAL_BUG", drafts Jira comment
# post:    posts to JIRA-123

# QA reviews the Jira comment; if disagrees with classification,
# QA edits .xera/JIRA-123/spec.ts and re-runs from the script step:

> /xera-script JIRA-123  # regen spec only, then exec + report
```

---

*End of design.*
