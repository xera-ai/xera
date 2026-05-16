import { describe, expect, test } from 'bun:test';
import { cpSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { enhanceClassification } from '../../src/graph/classify';
import { deriveSnapshot, loadAllEvents } from '../../src/graph/store';

const FIXTURES = join(import.meta.dir, '../../../../fixtures/golden-graph');

const SCENARIOS = [
  {
    name: 'test-outdated-label-change',
    stubReturns: {
      classification: 'TEST_OUTDATED' as const,
      confidence: 0.87,
      evidence: { reasoning: 'TICKET-200 changed AC' },
    },
  },
  {
    name: 'test-outdated-multi-candidate',
    stubReturns: {
      classification: 'TEST_OUTDATED' as const,
      confidence: 0.85,
      evidence: { reasoning: 'first candidate matches' },
    },
  },
  {
    name: 'test-outdated-ambiguous',
    stubReturns: {
      classification: 'AMBIGUOUS' as const,
      confidence: 0.5,
      evidence: { reasoning: 'conflict' },
    },
  },
  {
    name: 'test-outdated-false-positive',
    stubReturns: {
      classification: 'BUG' as const,
      confidence: 0.6,
      evidence: { reasoning: 'LLM rejects' },
    },
  },
];

describe('TEST_OUTDATED golden fixtures', () => {
  for (const { name, stubReturns } of SCENARIOS) {
    test(name, async () => {
      const tmp = mkdtempSync(join(tmpdir(), `xera-tofix-${name}-`));
      try {
        cpSync(join(FIXTURES, name), tmp, { recursive: true });
        const events = loadAllEvents(tmp);
        const graph = deriveSnapshot(events);
        const expected = JSON.parse(
          readFileSync(join(tmp, 'expected-classification.json'), 'utf8'),
        ) as { classification: string; confidence: number };

        // Pick the first scenario in the graph
        const scenarioId = Object.keys(graph.scenarios)[0]!;

        const stub = async () => stubReturns;
        const out = await enhanceClassification(
          { scenarioId, traceClassification: 'REAL_BUG' },
          graph,
          stub,
        );

        expect(out.classification).toBe(expected.classification);
        if (expected.confidence !== undefined) {
          expect(out.confidence).toBeCloseTo(expected.confidence, 2);
        }
      } finally {
        rmSync(tmp, { recursive: true, force: true });
      }
    });
  }
});
