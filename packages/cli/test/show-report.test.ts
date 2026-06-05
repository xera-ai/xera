import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { showReportCommand } from '../src/commands/show-report';

describe('showReportCommand (#226)', () => {
  let cwd: string;
  let originalCwd: string;

  beforeEach(() => {
    originalCwd = process.cwd();
    cwd = mkdtempSync(join(tmpdir(), 'xera-show-report-'));
    process.chdir(cwd);
  });
  afterEach(() => {
    process.chdir(originalCwd);
    rmSync(cwd, { recursive: true, force: true });
  });

  function captureStderr(): { restore: () => string } {
    const original = console.error;
    const chunks: string[] = [];
    console.error = (...args: unknown[]) => {
      chunks.push(args.map((a) => String(a)).join(' '));
    };
    return {
      restore: () => {
        console.error = original;
        return chunks.join('\n');
      },
    };
  }

  test('exits 1 with actionable message when ticket has no runs', async () => {
    const cap = captureStderr();
    const exit = await showReportCommand({ ticket: 'XFB-9' });
    const stderr = cap.restore();
    expect(exit).toBe(1);
    expect(stderr).toContain('no runs found for XFB-9');
    expect(stderr).toContain('xera-internal exec XFB-9');
  });

  test('exits 1 with --reporter=html hint when run exists but no html report', async () => {
    const runsDir = join(cwd, '.xera', 'XFB-9', 'runs');
    mkdirSync(join(runsDir, '2026-06-05T12-00-00'), { recursive: true });
    writeFileSync(join(runsDir, '2026-06-05T12-00-00', 'report.json'), '{}');

    const cap = captureStderr();
    const exit = await showReportCommand({ ticket: 'XFB-9' });
    const stderr = cap.restore();

    expect(exit).toBe(1);
    expect(stderr).toContain('no HTML report');
    expect(stderr).toContain('--reporter=html');
  });

  test('exits 1 with specific message when --run id not found', async () => {
    const runsDir = join(cwd, '.xera', 'XFB-9', 'runs');
    mkdirSync(join(runsDir, '2026-06-05T12-00-00'), { recursive: true });

    const cap = captureStderr();
    const exit = await showReportCommand({ ticket: 'XFB-9', run: '2999-01-01T00-00-00' });
    const stderr = cap.restore();

    expect(exit).toBe(1);
    expect(stderr).toContain("run '2999-01-01T00-00-00' not found");
  });
});
