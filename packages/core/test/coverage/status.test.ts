import { describe, expect, test } from 'bun:test';
import { computeScenarioStatus } from '../../src/coverage/status';
import type { Snapshot } from '../../src/graph/types';

function emptySnap(): Snapshot {
  return {
    schema_version: 1,
    generated_at: '2026-05-17T10:00:00.000Z',
    event_count: 0,
    events_hash: 'sha256:',
    tickets: {},
    scenarios: {},
    poms: {},
    areas: {},
    edges: [],
    latest_failures: {},
    acNodes: {},
    classifications: [],
  };
}

describe('computeScenarioStatus', () => {
  const now = new Date('2026-05-17T10:00:00.000Z');

  test('NOT_PASSING when no classifications', () => {
    expect(computeScenarioStatus('PROJ-1#scenario-0', emptySnap(), 30, now)).toBe('NOT_PASSING');
  });

  test('PASSING when latest classification is PASS within window', () => {
    const snap = emptySnap();
    snap.classifications.push({
      scenarioId: 'PROJ-1#scenario-0',
      classification: 'PASS',
      ts: '2026-05-15T10:00:00.000Z',
    });
    expect(computeScenarioStatus('PROJ-1#scenario-0', snap, 30, now)).toBe('PASSING');
  });

  test('NOT_PASSING when latest PASS is older than windowDays', () => {
    const snap = emptySnap();
    snap.classifications.push({
      scenarioId: 'PROJ-1#scenario-0',
      classification: 'PASS',
      ts: '2026-03-01T10:00:00.000Z',
    });
    expect(computeScenarioStatus('PROJ-1#scenario-0', snap, 30, now)).toBe('NOT_PASSING');
  });

  test('NOT_PASSING when latest classification is REAL_BUG (most recent wins)', () => {
    const snap = emptySnap();
    snap.classifications.push(
      { scenarioId: 'PROJ-1#scenario-0', classification: 'PASS', ts: '2026-05-10T10:00:00.000Z' },
      {
        scenarioId: 'PROJ-1#scenario-0',
        classification: 'REAL_BUG',
        ts: '2026-05-15T10:00:00.000Z',
      },
    );
    expect(computeScenarioStatus('PROJ-1#scenario-0', snap, 30, now)).toBe('NOT_PASSING');
  });
});
