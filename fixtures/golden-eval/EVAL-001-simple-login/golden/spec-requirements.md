# EVAL-001 — spec.ts requirements

Each requirement below is checked individually by the eval judge against
the actual generated `spec.ts`.

## MUST

- Import and use a `LoginPage` page object from `page-objects/login.page.ts`.
- Locate the email input via `getByLabel(/email/i)` or `getByRole('textbox', { name: /email/i })`.
- Locate the password input via `getByLabel(/password/i)`.
- Locate the submit button via `getByRole('button', { name: /sign in|log in/i })`.
- After valid-credentials submit, assert `await expect(page).toHaveURL(/\/dashboard/)`.
- After valid-credentials submit, assert the dashboard greeting element contains "Alice" via `getByText` or `getByRole('heading', ...)`.
- After invalid-password submit, assert visibility of an element containing "Invalid email or password" via `getByText`.
- Wrap both scenarios with `test.describe('User can log in to dashboard', ...)`.
- Use one `test(...)` per Gherkin scenario; test name should match scenario name.

## MUST NOT

- Use `page.waitForTimeout(...)` or `setTimeout`.
- Use raw CSS selectors (`page.locator('.btn-primary')`) for form fields or submit buttons.
- Use XPath locators.
- Contain `console.log`, commented-out code, or unused imports.

## SHOULD

- Reuse the `LoginPage` POM's `login(email, password)` method rather than scripting field fills inline in each test.
