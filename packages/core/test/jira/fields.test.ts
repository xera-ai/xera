import { describe, expect, test } from 'bun:test';
import { rankStoryCandidates } from '../../src/jira/fields';

describe('rankStoryCandidates', () => {
  test('ranks "description" highest by default', () => {
    const ranked = rankStoryCandidates([
      { id: 'description', name: 'description', hasContent: true },
      { id: 'summary', name: 'summary', hasContent: true },
      { id: 'customfield_10001', name: 'customfield_10001', hasContent: true },
    ]);
    expect(ranked[0]?.id).toBe('description');
  });

  test('drops empty fields', () => {
    const ranked = rankStoryCandidates([
      { id: 'description', name: 'description', hasContent: false },
      { id: 'customfield_10001', name: 'customfield_10001', hasContent: true },
    ]);
    expect(ranked.map((f) => f.id)).toEqual(['customfield_10001']);
  });
});
