import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { enrichTicket } from '../../src/graph/enrich';
import { appendEvents, loadAllEvents } from '../../src/graph/store';
import { ulid } from '../../src/graph/ulid';

let root: string;
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'xera-enrich-'));
});
afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

function seedTicket(ticketId: string) {
  appendEvents(
    root,
    [
      {
        event_id: ulid(),
        schema_version: 1,
        ts: '2026-05-16T00:00:00Z',
        actor: 'test',
        type: 'ticket.fetched',
        payload: {
          ticketId,
          summary: 's',
          ac: [],
          jiraLinks: [],
          storyHash: 'h',
          modifiesAreas: [],
        },
      } as any,
    ],
    { skill: 'test', ticketId },
  );
}

function writeEnrichmentInput(
  ticketId: string,
  similar: Array<{ ticketId: string; confidence: number; reason: string }>,
) {
  const dir = join(root, '.xera', ticketId);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'enrichment-input.json'), JSON.stringify({ similar }));
}

describe('enrichTicket', () => {
  test('emits ticket.enriched + edge.discovered:similar events', async () => {
    seedTicket('ABC-100');
    seedTicket('ABC-200');
    writeEnrichmentInput('ABC-100', [
      { ticketId: 'ABC-200', confidence: 0.85, reason: 'same area' },
    ]);

    const result = await enrichTicket(root, 'ABC-100', {});
    expect(result.similarCount).toBe(1);

    const events = loadAllEvents(root);
    const types = events.map((e) => e.type);
    expect(types).toContain('ticket.enriched');
    expect(types.filter((t) => t === 'edge.discovered')).toHaveLength(1);
  });

  test('drops candidates with confidence below 0.7', async () => {
    seedTicket('ABC-100');
    seedTicket('ABC-200');
    seedTicket('ABC-300');
    writeEnrichmentInput('ABC-100', [
      { ticketId: 'ABC-200', confidence: 0.85, reason: 'high' },
      { ticketId: 'ABC-300', confidence: 0.4, reason: 'low' },
    ]);
    const result = await enrichTicket(root, 'ABC-100', {});
    expect(result.similarCount).toBe(1);
  });

  test('drops candidates that do not exist in graph', async () => {
    seedTicket('ABC-100');
    writeEnrichmentInput('ABC-100', [{ ticketId: 'NOPE-999', confidence: 0.9, reason: 'fake' }]);
    const result = await enrichTicket(root, 'ABC-100', {});
    expect(result.similarCount).toBe(0);
  });

  test('clamps confidence > 1 to 1', async () => {
    seedTicket('ABC-100');
    seedTicket('ABC-200');
    writeEnrichmentInput('ABC-100', [{ ticketId: 'ABC-200', confidence: 1.5, reason: 'oob' }]);
    const result = await enrichTicket(root, 'ABC-100', {});
    expect(result.similarCount).toBe(1);
  });

  test('caps similar edges at 10 even if input has more', async () => {
    seedTicket('ABC-100');
    for (let i = 0; i < 15; i++) seedTicket(`ABC-${200 + i}`);
    writeEnrichmentInput(
      'ABC-100',
      Array.from({ length: 15 }, (_, i) => ({
        ticketId: `ABC-${200 + i}`,
        confidence: 0.8,
        reason: 'r',
      })),
    );
    const result = await enrichTicket(root, 'ABC-100', {});
    expect(result.similarCount).toBe(10);
  });

  test('throws if enrichment-input.json missing', async () => {
    seedTicket('ABC-100');
    await expect(enrichTicket(root, 'ABC-100', {})).rejects.toThrow(/enrichment-input.json/);
  });

  test('throws actionable error when ticket not in graph (before file check)', async () => {
    // No seedTicket call — the candidate is not in the graph at all.
    // The error should point at /xera-fetch, not at the missing file.
    await expect(enrichTicket(root, 'ABC-999', {})).rejects.toThrow(
      /not in graph.*\/xera-fetch ABC-999/,
    );
  });

  test('removes enrichment-input.json after a successful enrich', async () => {
    seedTicket('ABC-100');
    seedTicket('ABC-200');
    writeEnrichmentInput('ABC-100', [
      { ticketId: 'ABC-200', confidence: 0.85, reason: 'cleanup test' },
    ]);
    const inputPath = join(root, '.xera', 'ABC-100', 'enrichment-input.json');
    expect(existsSync(inputPath)).toBe(true);
    await enrichTicket(root, 'ABC-100', {});
    expect(existsSync(inputPath)).toBe(false);
  });
});
