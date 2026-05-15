import { describe, expect, test } from 'bun:test';
import { generateRunId } from '../../src/eval/run-id';

describe('generateRunId', () => {
  test('format YYYYMMDD-HHmmss-<7-char-hex>', () => {
    const id = generateRunId({
      getGitSha: () => 'a1b2c3d4e5f6',
      now: () => new Date('2026-05-20T10:30:45Z'),
    });
    expect(id).toBe('20260520-103045-a1b2c3d');
  });

  test('falls back to "nogit" when git sha unavailable', () => {
    const id = generateRunId({
      getGitSha: () => null,
      now: () => new Date('2026-05-20T10:30:45Z'),
    });
    expect(id).toBe('20260520-103045-nogit');
  });

  test('uses real git sha when no stub provided', () => {
    // Real call; just assert shape, not exact value.
    const id = generateRunId();
    expect(id).toMatch(/^\d{8}-\d{6}-[a-f0-9]{7}$|^\d{8}-\d{6}-nogit$/);
  });
});
