import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { impactPrepareCmd } from '../../src/bin-internal/impact-prepare';
import { appendEvents } from '../../src/graph/store';
import type { Event } from '../../src/graph/types';
import { ulid } from '../../src/graph/ulid';

let root: string;
let prevCwd: string;

beforeEach(() => {
  prevCwd = process.cwd();
  root = mkdtempSync(join(tmpdir(), 'xera-impact-'));
  process.chdir(root);
});
afterEach(() => {
  process.chdir(prevCwd);
  rmSync(root, { recursive: true, force: true });
});

function mkE<T extends Event['type']>(
  type: T,
  payload: Extract<Event, { type: T }>['payload'],
  ts: string,
): Event {
  return { event_id: ulid(), schema_version: 1, ts, actor: 'test', type, payload } as Event;
}

function seedGraph() {
  appendEvents(
    root,
    [
      mkE(
        'ticket.fetched',
        {
          ticketId: 'ABC-100',
          summary: 'login',
          ac: [],
          jiraLinks: [],
          storyHash: 'h1',
          modifiesAreas: ['login'],
        },
        '2026-05-10T00:00:00Z',
      ),
      mkE(
        'scenario.generated',
        {
          scenarioId: 'sc-100',
          ticketId: 'ABC-100',
          name: 'user signs in',
          gherkin: 'g',
          priority: 'p0',
          featureHash: 'f1',
          generatedAt: '2026-05-10T00:00:00Z',
        },
        '2026-05-10T00:00:00Z',
      ),
      mkE(
        'pom.generated',
        {
          pomId: 'pom-login',
          ticketId: 'ABC-100',
          filePath: 'login.ts',
          route: '/login',
          locators: [],
          scope: 'shared',
        },
        '2026-05-10T00:00:00Z',
      ),
      mkE(
        'edge.discovered',
        { kind: 'uses', from: 'sc-100', to: 'pom-login', source: 't' },
        '2026-05-10T00:00:00Z',
      ),
      mkE(
        'edge.discovered',
        { kind: 'covers', from: 'pom-login', to: 'login', source: 't' },
        '2026-05-10T00:00:00Z',
      ),
      mkE(
        'ticket.fetched',
        {
          ticketId: 'ABC-200',
          summary: 'rename Sign in',
          ac: ['Button = Log in'],
          jiraLinks: [],
          storyHash: 'h2',
          modifiesAreas: ['login'],
        },
        '2026-05-15T00:00:00Z',
      ),
      mkE(
        'edge.discovered',
        { kind: 'modifies', from: 'ABC-200', to: 'login', source: 'extract-areas' },
        '2026-05-15T00:00:00Z',
      ),
    ],
    { skill: 'test', ticketId: 'ABC-100' },
  );
}

describe('impact-prepare', () => {
  test('writes both .xera/impact/<TICKET>.json and .md', async () => {
    seedGraph();
    const exit = await impactPrepareCmd(['ABC-200']);
    expect(exit).toBe(0);
    expect(existsSync(join(root, '.xera/impact/ABC-200.json'))).toBe(true);
    expect(existsSync(join(root, '.xera/impact/ABC-200.md'))).toBe(true);
    const json = JSON.parse(readFileSync(join(root, '.xera/impact/ABC-200.json'), 'utf8'));
    expect(json.targetTicket).toBe('ABC-200');
    expect(json.scenarios.length).toBe(1);
    expect(json.scenarios[0].scenarioId).toBe('sc-100');
  });

  test('--quiet skips markdown output', async () => {
    seedGraph();
    const exit = await impactPrepareCmd(['ABC-200', '--quiet']);
    expect(exit).toBe(0);
    expect(existsSync(join(root, '.xera/impact/ABC-200.json'))).toBe(true);
    expect(existsSync(join(root, '.xera/impact/ABC-200.md'))).toBe(false);
  });

  test('exits 2 when target ticket not in graph', async () => {
    seedGraph();
    const exit = await impactPrepareCmd(['NOPE-999']);
    expect(exit).toBe(2);
  });

  test('exit 0 even when impact list is empty', async () => {
    appendEvents(
      root,
      [
        mkE(
          'ticket.fetched',
          {
            ticketId: 'ABC-200',
            summary: 'new feature',
            ac: [],
            jiraLinks: [],
            storyHash: 'h2',
            modifiesAreas: ['greenfield'],
          },
          '2026-05-15T00:00:00Z',
        ),
      ],
      { skill: 'test', ticketId: 'ABC-200' },
    );
    const exit = await impactPrepareCmd(['ABC-200']);
    expect(exit).toBe(0);
    const json = JSON.parse(readFileSync(join(root, '.xera/impact/ABC-200.json'), 'utf8'));
    expect(json.scenarios).toHaveLength(0);
  });

  test('--depth 2 returns more scenarios when jira-linked exists', async () => {
    seedGraph();
    appendEvents(
      root,
      [
        mkE(
          'ticket.fetched',
          {
            ticketId: 'ABC-300',
            summary: 'unrelated',
            ac: [],
            jiraLinks: [],
            storyHash: 'h3',
            modifiesAreas: ['profile'],
          },
          '2026-05-12T00:00:00Z',
        ),
        mkE(
          'scenario.generated',
          {
            scenarioId: 'sc-300',
            ticketId: 'ABC-300',
            name: 'view profile',
            gherkin: 'g',
            priority: 'p1',
            featureHash: 'f3',
            generatedAt: '2026-05-12T00:00:00Z',
          },
          '2026-05-12T00:00:00Z',
        ),
        mkE(
          'edge.discovered',
          { kind: 'tests', from: 'ABC-300', to: 'sc-300', source: 't' },
          '2026-05-12T00:00:00Z',
        ),
        mkE(
          'edge.discovered',
          { kind: 'jira-linked', from: 'ABC-200', to: 'ABC-300', source: 'jira:relates' },
          '2026-05-15T00:00:00Z',
        ),
      ],
      { skill: 'test', ticketId: 'ABC-200' },
    );
    const exit = await impactPrepareCmd(['ABC-200', '--depth', '2']);
    expect(exit).toBe(0);
    const json = JSON.parse(readFileSync(join(root, '.xera/impact/ABC-200.json'), 'utf8'));
    const ids = json.scenarios.map((s: { scenarioId: string }) => s.scenarioId).sort();
    expect(ids).toContain('sc-100');
    expect(ids).toContain('sc-300');
  });

  test('--min-priority p0 filters out p1/p2 scenarios', async () => {
    seedGraph();
    // sc-100 is already p0 — change to p1 to test exclusion
    // Re-seed with sc-100 as p1
    rmSync(join(root, '.xera/graph'), { recursive: true, force: true });
    appendEvents(
      root,
      [
        mkE(
          'ticket.fetched',
          {
            ticketId: 'ABC-100',
            summary: 'x',
            ac: [],
            jiraLinks: [],
            storyHash: 'h',
            modifiesAreas: ['login'],
          },
          '2026-05-10T00:00:00Z',
        ),
        mkE(
          'scenario.generated',
          {
            scenarioId: 'sc-100',
            ticketId: 'ABC-100',
            name: 'n',
            gherkin: 'g',
            priority: 'p1',
            featureHash: 'f',
            generatedAt: '2026-05-10T00:00:00Z',
          },
          '2026-05-10T00:00:00Z',
        ),
        mkE(
          'pom.generated',
          {
            pomId: 'pom-l',
            ticketId: 'ABC-100',
            filePath: 'l.ts',
            route: '/login',
            locators: [],
            scope: 'shared',
          },
          '2026-05-10T00:00:00Z',
        ),
        mkE(
          'edge.discovered',
          { kind: 'uses', from: 'sc-100', to: 'pom-l', source: 't' },
          '2026-05-10T00:00:00Z',
        ),
        mkE(
          'edge.discovered',
          { kind: 'covers', from: 'pom-l', to: 'login', source: 't' },
          '2026-05-10T00:00:00Z',
        ),
        mkE(
          'ticket.fetched',
          {
            ticketId: 'ABC-200',
            summary: 'r',
            ac: [],
            jiraLinks: [],
            storyHash: 'h2',
            modifiesAreas: ['login'],
          },
          '2026-05-15T00:00:00Z',
        ),
        mkE(
          'edge.discovered',
          { kind: 'modifies', from: 'ABC-200', to: 'login', source: 't' },
          '2026-05-15T00:00:00Z',
        ),
      ],
      { skill: 'test', ticketId: 'ABC-100' },
    );
    const exit = await impactPrepareCmd(['ABC-200', '--min-priority', 'p0']);
    expect(exit).toBe(0);
    const json = JSON.parse(readFileSync(join(root, '.xera/impact/ABC-200.json'), 'utf8'));
    expect(json.scenarios).toHaveLength(0);
  });
});
