import { cpSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { graphBackfillCmd } from '../../src/bin-internal/graph-backfill';
import { deriveSnapshot, isSnapshotStale, loadAllEvents } from '../../src/graph/store';

const FIXTURES = join(__dirname, '../../../../fixtures/golden-graph');

describe('golden-graph snapshot fixtures', () => {
  for (const name of ['corrupt-event-file', 'dedup-by-ulid', 'concurrent-fetch']) {
    test(name, () => {
      const tmp = mkdtempSync(join(tmpdir(), `xera-gold-${name}-`));
      try {
        cpSync(join(FIXTURES, name), tmp, { recursive: true });
        const events = loadAllEvents(tmp);
        const snap = deriveSnapshot(events);
        const expected = JSON.parse(readFileSync(join(tmp, 'expected/snapshot.json'), 'utf8'));
        expect(snap.tickets).toEqual(expected.tickets);
        expect(snap.scenarios).toEqual(expected.scenarios);
      } finally {
        rmSync(tmp, { recursive: true, force: true });
      }
    });
  }
});

describe('golden-graph stale-snapshot', () => {
  test('isSnapshotStale returns true when committed snapshot does not match events', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'xera-gold-stale-'));
    try {
      cpSync(join(FIXTURES, 'stale-snapshot'), tmp, { recursive: true });
      expect(isSnapshotStale(tmp)).toBe(true);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });
});

describe('golden-graph backfill-pre-v06', () => {
  let prevCwd: string;
  beforeEach(() => {
    prevCwd = process.cwd();
  });
  afterEach(() => {
    process.chdir(prevCwd);
  });

  test('graph-backfill synthesizes events from pre-v0.6 artifacts', async () => {
    const tmp = mkdtempSync(join(tmpdir(), 'xera-gold-backfill-'));
    try {
      cpSync(join(FIXTURES, 'backfill-pre-v06'), tmp, { recursive: true });
      process.chdir(tmp);
      const exit = await graphBackfillCmd([]);
      expect(exit).toBe(0);
      const events = loadAllEvents(tmp);
      const types = events.map((e) => e.type);
      expect(types).toContain('ticket.fetched');
      expect(types).toContain('scenario.generated');
      expect(types).toContain('pom.generated');
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });
});
