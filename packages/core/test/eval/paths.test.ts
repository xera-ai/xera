import { describe, expect, test } from 'bun:test';
import { resolveEvalPaths } from '../../src/eval/paths';

describe('resolveEvalPaths', () => {
  test('returns all paths anchored at <cwd>/.xera/eval/<run-id>', () => {
    const p = resolveEvalPaths('/repo', '20260520-103045-a1b2c3d');
    expect(p.root).toBe('/repo/.xera/eval/20260520-103045-a1b2c3d');
    expect(p.manifest).toBe('/repo/.xera/eval/20260520-103045-a1b2c3d/manifest.json');
    expect(p.lock).toBe('/repo/.xera/eval/20260520-103045-a1b2c3d/.lock');
    expect(p.deterministicScores).toBe(
      '/repo/.xera/eval/20260520-103045-a1b2c3d/deterministic-scores.json',
    );
    expect(p.judgeScores).toBe('/repo/.xera/eval/20260520-103045-a1b2c3d/judge-scores.json');
    expect(p.report).toBe('/repo/.xera/eval/20260520-103045-a1b2c3d/report.md');
    expect(p.summary).toBe('/repo/.xera/eval/20260520-103045-a1b2c3d/summary.json');
    expect(p.inputsDir).toBe('/repo/.xera/eval/20260520-103045-a1b2c3d/inputs');
    expect(p.actualDir).toBe('/repo/.xera/eval/20260520-103045-a1b2c3d/actual');
  });

  test('ticket-scoped paths', () => {
    const p = resolveEvalPaths('/repo', 'rid');
    expect(p.ticketInputsDir('EVAL-001')).toBe('/repo/.xera/eval/rid/inputs/EVAL-001');
    expect(p.ticketActualDir('EVAL-001')).toBe('/repo/.xera/eval/rid/actual/EVAL-001');
  });
});
