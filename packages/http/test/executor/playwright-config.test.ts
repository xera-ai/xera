import { describe, expect, test } from 'bun:test';
import { generateHttpPlaywrightConfig } from '../../src/executor/playwright-config';

describe('generateHttpPlaywrightConfig', () => {
  test('generates http-only config without browser', () => {
    const cfg = generateHttpPlaywrightConfig({
      specPath: '/abs/ticket/spec.ts',
      outputDir: '/abs/ticket/runs/RUN-1',
      baseURL: 'https://api.x.com',
    });
    expect(cfg).toContain('testDir');
    expect(cfg).toContain('testMatch');
    expect(cfg).not.toContain('browserName');
    expect(cfg).toContain('reporter');
    expect(cfg).toContain("'/abs/ticket'"); // dirname of spec
    expect(cfg).toContain("'spec.ts'"); // basename
    expect(cfg).toContain('https://api.x.com');
    expect(cfg).toContain('projects');
  });

  test('output config is valid TypeScript (executable)', () => {
    const cfg = generateHttpPlaywrightConfig({
      specPath: '/x/y/spec.ts',
      outputDir: '/x/y/runs/r',
      baseURL: 'http://localhost:3000',
    });
    expect(cfg).toMatch(/import .* from '@playwright\/test'/);
    expect(cfg).toMatch(/export default/);
  });
});
