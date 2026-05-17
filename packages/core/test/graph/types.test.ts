import { describe, test, expect } from 'bun:test';
import type { EdgeKind } from '../../src/graph/types';

describe('EdgeKind union', () => {
  test('includes "satisfies"', () => {
    const kinds: EdgeKind[] = ['tests', 'uses', 'covers', 'modifies', 'jira-linked', 'similar', 'ran', 'satisfies'];
    expect(kinds).toContain('satisfies');
  });
});
