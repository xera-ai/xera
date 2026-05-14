import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';
import { createRestBackend } from '../../src/jira/rest-backend';

const originalFetch = globalThis.fetch;

describe('rest-backend', () => {
  beforeEach(() => {
    globalThis.fetch = mock(async (url: string | URL, init?: RequestInit) => {
      const u = url.toString();
      if (u.includes('/rest/api/3/issue/JIRA-1?')) {
        return new Response(
          JSON.stringify({
            key: 'JIRA-1',
            fields: {
              summary: 'A summary',
              description: 'A story',
              customfield_10001: 'An AC',
              attachment: [{ filename: 'a.png', content: 'https://x.com/a.png' }],
            },
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      }
      if (u.endsWith('/comment') && init?.method === 'POST') {
        return new Response(JSON.stringify({ id: '42' }), { status: 201 });
      }
      return new Response('not found', { status: 404 });
    }) as unknown as typeof fetch;
  });
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  test('fetchTicket maps fields per JiraFieldMap', async () => {
    const c = createRestBackend('https://x.atlassian.net', { email: 'a@b.com', apiToken: 't' });
    const t = await c.fetchTicket('JIRA-1', {
      story: 'description',
      acceptanceCriteria: 'customfield_10001',
    });
    expect(t.key).toBe('JIRA-1');
    expect(t.summary).toBe('A summary');
    expect(t.story).toBe('A story');
    expect(t.acceptanceCriteria).toBe('An AC');
    expect(t.attachments).toHaveLength(1);
  });

  test('postComment returns comment id', async () => {
    const c = createRestBackend('https://x.atlassian.net', { email: 'a@b.com', apiToken: 't' });
    const r = await c.postComment('JIRA-1', 'hello');
    expect(r.id).toBe('42');
  });
});
