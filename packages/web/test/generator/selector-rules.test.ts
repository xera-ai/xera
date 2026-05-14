import { describe, expect, test } from 'bun:test';
import { lintSelectors } from '../../src/generator/selector-rules';

describe('lintSelectors', () => {
  test('warns on auto-class CSS selector', () => {
    const r = lintSelectors(`page.locator('.MuiButton-root-3xyz')`);
    expect(r.warnings.some((w) => w.rule === 'no-auto-classname')).toBe(true);
  });
  test('warns on bare CSS selector without justification comment', () => {
    const r = lintSelectors(`page.locator('div > button.submit')`);
    expect(r.warnings.some((w) => w.rule === 'prefer-role-over-css')).toBe(true);
  });
  test('accepts CSS with xera-allow-css justification', () => {
    const r = lintSelectors(
      `// xera-allow-css: 3rd-party widget no roles\npage.locator('div.widget')`,
    );
    expect(r.warnings.length).toBe(0);
  });
  test('no warning for getByRole', () => {
    const r = lintSelectors(`page.getByRole('button', { name: 'Sign in' })`);
    expect(r.warnings.length).toBe(0);
  });
});
