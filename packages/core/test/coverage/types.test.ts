import { describe, expect, test } from 'vitest';
import type { CoverageConfig } from '../../src/coverage/types';
import { DEFAULT_COVERAGE_CONFIG } from '../../src/coverage/types';

describe('CoverageConfig defaults', () => {
  test('staleAfterDays=30, criticalAreas=[], autoSnapshotOnCoverage=true', () => {
    const cfg: CoverageConfig = DEFAULT_COVERAGE_CONFIG;
    expect(cfg.staleAfterDays).toBe(30);
    expect(cfg.criticalAreas).toEqual([]);
    expect(cfg.autoSnapshotOnCoverage).toBe(true);
  });
});
