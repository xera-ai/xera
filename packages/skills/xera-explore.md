---
name: xera-explore
description: Generative — propose ADVERSARIAL Gherkin scenarios beyond the ticket's acceptance criteria (negative paths, boundaries, races, a11y, security smells). QA-internal; not part of /xera-run. Use when you want AI to brainstorm "what could go wrong" tests for a ticket. Available v0.9+ (experimental).
---

The user invoked `/xera-explore <TICKET>`. If no key, ask.

This skill is **opt-in and QA-internal**. `/xera-run` does NOT auto-trigger it. Output lands in `.xera/<TICKET>/explore.feature` (separate from `test.feature`) so PO review of AC-driven scenarios is not disturbed.

**Status: experimental.** The prompt has no golden-eval coverage yet (v0.9.0). Treat AI output as a brainstorming partner, not a source of truth — QA must review every proposal.

## Step 1 — Verify project + ticket

Confirm `xera.config.ts` exists in cwd. If not, say `xera.config.ts not found — run this inside a xera project.` and STOP.

Verify `.xera/{{TICKET}}/story.md` exists. If not, say `No story.md for {{TICKET}}. Run /xera-fetch {{TICKET}} first.` and STOP.

## Step 2 — Ask the user for focus (UX checkpoint)

Before running the prompt, ask the user **two questions** in sequence:

**Q1.** Print:

```
What adversarial categories should I focus on for {{TICKET}}?

  [1] negative           — invalid/malformed input (default ON)
  [2] boundary           — empty/max-length/unicode/precision edges (default ON)
  [3] state-combination  — role × flag × prior-action combinations
  [4] race               — double-submit, concurrent, network drop mid-action
  [5] error-recovery     — 5xx, timeout, session expiry, browser back/forward
  [6] a11y               — keyboard nav, screen reader, focus management
  [7] security-smell     — XSS, IDOR, open redirect, auth bypass
  [8] non-functional     — i18n, perf budget, viewport, reduced motion

Reply with: numbers (e.g. "1,2,4,7"), "all", or "default" (= 1,2,4,7 — the 4 most universally relevant).
```

Wait for the user's answer. Default to `1,2,4,7` if they reply "default" or with an empty input. Reject invalid numbers with a one-line error and re-ask.

For HTTP adapter tickets (`meta.json.adapter === "http"`), strike `a11y` from the list and adjust default to `1,2,4,5,7`.

**Q2.** Print:

```
Any specific concern to investigate? (e.g. "double-charge under flaky network", "RTL languages break the cart UI")
Reply with a one-liner, or press Enter to skip.
```

Capture the free-text reply (may be empty). This becomes `userHint` passed to the prompt.

## Step 3 — Prepare context

Run:

```bash
bun run xera:explore-prepare {{TICKET}} \
  --categories "<comma-separated-slugs-from-Q1>" \
  --user-hint "<reply-from-Q2-or-empty>"
```

Exit codes:
- `0` — context written to `.xera/{{TICKET}}/adversarial-input.json`
- `1` — invalid flags (shouldn't happen; you pass through user input)
- `2` — ticket has no story / not a xera project; surface stderr and STOP

The binary assembles: story, AC, existing `test.feature` (if present), existing `spec.ts` (if present), adapter, the chosen categories, and the user hint.

## Step 4 — Invoke the adversarial-scenarios prompt

Mint a fresh per-invocation nonce:

```bash
bun -e "console.log('XR_' + crypto.randomUUID().replace(/-/g,'').slice(0,12))"
```

Capture the single-line output as the nonce.

Read `.xera/{{TICKET}}/adversarial-input.json` and `node_modules/@xera-ai/prompts/adversarial-scenarios.md`. Generate proposals following that prompt's rules. Wrap the input JSON between two identical `<NONCE>` tags (using the real nonce, NOT the literal `<NONCE>`) before feeding it to your generation context.

Write the prompt output to `.xera/{{TICKET}}/adversarial-proposals.json`. Schema:

```json
{
  "proposals": [
    {
      "id": "A1",
      "ticketId": "{{TICKET}}",
      "category": "negative | boundary | state-combination | race | error-recovery | a11y | security-smell | non-functional",
      "severity": "low | medium | high",
      "title": "...",
      "rationale": "...",
      "gherkin": "Scenario: ...\n  Given ...\n  When ...\n  Then ..."
    }
  ]
}
```

## Step 5 — Present proposals to user (UX checkpoint)

Read the proposals and print them grouped by severity descending, with category badge. Example:

```
8 adversarial scenarios proposed for {{TICKET}}:

[HIGH] severity
  [A1] race · "Double-click Apple Pay does not double-charge"
       Why: AC does not mention idempotency; spec.ts has no waitFor on button disable.
       Preview: Given user is on /checkout · When user clicks "Apple Pay" twice within 200ms · Then exactly one payment is captured

  [A2] security-smell · "Comment field rejects script injection"
       Why: AC doesn't mention sanitization; comment field is reflected on order confirmation.
       Preview: When user enters "<script>alert(1)</script>" as comment · Then the rendered comment shows literal text

[MEDIUM] severity
  [A3] negative · "Email field rejects malformed addresses"
       ...

[LOW] severity
  [A8] non-functional · "Order summary survives 1000 line items"
       ...
```

Ask the user:

```
Pick proposals to accept [comma-separated IDs / all / high-only / none]:
```

- **none** — STOP. Mention `.xera/{{TICKET}}/adversarial-proposals.json` is preserved for later review.
- **all** — accept every proposal.
- **high-only** — accept only `severity === "high"`.
- **comma-separated IDs** (e.g. `A1, A3, A7`) — accept the named subset. Reject unknown IDs with a one-line error and re-ask.

## Step 6 — Finalize accepted proposals

Run:

```bash
bun run xera:explore-finalize {{TICKET}} --accept "<comma-separated-ids-or-all-or-high-only>"
```

The binary appends accepted scenarios to `.xera/{{TICKET}}/explore.feature`, tagged `@adversarial` (and a second tag matching the category, e.g. `@adversarial-race`). If `explore.feature` does not exist, the binary creates it with a Feature header copied from `test.feature` (or a synthesized one if no `test.feature` yet).

Exit codes:
- `0` — written
- `1` — invalid flags / no IDs matched
- `2` — proposals file missing (Step 4 didn't produce output)
- `4` — internal write error

## Step 7 — Next-step summary

Print:

```
Wrote N adversarial scenarios to .xera/{{TICKET}}/explore.feature.

Review the file, edit as needed, then either:
  (a) merge into test.feature and run /xera-script {{TICKET}} to generate spec
  (b) keep explore.feature separate and run via: bun run xera:exec {{TICKET}} --grep "@adversarial"
      (when /xera-script grows multi-feature support — currently spec covers test.feature only,
       so option (a) is the only end-to-end path)

The raw proposals are at .xera/{{TICKET}}/adversarial-proposals.json if you want to revisit.
```

## Edge cases

- User picks 0 categories in Q1 → STOP with a friendly note ("no categories selected, nothing to explore").
- Prompt returns `{ "proposals": [] }` (degenerate input or attempted injection) → tell the user the prompt returned no proposals and STOP. Do NOT retry without further input from the user.
- `adversarial-proposals.json` already exists from a prior run → ask `Overwrite existing proposals from prior /xera-explore run? (y/N)` before Step 4. If no, skip Step 4 and jump straight to Step 5 with the existing file.
- `explore.feature` already exists → the finalize binary appends; it does NOT overwrite. If the user wants a clean slate, instruct them to delete the file manually before re-running.

## What this skill does NOT do

- It does NOT modify `test.feature`. AC-driven scenarios are sacred.
- It does NOT generate `spec.ts`. That's `/xera-script`'s job. Merge `explore.feature` into `test.feature` first.
- It does NOT auto-run tests. Use `/xera-exec` after merging.
- It does NOT record graph events in v0.9.0 (deferred to v0.9.1 once the schema is finalized).
