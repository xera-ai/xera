# xera v0.2 — AI Gen Eval Harness Design

**Status:** Draft for review
**Date:** 2026-05-14
**Author:** thanh@trinity-technology.com
**Scope:** v0.2.0 — maintainer-facing evaluation harness for AI gen quality
**Depends on:** v0.1.0 (`@xera-ai/core@^0.1.7`, `@xera-ai/web@^0.1.6`, `@xera-ai/skills@^0.1.1`, `@xera-ai/prompts@^1.0.0`)
**Out of scope (deferred):** CI gate / GitHub Action, Anthropic API direct judging, snapshot regression layer, end-user-facing eval, trend tracking, self-healing auto-fix, test data factories.

---

## 1. Goals & Scope

### 1.1 Goal

Ship an eval harness so a maintainer editing any of the 3 prompt templates (`feature-from-story.md`, `script-from-feature.md`, `diagnose-failure.md`) can run a single command from inside a Claude Code session in the xera repo and get a per-dimension, per-ticket score table, surfacing regressions **before publishing** a new prompt version.

This directly addresses POSTMORTEM risk #1 (*"LLM non-determinism for spec gen — same story may produce different specs across runs. Mitigations: ... evaluation rubric harness in v0.2."*).

### 1.2 In-scope deliverables

- 1 new skill: `packages/skills/xera-eval.md`
- 1 new prompt template: `packages/prompts/eval-rubric.md`
- 3 new `xera-internal` subcommands: `eval-prepare`, `eval-deterministic`, `eval-report`
- 5 hand-crafted golden tickets under `fixtures/golden-eval/<ticket-id>/` at v0.2.0 (with explicit growth target to 15–20 by v0.2.x patch releases as contributors add coverage). 5 is enough to validate the harness end-to-end; 15+ is needed before per-ticket noise stops dominating regression signal. See §7 risk #6.
- Reuse existing `fixtures/golden-tickets/` for classifier eval (no new fixtures)
- `.xera/eval/<run-id>/` artifact layout (mirrors `.xera/<TICKET>/`)
- `xera-internal doctor` subcommand (NEW; maintainer-only binary): validate golden-eval fixtures + eval scripts. The public `xera doctor` shipped to end users is NOT touched — that command stays focused on consumer-project health and would otherwise carry dead code paths only triggered inside xera repo.
- Tests: unit per subcommand + an end-to-end test driving the full skill flow with stubbed session LLM (writes pre-baked `actual/` files; does not require a real Claude Code session)

### 1.3 Out-of-scope (deferred to v0.2.x or later)

- CI gate / GitHub Action / PR comment automation (defer; would unlock if `eval` works locally)
- Anthropic API direct judge — requires `ANTHROPIC_API_KEY` secret management (defer to v0.3+)
- Snapshot regression layer atop human goldens (defer until human goldens stable)
- End-user-facing eval (this is strictly a maintainer tool, not shipped to QA consumers)
- Scoring leaderboard, trend graphs, historical regression dashboards (YAGNI)
- Auto-fix of failing prompts (in v0.3+ self-healing scope)

### 1.4 Success criteria

From a clean checkout of xera, a maintainer can:

1. `bun install`
2. Open Claude Code in the repo root.
3. Run `/xera-eval` in the session.
4. Skill orchestrates gen + sub-agent-driven judge across 5 tickets × applicable stages.
5. Read `.xera/eval/<run-id>/report.md` with per-dimension PASS/FAIL + 1-sentence judge notes per dimension.
6. Edit a prompt template, re-run, observe scores change.
7. Edit `eval-rubric.md`, run `/xera-eval --judge-only`, observe re-judge without re-gen.

If any of those breaks for a maintainer, v0.2 is not ready.

---

## 2. Architecture

### 2.1 Flow

```
xera repo (maintainer's Claude Code session)
  │
  └──► /xera-eval [--prompt=<stage>] [--ticket=<id>]
         │
         ▼
    packages/skills/xera-eval.md
         │
         ├── Phase 1: PREPARE (deterministic)
         │     bun run xera:eval-prepare
         │       → reads fixtures/golden-eval/*
         │       → copies story.md (and where needed test.feature) to
         │         .xera/eval/<run-id>/inputs/<ticket>/
         │       → writes manifest.json (list of tickets + stages to eval +
         │         prompt versions captured at run time)
         │
         ├── Phase 2: GEN (session LLM cognitive work)
         │     For each ticket × stage in manifest:
         │       - Stage = feature-from-story:
         │           Read packages/prompts/feature-from-story.md (current version)
         │           Read inputs/<ticket>/story.md
         │           Generate test.feature → actual/<ticket>/test.feature
         │       - Stage = script-from-feature:
         │           Read packages/prompts/script-from-feature.md
         │           Read inputs/<ticket>/test.feature  ← THE GOLDEN FEATURE
         │           Generate spec.ts + POMs → actual/<ticket>/spec.ts (+ page-objects/)
         │       - Stage = diagnose-failure:
         │           Read packages/prompts/diagnose-failure.md
         │           Read fixtures/golden-tickets/<id>/classifier-input.json
         │           Produce classification.json → actual/<ticket>/classification.json
         │
         ├── Phase 3: DETERMINISTIC SCORE (CLI)
         │     bun run xera:eval-deterministic
         │       → For each actual:
         │           - gherkin: xera:validate-feature (existing v0.1)
         │           - spec: xera:typecheck + xera:lint + selector-rules + pom-scan
         │           - classifier: exact bucket match vs golden's expected.json
         │       → writes deterministic-scores.json
         │       → If a check fails OR crashes: still continue; judge ALWAYS runs in
         │         phase 4. The deterministic result is signal recorded in the report;
         │         it never short-circuits the judge.
         │
         ├── Phase 4: JUDGE (sub-agent cognitive work — fresh context per ticket × stage)
         │     For each actual + golden pair, the orchestrating skill spawns a
         │     sub-agent via the Task tool. Each sub-agent invocation gets ONLY:
         │       - The contents of packages/prompts/eval-rubric.md
         │       - The contents of actual/<ticket>/<artifact>
         │       - The contents of the golden reference for that stage
         │         (golden/test.feature for gherkin; golden/spec-requirements.md
         │          for spec; golden expected.json for classifier)
         │       - The stage name
         │     Sub-agent returns a strict JSON dimensions object (schema in §3.5).
         │     Orchestrator appends each sub-agent's output to judge-scores.json.
         │
         │     RATIONALE: a sub-agent has a fresh context window — it has NOT
         │     seen the prompt template being evaluated, has NOT seen the gen
         │     phase, and has NO conversation history that could bias the
         │     judgment toward "looks like what I just wrote." This is the
         │     critical mitigation for self-evaluation bias. See §2.2 #7 and §7 #1.
         │
         └── Phase 5: REPORT (CLI)
               bun run xera:eval-report
                 → merge deterministic + judge scores
                 → render .xera/eval/<run-id>/report.md (human-readable table)
                 → write summary.json (machine-readable)
                 → print summary to stdout: e.g. "12/15 PASS, 3 FAIL" with
                   dimension breakdown
```

### 2.2 Key design decisions

1. **Phase split = deterministic-as-signal, not gate.** Deterministic checks run first and their results are recorded, but they NEVER short-circuit the judge. Rationale: even when gherkin syntax fails, the judge's notes on coverage / specificity are still useful regression signal. Cost is bounded (5 tickets) so we prefer signal over savings. If deterministic cost becomes a problem later, we can add `--skip-judge-on-deterministic-fail`; we explicitly do not in v0.2.

2. **`script-from-feature` stage uses the GOLDEN feature as its input, not the `actual/` feature produced in phase 2.** Otherwise stages compound: a bad gherkin makes a bad spec, and you cannot tell which prompt caused which regression. Each stage is evaluated in isolation against a fixed input.

3. **`.xera/eval/<run-id>/` mirrors `.xera/<TICKET>/`** so contributors already familiar with v0.1 ticket layouts know where to look. `<run-id>` = `YYYYMMDD-HHmmss-<git-shorthash>`.

4. **Prompt versions captured.** `summary.json` records the version of each prompt template used so historical eval runs are reproducible-in-description even if outputs are stochastic.

5. **No mutation of `packages/prompts/`** during eval. Eval only READS prompts; writes only go to `.xera/eval/`.

6. **Idempotent re-run.** If `<run-id>` exists, fail fast unless `--force`. Reuses `packages/core/src/lock.ts` for concurrent-run safety.

7. **Sub-agent for judge phase (deliberate exception to CLAUDE.md no-sub-agent rule).** Gen phase (phase 2) is direct session work, matching v0.1 pattern. Judge phase (phase 4) spawns a sub-agent per ticket × stage. Justification: CLAUDE.md's "prompt is data the skill points at, not a sub-agent" rule applies to user-facing `/xera-*` skills where a sub-agent would obscure the work from the QA. The eval skill is a *maintainer-only* tool whose entire purpose is to evaluate quality without bias. A fresh context is the critical mitigation against self-evaluation bias (see §7 #1). Documented as a deliberate exception in the skill's frontmatter.

8. **Interleave gen-then-judge per ticket × stage, not batched.** Phase 2 and phase 4 are conceptually separate but executed interleaved: for each (ticket, stage), generate immediately followed by judging in the same loop iteration. Avoids ballooning the orchestrator's context with all 5 gen outputs before judging starts. Sub-agent for judge means orchestrator's context grows only by the sub-agent's small JSON return value per iteration.

---

## 3. Rubric Dimensions

Per stage, what the judge scores. Each dimension is **PASS / FAIL / NA** + a 1-sentence free-form `notes` field. Aggregated to a per-stage `%` at the end.

### 3.1 `feature-from-story` (Gherkin)

| Dimension | Question judge answers |
|---|---|
| **Coverage** | Are all acceptance criteria from `story.md` reflected as scenarios? Cite missing AC if any. |
| **Specificity** | Each scenario's Given/When/Then concrete (not vague verbs like "should work")? |
| **Independence** | Each scenario runnable standalone, no implicit ordering between scenarios? |
| **AC alignment** | Each scenario maps to ≥1 AC line; no orphan scenarios fabricated outside story scope? |
| **Negative paths** | If story implies error/edge cases, are they covered? |

Deterministic gate (runs *before* judge): `xera:validate-feature` (gherkin syntax + scenario count > 0). Already exists in v0.1.

### 3.2 `script-from-feature` (Playwright spec.ts)

Spec stage golden is a **requirements list** (`spec-requirements.md`) not a concrete `.ts` file (see §4.1 rationale). Judge checks each requirement individually rather than matching text.

| Dimension | Question judge answers |
|---|---|
| **Requirements satisfied** | For each bullet in `spec-requirements.md`, is the requirement met by the actual `spec.ts`? Cite the requirement(s) that fail. |
| **Step fidelity** | Does each `test()` body execute the When/Then of the matching scenario? |
| **Wait strategy** | Are explicit waits used (`expect(...).toBeVisible()`, `waitFor`)? No `waitForTimeout` / arbitrary `setTimeout`? |
| **Assertion quality** | Are assertions specific (right element, right state) — not just "page loaded"? |
| **No dead code** | No unused imports, no commented-out lines, no `console.log`? |

The Requirements-satisfied dimension subsumes POM use, selector strategy, etc., because those are encoded as bullets in `spec-requirements.md` per fixture.

Deterministic gate: `xera:typecheck` + `xera:lint` + selector-rules + pom-scan (existing v0.1).

### 3.3 `diagnose-failure` (Classifier)

| Dimension | Question judge answers |
|---|---|
| **Bucket match** | Does actual bucket equal golden bucket? (deterministic — PASS/FAIL by string compare) |
| **Root cause quality** | Is the root cause explanation specific (cites trace event / line) vs generic? |
| **Action specificity** | Is the recommended action concrete (e.g. "update locator `getByRole('button', {name: 'X'})`") vs vague ("fix selector")? |
| **No hallucinated evidence** | Does the diagnosis only reference events / files that exist in `classifier-input.json`? |

Deterministic gate: exact bucket match against the golden's `expected.json#expected_bucket` field.

### 3.4 Aggregation

- Per-stage score = `passing dimensions / non-NA dimensions` (e.g., 4/5 = 80%).
- Per-ticket score = mean of stage scores it was run on.
- **Overall pass threshold:** all dimensions PASS, OR the maintainer explicitly accepts a FAIL with rationale documented in the commit body. No hard auto-block (no CI in v0.2).

### 3.5 Judge prompt (`packages/prompts/eval-rubric.md`)

Single prompt template with sections per stage. The orchestrator passes the following to the judge sub-agent:

- The stage being evaluated
- The actual output (as file contents pasted into the sub-agent prompt — sub-agent reads no project files)
- The golden reference for that stage:
  - `feature-from-story`: the golden `test.feature` text
  - `script-from-feature`: the golden `spec-requirements.md` bullet list
  - `diagnose-failure`: the golden `expected.json` (bucket + RCA notes)
- The rubric dimensions for that stage (from `eval-rubric.md`)

Output: a strict JSON object the report tooling consumes. Schema enforced by zod in `eval-report`:

```json
{
  "stage": "feature-from-story",
  "ticket": "EVAL-001",
  "dimensions": [
    { "name": "Coverage",    "verdict": "PASS", "notes": "All 4 AC reflected as scenarios." },
    { "name": "Specificity", "verdict": "FAIL", "notes": "Scenario 'login works' uses vague verbs." },
    { "name": "Independence","verdict": "PASS", "notes": "Each scenario sets its own preconditions." },
    { "name": "AC alignment","verdict": "PASS", "notes": "No orphan scenarios." },
    { "name": "Negative paths", "verdict": "NA", "notes": "Story did not specify error paths." }
  ]
}
```

---

## 4. Data Shapes & File Layout

### 4.1 Golden ticket fixture layout

```
fixtures/golden-eval/
  README.md                          # how to add a new golden
  EVAL-001-simple-login/             # ADAPTED FROM fixtures/sample-app + SAMPLE-001
    story.md                         # input: simulated Jira story
    meta.json                        # { "id": "EVAL-001",
                                     #   "summary": "User can log in",
                                     #   "source": "sample-app/SAMPLE-001",
                                     #   "stages": ["feature-from-story",
                                     #              "script-from-feature"] }
    golden/
      test.feature                   # human-authored ground truth (exact text;
                                     # Gherkin is syntactically constrained
                                     # enough that text comparison is fair)
      spec-requirements.md           # human-authored REQUIREMENTS list, NOT a
                                     # full spec.ts. Markdown bullets of MUST /
                                     # MUST NOT / SHOULD statements judge
                                     # checks the actual spec.ts against.
                                     # Example contents:
                                     #   - MUST import and use LoginPage POM
                                     #     from page-objects/login.page.ts
                                     #   - MUST assert URL contains "/dashboard"
                                     #     after successful login
                                     #   - MUST NOT use page.waitForTimeout
                                     #   - MUST use getByRole / getByLabel
                                     #     selectors, not raw CSS for form fields
  EVAL-002-form-validation/...
  EVAL-003-multi-step-wizard/...
  EVAL-004-rich-acceptance-criteria/...
  EVAL-005-ambiguous-story/...        # tests judge's "missing info" detection
```

For classifier eval: reuse `fixtures/golden-tickets/<id>/` (already has `classifier-input.json` + `expected.json` from v0.1). No new directory tree.

### 4.2 `.xera/eval/<run-id>/` layout

```
.xera/eval/<run-id>/                  # run-id = YYYYMMDD-HHmmss-<git-shorthash>
  manifest.json                       # { tickets: [...], stages: [...], prompt_versions: {...} }
  inputs/<ticket>/
    story.md                          # copied from fixture
    test.feature                      # GOLDEN feature (for spec-stage input)
    classifier-input.json             # for classifier eval
  actual/<ticket>/
    test.feature                      # session LLM output for gherkin stage
    spec.ts                           # session LLM output for spec stage
    page-objects/                     # session LLM output (POM files)
    classification.json               # session LLM output for classifier stage
  deterministic-scores.json           # phase 3 output
  judge-scores.json                   # phase 4 output
  report.md                           # phase 5 human-readable
  summary.json                        # phase 5 machine-readable
```

`.xera/eval/` is added to `.gitignore` (consistent with `.xera/<TICKET>/runs/`).

### 4.3 `manifest.json` schema

```json
{
  "run_id": "20260520-103045-a1b2c3d",
  "started_at": "2026-05-20T10:30:45Z",
  "git_sha": "a1b2c3d",
  "tickets": ["EVAL-001", "EVAL-002", "EVAL-003", "EVAL-004", "EVAL-005"],
  "stages": ["feature-from-story", "script-from-feature", "diagnose-failure"],
  "prompt_versions": {
    "feature-from-story": "1.0.0",
    "script-from-feature": "1.0.0",
    "diagnose-failure":    "1.0.0",
    "eval-rubric":         "1.0.0"
  },
  "flags": { "force": false, "only_prompt": null, "only_ticket": null }
}
```

### 4.4 `summary.json` schema

```json
{
  "run_id": "20260520-103045-a1b2c3d",
  "git_sha": "a1b2c3d",
  "prompt_versions": { "feature-from-story": "1.0.0", "...": "..." },
  "results": [
    {
      "ticket": "EVAL-001",
      "stage":  "feature-from-story",
      "deterministic": { "passed": true, "checks": ["validate-feature"] },
      "judge": {
        "passed": false,
        "dimensions": [
          { "name": "Coverage",    "verdict": "PASS", "notes": "..." },
          { "name": "Specificity", "verdict": "FAIL", "notes": "..." }
        ],
        "score": 0.8
      }
    }
  ],
  "overall": { "passed": 12, "failed": 3, "total": 15, "score": 0.80 }
}
```

### 4.5 New `xera-internal` subcommands

| Subcommand | Purpose | Output |
|---|---|---|
| `xera-internal eval-prepare` | Copy fixtures → `.xera/eval/<run-id>/inputs/`; write `manifest.json`; acquire run lock | `manifest.json`, `inputs/` tree |
| `xera-internal eval-deterministic` | Run gherkin validate / typecheck / lint / selector-rules / pom-scan / classifier-exact-match per ticket | `deterministic-scores.json` |
| `xera-internal eval-report` | Merge `deterministic-scores.json` + `judge-scores.json` → render `report.md` + `summary.json`; release lock | `report.md`, `summary.json`, stdout table |

No `eval-judge` subcommand: judging is **session LLM cognitive work** invoked by the skill directly. (Matches v0.1 pattern: skills do AI work, CLI does deterministic work.)

### 4.6 Skill frontmatter (`packages/skills/xera-eval.md`)

```yaml
---
name: xera-eval
description: Evaluate AI gen quality across golden tickets (maintainer-only).
inputs:
  - --prompt:      optional. One of feature-from-story | script-from-feature | diagnose-failure.
  - --ticket:      optional. Restrict to one golden ticket id.
  - --force:       optional. Allow re-running with the same run-id.
  - --judge-only:  optional. Skip phases 1-3; re-run phase 4 (judge) against
                   the most recent .xera/eval/<run-id>/actual/ tree, then
                   phase 5 (report). Used when iterating on eval-rubric.md
                   without wanting to burn tokens re-generating outputs.
                   Errors if no prior run exists in .xera/eval/.
outputs:
  - .xera/eval/<run-id>/report.md
  - .xera/eval/<run-id>/summary.json
---
```

### 4.7 Eval-rubric prompt versioning

`packages/prompts/eval-rubric.md` carries its own `version` line in frontmatter (same convention as the other 3 prompts in v0.1). It is independently versioned because changes to *how* the judge scores can drift eval results without any prompt-under-test change. Bumping `eval-rubric` version is itself a signal that "old eval scores are not directly comparable to new ones."

---

## 5. Testing & Error Handling

### 5.1 Tests for the harness itself

| Layer | Test | Where |
|---|---|---|
| `eval-prepare` | Unit: given fixture dir + flags, produces correct `manifest.json` + `inputs/` tree | `packages/core/test/bin-internal/eval-prepare.test.ts` |
| `eval-deterministic` | Unit: given `actual/` with known-bad gherkin, returns correct `deterministic-scores.json` | `packages/core/test/bin-internal/eval-deterministic.test.ts` |
| `eval-report` | Unit: given hand-built `deterministic-scores.json` + `judge-scores.json`, renders expected `report.md` + `summary.json` | `packages/core/test/bin-internal/eval-report.test.ts` |
| Golden fixtures themselves | Snapshot: `golden/test.feature` validates with `xera:validate-feature`; `golden/spec.ts` typechecks + lints | `packages/core/test/fixtures/golden-eval.test.ts` |
| Skill `.md` | Lint: frontmatter parses, all `bun run xera:eval-*` commands referenced exist as scripts | reuse existing skill-lint pattern |
| **End-to-end** | Integration: drive the full skill flow with a STUB session-LLM (pre-write known outputs into `actual/`), assert final `report.md` content. Does NOT require a real Claude Code session. | `packages/core/test/bin-internal/eval-e2e.test.ts` |

The end-to-end test is the crucial one — it proves the deterministic plumbing works *without* needing a live session LLM. The skill's cognitive steps are stubbed by pre-writing files to `actual/`.

### 5.2 Error handling matrix

| Failure mode | Behavior |
|---|---|
| Fixture missing (`fixtures/golden-eval/EVAL-001/` not found) | `eval-prepare` fails fast with clear message: `Missing golden fixture: EVAL-001` |
| `manifest.json` invalid (zod parse fail) | Fail fast with zod error path |
| Session LLM writes invalid JSON for judge scores | `eval-report` fails fast pointing at offending file + line; does NOT silently drop scores |
| `actual/<ticket>/test.feature` missing (skill skipped a ticket) | `eval-report` marks that ticket+stage as `SKIPPED` (not FAIL); counts as 0/0 in aggregation |
| Deterministic check fails OR crashes (e.g., gherkin syntax invalid, typecheck throws on unrelated file) | Catch, record as `deterministic.error` (or `deterministic.failed`) in scores JSON. Judge always still runs in phase 4 (deterministic never short-circuits judge — see §2.2 decision #1). |
| Concurrent eval run on same `<run-id>` | Same lock pattern as `.xera/<TICKET>/.lock` (existing v0.1) — reuse `packages/core/src/lock.ts` |
| Judge produces verdict outside `{PASS, FAIL, NA}` | `eval-report` rejects with zod error; does NOT coerce |
| `--ticket=BAD-ID` (no matching fixture) | `eval-prepare` fails fast: `No golden fixture for BAD-ID` |
| `--prompt=BAD-STAGE` | `eval-prepare` fails fast: `Unknown stage: BAD-STAGE. Valid: feature-from-story, script-from-feature, diagnose-failure.` |
| `--judge-only` with no prior run | Fail fast: `No prior eval run found in .xera/eval/. Run /xera-eval without --judge-only first.` |
| `--judge-only` combined with `--prompt` or `--ticket` | Honor the scope filters when selecting which prior `actual/` outputs to re-judge. Useful for "I tweaked the gherkin rubric only, re-judge feature-from-story stage only." |

### 5.3 Determinism & repeatability notes

- Eval run is **not** deterministic across maintainers (session LLM is stochastic). Two runs of the same golden produce different `actual/` outputs and may produce different judge verdicts.
- `summary.json` records `prompt_versions` + `git_sha`. A single run is reproducible *in description* even if not in *output*.
- Trend across runs is **deliberately not tracked** in v0.2. Maintainer judges trend manually by reading `summary.json` history. (Auto trend tracking = v0.3 if needed.)
- `eval-rubric.md` is itself versioned. Changes to the rubric invalidate cross-version comparison.

### 5.4 Doctor (maintainer-only)

New `xera-internal doctor` subcommand. Lives in `@xera-ai/core`'s `xera-internal` binary alongside the other `eval-*` subcommands. Checks:

- `fixtures/golden-eval/` exists and contains ≥ 3 ticket dirs
- Each golden ticket dir has the files declared in its `meta.json#stages` (e.g., `feature-from-story` stage → `golden/test.feature` required; `script-from-feature` stage → `golden/spec-requirements.md` required)
- `packages/prompts/eval-rubric.md` parses (frontmatter + version)
- `bun run xera:eval-prepare`, `xera:eval-deterministic`, `xera:eval-report` scripts all exist in root `package.json`
- `packages/skills/xera-eval.md` parses (frontmatter)

The public `xera doctor` CLI shipped to end users via `@xera-ai/cli` is **not modified**. Eval is strictly maintainer-only, so end users never need any of these checks. Adding them to the public CLI would create dead code in 100% of end-user installs (no consumer project has `fixtures/golden-eval/`).

---

## 6. Roadmap positioning

This spec replaces the "AI gen evaluation rubric harness" item in v0.1 spec §19.2. After v0.2.0 ships, the next steps:

- **v0.2.x patch releases** — Grow `fixtures/golden-eval/` from 5 to 15–20 tickets. Each new ticket is its own PR adding `story.md` + `meta.json` + `golden/*`. No new harness code required; pure fixture growth. Target ~3 tickets per patch.
- **v0.2.1+ — CI mode** (separate spec; would build on this eval harness by wrapping it in a GitHub Action; needs API-key judge in §7 #1)
- **v0.3 — Self-healing auto-fix** (separate spec)
- **v0.3+ — Test data factories + cleanup** (separate spec)

---

## 7. Open Questions / Risks

1. **Self-evaluation bias.** Same model judging its own output systematically inflates scores. **Mitigation in v0.2:** judge runs in a sub-agent with fresh context (§2.1 phase 4, §2.2 decision #7). Sub-agent has not seen the prompt template under test, the gen attempt, or any orchestrator history — its inputs are exactly the rubric + actual + golden as text payloads passed via the Task tool prompt. This is a real mitigation, not just documentation. **Residual risk:** sub-agent is still the same underlying model family; intrinsic preferences remain. v0.3+ Anthropic API direct judge with fixed `temperature=0` strengthens this further if needed.

2. **Judge stability across runs.** Two runs of identical prompts may yield different verdicts (LLM stochasticity). Mitigation: rubric phrased as concrete questions; dimensions binary (PASS/FAIL only, not 1–5); `eval-rubric.md` version-pinned. If sub-agent default temperature varies across Claude Code versions, document running eval at a pinned `Claude Code` version per release.

3. **Token cost.** 5 tickets × 3 stages × 1 gen turn + 5 × 3 × 1 sub-agent invocation = ~30 LLM-bound operations. Sub-agent has its own token budget separate from orchestrator's context, so orchestrator does not balloon. Mitigation: `--prompt` and `--ticket` flags scope; `--judge-only` skips gen entirely; interleave (§2.2 #8) bounds orchestrator-side context growth.

4. **Golden tickets going stale as prompts evolve.** A golden authored against today's prompts may not match the *intended* output after a prompt rewrite. Mitigation: golden files are version-controlled, contributors update them in the same PR as the prompt change. README in `fixtures/golden-eval/` documents the policy.

5. **Sub-agent exception to CLAUDE.md.** The CLAUDE.md rule is "skills do not spawn sub-agents for prompts" — eval skill deliberately breaks it. Risk: future maintainer reads CLAUDE.md, doesn't see the exception, mistakenly removes sub-agent usage during "consistency cleanup." Mitigation: spec §2.2 #7 documents the exception with rationale; xera-eval.md frontmatter has a comment block explaining why it spawns sub-agents.

6. **5 golden tickets has weak statistical signal.** Single bad gen on one ticket flips overall score 20% — noise dominates regression detection. Mitigation: v0.2.x roadmap explicitly grows the set to 15–20 (§6). v0.2.0 baseline existence is the contribution; statistical credibility comes with patch releases.

7. **Test stub for end-to-end is itself a maintenance cost.** If the skill flow changes, the e2e test must be updated. Mitigation: stub is small (pre-writes files); skill changes that break it are exactly the changes that should require test updates.
