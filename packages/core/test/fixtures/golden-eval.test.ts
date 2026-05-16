import { describe, expect, test } from 'bun:test';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { validateGherkin } from '@xera-ai/web';

const ROOT = join(import.meta.dir, '../../../../fixtures/golden-eval');

describe('fixtures/golden-eval/', () => {
  const dirs = existsSync(ROOT)
    ? readdirSync(ROOT, { withFileTypes: true })
        .filter((e) => e.isDirectory())
        .map((e) => e.name)
    : [];

  test('has ≥ 3 fixtures', () => {
    expect(dirs.length).toBeGreaterThanOrEqual(3);
  });

  for (const name of dirs) {
    const dir = join(ROOT, name);
    const metaPath = join(dir, 'meta.json');

    test(`${name}: meta.json parses`, () => {
      expect(existsSync(metaPath)).toBe(true);
      const meta = JSON.parse(readFileSync(metaPath, 'utf8'));
      expect(typeof meta.id).toBe('string');
      expect(Array.isArray(meta.stages)).toBe(true);
    });

    test(`${name}: story.md exists`, () => {
      expect(existsSync(join(dir, 'story.md'))).toBe(true);
    });

    test(`${name}: golden/test.feature (if declared) parses`, () => {
      const meta = JSON.parse(readFileSync(metaPath, 'utf8'));
      if (!meta.stages.includes('feature-from-story')) return;
      const f = join(dir, 'golden/test.feature');
      expect(existsSync(f)).toBe(true);
      const r = validateGherkin(readFileSync(f, 'utf8'));
      expect(r.ok).toBe(true);
    });

    test(`${name}: golden/spec-requirements.md (if declared) exists`, () => {
      const meta = JSON.parse(readFileSync(metaPath, 'utf8'));
      if (!meta.stages.includes('script-from-feature')) return;
      expect(existsSync(join(dir, 'golden/spec-requirements.md'))).toBe(true);
    });
  }
});
