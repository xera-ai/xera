import { expect, test } from '@playwright/test';

test.describe('SAMPLE-001: Playwright docs site smoke test', () => {
  test('Home page loads with expected title', async ({ page }) => {
    await page.goto('https://playwright.dev');
    await expect(page).toHaveTitle(/Playwright/);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  });
});
