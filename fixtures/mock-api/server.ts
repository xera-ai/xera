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
 * Run: `bun run fixtures/mock-api/server.ts` (or `MOCK_API_PORT=4200 bun run ...`).
 */

const TOKENS = new Map<string, 'user' | 'admin'>([
  ['Bearer test-token-001', 'user'],
  ['Bearer test-token-admin', 'admin'],
]);

const PORT = Number(process.env.MOCK_API_PORT ?? 4100);

function unauthorized(): Response {
  return Response.json({ error: 'Unauthorized' }, { status: 401 });
}

function validateEmail(email: unknown): { ok: true } | { ok: false; reason: string } {
  if (typeof email !== 'string' || email === '') return { ok: false, reason: 'email is required' };
  if (!email.includes('@')) return { ok: false, reason: 'email must be valid' };
  return { ok: true };
}

const server = Bun.serve({
  port: PORT,
  async fetch(req: Request) {
    const url = new URL(req.url);
    const auth = req.headers.get('authorization') ?? '';
    const role = TOKENS.get(auth);

    if (url.searchParams.get('simulate') === 'rate-limited') {
      return Response.json({ error: 'Too Many Requests' }, { status: 429 });
    }

    // POST /users
    if (url.pathname === '/users' && req.method === 'POST') {
      if (!role) return unauthorized();
      const body = (await req.json().catch(() => ({}))) as { name?: string; email?: string };
      const check = validateEmail(body.email);
      if (!check.ok) return Response.json({ errors: [check.reason] }, { status: 422 });
      return Response.json(
        { id: `usr-${Date.now()}`, email: body.email, name: body.name ?? null },
        { status: 201 },
      );
    }

    // GET /users/:id
    if (url.pathname.startsWith('/users/') && req.method === 'GET') {
      if (!role) return unauthorized();
      const id = url.pathname.split('/')[2];
      if (!id || id === 'missing') {
        return Response.json({ error: 'Not Found' }, { status: 404 });
      }
      return Response.json({ id, email: 'demo@example.com', name: 'Demo' }, { status: 200 });
    }

    // POST /orders (admin only)
    if (url.pathname === '/orders' && req.method === 'POST') {
      if (!role) return unauthorized();
      if (role !== 'admin') return Response.json({ error: 'Forbidden' }, { status: 403 });
      const body = (await req.json().catch(() => ({}))) as { product?: string };
      return Response.json(
        { id: `ord-${Date.now()}`, product: body.product ?? 'unknown', status: 'pending' },
        { status: 201 },
      );
    }

    return Response.json({ error: 'Not Found' }, { status: 404 });
  },
});

console.log(`[mock-api] listening on http://localhost:${server.port}`);
