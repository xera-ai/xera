import { describe, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fillGapPrepareCmd } from '../../src/bin-internal/fill-gap-prepare';
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
  const dir = mkdtempSync(join(tmpdir(), 'xera-fill-prep-'));
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

describe('fill-gap-prepare subcommand', () => {
  test('exports fillGapPrepareCmd returning Promise<number>', () => {
    expect(typeof fillGapPrepareCmd).toBe('function');
    const r = fillGapPrepareCmd(['--help-stub']);
    expect(r).toBeInstanceOf(Promise);
  });

  test('requires --area or --ticket', async () => {
    const code = await fillGapPrepareCmd([]);
    expect(code).toBe(1);
  });

  test('rejects both --area and --ticket together', async () => {
    const code = await fillGapPrepareCmd(['--area', 'checkout', '--ticket', 'PROJ-1']);
    expect(code).toBe(1);
  });
});

describe('fill-gap-prepare --area', () => {
  test('writes context.json with mode=area + tickets modifying area', async () => {
    const dir = makeProject();
    const events: Event[] = [
      {
        event_id: eid('20260515100000'),
        schema_version: 1,
        ts: '2026-05-15T10:00:00.000Z',
        actor: 'test',
        type: 'ticket.fetched',
        payload: {
          ticketId: 'PROJ-101',
          summary: 'Add Apple Pay',
          ac: ['User selects Apple Pay', 'Order confirms'],
          jiraLinks: [],
          storyHash: 'h',
          modifiesAreas: ['checkout'],
        },
      },
    ];
    appendEvents(dir, events, { skill: 'fetch', ticketId: 'PROJ-101' });
    const prevCwd = process.cwd();
    process.chdir(dir);
    try {
      const code = await fillGapPrepareCmd(['--area', 'checkout']);
      expect(code).toBe(0);
      const ctx = JSON.parse(
        readFileSync(join(dir, '.xera/coverage/checkout/context.json'), 'utf8'),
      );
      expect(ctx.mode).toBe('area');
      expect(ctx.area).toBe('checkout');
      expect(ctx.tickets).toHaveLength(1);
      expect(ctx.tickets[0].id).toBe('PROJ-101');
      expect(ctx.tickets[0].ac).toEqual(['User selects Apple Pay', 'Order confirms']);
    } finally {
      process.chdir(prevCwd);
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('exit 2 when area has no tickets modifying it (cannot fill)', async () => {
    const dir = makeProject();
    const prevCwd = process.cwd();
    process.chdir(dir);
    try {
      const code = await fillGapPrepareCmd(['--area', 'nonexistent']);
      expect(code).toBe(2);
    } finally {
      process.chdir(prevCwd);
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('fill-gap-prepare --ticket', () => {
  test('writes context.json with mode=ticket + unsatisfied ACs', async () => {
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
          summary: 'Add tax',
          ac: ['Subtotal', 'Tax', 'Total'],
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
          name: 'Subtotal scenario',
          gherkin: 'Given X\nThen Y',
          priority: 'p1',
          featureHash: 'h',
          generatedAt: '2026-05-12T11:00:00.000Z',
        },
      },
      {
        event_id: eid('20260512120000'),
        schema_version: 1,
        ts: '2026-05-12T12:00:00.000Z',
        actor: 'test',
        type: 'edge.discovered',
        payload: {
          kind: 'satisfies',
          from: 'PROJ-105#scenario-0',
          to: 'PROJ-105#ac-0',
          source: 'ac-coverage',
          confidence: 0.9,
        },
      },
    ];
    appendEvents(dir, events, { skill: 'fetch', ticketId: 'PROJ-105' });
    const prevCwd = process.cwd();
    process.chdir(dir);
    try {
      const code = await fillGapPrepareCmd(['--ticket', 'PROJ-105']);
      expect(code).toBe(0);
      const ctx = JSON.parse(
        readFileSync(join(dir, '.xera/coverage/PROJ-105/context.json'), 'utf8'),
      );
      expect(ctx.mode).toBe('ticket');
      expect(ctx.ticket.id).toBe('PROJ-105');
      expect(ctx.unsatisfiedAcs).toEqual([
        { index: 1, text: 'Tax' },
        { index: 2, text: 'Total' },
      ]);
      expect(ctx.existingScenarios).toHaveLength(1);
      expect(ctx.existingScenarios[0].scenarioId).toBe('PROJ-105#scenario-0');
    } finally {
      process.chdir(prevCwd);
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('exit 2 when ticket has all ACs satisfied (no work to do)', async () => {
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
          summary: 'Already covered',
          ac: ['AC 0'],
          jiraLinks: [],
          storyHash: 'h',
          modifiesAreas: [],
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
      const code = await fillGapPrepareCmd(['--ticket', 'PROJ-200']);
      expect(code).toBe(2);
    } finally {
      process.chdir(prevCwd);
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
