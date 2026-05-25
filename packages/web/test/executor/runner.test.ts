import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';
import { runPlaywright } from '../../src/executor';

describe('runPlaywright', () => {
  test('returns PASS when subprocess exits 0 and tests ran', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'xera-exec-'));
    writeFileSync(
      join(dir, 'report.json'),
      JSON.stringify({ suites: [], stats: { expected: 2, unexpected: 0 } }),
    );
    const result = await runPlaywright({
      specPath: '/tmp/spec.ts',
      configPath: '/tmp/playwright.config.ts',
      outputDir: dir,
      spawn: async () => ({ exitCode: 0 }),
    });
    expect(result.outcome).toBe('PASS');
    expect(result.rawReportPath).toBe(join(dir, 'report.json'));
    rmSync(dir, { recursive: true });
  });

  test('returns FAIL when subprocess exits 0 but no tests ran (false-pass guard)', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'xera-exec-'));
    writeFileSync(
      join(dir, 'report.json'),
      JSON.stringify({ suites: [], stats: { expected: 0, unexpected: 0 } }),
    );
    const result = await runPlaywright({
      specPath: '/tmp/spec.ts',
      configPath: '/tmp/playwright.config.ts',
      outputDir: dir,
      spawn: async () => ({ exitCode: 0 }),
    });
    expect(result.outcome).toBe('FAIL');
    rmSync(dir, { recursive: true });
  });

  test('returns FAIL when report is missing despite exit 0', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'xera-exec-'));
    const result = await runPlaywright({
      specPath: '/tmp/spec.ts',
      configPath: '/tmp/playwright.config.ts',
      outputDir: dir,
      spawn: async () => ({ exitCode: 0 }),
    });
    expect(result.outcome).toBe('FAIL');
    rmSync(dir, { recursive: true });
  });

  test('returns FAIL when subprocess exits non-zero', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'xera-exec-'));
    writeFileSync(
      join(dir, 'report.json'),
      JSON.stringify({ suites: [], stats: { expected: 1, unexpected: 1 } }),
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
