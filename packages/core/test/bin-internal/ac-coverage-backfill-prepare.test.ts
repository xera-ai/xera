import { describe, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { acCoverageBackfillPrepareCmd } from '../../src/bin-internal/ac-coverage-backfill-prepare';
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
  const dir = mkdtempSync(join(tmpdir(), 'xera-backfill-prep-'));
  mkdirSync(join(dir, '.xera', 'graph'), { recursive: true });
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

describe('ac-coverage-backfill-prepare subcommand', () => {
  test('exports acCoverageBackfillPrepareCmd returning Promise<number>', () => {
    expect(typeof acCoverageBackfillPrepareCmd).toBe('function');
    const r = acCoverageBackfillPrepareCmd(['--help-stub']);
    expect(r).toBeInstanceOf(Promise);
  });
});

describe('ac-coverage-backfill-prepare end-to-end', () => {
  test('writes ac-backfill-input.json with unmapped tickets', async () => {
    const dir = makeProject();
    const events: Event[] = [
      {
        event_id: eid('20260512100000'),
        schema_version: 1,
        ts: '2026-05-12T10:00:00.000Z',
        actor: 'test',
        type: 'ticket.fetched',
        payload: {
          ticketId: 'PROJ-105',
          summary: 'Add tax line item',
          ac: ['Subtotal shows', 'Tax shows', 'Total includes tax'],
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
          name: 'Checkout shows subtotal',
          gherkin: 'Given X\nWhen Y\nThen subtotal is visible',
          priority: 'p1',
          featureHash: 'h',
          generatedAt: '2026-05-12T11:00:00.000Z',
        },
      },
    ];
    appendEvents(dir, events, { skill: 'fetch', ticketId: 'PROJ-105' });

    const prevCwd = process.cwd();
    process.chdir(dir);
    try {
      const code = await acCoverageBackfillPrepareCmd([]);
      expect(code).toBe(0);
      const input = JSON.parse(
        readFileSync(join(dir, '.xera/coverage/ac-backfill-input.json'), 'utf8'),
      );
      expect(input.tickets).toHaveLength(1);
      expect(input.tickets[0].id).toBe('PROJ-105');
      expect(input.tickets[0].acs).toEqual(['Subtotal shows', 'Tax shows', 'Total includes tax']);
      expect(input.tickets[0].scenarios).toHaveLength(1);
      expect(input.tickets[0].scenarios[0].id).toBe('PROJ-105#scenario-0');
    } finally {
      process.chdir(prevCwd);
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('returns exit 0 + writes empty tickets[] when nothing needs backfill', async () => {
    const dir = makeProject();
    const prevCwd = process.cwd();
    process.chdir(dir);
    try {
      const code = await acCoverageBackfillPrepareCmd([]);
      expect(code).toBe(0);
      const input = JSON.parse(
        readFileSync(join(dir, '.xera/coverage/ac-backfill-input.json'), 'utf8'),
      );
      expect(input.tickets).toEqual([]);
    } finally {
      process.chdir(prevCwd);
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('surfaces only unmapped scenarios when a ticket is partially mapped (#119)', async () => {
    const dir = makeProject();
    const events: Event[] = [
      {
        event_id: eid('20260512100002'),
        schema_version: 1,
        ts: '2026-05-12T10:00:00.000Z',
        actor: 'test',
        type: 'ticket.fetched',
        payload: {
          ticketId: 'PROJ-300',
          summary: 'Partially mapped',
          ac: ['AC 0', 'AC 1'],
          jiraLinks: [],
          storyHash: 'h',
          modifiesAreas: [],
        },
      },
      {
        event_id: eid('20260512110002'),
        schema_version: 1,
        ts: '2026-05-12T11:00:00.000Z',
        actor: 'test',
        type: 'scenario.generated',
        payload: {
          scenarioId: 'PROJ-300#scenario-mapped',
          ticketId: 'PROJ-300',
          name: 'mapped',
          gherkin: 'g',
          priority: 'p1',
          featureHash: 'h',
          generatedAt: '2026-05-12T11:00:00.000Z',
        },
      },
      {
        event_id: eid('20260512110003'),
        schema_version: 1,
        ts: '2026-05-12T11:01:00.000Z',
        actor: 'test',
        type: 'scenario.generated',
        payload: {
          scenarioId: 'PROJ-300#scenario-new',
          ticketId: 'PROJ-300',
          name: 'new',
          gherkin: 'g',
          priority: 'p1',
          featureHash: 'h',
          generatedAt: '2026-05-12T11:01:00.000Z',
        },
      },
      {
        event_id: eid('20260512120002'),
        schema_version: 1,
        ts: '2026-05-12T12:00:00.000Z',
        actor: 'test',
        type: 'edge.discovered',
        payload: {
          kind: 'satisfies',
          from: 'PROJ-300#scenario-mapped',
          to: 'PROJ-300#ac-0',
          source: 'ac-coverage',
          confidence: 0.9,
        },
      },
    ];
    appendEvents(dir, events, { skill: 'fetch', ticketId: 'PROJ-300' });
    const prevCwd = process.cwd();
    process.chdir(dir);
    try {
      await acCoverageBackfillPrepareCmd([]);
      const input = JSON.parse(
        readFileSync(join(dir, '.xera/coverage/ac-backfill-input.json'), 'utf8'),
      );
      expect(input.tickets).toHaveLength(1);
      expect(input.tickets[0].id).toBe('PROJ-300');
      const ids = input.tickets[0].scenarios.map((s: { id: string }) => s.id);
      expect(ids).toEqual(['PROJ-300#scenario-new']);
    } finally {
      process.chdir(prevCwd);
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('excludes tickets where every scenario is already mapped via satisfies edges', async () => {
    const dir = makeProject();
    const events: Event[] = [
      {
        event_id: eid('20260512100001'),
        schema_version: 1,
        ts: '2026-05-12T10:00:00.000Z',
        actor: 'test',
        type: 'ticket.fetched',
        payload: {
          ticketId: 'PROJ-200',
          summary: 'Already mapped',
          ac: ['AC 0'],
          jiraLinks: [],
          storyHash: 'h',
          modifiesAreas: [],
        },
      },
      {
        event_id: eid('20260512110001'),
        schema_version: 1,
        ts: '2026-05-12T11:00:00.000Z',
        actor: 'test',
        type: 'scenario.generated',
        payload: {
          scenarioId: 'PROJ-200#scenario-0',
          ticketId: 'PROJ-200',
          name: 's',
          gherkin: 'g',
          priority: 'p1',
          featureHash: 'h',
          generatedAt: '2026-05-12T11:00:00.000Z',
        },
      },
      {
        event_id: eid('20260512120001'),
        schema_version: 1,
        ts: '2026-05-12T12:00:00.000Z',
        actor: 'test',
        type: 'edge.discovered',
        payload: {
          kind: 'satisfies',
          from: 'PROJ-200#scenario-0',
          to: 'PROJ-200#ac-0',
          source: 'ac-coverage',
          confidence: 0.9,
        },
      },
    ];
    appendEvents(dir, events, { skill: 'fetch', ticketId: 'PROJ-200' });
    const prevCwd = process.cwd();
    process.chdir(dir);
    try {
      await acCoverageBackfillPrepareCmd([]);
      const input = JSON.parse(
        readFileSync(join(dir, '.xera/coverage/ac-backfill-input.json'), 'utf8'),
      );
      expect(input.tickets).toEqual([]);
    } finally {
      process.chdir(prevCwd);
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
