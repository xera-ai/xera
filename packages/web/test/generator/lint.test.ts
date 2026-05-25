import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';
import { lintTicket } from '../../src/generator/lint';

describe('lintTicket', () => {
  test('returns warnings for bad selectors in spec.ts', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'xera-lint-'));
    writeFileSync(join(dir, 'spec.ts'), `page.locator('.MuiButton-root-3xyz')`);
    const r = await lintTicket(dir);
    expect(r.ok).toBe(false);
    expect(r.warnings.some((w) => w.rule === 'no-auto-classname')).toBe(true);
    rmSync(dir, { recursive: true });
  });
  test('returns ok when no issues', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'xera-lint-'));
    writeFileSync(join(dir, 'spec.ts'), `page.getByRole('button')`);
    const r = await lintTicket(dir);
    expect(r.ok).toBe(true);
    rmSync(dir, { recursive: true });
  });
});
