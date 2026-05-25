/**
 * Deterministic HTTP target for xera v0.7 http-adapter integration tests.
 *
 * Mirrors the surface in `fixtures/mock-api/openapi.yaml`:
 *   POST /users    create user; 201 on valid email, 422 on bad
 *   GET  /users/:id  200 or 404
 *   POST /orders     admin only; 201 or 403
 *
 * Auth: bearer header. Known tokens:
 *   "Bearer test-token-001"   → role 'user'
 *   "Bearer test-token-admin" → role 'admin'
 * Anything else → 401.
 *
 * Toggles via query string:
 *   ?simulate=rate-limited  → 429 on every endpoint
 *
 * Run: `npx tsx fixtures/mock-api/server.ts` (or `MOCK_API_PORT=4200 npx tsx ...`).
 */

import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';

const TOKENS = new Map<string, 'user' | 'admin'>([
  ['Bearer test-token-001', 'user'],
  ['Bearer test-token-admin', 'admin'],
]);

const PORT = Number(process.env.MOCK_API_PORT ?? 4100);

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.statusCode = status;
  res.setHeader('content-type', 'application/json');
  res.end(JSON.stringify(body));
}

function readJson(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve) => {
    let data = '';
    req.on('data', (chunk) => {
      data += chunk;
    });
    req.on('end', () => {
      try {
        resolve(data ? JSON.parse(data) : {});
      } catch {
        resolve({});
      }
    });
    req.on('error', () => resolve({}));
  });
}

function validateEmail(email: unknown): { ok: true } | { ok: false; reason: string } {
  if (typeof email !== 'string' || email === '') return { ok: false, reason: 'email is required' };
  if (!email.includes('@')) return { ok: false, reason: 'email must be valid' };
  return { ok: true };
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', `http://localhost:${PORT}`);
  const auth = (req.headers.authorization as string | undefined) ?? '';
  const role = TOKENS.get(auth);

  if (url.searchParams.get('simulate') === 'rate-limited') {
    return sendJson(res, 429, { error: 'Too Many Requests' });
  }

  // POST /users
  if (url.pathname === '/users' && req.method === 'POST') {
    if (!role) return sendJson(res, 401, { error: 'Unauthorized' });
    const body = (await readJson(req)) as { name?: string; email?: string };
    const check = validateEmail(body.email);
    if (!check.ok) return sendJson(res, 422, { errors: [check.reason] });
    return sendJson(res, 201, {
      id: `usr-${Date.now()}`,
      email: body.email,
      name: body.name ?? null,
    });
  }

  // GET /users/:id
  if (url.pathname.startsWith('/users/') && req.method === 'GET') {
    if (!role) return sendJson(res, 401, { error: 'Unauthorized' });
    const id = url.pathname.split('/')[2];
    if (!id || id === 'missing') return sendJson(res, 404, { error: 'Not Found' });
    return sendJson(res, 200, { id, email: 'demo@example.com', name: 'Demo' });
  }

  // POST /orders (admin only)
  if (url.pathname === '/orders' && req.method === 'POST') {
    if (!role) return sendJson(res, 401, { error: 'Unauthorized' });
    if (role !== 'admin') return sendJson(res, 403, { error: 'Forbidden' });
    const body = (await readJson(req)) as { product?: string };
    return sendJson(res, 201, {
      id: `ord-${Date.now()}`,
      product: body.product ?? 'unknown',
      status: 'pending',
    });
  }

  return sendJson(res, 404, { error: 'Not Found' });
});

server.listen(PORT, () => {
  console.log(`[mock-api] listening on http://localhost:${PORT}`);
});
