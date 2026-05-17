import { describe, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { acCoverageBackfillFinalizeCmd } from '../../src/bin-internal/ac-coverage-backfill-finalize';
import { acCoverageBackfillPrepareCmd } from '../../src/bin-internal/ac-coverage-backfill-prepare';
import { coveragePrepareCmd } from '../../src/bin-internal/coverage-prepare';
import { appendEvents } from '../../src/graph/store';
import type { Event } from '../../src/graph/types';

const CORE_DEFINE_PATH = resolve(__dirname, '../../src/config/define.ts');

function eid(seed: string): string {
  const digits = seed
    .replace(/[^0-9]/g, '')
    .padEnd(20, '0')
    .slice(0, 20);
  return `01HXYZ${digits}`;
}

function makeProject(): string {
  const dir = mkdtempSync(join(tmpdir(), 'xera-bf-rt-'));
  mkdirSync(join(dir, '.xera/graph'), { recursive: true });
  writeFileSync(
    join(dir, 'xera.config.ts'),
    `import { defineConfig } from '${CORE_DEFINE_PATH}';\n` +
      `export default defineConfig({\n` +
      `  jira: { baseUrl: 'https://example.atlassian.net', projectKeys: ['PROJ'], fields: { story: 'description' } },\n` +
      `  web: { baseUrl: { local: 'http://localhost:3000' }, defaultEnv: 'local' },\n` +
      `  adapters: ['web'],\n` +
      `});\n`,
  );
  return dir;
}

describe('AC backfill end-to-end round-trip', () => {
  test('prepare → simulated AI → finalize → coverage shows AC SATISFIED', async () => {
    const dir = makeProject();
    // Seed: ticket with 3 ACs + 1 scenario that PASSes, but no satisfies edges
    const events: Event[] = [
      {
        event_id: eid('20260512100000'),
        schema_version: 1,
        ts: '2026-05-12T10:00:00.000Z',
        actor: 'test',
        type: 'ticket.fetched',
        payload: {
          ticketId: 'PROJ-105',
          summary: 's',
          ac: ['User sees subtotal', 'Tax shows', 'Total'],
          jiraLinks: [],
          storyHash: 'h',
          modifiesAreas: [],
        },
      },
      {
        event_id: eid('20260512110000'),
        schema_version: 1,
        ts: '2026-05-12T11:00:00.000Z',
        actor: 'test',
        type: 'scenario.generated',
        payload: {
          scenarioId: 'PROJ-105#scenario-0',
          ticketId: 'PROJ-105',
          name: 'Cart shows subtotal',
          gherkin: 'Given X\nWhen Y\nThen subtotal is visible',
          priority: 'p1',
          featureHash: 'h',
          generatedAt: '2026-05-12T11:00:00.000Z',
        },
      },
      {
        event_id: eid('20260515100000'),
        schema_version: 1,
        ts: '2026-05-15T10:00:00.000Z',
        actor: 'test',
        type: 'run.classified',
        payload: {
          scenarioId: 'PROJ-105#scenario-0',
          runId: 'r1',
          classification: 'PASS',
          confidence: 'high',
        },
      },
    ];
    appendEvents(dir, events, { skill: 'fetch', ticketId: 'PROJ-105' });

    const prevCwd = process.cwd();
    process.chdir(dir);
    try {
      // 1. Coverage report says backfill needed
      await coveragePrepareCmd(['--snapshot-ts', '2026-05-17T10:00:00.000Z', '--no-emit-event']);
      let report = JSON.parse(readFileSync(join(dir, '.xera/coverage/report.json'), 'utf8'));
      expect(report.acBackfillNeeded).toBe(true);

      // 2. prepare assembles input
      await acCoverageBackfillPrepareCmd([]);
      const input = JSON.parse(
        readFileSync(join(dir, '.xera/coverage/ac-backfill-input.json'), 'utf8'),
      );
      expect(input.tickets).toHaveLength(1);

      // 3. Simulate AI: scenario 0 satisfies AC 0
      writeFileSync(
        join(dir, '.xera/coverage/ac-backfill-decisions.json'),
        JSON.stringify({
          mappings: [{ scenarioId: 'PROJ-105#scenario-0', satisfiesAcs: [0], confidence: 0.9 }],
        }),
      );

      // 4. finalize emits the event
      await acCoverageBackfillFinalizeCmd(['--snapshot-ts', '2026-05-17T11:00:00.000Z']);

      // 5. Re-run coverage; now AC 0 is SATISFIED, ACs 1 and 2 still UNSATISFIED
      await coveragePrepareCmd(['--snapshot-ts', '2026-05-17T10:00:00.000Z', '--no-emit-event']);
      report = JSON.parse(readFileSync(join(dir, '.xera/coverage/report.json'), 'utf8'));
      expect(report.acBackfillNeeded).toBe(false);
      expect(report.tickets).toHaveLength(1);
      expect(report.tickets[0].id).toBe('PROJ-105');
      expect(report.tickets[0].satisfiedCount).toBe(1);
      expect(report.tickets[0].acCount).toBe(3);
      expect(
        report.tickets[0].unsatisfiedAcs.map((ac: { index: number }) => ac.index).sort(),
      ).toEqual([1, 2]);
    } finally {
      process.chdir(prevCwd);
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
