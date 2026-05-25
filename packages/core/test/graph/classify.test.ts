import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { enhanceClassification, findCandidateTickets } from '../../src/graph/classify';
import { appendEvents, deriveSnapshot, loadAllEvents } from '../../src/graph/store';
import type { Event } from '../../src/graph/types';
import { ulid } from '../../src/graph/ulid';

let root: string;
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'xera-classify-'));
});
afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

function mkEvent<T extends Event['type']>(
  type: T,
  payload: Extract<Event, { type: T }>['payload'],
  ts: string,
): Event {
  return { event_id: ulid(), schema_version: 1, ts, actor: 'test', type, payload } as Event;
}

function seedScenarioWithCandidate(opts: {
  scenarioGeneratedAt: string;
  candidateFetchedAt: string;
}) {
  appendEvents(
    root,
    [
      mkEvent(
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
      mkEvent(
        'scenario.generated',
        {
          scenarioId: 'sc-1',
          ticketId: 'ABC-100',
          name: 'user signs in',
          gherkin: 'Given...',
          priority: 'p0',
          featureHash: 'f1',
          generatedAt: opts.scenarioGeneratedAt,
        },
        opts.scenarioGeneratedAt,
      ),
      mkEvent(
        'pom.generated',
        {
          pomId: 'pom-1',
          ticketId: 'ABC-100',
          filePath: 'login.ts',
          route: '/login',
          locators: [],
          scope: 'local',
        },
        opts.scenarioGeneratedAt,
      ),
      mkEvent(
        'edge.discovered',
        { kind: 'uses', from: 'sc-1', to: 'pom-1', source: 't' },
        opts.scenarioGeneratedAt,
      ),
      mkEvent(
        'edge.discovered',
        { kind: 'covers', from: 'pom-1', to: 'login', source: 't' },
        opts.scenarioGeneratedAt,
      ),
      mkEvent(
        'ticket.fetched',
        {
          ticketId: 'ABC-200',
          summary: 'rename Sign in',
          ac: ['Button label = Log in'],
          jiraLinks: [],
          storyHash: 'h2',
          modifiesAreas: ['login'],
        },
        opts.candidateFetchedAt,
      ),
      mkEvent(
        'edge.discovered',
        { kind: 'modifies', from: 'ABC-200', to: 'login', source: 't' },
        opts.candidateFetchedAt,
      ),
    ],
    { skill: 'test', ticketId: 'ABC-100' },
  );
}

describe('findCandidateTickets', () => {
  test('returns tickets that modify the scenario area AFTER scenario was generated', () => {
    seedScenarioWithCandidate({
      scenarioGeneratedAt: '2026-05-10T00:00:00Z',
      candidateFetchedAt: '2026-05-15T00:00:00Z',
    });
    const graph = deriveSnapshot(loadAllEvents(root));
    const candidates = findCandidateTickets(graph, graph.scenarios['sc-1']!);
    expect(candidates).toHaveLength(1);
    expect(candidates[0]!.id).toBe('ABC-200');
  });

  test('does NOT return tickets fetched before scenario was generated', () => {
    seedScenarioWithCandidate({
      scenarioGeneratedAt: '2026-05-15T00:00:00Z',
      candidateFetchedAt: '2026-05-10T00:00:00Z',
    });
    const graph = deriveSnapshot(loadAllEvents(root));
    const candidates = findCandidateTickets(graph, graph.scenarios['sc-1']!);
    expect(candidates).toHaveLength(0);
  });

  test("excludes the scenario's own owner ticket", () => {
    appendEvents(
      root,
      [
        mkEvent(
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
        mkEvent(
          'scenario.generated',
          {
            scenarioId: 'sc-1',
            ticketId: 'ABC-100',
            name: 'user signs in',
            gherkin: 'g',
            priority: 'p0',
            featureHash: 'f1',
            generatedAt: '2026-05-10T00:00:00Z',
          },
          '2026-05-10T00:00:00Z',
        ),
        mkEvent(
          'pom.generated',
          {
            pomId: 'pom-1',
            ticketId: 'ABC-100',
            filePath: 'login.ts',
            route: '/login',
            locators: [],
            scope: 'local',
          },
          '2026-05-10T00:00:00Z',
        ),
        mkEvent(
          'edge.discovered',
          { kind: 'uses', from: 'sc-1', to: 'pom-1', source: 't' },
          '2026-05-10T00:00:00Z',
        ),
        mkEvent(
          'edge.discovered',
          { kind: 'covers', from: 'pom-1', to: 'login', source: 't' },
          '2026-05-10T00:00:00Z',
        ),
        mkEvent(
          'edge.discovered',
          { kind: 'modifies', from: 'ABC-100', to: 'login', source: 't' },
          '2026-05-10T00:00:00Z',
        ),
      ],
      { skill: 'test', ticketId: 'ABC-100' },
    );
    const graph = deriveSnapshot(loadAllEvents(root));
    const candidates = findCandidateTickets(graph, graph.scenarios['sc-1']!);
    expect(candidates).toHaveLength(0);
  });
});

describe('enhanceClassification', () => {
  test('returns input unchanged when classification is FLAKY', async () => {
    seedScenarioWithCandidate({
      scenarioGeneratedAt: '2026-05-10T00:00:00Z',
      candidateFetchedAt: '2026-05-15T00:00:00Z',
    });
    const graph = deriveSnapshot(loadAllEvents(root));
    const decideOutdated = async () => ({
      classification: 'TEST_OUTDATED' as const,
      confidence: 0.99,
      evidence: { reasoning: 'x' },
    });
    const out = await enhanceClassification(
      { scenarioId: 'sc-1', traceClassification: 'FLAKY' },
      graph,
      decideOutdated,
    );
    expect(out.classification).toBe('FLAKY');
  });

  test('returns input unchanged when no candidates', async () => {
    appendEvents(
      root,
      [
        mkEvent(
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
        mkEvent(
          'scenario.generated',
          {
            scenarioId: 'sc-1',
            ticketId: 'ABC-100',
            name: 'n',
            gherkin: 'g',
            priority: 'p0',
            featureHash: 'f',
            generatedAt: '2026-05-10T00:00:00Z',
          },
          '2026-05-10T00:00:00Z',
        ),
        mkEvent(
          'pom.generated',
          {
            pomId: 'pom-1',
            ticketId: 'ABC-100',
            filePath: 'p.ts',
            route: '/login',
            locators: [],
            scope: 'local',
          },
          '2026-05-10T00:00:00Z',
        ),
        mkEvent(
          'edge.discovered',
          { kind: 'uses', from: 'sc-1', to: 'pom-1', source: 't' },
          '2026-05-10T00:00:00Z',
        ),
        mkEvent(
          'edge.discovered',
          { kind: 'covers', from: 'pom-1', to: 'login', source: 't' },
          '2026-05-10T00:00:00Z',
        ),
      ],
      { skill: 'test', ticketId: 'ABC-100' },
    );
    const graph = deriveSnapshot(loadAllEvents(root));
    let llmCalled = false;
    const decideOutdated = async () => {
      llmCalled = true;
      return {
        classification: 'TEST_OUTDATED' as const,
        confidence: 0.99,
        evidence: { reasoning: 'x' },
      };
    };
    const out = await enhanceClassification(
      { scenarioId: 'sc-1', traceClassification: 'REAL_BUG' },
      graph,
      decideOutdated,
    );
    expect(out.classification).toBe('REAL_BUG');
    expect(llmCalled).toBe(false);
  });

  test('overrides to TEST_OUTDATED when LLM returns confidence ≥ 0.7', async () => {
    seedScenarioWithCandidate({
      scenarioGeneratedAt: '2026-05-10T00:00:00Z',
      candidateFetchedAt: '2026-05-15T00:00:00Z',
    });
    const graph = deriveSnapshot(loadAllEvents(root));
    const decideOutdated = async () => ({
      classification: 'TEST_OUTDATED' as const,
      confidence: 0.87,
      evidence: { reasoning: 'TICKET-200 changed AC' },
    });
    const out = await enhanceClassification(
      { scenarioId: 'sc-1', traceClassification: 'REAL_BUG' },
      graph,
      decideOutdated,
    );
    expect(out.classification).toBe('TEST_OUTDATED');
    expect(out.confidence).toBeCloseTo(0.87, 5);
    expect(out.evidence?.candidateTickets?.[0]?.ticketId).toBe('ABC-200');
  });

  test('falls through to original classification when LLM confidence < 0.7', async () => {
    seedScenarioWithCandidate({
      scenarioGeneratedAt: '2026-05-10T00:00:00Z',
      candidateFetchedAt: '2026-05-15T00:00:00Z',
    });
    const graph = deriveSnapshot(loadAllEvents(root));
    const decideOutdated = async () => ({
      classification: 'TEST_OUTDATED' as const,
      confidence: 0.5,
      evidence: { reasoning: 'unsure' },
    });
    const out = await enhanceClassification(
      { scenarioId: 'sc-1', traceClassification: 'REAL_BUG' },
      graph,
      decideOutdated,
    );
    expect(out.classification).toBe('REAL_BUG');
    expect(out.evidence?.candidateTickets?.[0]?.ticketId).toBe('ABC-200');
  });
});
