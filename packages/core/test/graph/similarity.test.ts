import { describe, expect, test } from 'vitest';
import { buildSimilarityPrompt } from '../../src/graph/similarity';
import type { TicketNode } from '../../src/graph/types';

function mkTicket(id: string, summary: string, ac: string[] = []): TicketNode {
  return {
    id,
    summary,
    ac,
    storyHash: 'h',
    modifiesAreas: [],
    fetchedAt: '2026-05-16T00:00:00Z',
  };
}

describe('buildSimilarityPrompt', () => {
  test('includes target ticket id + summary + AC', () => {
    const prompt = buildSimilarityPrompt(
      mkTicket('ABC-100', 'Login page', ['User can log in']),
      [],
    );
    expect(prompt).toContain('ABC-100');
    expect(prompt).toContain('Login page');
    expect(prompt).toContain('User can log in');
  });

  test('includes candidate tickets in numbered list', () => {
    const prompt = buildSimilarityPrompt(mkTicket('ABC-100', 'Login page'), [
      mkTicket('ABC-200', 'Reset password'),
      mkTicket('ABC-201', 'Logout button'),
    ]);
    expect(prompt).toContain('ABC-200');
    expect(prompt).toContain('ABC-201');
    expect(prompt).toContain('Reset password');
  });

  test('mentions JSON output format with similar[] field', () => {
    const prompt = buildSimilarityPrompt(mkTicket('ABC-100', 'x'), []);
    expect(prompt).toContain('similar');
    expect(prompt).toMatch(/json/i);
  });

  test('mentions confidence ∈ [0, 1] threshold', () => {
    const prompt = buildSimilarityPrompt(mkTicket('ABC-100', 'x'), []);
    expect(prompt).toMatch(/confidence/i);
    expect(prompt).toMatch(/0.7|threshold/i);
  });

  test('truncates candidates to default rolling window of 100', () => {
    const candidates = Array.from({ length: 150 }, (_, i) =>
      mkTicket(`ABC-${100 + i}`, `summary ${i}`),
    );
    const prompt = buildSimilarityPrompt(mkTicket('ABC-1000', 'target'), candidates);
    // Should include first 100 candidates by ULID/fetchedAt order
    expect(prompt).toContain('ABC-100');
    expect(prompt).toContain('ABC-199');
    expect(prompt).not.toContain('ABC-200');
  });

  test('honors a caller-provided candidate limit override', () => {
    const candidates = Array.from({ length: 50 }, (_, i) =>
      mkTicket(`ABC-${100 + i}`, `summary ${i}`),
    );
    const prompt = buildSimilarityPrompt(mkTicket('ABC-1000', 'target'), candidates, 20);
    expect(prompt).toContain('ABC-100');
    expect(prompt).toContain('ABC-119');
    expect(prompt).not.toContain('ABC-120');
  });
});
