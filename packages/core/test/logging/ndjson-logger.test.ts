import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';
import { NdjsonLogger } from '../../src/logging/ndjson-logger';

describe('NdjsonLogger', () => {
  test('appends one JSON line per log()', () => {
    const dir = mkdtempSync(join(tmpdir(), 'xera-log-'));
    const path = join(dir, 'xera.log');
    const log = new NdjsonLogger(path);
    log.log({ step: 'fetch', exit: 0, ms: 12 });
    log.log({ step: 'feature', tokens_in: 100, tokens_out: 50 });
    const content = readFileSync(path, 'utf8');
    const lines = content.trim().split('\n');
    expect(lines).toHaveLength(2);
    const parsed1 = JSON.parse(lines[0]!);
    expect(parsed1.step).toBe('fetch');
    expect(typeof parsed1.ts).toBe('string');
    rmSync(dir, { recursive: true });
  });

  test('readAll parses NDJSON file', () => {
    const dir = mkdtempSync(join(tmpdir(), 'xera-log-'));
    const path = join(dir, 'xera.log');
    const log = new NdjsonLogger(path);
    log.log({ step: 'a' });
    log.log({ step: 'b' });
    expect(NdjsonLogger.readAll(path).map((e) => e.step)).toEqual(['a', 'b']);
    rmSync(dir, { recursive: true });
  });

  test('readAll returns empty array when file missing', () => {
    expect(NdjsonLogger.readAll('/no/such.log')).toEqual([]);
  });
});
