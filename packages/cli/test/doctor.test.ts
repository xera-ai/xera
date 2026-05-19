import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { doctorCommand } from '../src/commands/doctor';

describe('doctorCommand --strict flag arity (#153)', () => {
  let dir: string;
  const origCwd = process.cwd();
  let logs: string[];
  let logSpy: ReturnType<typeof mock>;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'xera-doctor-'));
    process.chdir(dir);
    logs = [];
    logSpy = mock((...args: unknown[]) => {
      logs.push(args.map(String).join(' '));
    });
    console.log = logSpy;
  });
  afterEach(() => {
    process.chdir(origCwd);
    rmSync(dir, { recursive: true, force: true });
    logSpy.mockRestore();
  });

  test('omitted --strict: returns 0 even with failing env checks', async () => {
    // No xera.config.ts in tmp dir → "xera.config.ts found and valid" check fails.
    const exit = await doctorCommand({});
    expect(exit).toBe(0);
    // Still prints the failing check.
    expect(logs.join('\n')).toContain('xera.config.ts');
  });

  test('--strict (boolean, no ticket): returns 1 on any failing env check', async () => {
    // Simulates `bunx xera doctor --strict` after cac parsing of `--strict [ticket]`
    // with no ticket arg supplied — cac yields strict === true.
    const exit = await doctorCommand({ strict: true });
    expect(exit).toBe(1);
    // No ticket arg passed → no ticket-specific check appears.
    expect(logs.join('\n')).not.toContain('XFB-7');
  });

  test('--strict <ticket>: returns 1 and runs ticket-specific checks', async () => {
    const exit = await doctorCommand({ strict: 'XFB-7' });
    expect(exit).toBe(1);
    // Ticket-specific check appears (xera.config.ts is missing so we won't reach
    // the artifact-dir check, but the ticket id must not crash the call).
    // The key behavior verified: passing a string doesn't throw and still treats
    // failures as non-zero.
  });

  test('--no-strict (strict === false): returns 0 even on failing checks (explicit opt-out)', async () => {
    const exit = await doctorCommand({ strict: false });
    expect(exit).toBe(0);
  });
});
