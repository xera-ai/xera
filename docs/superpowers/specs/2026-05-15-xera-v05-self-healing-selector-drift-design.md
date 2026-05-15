# xera v0.5 — Self-Healing Selector Drift Design

**Status:** Draft for review
**Date:** 2026-05-15
**Author:** thanh@trinity-technology.com
**Scope:** v0.5.0 — auto-propose + auto-apply + auto-verify a heal for SELECTOR_DRIFT failures
**Depends on:** v0.3.0 (prompt-injection defense — DOM is untrusted input, reuses the nonce-wrap mechanism)
**Out of scope (deferred):** heal-locator eval rubric (v0.5.1), past-passing DOM delta (v0.6), drift telemetry (v0.7+), heal-on-removed and heal-on-split (never — semantic decisions belong to humans).

---

## 1. Goals & Scope

### 1.1 Goal

When `/xera-report` classifies a test failure as `SELECTOR_DRIFT`, the skill auto-proposes a fix to the POM locator, auto-applies it to the POM file, auto-re-runs the test to verify, and stages the change on success (`git add <POM>`) or reverts it on failure (`git checkout HEAD -- <POM>`). QA reviews `git diff --staged` and commits if happy.

The current QA workflow when a SELECTOR_DRIFT failure happens:
1. Run `/xera-exec <TICKET>` → fails.
2. Run `/xera-report <TICKET>` → reads `class: SELECTOR_DRIFT` from classifier output.
3. **Manually** open the trace, find the failing locator, open the SUT, find the new element, edit the POM, re-run.

This spec compresses steps 3 into one auto-flow with explicit refusal cases when heal isn't appropriate.

### 1.2 In-scope deliverables

- `heal-locator.md` prompt template (v1.0.0) carrying the v0.3 `## Handling untrusted input` preamble + decision rules + refusal rules + strict JSON output schema.
- `xera-internal heal-prepare` subcommand: pure data assembly from trace + classifier-output + POM + test.feature → `heal-input.json`.
- `xera-report.md` skill: extended with the heal sub-flow (mint nonce → wrap DOM → call LLM → branch on apply/refuse → on apply, edit POM line + re-run `xera:exec` → stage on pass / revert on fail).
- Verify-prompts extension to include `heal-locator.md` in `IN_SCOPE_PROMPTS`.
- `EVAL-007-heal-label-change/` fixture shell (directory + `meta.json`; full golden + rubric deferred to v0.5.1).
- Unit tests for `heal-prepare.ts`.
- Version bumps: prompts 2.0.0 → 2.1.0, core 0.2.0 → 0.3.0, skills 0.2.0 → 0.3.0, cli patch + caret bumps.

### 1.3 Drift types in scope

1. **Label text changed** — button text "Sign in" → "Log in". Heal: update `getByRole('button', { name: 'Sign in' })` → `name: 'Log in'`.
2. **CSS auto-class drift** — `.locator('.MuiButton-root-3xyz')` no longer matches. Heal: switch to role-based or test-id-based selector using DOM evidence.
3. **Attribute renamed** — `getByTestId('login-btn')` → element now has `data-testid="signin-btn"`. Heal: update test-id reference.

### 1.4 Explicit refusal cases (heal MUST decline + report reason)

- `element-removed` — no DOM node matches role, label, or test-id family → real bug, route to manual investigation.
- `element-split` — multiple candidate elements survive filtering → semantic ambiguity, needs human decision.
- `low-confidence` — single candidate but weak signal → refuse rather than guess.
- `no-anchor` — candidate has no role/test-id/label, only a deep CSS path → would require XPath or auto-class which v0.1 lint already forbids.

Refusal output is structured (fixed enum), not free-form prose. This keeps downstream telemetry tractable.

### 1.5 Auto-apply + verify-loop semantics

1. Heal proposes change (or refuses).
2. If proposed: skill writes `newPomLine` to `pomFile:pomLine` (verbatim string-replace of `pomLineContent`).
3. Skill runs `bun run xera:exec <TICKET>`.
4. Exit 0 → `git add <POM>`, skill reports success + suggests `git commit`.
5. Exit 3 (test failed) → `git checkout HEAD -- <POM>`, skill reports new failure to QA, STOP.
6. Exit 4 (Playwright crashed) → `git checkout HEAD -- <POM>`, skill reports crash, STOP.

**Hard single-heal guard:** one heal attempt per `/xera-report` invocation. If verification fails, the skill does NOT retry. QA decides next steps (run `/xera-report` again, fix manually, escalate). This is the infinite-loop guard; non-negotiable for v0.5.

### 1.6 Out-of-scope (deferred)

- **Multi-locator heal in one pass.** A run with 5 SELECTOR_DRIFT scenarios heals only the first; QA re-runs 4 more times. Multi-heal semantics get hairy (if 5 heals + re-run = fail, bisect to find the wrong one?) and v0.5's conservative "one at a time" matches how QA already triages cascading drift.
- **Heal-locator eval rubric.** Adding a `heal-locator` stage to `eval-rubric.md` requires hand-graded golden output. v0.5.1 spec.
- **Past-passing DOM delta.** Storing last-passing DOM for delta-based heal is a quality boost but adds storage cost and isn't critical to v0.5's MVP. v0.6.
- **DOM-hierarchy-move heal.** Element still findable by deep CSS path → refuse (anti-pattern; lint forbids).
- **Drift telemetry.** "Same locator healed N times this week, suggest changing generation strategy." v0.7+.

### 1.7 Success criteria

From a clean checkout of xera, a maintainer can:

1. `bun install`
2. `bun run xera:doctor` — reports `ok` (validator now also checks `heal-locator.md` preamble).
3. `bun run xera:verify-prompts` — reports `ok` standalone (3 in-scope prompts now).
4. `bun test packages/core` — all green, including new `heal-prepare.test.ts`.
5. Open Claude Code in a scaffolded tryout project. Deliberately break a button label in the SUT (e.g. rename "Sign in" → "Log in"). Run `/xera-report <TICKET>`. Skill detects drift, proposes the new label, applies it to the POM, re-runs the test, and reports success with the POM change staged.
6. Run `git diff --staged` to see the locator change.
7. As a second smoke: delete the button entirely from the SUT. Run `/xera-report <TICKET>`. Skill detects, proposes nothing, reports `refusalCategory: element-removed`, suggests manual investigation.

If any of those breaks, v0.5.0 is not ready.

---

## 2. Architecture

### 2.1 High-level flow

```
/xera-report <TICKET>
   │
   ├─ Read .xera/<TICKET>/runs/<latest>/classifier-output.json
   │     (already exists from v0.1 classifier — already produces class:SELECTOR_DRIFT)
   │
   ├─ For the FIRST scenario classified SELECTOR_DRIFT (single-heal guard):
   │
   │     ┌──────────────────────────────────────────────────────────┐
   │     │ Phase A — Prepare                                         │
   │     │   bun packages/core/bin/internal.ts heal-prepare \         │
   │     │     <TICKET> <RUN_ID> <SCENARIO>                          │
   │     │   • Read trace.json + classifier-output.json              │
   │     │   • Extract failedLocator + locatorFileLine               │
   │     │   • Read PomFile @ locatorFileLine to capture method      │
   │     │   • Read test.feature step text                           │
   │     │   • Write .xera/<TICKET>/runs/<RUN_ID>/heal-input.json    │
   │     └──────────────────────────────────────────────────────────┘
   │     ┌──────────────────────────────────────────────────────────┐
   │     │ Phase B — LLM heal proposal                               │
   │     │   • Skill mints nonce (XR_xxx) per v0.3                   │
   │     │   • Skill wraps domSnapshotAtFailure in nonce             │
   │     │   • Skill reads heal-locator.md prompt template           │
   │     │   • LLM emits .xera/<TICKET>/runs/<RUN_ID>/heal-output.json│
   │     │     { decision, newLocator?, newPomLine?, reason,         │
   │     │       confidence, refusalCategory? }                      │
   │     └──────────────────────────────────────────────────────────┘
   │     │
   │     ├─ decision == "refuse"   → report to QA, STOP heal flow
   │     │
   │     └─ decision == "apply"    → continue:
   │           ┌──────────────────────────────────────────────────┐
   │           │ Phase C — Apply + verify                          │
   │           │   • Skill replaces pomLineContent → newPomLine    │
   │           │     in pomFile (verbatim string-replace)          │
   │           │   • Skill runs `bun run xera:exec <TICKET>`       │
   │           │     • exit 0 → `git add <pomFile>`;                │
   │           │                report success, suggest commit     │
   │           │     • exit 3 → `git checkout HEAD -- <pomFile>`;   │
   │           │                surface new failure, STOP           │
   │           │     • exit 4 → revert + surface crash, STOP        │
   │           └──────────────────────────────────────────────────┘
```

### 2.2 Key design decisions

1. **Auto-apply, not sidecar.** The heal updates the real POM directly so the verification re-run actually exercises the new locator. Git staging gives QA the review gate. A `<POM>.heal.ts` sidecar would require a second merge step that's easy to skip.

2. **One heal per `/xera-report` invocation.** Verification failure does NOT trigger a second heal. QA decides next steps. Simplest semantics; rules out infinite loops.

3. **Refuse categories are a fixed enum.** Four values: `element-removed`, `element-split`, `low-confidence`, `no-anchor`. Free-form refusal text would defeat downstream telemetry.

4. **DOM is untrusted input.** The v0.3 nonce-wrap mechanism applies as-is. `heal-locator.md` carries the `## Handling untrusted input` preamble; `verify-prompts` validates it. The whole point: v0.3's mechanism generalizes for free.

5. **First-failure scoping.** Classifier output already orders scenarios; first scenario with `class: SELECTOR_DRIFT` is the heal target. v0.5's design accepts cascade drift produces multiple QA re-runs.

6. **Verbatim line match, not regex.** `heal-prepare` records `pomLineContent` (the exact source line). Apply step replaces verbatim. If the POM drifted between prepare and apply, the replace fails loudly rather than silently corrupting.

7. **Low-confidence apply → automatic refuse.** Implemented in the skill's parse step, not the LLM. If the LLM returns `{ decision: "apply", confidence: "low" }`, the skill downgrades to `{ decision: "refuse", refusalCategory: "low-confidence" }` before any file write. Defense-in-depth against an over-confident LLM.

8. **No heal history in meta.json.** Git diff on the POM is the durable record. The `.xera/<TICKET>/runs/<RUN_ID>/heal-input.json` + `heal-output.json` live alongside the trace as run artifacts. No schema change to meta.json.

### 2.3 Affected files

| File | Change |
|---|---|
| `packages/prompts/heal-locator.md` | **NEW.** Prompt template. v1.0.0. Section 2.4 details. |
| `packages/prompts/version.json` | Bump `"prompts": "2.0.0"` → `"2.1.0"`. |
| `packages/prompts/package.json` | Bump version `"2.0.0"` → `"2.1.0"`. |
| `packages/core/src/bin-internal/heal-prepare.ts` | **NEW.** Subcommand: assembles `heal-input.json`. No LLM call. |
| `packages/core/src/bin-internal/index.ts` | Register `heal-prepare` in `COMMANDS`. |
| `packages/core/src/bin-internal/verify-prompts.ts` | Extend `IN_SCOPE_PROMPTS` to include `'heal-locator.md'`. |
| `packages/core/test/bin-internal/heal-prepare.test.ts` | **NEW.** Unit tests. |
| `packages/core/test/bin-internal/verify-prompts.test.ts` | Extend seed + 1 new test that heal-locator.md is checked. |
| `packages/skills/xera-report.md` | **MODIFY.** Add heal sub-flow after classifier read. |
| `packages/skills/package.json` | Bump `"version": "0.2.0"` → `"0.3.0"`. |
| `packages/core/package.json` | Bump `"version": "0.2.0"` → `"0.3.0"`. |
| `packages/cli/package.json` | Bump patch + caret bumps on `@xera-ai/core` → `^0.3.0`, `@xera-ai/skills` → `^0.3.0`. |
| `packages/cli/src/commands/init.ts` | Bump `@xera-ai/prompts` caret `^2.0.0` → `^2.1.0`. |
| `packages/cli/src/commands/init-update.ts` | Same bump. |
| `fixtures/golden-eval/EVAL-007-heal-label-change/` | **NEW directory.** `meta.json` declaring `stages: ["heal-locator"]`. Golden + rubric ship in v0.5.1. |

No new root scripts. `xera:heal-prepare` is internal — called from inside the `xera-report` skill via the `bun packages/core/bin/internal.ts heal-prepare` path. Exposing as a root script tempts QA to call it directly, which would skip the LLM proposal step.

### 2.4 `heal-locator.md` prompt template structure

```markdown
---
id: heal-locator
version: 1.0.0
inputs:
  - heal-input.json (wrapped by caller per v0.3 nonce protocol)
outputs:
  - heal-output.json (strict schema; see Output format section)
---

# Propose a fix for a drifted Playwright locator

You receive a JSON payload describing a failing Playwright locator,
the page DOM at the moment of failure, the page-object method that
defines the locator, and the Gherkin step that triggered the failure.

Decide one of two outcomes: apply (propose a new locator) or refuse
(declare the drift not auto-healable, with a fixed-enum category).

## Handling untrusted input

[verbatim v0.3 preamble; the calling skill wraps the
domSnapshotAtFailure field in <XR_*> tags]

## Decision rules

1. Find the most likely target element in domSnapshotAtFailure that
   matches the gherkinStep intent + the pomMethodName...
   [full rules — label, class, attribute drift detection]

## Refusal rules

- element-removed: no DOM node matches role OR label OR test-id family
- element-split: ≥ 2 candidate elements survive filtering
- low-confidence: single candidate but weak signal
- no-anchor: candidate has no role/test-id/label, only deep CSS path

## Quality rules

- newLocator must use one of: getByRole, getByTestId, getByLabel,
  getByText. Never .locator(cssSelector). Never xpath=.
- newPomLine must preserve exact indentation of pomLineContent.

## Output format (strict)

Return ONLY a JSON object — no prose before or after, no markdown
fences. Exactly the schema in §3.2 of this spec.
```

Full text lives in the plan; this section captures shape only.

---

## 3. Data shapes

### 3.1 `heal-input.json` (Phase A output)

```json
{
  "ticket": "JIRA-123",
  "runId": "2026-05-15T08-30-12-7f3a",
  "scenarioName": "User can sign in with valid credentials",
  "failedLocator": {
    "raw": "getByRole('button', { name: 'Sign in' })",
    "kind": "role|test-id|css-class|text|label|other",
    "pomFile": ".xera/JIRA-123/page-objects/LoginPage.ts",
    "pomLine": 14,
    "pomLineContent": "  signInButton = this.page.getByRole('button', { name: 'Sign in' });",
    "pomMethodName": "signInButton"
  },
  "gherkinStep": "When I click the \"Sign in\" button",
  "domSnapshotAtFailure": "<html>...scrubbed DOM...</html>"
}
```

### 3.2 `heal-output.json` (Phase B output — LLM-written)

**Apply shape:**

```json
{
  "decision": "apply",
  "newLocator": "getByRole('button', { name: 'Log in' })",
  "newPomLine": "  signInButton = this.page.getByRole('button', { name: 'Log in' });",
  "reason": "Label text changed from 'Sign in' to 'Log in' in DOM (<button> at line 47 of domSnapshotAtFailure).",
  "confidence": "high",
  "refusalCategory": null
}
```

**Refuse shape:**

```json
{
  "decision": "refuse",
  "newLocator": null,
  "newPomLine": null,
  "reason": "The DOM snapshot contains no <button> matching the role or label. The form section appears to have been removed (no <form> tag in the captured DOM).",
  "confidence": "high",
  "refusalCategory": "element-removed"
}
```

**Strict rules:**

- `decision`: exactly `"apply"` or `"refuse"`.
- `refusalCategory`: one of `element-removed`, `element-split`, `low-confidence`, `no-anchor`, or `null` (only when `decision == "apply"`).
- `confidence`: `"low"`, `"medium"`, `"high"`.
- **Low-confidence apply is downgraded to refuse by the skill** (not by the LLM). If LLM emits `{ decision: "apply", confidence: "low" }`, the skill rewrites to `{ decision: "refuse", refusalCategory: "low-confidence" }` before any file write.
- `newPomLine` (when apply): the FULL replacement line text with the SAME indentation as `pomLineContent`. The skill string-replaces `pomLineContent` → `newPomLine` in the POM file.

### 3.3 Apply step pseudocode (skill's instructions)

```
1. Read heal-output.json. Parse.
2. If parse fails → report parse error, treat as refusal, STOP.
3. If !confidence in ["low","medium","high"] OR
      !decision in ["apply","refuse"] → schema error, STOP.
4. If decision == "apply" && confidence == "low":
     Downgrade to decision="refuse", refusalCategory="low-confidence".
5. If decision == "refuse":
     Report reason + refusalCategory to QA. STOP.
6. If decision == "apply":
     Read heal-input.json's pomFile.
     If text does not contain pomLineContent verbatim → STOP with
       "POM line drifted since heal was proposed; re-run /xera-report."
     Replace pomLineContent with newPomLine. Write back.
     Run: bun run xera:exec <TICKET>.
       exit 0 → run `git add <pomFile>`. Report success + suggest commit.
       exit 3 → run `git checkout HEAD -- <pomFile>`. Read latest run's
                classifier output, summarize new failure, STOP.
       exit 4 → run `git checkout HEAD -- <pomFile>`. Report crash, STOP.
```

### 3.4 Decision rule shorthand (full text lives in the plan)

| Case | Detect by | Heal strategy |
|---|---|---|
| Label changed | Old label not in DOM; new element with same role + similar text | `getByRole(<role>, { name: '<new>' })` |
| CSS auto-class | `kind == "css-class"` + class string matches `Mui|css-\|ant-\|chakra-` | Upgrade to `getByRole` or `getByTestId` per DOM evidence |
| Attribute renamed | `kind == "test-id"` + old test-id absent + element with same role/label | `getByTestId('<new>')` |
| Element removed | No DOM node matches role OR label OR test-id family | Refuse `element-removed` |
| Multiple matches | ≥ 2 candidate elements survive filtering | Refuse `element-split` |
| Ambiguous | Single candidate but low signal | Refuse `low-confidence` |
| No anchor | Candidate has no role/test-id/label, only deep CSS path | Refuse `no-anchor` |

---

## 4. Error handling

| Failure mode | Behavior |
|---|---|
| Classifier output missing or unparseable | Skill reports the error, STOP (no heal attempt). |
| No SELECTOR_DRIFT scenarios in the run | Skill skips heal flow entirely, proceeds with existing report behavior. |
| Multiple SELECTOR_DRIFT scenarios | Heal the FIRST. List the rest in the report output as "additional drifts: re-run after applying first heal". |
| `heal-prepare` cannot find failedLocator in trace | `heal-prepare` exits 1 with a clear message; skill catches and reports "trace lacks failed-locator event; cannot heal". STOP. |
| LLM returns malformed JSON | Skill reports parse error, treats as refusal, no POM change. |
| LLM returns valid JSON but wrong schema (e.g. `decision: "skip"`) | Schema error, treated as refusal. |
| `pomLineContent` no longer matches POM file content | Apply step refuses to write ("POM line drifted; re-run /xera-report"). No partial writes. |
| Verification re-run fails (exit 3) | Revert POM via `git checkout HEAD -- <POM>`. Surface the new failure. STOP — no second heal. |
| Verification re-run crashes (exit 4) | Revert POM. Surface the crash. STOP. |
| Verification re-run cannot run (env missing) | Same as exit 4: revert + surface. |
| DOM snapshot is empty (no domSnapshotAtFailure in trace) | `heal-prepare` exits 1; skill reports "no DOM snapshot — cannot heal" STOP. |
| `git add` or `git checkout` fails | Skill reports the git error verbatim. POM may be in inconsistent state — surface explicitly so QA notices. |
| User runs `/xera-report` on a directory with no `.xera/<TICKET>/` | Same as existing v0.1 behavior. No heal-specific change. |

---

## 5. Roadmap positioning

- **v0.5.0 (this spec).** Heal proposal + auto-apply + verification re-run + stage/revert. EVAL-007 directory shell. No rubric.
- **v0.5.1 (separate spec).** Add `heal-locator` stage to `eval-rubric.md` with judge sub-agent dimensions (Correctness, Refusal hygiene, Confidence calibration). Populate EVAL-007 golden output via hand-grading. Wire into `xera-eval`.
- **v0.5.x (patch).** Locality-trim the DOM snapshot at `heal-prepare` time if size > 50KB threshold. Reduces token cost on real-world apps.
- **v0.6.0 (separate spec).** Past-passing DOM delta: store last successful run's scrubbed DOM, feed alongside failure DOM. Quality boost; requires storage decisions (retention, deduplication).
- **v0.7+ (separate spec).** Drift telemetry: track healed-locator frequency, surface to maintainers as a generation-strategy signal.

---

## 6. Open questions / risks

1. **LLM picks a semantically wrong but technically valid element.** Heal applies, verification re-run passes (because the wrong element happens to be clickable and the assertion is weak). Test now silently tests the wrong thing.
   **Mitigations:** `pomMethodName` and `gherkinStep` give the LLM intent context. Verification re-runs the SAME assertion — well-written specific assertions tend to fail re-verify on wrong heals. QA reviews `git diff --staged` before commit. **Residual risk: persistent.** Heals on weak tests are weak — this is a test-suite quality property, not a heal bug.

2. **DOM scrubber leaks data into the LLM prompt.** `domSnapshotAtFailure` is scrubbed via existing `scrub-rules.ts`, but rules don't catch everything (free-text fields may contain PII).
   **Mitigations:** v0.3 nonce-wrap defense applies — LLM treats DOM as untrusted, will not echo PII. DOM does enter context window. **Residual risk: present.** Same surface as today's `diagnose-failure`; v0.5 just exercises it more.

3. **DOM snapshot is huge.** Real-world apps produce 100KB+ DOMs. Feeding whole into LLM is expensive + risks context-window overflow.
   **Mitigations:** v0.5 ships the simple "send whole scrubbed DOM" path. If tokens become a real cost, v0.5.x patch adds locality trimming (nearest 3 ancestor levels + descendants). `heal-prepare` emits a token-size warning when DOM > 50KB.

4. **Heal succeeds locally, breaks in CI.** Different test data, different timing, different SUT state.
   **Mitigations:** Out of v0.5's control. The heal verification re-run mirrors how QA would re-run manually. CI divergence is a deployment-pipeline concern.

5. **Single-heal guard frustrates QA on cascading drift.** Design refresh renames 5 buttons → 5 drifts → 5 re-runs.
   **Mitigations:** Document in v0.5 PR. Each re-run is cheap. Multi-heal semantics get hairy (which heal was wrong on cascade failure?). v0.5.x patch adds multi-heal if pain is real.

6. **POM line drifted between prepare and apply.** Some other process edits POM in the same window (unlikely in normal `/xera-report` flow).
   **Mitigations:** Apply step refuses (loud failure). No silent corruption.

7. **Verification re-run takes ~30s.** Heal-and-verify adds 30s to report flow.
   **Mitigations:** Acceptable. Skill emits "Re-running test to verify heal — ~30s" so QA sees it. v0.5 has no flag to disable verification; it's the whole point of auto-apply.

8. **Heal output JSON malformed.** LLM returns invalid JSON or wrong schema.
   **Mitigations:** Skill validates parse + schema before applying. Malformed → treat as refusal, no POM change. Prompt's output rules section mirrors `eval-rubric.md`'s strict-JSON discipline.

9. **`git add` lands additional unrelated files.** If POM file path is wrong (bug in heal-prepare's path extraction), wrong file gets staged.
   **Mitigations:** `heal-prepare` records exact `pomFile` from trace event; no globbing, no inference. Unit tests on `heal-prepare.ts` cover path correctness.

10. **Heal flow runs but no SELECTOR_DRIFT scenarios exist.** The skill should NOT attempt heal in this case.
    **Mitigations:** Skill explicitly checks `classifier-output.json` for `class: SELECTOR_DRIFT` BEFORE invoking `heal-prepare`. If none → skip heal phase entirely, exit normally.

11. **Risk NOT raised:** prompt injection via DOM. v0.3 mechanism covers it. The whole point of v0.5 architecture is that no new defense work is needed — v0.3 generalizes.
