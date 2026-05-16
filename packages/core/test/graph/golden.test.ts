import { describe, expect, test } from 'bun:test';
import { cpSync, existsSync, mkdtempSync, rmSync } from 'node:fs';
import { readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { deriveSnapshot, loadAllEvents } from '../../src/graph/store';

const FIXTURES = join(__dirname, '../../../../fixtures/golden-graph');

describe('golden-graph fixtures', () => {
  for (const name of ['corrupt-event-file', 'dedup-by-ulid', 'concurrent-fetch']) {
    test(name, () => {
      const tmp = mkdtempSync(join(tmpdir(), `xera-gold-${name}-`));
      try {
        cpSync(join(FIXTURES, name), tmp, { recursive: true });
        const events = loadAllEvents(tmp);
        const snap = deriveSnapshot(events);
        const expected = JSON.parse(readFileSync(join(tmp, 'expected/snapshot.json'), 'utf8'));
        // Compare deterministic subset (ignore generated_at, events_hash sensitivity)
        expect(snap.tickets).toEqual(expected.tickets);
        expect(snap.scenarios).toEqual(expected.scenarios);
      } finally {
        rmSync(tmp, { recursive: true, force: true });
      }
    });
  }
});
