import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { lintCmd } from '../../src/bin-internal/lint';
import { validateFeatureCmd } from '../../src/bin-internal/validate-feature';

function setupTicket(content: { feature?: string; spec?: string }): string {
  const cwd = mkdtempSync(join(tmpdir(), 'xera-qg-'));
  mkdirSync(join(cwd, '.xera/JIRA-1'), { recursive: true });
  if (content.feature !== undefined)
    writeFileSync(join(cwd, '.xera/JIRA-1/test.feature'), content.feature);
  if (content.spec !== undefined) writeFileSync(join(cwd, '.xera/JIRA-1/spec.ts'), content.spec);
  return cwd;
}

describe('quality gate subcommands', () => {
  let originalCwd: string;
  beforeEach(() => {
    originalCwd = process.cwd();
  });
  afterEach(() => {
    process.chdir(originalCwd);
  });

  test('validate-feature: exit 0 on good feature', async () => {
    const cwd = setupTicket({ feature: `Feature: x\n  Scenario: y\n    Given z\n` });
    process.chdir(cwd);
    expect(await validateFeatureCmd(['JIRA-1'])).toBe(0);
    rmSync(cwd, { recursive: true });
  });
  test('lint: exit 2 on auto-classname selector', async () => {
    const cwd = setupTicket({ spec: `page.locator('.MuiButton-root-3xyz')` });
    process.chdir(cwd);
    expect(await lintCmd(['JIRA-1'])).toBe(2);
    rmSync(cwd, { recursive: true });
  });
});
