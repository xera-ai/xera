import { cpSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';
import { walkImpact } from '../../src/graph/impact';
import { deriveSnapshot, loadAllEvents } from '../../src/graph/store';

const FIXTURES = join(import.meta.dirname, '../../../../fixtures/golden-impact');

const SCENARIOS = [
  { name: 'impact-depth-1', target: 'ABC-200', depth: 1 as const },
  { name: 'impact-depth-2', target: 'ABC-200', depth: 2 as const },
  { name: 'impact-empty', target: 'ABC-200', depth: 1 as const },
];

describe('impact golden fixtures', () => {
  for (const { name, target, depth } of SCENARIOS) {
    test(name, () => {
      const tmp = mkdtempSync(join(tmpdir(), `xera-impact-gold-${name}-`));
      try {
        cpSync(join(FIXTURES, name), tmp, { recursive: true });
        const events = loadAllEvents(tmp);
        const graph = deriveSnapshot(events);
        const targetTicket = graph.tickets[target]!;
        expect(targetTicket).toBeDefined();
        const result = walkImpact(graph, targetTicket, { depth });
        const ids = result.map((s) => s.scenarioId).sort();
        const expected = JSON.parse(readFileSync(join(tmp, 'expected-impact.json'), 'utf8')) as {
          scenarios: string[];
        };
        expect(ids).toEqual(expected.scenarios.sort());
      } finally {
        rmSync(tmp, { recursive: true, force: true });
      }
    });
  }
});
