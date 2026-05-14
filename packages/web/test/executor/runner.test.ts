import { describe, expect, test } from 'bun:test';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runPlaywright } from '../../src/executor';

describe('runPlaywright', () => {
  test('returns PASS when subprocess exits 0', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'xera-exec-'));
    const fakeReport = { suites: [], stats: { unexpected: 0 } };
    writeFileSync(join(dir, 'report.json'), JSON.stringify(fakeReport));

    const result = await runPlaywright({
      specPath: '/tmp/spec.ts',
      configPath: '/tmp/playwright.config.ts',
      outputDir: dir,
      // DI hook: simulate subprocess
      spawn: async () => ({ exitCode: 0 }),
    });
    expect(result.outcome).toBe('PASS');
    expect(result.rawReportPath).toBe(join(dir, 'report.json'));
    rmSync(dir, { recursive: true });
  });

  test('returns FAIL when subprocess exits non-zero', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'xera-exec-'));
    writeFileSync(
      join(dir, 'report.json'),
      JSON.stringify({ suites: [], stats: { unexpected: 1 } }),
    );
    const result = await runPlaywright({
      specPath: '/tmp/spec.ts',
      configPath: '/tmp/playwright.config.ts',
      outputDir: dir,
      spawn: async () => ({ exitCode: 1 }),
    });
    expect(result.outcome).toBe('FAIL');
    rmSync(dir, { recursive: true });
  });
});
