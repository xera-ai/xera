import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { graphRenderCmd } from '../../src/bin-internal/graph-render';
import { appendEvents } from '../../src/graph/store';
import { ulid } from '../../src/graph/ulid';

let root: string; let prevCwd: string;

beforeEach(() => {
  prevCwd = process.cwd();
  root = mkdtempSync(join(tmpdir(), 'xera-render-'));
  process.chdir(root);
});
afterEach(() => {
  process.chdir(prevCwd);
  rmSync(root, { recursive: true, force: true });
});

function seedSmallGraph() {
  appendEvents(root, [{
    event_id: ulid(), schema_version: 1, ts: '2026-05-16T00:00:00Z', actor: 'test',
    type: 'ticket.fetched',
    payload: { ticketId: 'ABC-1', summary: 'login', ac: [], jiraLinks: [], storyHash: 'h', modifiesAreas: ['login'] },
  } as any], { skill: 'test', ticketId: 'ABC-1' });
}

describe('graph-render', () => {
  test('writes .xera/graph.html with embedded graph data', async () => {
    seedSmallGraph();
    const exit = await graphRenderCmd([]);
    expect(exit).toBe(0);
    const htmlPath = join(root, '.xera/graph.html');
    expect(existsSync(htmlPath)).toBe(true);
    const html = readFileSync(htmlPath, 'utf8');
    expect(html).toMatch(/^<!DOCTYPE html>/);
    expect(html).toContain('ABC-1');
  });

  test('--out flag writes to custom path', async () => {
    seedSmallGraph();
    const customOut = join(root, 'custom.html');
    const exit = await graphRenderCmd(['--out', customOut]);
    expect(exit).toBe(0);
    expect(existsSync(customOut)).toBe(true);
  });

  test('--ticket filter narrows to one ticket', async () => {
    appendEvents(root, [
      { event_id: ulid(), schema_version: 1, ts: '2026-05-16T00:00:00Z', actor: 't', type: 'ticket.fetched',
        payload: { ticketId: 'ABC-1', summary: 'A', ac: [], jiraLinks: [], storyHash: 'h', modifiesAreas: [] } },
      { event_id: ulid(), schema_version: 1, ts: '2026-05-16T00:00:00Z', actor: 't', type: 'ticket.fetched',
        payload: { ticketId: 'ABC-2', summary: 'B', ac: [], jiraLinks: [], storyHash: 'h', modifiesAreas: [] } },
    ] as any, { skill: 't', ticketId: 'ABC-1' });
    const exit = await graphRenderCmd(['--ticket', 'ABC-1']);
    expect(exit).toBe(0);
    const html = readFileSync(join(root, '.xera/graph.html'), 'utf8');
    // Only ABC-1 should be in the embedded graph data; ABC-2 excluded
    const match = html.match(/window\.__GRAPH__\s*=\s*(\{[\s\S]*?\});/);
    expect(match).not.toBeNull();
    expect(match![1]!).toContain('ABC-1');
    expect(match![1]!).not.toContain('ABC-2');
  });

  test('exits 0 when graph empty (no events)', async () => {
    const exit = await graphRenderCmd([]);
    expect(exit).toBe(0);
    expect(existsSync(join(root, '.xera/graph.html'))).toBe(true);
  });
});
