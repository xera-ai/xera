import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';
import { type MetaJson, readMeta, writeMeta } from '../../src/artifact/meta';

describe('meta.json IO', () => {
  test('writeMeta then readMeta round-trips', () => {
    const dir = mkdtempSync(join(tmpdir(), 'xera-meta-'));
    const path = join(dir, 'meta.json');
    const m: MetaJson = {
      ticket: 'JIRA-1',
      adapter: 'web',
      xera_version: '0.1.0',
      prompts_version: '1.0.0',
      fetched_at: '2026-05-14T10:00:00.000Z',
      story_hash: 'sha256:abc',
    };
    writeMeta(path, m);
    expect(readMeta(path)).toEqual(m);
    rmSync(dir, { recursive: true });
  });

  test('readMeta returns null when missing', () => {
    expect(readMeta('/no/such/meta.json')).toBeNull();
  });
});
