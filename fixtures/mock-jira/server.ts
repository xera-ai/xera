import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const TICKETS_DIR = join(HERE, 'tickets');
const PORT = Number(process.env.MOCK_JIRA_PORT ?? 4322);

function loadTicket(key: string): unknown | null {
  const p = join(TICKETS_DIR, `${key}.json`);
  if (!existsSync(p)) return null;
  return JSON.parse(readFileSync(p, 'utf8'));
}

const comments: Array<{ key: string; body: unknown }> = [];

Bun.serve({
  port: PORT,
  fetch(req) {
    const url = new URL(req.url);

    // GET /rest/api/3/issue/<KEY>
    const issueMatch = url.pathname.match(/^\/rest\/api\/3\/issue\/([^/]+)$/);
    if (req.method === 'GET' && issueMatch) {
      const ticket = loadTicket(decodeURIComponent(issueMatch[1]!));
      return ticket
        ? new Response(JSON.stringify(ticket), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          })
        : new Response('not found', { status: 404 });
    }

    // POST /rest/api/3/issue/<KEY>/comment
    const commentMatch = url.pathname.match(/^\/rest\/api\/3\/issue\/([^/]+)\/comment$/);
    if (req.method === 'POST' && commentMatch) {
      return req.json().then((body) => {
        comments.push({ key: commentMatch[1]!, body });
        return new Response(JSON.stringify({ id: String(comments.length) }), {
          status: 201,
          headers: { 'content-type': 'application/json' },
        });
      });
    }

    // GET /__comments__ for assertions
    if (req.method === 'GET' && url.pathname === '/__comments__') {
      return new Response(JSON.stringify(comments), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }

    return new Response('not found', { status: 404 });
  },
});
console.log(`mock-jira listening on http://localhost:${PORT}`);
console.log(`available tickets: ${readdirSync(TICKETS_DIR).join(', ')}`);
