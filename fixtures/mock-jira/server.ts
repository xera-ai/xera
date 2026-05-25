import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { createServer } from 'node:http';
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

const server = createServer((req, res) => {
  const url = new URL(req.url ?? '/', `http://localhost:${PORT}`);
  const json = (status: number, body: unknown) => {
    res.statusCode = status;
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify(body));
  };

  // GET /rest/api/3/issue/<KEY>
  const issueMatch = url.pathname.match(/^\/rest\/api\/3\/issue\/([^/]+)$/);
  if (req.method === 'GET' && issueMatch) {
    const ticket = loadTicket(decodeURIComponent(issueMatch[1]!));
    if (ticket) return json(200, ticket);
    res.statusCode = 404;
    return res.end('not found');
  }

  // POST /rest/api/3/issue/<KEY>/comment
  const commentMatch = url.pathname.match(/^\/rest\/api\/3\/issue\/([^/]+)\/comment$/);
  if (req.method === 'POST' && commentMatch) {
    let data = '';
    req.on('data', (chunk) => {
      data += chunk;
    });
    req.on('end', () => {
      const body = data ? JSON.parse(data) : {};
      comments.push({ key: commentMatch[1]!, body });
      json(201, { id: String(comments.length) });
    });
    return;
  }

  // GET /__comments__ for assertions
  if (req.method === 'GET' && url.pathname === '/__comments__') {
    return json(200, comments);
  }

  res.statusCode = 404;
  res.end('not found');
});

server.listen(PORT, () => {
  console.log(`mock-jira listening on http://localhost:${PORT}`);
  console.log(`available tickets: ${readdirSync(TICKETS_DIR).join(', ')}`);
});
