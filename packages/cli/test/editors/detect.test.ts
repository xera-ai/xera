import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';
import { detectEditors } from '../../src/editors/detect';

function fresh(): string {
  return mkdtempSync(join(tmpdir(), 'xera-detect-'));
}

describe('detectEditors', () => {
  test('returns [] for empty dir', () => {
    const d = fresh();
    try {
      expect(detectEditors(d)).toEqual([]);
    } finally {
      rmSync(d, { recursive: true, force: true });
    }
  });

  test('detects .claude/', () => {
    const d = fresh();
    try {
      mkdirSync(join(d, '.claude'));
      expect(detectEditors(d)).toEqual(['claude']);
    } finally {
      rmSync(d, { recursive: true, force: true });
    }
  });

  test('detects .cursor/', () => {
    const d = fresh();
    try {
      mkdirSync(join(d, '.cursor'));
      expect(detectEditors(d)).toEqual(['cursor']);
    } finally {
      rmSync(d, { recursive: true, force: true });
    }
  });

  test('detects .agents/ as codex', () => {
    const d = fresh();
    try {
      mkdirSync(join(d, '.agents'));
      expect(detectEditors(d)).toEqual(['codex']);
    } finally {
      rmSync(d, { recursive: true, force: true });
    }
  });

  test('returns all three when all present, in stable order', () => {
    const d = fresh();
    try {
      mkdirSync(join(d, '.cursor'));
      mkdirSync(join(d, '.agents'));
      mkdirSync(join(d, '.claude'));
      expect(detectEditors(d)).toEqual(['claude', 'cursor', 'codex']);
    } finally {
      rmSync(d, { recursive: true, force: true });
    }
  });
});
