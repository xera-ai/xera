import { describe, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { acCoverageBackfillFinalizeCmd } from '../../src/bin-internal/ac-coverage-backfill-finalize';
import { appendEvents } from '../../src/graph/store';
import type { Event } from '../../src/graph/types';

function eid(seed: string): string {
  const digits = seed
    .replace(/[^0-9]/g, '')
    .padEnd(20, '0')
    .slice(0, 20);
  return `01HXYZ${digits}`;
}

function makeProject(): string {
  const dir = mkdtempSync(join(tmpdir(), 'xera-backfill-fin-'));
  mkdirSync(join(dir, '.xera/graph'), { recursive: true });
  mkdirSync(join(dir, '.xera/coverage'), { recursive: true });
  return dir;
}

describe('ac-coverage-backfill-finalize subcommand', () => {
  test('exports acCoverageBackfillFinalizeCmd returning Promise<number>', () => {
    expect(typeof acCoverageBackfillFinalizeCmd).toBe('function');
    const r = acCoverageBackfillFinalizeCmd(['--help-stub']);
    expect(r).toBeInstanceOf(Promise);
  });
});

describe('ac-coverage-backfill-finalize end-to-end', () => {
  test('reads decisions JSON and emits ac-coverage.backfilled event per ticket', async () => {
    const dir = makeProject();
    // Seed ticket events so the snapshot has the ACNodes
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
          ac: ['AC 0', 'AC 1', 'AC 2'],
          jiraLinks: [],
          storyHash: 'h',
          modifiesAreas: [],
        },
      },
    ];
    appendEvents(dir, events, { skill: 'fetch', ticketId: 'PROJ-105' });

    writeFileSync(
      join(dir, '.xera/coverage/ac-backfill-decisions.json'),
      JSON.stringify({
        mappings: [{ scenarioId: 'PROJ-105#scenario-0', satisfiesAcs: [0, 2], confidence: 0.85 }],
      }),
    );

    const prevCwd = process.cwd();
    process.chdir(dir);
    try {
      const code = await acCoverageBackfillFinalizeCmd([
        '--snapshot-ts',
        '2026-05-17T10:00:00.000Z',
      ]);
      expect(code).toBe(0);
      const monthDir = join(dir, '.xera/graph/events/2026-05');
      const files = readdirSync(monthDir).filter((f) => f.includes('-ac-coverage-'));
      expect(files.length).toBe(1);
      const content = readFileSync(join(monthDir, `${files[0]}`), 'utf8').trim();
      const event = JSON.parse(content);
      expect(event.type).toBe('ac-coverage.backfilled');
      expect(event.payload.ticketId).toBe('PROJ-105');
      expect(event.payload.mappings).toEqual([
        { scenarioId: 'PROJ-105#scenario-0', satisfiesAcs: [0, 2], confidence: 0.85 },
      ]);
    } finally {
      process.chdir(prevCwd);
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('rejects malformed decisions JSON (Zod validation)', async () => {
    const dir = makeProject();
    writeFileSync(
      join(dir, '.xera/coverage/ac-backfill-decisions.json'),
      JSON.stringify({
        mappings: [{ scenarioId: 'PROJ-1#scenario-0', satisfiesAcs: [1.5], confidence: 0.85 }],
      }),
    );
    const prevCwd = process.cwd();
    process.chdir(dir);
    try {
      const code = await acCoverageBackfillFinalizeCmd([]);
      expect(code).not.toBe(0);
    } finally {
      process.chdir(prevCwd);
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('exit 0 + no events when mappings array is empty', async () => {
    const dir = makeProject();
    writeFileSync(
      join(dir, '.xera/coverage/ac-backfill-decisions.json'),
      JSON.stringify({ mappings: [] }),
    );
    const prevCwd = process.cwd();
    process.chdir(dir);
    try {
      const code = await acCoverageBackfillFinalizeCmd([
        '--snapshot-ts',
        '2026-05-17T10:00:00.000Z',
      ]);
      expect(code).toBe(0);
      const monthDir = join(dir, '.xera/graph/events/2026-05');
      let files: string[] = [];
      try {
        files = readdirSync(monthDir);
      } catch {
        /* not created */
      }
      expect(files.filter((f) => f.includes('-ac-coverage-')).length).toBe(0);
    } finally {
      process.chdir(prevCwd);
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
