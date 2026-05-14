---
id: diagnose-failure
version: 1.0.0
inputs:
  - .xera/<TICKET>/runs/<latest>/normalized.json
  - .xera/<TICKET>/test.feature
  - .xera/<TICKET>/story.md
  - .xera/<TICKET>/spec.ts
  - .xera/<TICKET>/status.json (history)
  - .xera/<TICKET>/meta.json (hashes)
outputs:
  - classifier-input.json (consumed by `xera-internal report`)
---

# Diagnose a failed Playwright run

You will read a normalized run output (already secret-scrubbed) and decide what category each failed scenario belongs to.

## Inputs you must read

1. `normalized.json` — per-scenario pass/fail, plus for failures: errorMessage, networkAtFailure, consoleAtFailure, screenshotPath.
2. `test.feature` — what the test was *supposed* to verify.
3. `story.md` — the business intent behind the test.
4. `spec.ts` — the actual code that ran.
5. `status.json` — previous runs of the same scenario (history field).
6. `meta.json` — hashes. Specifically: did `story_hash` or `feature_hash` change since the previous run? Has `spec.ts` changed?

## Classification taxonomy

Choose exactly one class per scenario:

- **PASS** — the scenario passed.
- **REAL_BUG** — the app behaves differently from the story.
  - Examples: element shown with wrong text; HTTP 500 on a request that should succeed; missing required UI.
- **SELECTOR_DRIFT** — the UI changed but the story did not.
  - Examples: button text changed from "Sign in" to "Login"; element id renamed.
  - Evidence: similar element nearby in DOM; identical scenarios passed in prior runs.
- **FLAKY** — inconsistent failure not caused by test or app changes.
  - Evidence: prior 3+ runs passed; no spec change; failure at a wait/timing step; transient network error.
- **TEST_BUG** — the test code or Gherkin is wrong.
  - Examples: assertion contradicts story; wrong URL; bug in POM.

## Decision algorithm

1. If outcome is PASS → class = PASS.
2. If element NOT in DOM at failure point:
   - Search for similar element nearby (text, role variants).
   - Found similar → SELECTOR_DRIFT.
   - Not found AND story does not require the element → TEST_BUG.
   - Not found AND story requires it → REAL_BUG.
3. If element IN DOM but assertion mismatch:
   - Mismatch matches story intent → REAL_BUG.
   - Mismatch contradicts story (spec asserts wrong thing) → TEST_BUG.
4. If timeout / network error:
   - Prior runs passed, no spec change → FLAKY.
   - Network 5xx from app endpoint → REAL_BUG.
5. If `spec.ts` changed recently AND failure mode is novel → TEST_BUG.

## Confidence

- **high** — clear evidence in normalized.json + history.
- **medium** — heuristic match but one piece of evidence missing.
- **low** — first run AND ambiguous evidence; classify conservatively (TEST_BUG or SELECTOR_DRIFT) but mark low.

## Rationale

Each scenario must include a 1–3 sentence `rationale` written in English explaining why you chose the class. Reference concrete evidence (URL, status code, element name, prior run timestamp).

## Output format

Write `classifier-input.json` with this shape:

```json
{
  "runId": "<runId from normalized.json>",
  "scenarios": [
    {
      "name": "<scenario name>",
      "outcome": "PASS" | "FAIL" | "SKIPPED",
      "class": "PASS" | "REAL_BUG" | "SELECTOR_DRIFT" | "FLAKY" | "TEST_BUG",
      "confidence": "low" | "medium" | "high",
      "rationale": "..."
    }
  ],
  "scenarioCounts": { "total": N, "passed": N, "failed": N, "skipped": N }
}
```

The skill will pass this file to `bun run xera:report -- --input=<path>`.
