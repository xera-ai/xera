import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { graphEnrichCmd } from '../../src/bin-internal/graph-enrich';
import { appendEvents, loadAllEvents } from '../../src/graph/store';
import { ulid } from '../../src/graph/ulid';

let root: string; let prevCwd: string;
beforeEach(() => { prevCwd = process.cwd(); root = mkdtempSync(join(tmpdir(), 'xera-genrich-')); process.chdir(root); });
afterEach(() => { process.chdir(prevCwd); rmSync(root, { recursive: true, force: true }); });

function seedTicket(id: string) {
  appendEvents(root, [{
    event_id: ulid(), schema_version: 1, ts: '2026-05-16T00:00:00Z', actor: 'test',
    type: 'ticket.fetched',
    payload: { ticketId: id, summary: 's', ac: [], jiraLinks: [], storyHash: 'h', modifiesAreas: [] },
  } as any], { skill: 'test', ticketId: id });
}

function writeInput(ticket: string, similar: any[]) {
  const dir = join(root, '.xera', ticket);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'enrichment-input.json'), JSON.stringify({ similar }));
}

describe('graph-enrich', () => {
  test('emits ticket.enriched after consuming enrichment-input.json', async () => {
    seedTicket('ABC-100');
    seedTicket('ABC-200');
    writeInput('ABC-100', [{ ticketId: 'ABC-200', confidence: 0.8, reason: 'r' }]);
    const exit = await graphEnrichCmd(['--ticket', 'ABC-100']);
    expect(exit).toBe(0);
    const events = loadAllEvents(root);
    expect(events.some((e) => e.type === 'ticket.enriched')).toBe(true);
  });

  test('exits 1 when --ticket missing', async () => {
    const exit = await graphEnrichCmd([]);
    expect(exit).toBe(1);
  });

  test('exits 0 + skips when ticket already enriched (no --force)', async () => {
    seedTicket('ABC-100');
    seedTicket('ABC-200');
    writeInput('ABC-100', [{ ticketId: 'ABC-200', confidence: 0.8, reason: 'r' }]);
    await graphEnrichCmd(['--ticket', 'ABC-100']);
    const before = loadAllEvents(root).length;
    const exit = await graphEnrichCmd(['--ticket', 'ABC-100']);
    expect(exit).toBe(0);
    expect(loadAllEvents(root).length).toBe(before);
  });

  test('--force re-emits even when already enriched', async () => {
    seedTicket('ABC-100');
    seedTicket('ABC-200');
    writeInput('ABC-100', [{ ticketId: 'ABC-200', confidence: 0.8, reason: 'r' }]);
    await graphEnrichCmd(['--ticket', 'ABC-100']);
    const before = loadAllEvents(root).length;
    const exit = await graphEnrichCmd(['--ticket', 'ABC-100', '--force']);
    expect(exit).toBe(0);
    expect(loadAllEvents(root).length).toBeGreaterThan(before);
  });
});
