import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { reportCmd } from '../../src/bin-internal/report';
import { appendEvents } from '../../src/graph/store';
import type { Event } from '../../src/graph/types';
import { ulid } from '../../src/graph/ulid';

let root: string;
let prevCwd: string;
beforeEach(() => {
  prevCwd = process.cwd();
  root = mkdtempSync(join(tmpdir(), 'xera-rep-'));
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

function seedGraph(ticket: string, opts: { hasCandidate: boolean }) {
  const events: Event[] = [
    mkE(
      'ticket.fetched',
      {
        ticketId: ticket,
        summary: 'login',
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
        scenarioId: 'sc-1',
        ticketId: ticket,
        name: 'user signs in',
        gherkin: 'g',
        priority: 'p0',
        featureHash: 'f',
        generatedAt: '2026-05-10T00:00:00Z',
      },
      '2026-05-10T00:00:00Z',
    ),
    mkE(
      'pom.generated',
      {
        pomId: 'pom-1',
        ticketId: ticket,
        filePath: 'p.ts',
        route: '/login',
        locators: [],
        scope: 'local',
      },
      '2026-05-10T00:00:00Z',
    ),
    mkE(
      'edge.discovered',
      { kind: 'uses', from: 'sc-1', to: 'pom-1', source: 't' },
      '2026-05-10T00:00:00Z',
    ),
    mkE(
      'edge.discovered',
      { kind: 'covers', from: 'pom-1', to: 'login', source: 't' },
      '2026-05-10T00:00:00Z',
    ),
  ];
  if (opts.hasCandidate) {
    events.push(
      mkE(
        'ticket.fetched',
        {
          ticketId: 'ABC-200',
          summary: 'rename',
          ac: ['Button = Log in'],
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
    );
  }
  appendEvents(root, events, { skill: 'test', ticketId: ticket });
}

function writeReportInput(ticket: string, runId: string) {
  const runDir = join(root, '.xera', ticket, 'runs', runId);
  mkdirSync(runDir, { recursive: true });
  const input = {
    runId,
    scenarioCounts: { total: 1, passed: 0, failed: 1, skipped: 0 },
    scenarios: [
      {
        name: 'user signs in',
        outcome: 'FAIL',
        class: 'REAL_BUG',
        confidence: 'medium',
        rationale: 'expected Sign in button missing',
      },
    ],
  };
  const inputPath = join(runDir, 'classifier-output.json');
  writeFileSync(inputPath, JSON.stringify(input));
  return inputPath;
}

function writeOutdatedDecisions(ticket: string, runId: string, decisions: unknown) {
  const runDir = join(root, '.xera', ticket, 'runs', runId);
  writeFileSync(join(runDir, 'outdated-decisions.json'), JSON.stringify(decisions));
}

describe('reportCmd with TEST_OUTDATED enhancement', () => {
  test('preserves REAL_BUG when no graph candidates', async () => {
    seedGraph('ABC-100', { hasCandidate: false });
    const inputPath = writeReportInput('ABC-100', 'r1');
    const exit = await reportCmd(['ABC-100', `--input=${inputPath}`]);
    expect(exit).toBe(0);
    const status = JSON.parse(readFileSync(join(root, '.xera/ABC-100/status.json'), 'utf8'));
    expect(status.classification).toBe('REAL_BUG');
  });

  test('overrides REAL_BUG → TEST_OUTDATED when candidate exists + decisions file confirms', async () => {
    seedGraph('ABC-100', { hasCandidate: true });
    const inputPath = writeReportInput('ABC-100', 'r2');
    writeOutdatedDecisions('ABC-100', 'r2', {
      'sc-1': {
        classification: 'TEST_OUTDATED',
        confidence: 0.87,
        evidence: { reasoning: 'TICKET-200 changed AC' },
      },
    });
    const exit = await reportCmd(['ABC-100', `--input=${inputPath}`]);
    expect(exit).toBe(0);
    const status = JSON.parse(readFileSync(join(root, '.xera/ABC-100/status.json'), 'utf8'));
    expect(status.classification).toBe('TEST_OUTDATED');
  });

  test('preserves REAL_BUG when candidate exists but decisions file says BUG', async () => {
    seedGraph('ABC-100', { hasCandidate: true });
    const inputPath = writeReportInput('ABC-100', 'r3');
    writeOutdatedDecisions('ABC-100', 'r3', {
      'sc-1': { classification: 'BUG', confidence: 0.6, evidence: { reasoning: 'unrelated' } },
    });
    const exit = await reportCmd(['ABC-100', `--input=${inputPath}`]);
    expect(exit).toBe(0);
    const status = JSON.parse(readFileSync(join(root, '.xera/ABC-100/status.json'), 'utf8'));
    expect(status.classification).toBe('REAL_BUG');
  });
});
