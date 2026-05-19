import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { samplesRemoveCommand } from '../src/commands/samples';
import { samplesForShape, scaffoldSample } from '../src/samples';

describe('xera samples remove', () => {
  let dir: string;
  const origCwd = process.cwd();

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'xera-samples-remove-'));
    process.chdir(dir);
  });
  afterEach(() => {
    process.chdir(origCwd);
    rmSync(dir, { recursive: true, force: true });
  });

  test('returns 0 with no-op when no samples present', async () => {
    const code = await samplesRemoveCommand({ yes: true });
    expect(code).toBe(0);
  });

  test('--yes removes all installed samples', async () => {
    for (const s of samplesForShape('mixed')) {
      scaffoldSample(dir, s, { cliVersion: '0.0.1' });
    }
    expect(existsSync(join(dir, '.xera/SAMPLE-001'))).toBe(true);
    expect(existsSync(join(dir, '.xera/SAMPLE-HTTP-001'))).toBe(true);

    const code = await samplesRemoveCommand({ yes: true });
    expect(code).toBe(0);
    expect(existsSync(join(dir, '.xera/SAMPLE-001'))).toBe(false);
    expect(existsSync(join(dir, '.xera/SAMPLE-HTTP-001'))).toBe(false);
  });

  test('--yes removes only the samples that exist', async () => {
    const [web] = samplesForShape('web');
    scaffoldSample(dir, web!, { cliVersion: '0.0.1' });
    const code = await samplesRemoveCommand({ yes: true });
    expect(code).toBe(0);
    expect(existsSync(join(dir, '.xera/SAMPLE-001'))).toBe(false);
  });
});
