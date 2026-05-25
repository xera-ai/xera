import { describe, expect, test } from 'vitest';
import { validateGherkin } from '../../src/generator/gherkin-validate';

describe('validateGherkin', () => {
  test('accepts well-formed feature', () => {
    const r = validateGherkin(
      `Feature: Login\n  Scenario: ok\n    Given I am on /\n    Then I see "x"\n`,
    );
    expect(r.ok).toBe(true);
  });
  test('rejects empty input', () => {
    const r = validateGherkin('');
    expect(r.ok).toBe(false);
  });
  test('reports parse errors with line numbers', () => {
    const r = validateGherkin(`Scenario: only\n  Given y\n`); // Scenario without Feature
    expect(r.ok).toBe(false);
    expect(r.errors[0]?.line).toBeGreaterThan(0);
  });
});
