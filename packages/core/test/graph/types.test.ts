import { describe, expect, test } from 'bun:test';
import type { ACNode, EdgeKind } from '../../src/graph/types';

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
