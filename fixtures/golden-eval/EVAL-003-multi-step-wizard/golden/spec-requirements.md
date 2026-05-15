# EVAL-003 — spec.ts requirements

## MUST

- Import and use an `OnboardingPage` POM from `page-objects/onboarding.page.ts`.
- Expose POM methods: `fillDisplayName(name)`, `selectTimezone(tz)`, `clickNext()`, `clickBack()`, `clickFinish()`.
- Assert step progression by visible heading or step indicator, not by URL alone (the wizard may be single-route).
- After "Finish", assert `await expect(page).toHaveURL(/\/home/)`.
- After "Back", assert the display name field value via `await expect(field).toHaveValue('Bob')`.
- Cover all 3 scenarios with separate `test(...)` blocks.

## MUST NOT

- Use `page.waitForTimeout` between steps; rely on `expect(...).toBeVisible()`.
- Assert intermediate step state via raw CSS class names (e.g., `.step-2-active`).

## SHOULD

- Define a small helper in the POM for advancing N steps with given data, to avoid repetition across scenarios.
