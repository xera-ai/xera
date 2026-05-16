import { describe, expect, test } from 'bun:test';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { aggregateScenarios } from '../../src/classifier/aggregate';

const fixturesDir = join(import.meta.dir, '..', '..', '..', '..', 'fixtures', 'golden-tickets');

describe('classifier golden fixtures', () => {
  for (const file of readdirSync(fixturesDir)) {
    if (!file.endsWith('.json')) continue;
    const fixture = JSON.parse(readFileSync(join(fixturesDir, file), 'utf8'));
    test(`${file}: aggregator matches expected overall`, () => {
      const r = aggregateScenarios(fixture.scenarios);
      expect(r.overall).toBe(fixture.expected.overall);
      expect(r.overallConfidence).toBe(fixture.expected.overallConfidence);
    });
  }
});
