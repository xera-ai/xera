---
name: xera-fill-gap
description: Generative — draft Gherkin scenarios for an UNCOVERED area or the unsatisfied ACs of a specific ticket. Use when you want AI to fill a coverage gap. Available v0.8.2+.
---

The user invoked one of:
- `/xera-fill-gap <area>` (area mode — fill an UNCOVERED area)
- `/xera-fill-gap --ticket <TICKET>` (ticket mode — fill unsatisfied ACs of a specific ticket)

If neither is provided, ask.

This skill does NOT modify graph state, run tests, or auto-chain into `/xera-script`. It produces draft `.feature` files that the user reviews; the user invokes `/xera-script` separately when ready.

## Step 1 — Verify project layout

Confirm `xera.config.ts` exists in cwd. If not, say `xera.config.ts not found — run this inside a xera project.` and STOP.

## Step 2 — Assemble context

Run:

```bash
bun run xera:fill-gap-prepare {{--area <slug> | --ticket <TICKET>}}
```

Exit codes:
- `0` — context written
- `1` — invalid flags (shouldn't happen if you pass-through user input)
- `2` — area has no tickets / ticket has no unsatisfied ACs. Surface the stderr and STOP.

The output is `.xera/coverage/<scope>/context.json` where `<scope>` is the area slug or ticket ID.

## Step 3 — Invoke the propose-scenarios prompt

Mint a fresh per-invocation nonce:

```bash
bun -e "console.log('XR_' + crypto.randomUUID().replace(/-/g,'').slice(0,12))"
```

Capture the single-line output as the nonce.

Read `.xera/coverage/<scope>/context.json` and `node_modules/@xera-ai/prompts/propose-scenarios.md`. Generate scenario proposals following that prompt's rules. Wrap the context JSON between two identical `<NONCE>` tags before feeding it to your generation context.

Write the prompt output to `.xera/coverage/<scope>/proposals.json`. Schema:

```json
{
  "proposals": [
    {
      "id": "P1", "ticketId": "<id>", "title": "<title>",
      "rationale": "<one sentence>",
      "gherkin": "Scenario: ...\n  Given ...\n  When ...\n  Then ...",
      "satisfiesAcs": [<indices or empty>]
    }
  ]
}
```

## Step 4 — Present proposals to user

Read the proposals and print them in a numbered list:

```
3 candidate scenarios for `<scope>`:

  [P1] PROJ-101 · "Customer pays with Apple Pay"
       Why: Ticket adds Apple Pay; no scenario tests this path.
       Preview: Given user is on /checkout · When they select Apple Pay · Then ...

  [P2] PROJ-101 · "Apple Pay declined with no second attempt"
       Why: ...
       Preview: ...

  ...
```

Ask the user: `Pick proposals to draft [comma-separated IDs / all / none]:`

- **none** — STOP. Mention the proposals.json file path so the user can review later.
- **all** — accept every proposal in proposals.json.
- **comma-separated IDs** (e.g. `P1, P3`) — accept the named subset.

## Step 5 — Finalize each accepted proposal

For each accepted proposal ID, run:

```bash
bun run xera:fill-gap-finalize --accept <id> --ticket <proposal.ticketId> --source .xera/coverage/<scope>/proposals.json
```

If the binary returns exit 3 (`feature.draft.md` already exists), prompt the user: `Overwrite existing draft for <TICKET>? (y/N)`. If yes, re-run with `--force`.

Collect the list of written `.xera/<TICKET>/feature.draft.md` paths.

## Step 6 — Print next-step summary

```
Drafted N scenario(s):
  - .xera/PROJ-101/feature.draft.md
  - ...

Next:
  Review each feature.draft.md, edit as needed, then run /xera-script <TICKET> when ready.
```

## Edge cases

- Graph snapshot not present yet — `fill-gap-prepare` will return exit 2; surface message + suggest `/xera-fetch` first.
- All proposals declined — STOP, no files written, no graph events emitted (the prompt run leaves only `.xera/coverage/<scope>/proposals.json` on disk, which is fine and reviewable).
- Mixed acceptance / overwrite conflict — handle one at a time; don't abort all on first --force prompt.
