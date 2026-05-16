import { describe, expect, test } from 'bun:test';
import { buildPlaywrightArgs } from '../../src/executor/playwright-args';

describe('buildPlaywrightArgs', () => {
  test('includes spec path, reporter, output dir, trace on', () => {
    const args = buildPlaywrightArgs({
      specPath: '/r/.xera/JIRA-1/spec.ts',
      outputDir: '/r/.xera/JIRA-1/runs/2026-05-14T10-30',
      configPath: '/r/.xera/JIRA-1/playwright.config.ts',
    });
    expect(args).toContain('test');
    expect(args).toContain('/r/.xera/JIRA-1/spec.ts');
    expect(args).toContain('--reporter=json');
    expect(args).toContain('--output=/r/.xera/JIRA-1/runs/2026-05-14T10-30');
    expect(args).toContain('--trace=on');
    expect(args).toContain('--config=/r/.xera/JIRA-1/playwright.config.ts');
  });

  test('emits --grep flag when grep field is provided', () => {
    const args = buildPlaywrightArgs({
      specPath: '/r/.xera/JIRA-1/spec.ts',
      outputDir: '/r/.xera/JIRA-1/runs/2026-05-14T10-30',
      configPath: '/r/.xera/JIRA-1/playwright.config.ts',
      grep: 'should login successfully',
    });
    expect(args).toContain('--grep');
    expect(args).toContain('should login successfully');
  });

  test('omits --grep flag when grep field is not provided', () => {
    const args = buildPlaywrightArgs({
      specPath: '/r/.xera/JIRA-1/spec.ts',
      outputDir: '/r/.xera/JIRA-1/runs/2026-05-14T10-30',
      configPath: '/r/.xera/JIRA-1/playwright.config.ts',
    });
    expect(args).not.toContain('--grep');
  });
});
