# Golden Eval Fixtures

Hand-authored ground-truth tickets used by the v0.2 eval harness
(`/xera-eval` skill). Each fixture exercises one or more prompt-template
stages so a maintainer can detect regressions when editing a prompt.

## Layout

Each fixture is a directory under `fixtures/golden-eval/`:

```
EVAL-NNN-short-slug/
  story.md                   # simulated Jira story (markdown)
  meta.json                  # { id, summary, source?, stages }
  golden/
    test.feature             # ground-truth Gherkin (for feature-from-story stage)
    spec-requirements.md     # MUST/MUST NOT/SHOULD bullets (for script-from-feature stage)
```

`meta.json#stages` must list which stages this fixture exercises. Only the
stages listed will be evaluated. Example: an ambiguous-story fixture may
only exercise `feature-from-story` and omit `script-from-feature`.

## Why `spec-requirements.md` instead of `spec.ts`?

Many valid Playwright spec files satisfy the same user story. Matching
generated `spec.ts` against one specific golden text would over-constrain.
We instead express the golden as a list of MUST / MUST NOT / SHOULD
statements the judge checks individually. Example:

- MUST import and use `LoginPage` POM from `page-objects/login.page.ts`.
- MUST assert URL contains `/dashboard` after successful login.
- MUST NOT use `page.waitForTimeout`.
- MUST use `getByRole` / `getByLabel` selectors for form fields, not raw CSS.

## Adding a new fixture

1. Create `fixtures/golden-eval/EVAL-NNN-slug/`.
2. Write `story.md` with H1 ticket heading + `## Story` + `## Acceptance Criteria`.
3. Write `meta.json`:
   ```json
   {
     "id": "EVAL-NNN",
     "summary": "One-line description",
     "stages": ["feature-from-story", "script-from-feature"]
   }
   ```
4. Hand-author `golden/test.feature` for stages that include `feature-from-story`.
5. Hand-author `golden/spec-requirements.md` for stages that include
   `script-from-feature`. Keep bullets concrete and checkable.
6. Run `bun run xera:doctor` to validate the fixture shape.
7. Run `/xera-eval --ticket=EVAL-NNN` from a Claude Code session in this repo
   to smoke-test before opening a PR.

## Stale goldens policy

When a prompt-template changes shape, the golden authored against the prior
prompt may no longer reflect "ideal" output. **Update the relevant
`golden/*` files in the SAME PR as the prompt change.** Reviewer should
confirm both prompt diff and golden diff are coherent.

## Classifier (`diagnose-failure`) stage

Classifier fixtures are NOT under `fixtures/golden-eval/`. They live at
`fixtures/golden-tickets/*.json` (existing v0.1 location, reused as-is).
The eval harness automatically picks them up; no action needed here.
