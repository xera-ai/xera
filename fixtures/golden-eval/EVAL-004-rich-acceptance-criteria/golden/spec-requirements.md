# EVAL-004 — spec.ts requirements

## MUST

- Import and use a `SettingsPage` POM from `page-objects/settings.page.ts`.
- Locate buttons by role: `getByRole('button', { name: /save/i })`, `getByRole('button', { name: /discard/i })`.
- Use `expect(button).toBeVisible()` / `toBeHidden()` for button visibility — not `toHaveCount`.
- Use `expect(field).toHaveValue('...')` for field contents — not `expect(field.value()).toBe(...)`.
- Cover all 6 scenarios from the Gherkin with separate `test()` blocks.
- For the "Reload preserves" scenario, use `await page.reload()` (not full re-navigation).
- For the toast assertion, use `getByText('Settings saved')` with `toBeVisible()`.

## MUST NOT

- Use `page.waitForTimeout` between actions.
- Set values with `field.evaluate(el => el.value = ...)` — use `fill`.
- Skip the "navigate away while dirty" scenario; it tests a non-trivial behavior.

## SHOULD

- Define a fixture or beforeEach that loads the settings page with a known user.
- Group the dirty-state scenarios under a nested `describe`.
