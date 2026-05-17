import { describe, expect, test } from 'bun:test';
import type {
  ACNode,
  AcCoverageBackfilledPayload,
  CoverageSnapshotPayload,
  EdgeKind,
  Event,
  ScenarioGeneratedPayload,
  Snapshot,
} from '../../src/graph/types';

describe('EdgeKind union', () => {
  test('includes "satisfies"', () => {
    const kinds: EdgeKind[] = [
      'tests',
      'uses',
      'covers',
      'modifies',
      'jira-linked',
      'similar',
      'ran',
      'satisfies',
    ];
    expect(kinds).toContain('satisfies');
  });
});

describe('ACNode', () => {
  test('shape: id = `${ticketId}#ac-${index}`, includes text + index', () => {
    const node: ACNode = {
      id: 'PROJ-105#ac-2',
      ticketId: 'PROJ-105',
      index: 2,
      text: 'Tax line item shows in cart preview',
    };
    expect(node.id).toBe(`${node.ticketId}#ac-${node.index}`);
    expect(node.index).toBe(2);
  });
});

describe('ScenarioGeneratedPayload', () => {
  test('accepts optional satisfiesAcs: number[]', () => {
    const withMapping: ScenarioGeneratedPayload = {
      scenarioId: 'PROJ-105#scenario-0',
      ticketId: 'PROJ-105',
      name: 'Checkout shows tax',
      gherkin: 'Given ...',
      priority: 'p1',
      featureHash: 'abc',
      generatedAt: '2026-05-17T10:00:00.000Z',
      satisfiesAcs: [0, 3],
    };
    expect(withMapping.satisfiesAcs).toEqual([0, 3]);

    const withoutMapping: ScenarioGeneratedPayload = {
      scenarioId: 'PROJ-101#scenario-0',
      ticketId: 'PROJ-101',
      name: 'Legacy scenario',
      gherkin: '...',
      priority: 'p2',
      featureHash: 'xyz',
      generatedAt: '2026-05-17T10:00:00.000Z',
    };
    expect(withoutMapping.satisfiesAcs).toBeUndefined();
  });
});
