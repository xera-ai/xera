# EVAL-002 — spec.ts requirements

## MUST

- Import and use a `SignUpPage` page object from `page-objects/sign-up.page.ts`.
- Use `getByLabel(/email/i)` and `getByLabel(/password/i)` for inputs.
- Use `getByRole('button', { name: /create account/i })` for submit.
- Assert inline error text via `getByText('Please enter a valid email address')` (or equivalent toHaveText).
- Assert button disabled state via `expect(button).toBeDisabled()`.
- After valid submit, assert `await expect(page).toHaveURL(/\/welcome/)`.
- Use one `test(...)` per Gherkin scenario; cover all 4 scenarios.

## MUST NOT

- Use `page.waitForTimeout(...)` or `setTimeout`.
- Use CSS selectors for form fields.
- Submit form before asserting button-disabled state (ordering matters).
- Hardcode invalid-email or short-password assertions without first triggering blur.

## SHOULD

- Use the POM's `fillEmail`, `fillPassword`, `blur*`, and `submit` methods rather than inline locator manipulation.
