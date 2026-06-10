import { createServer, type Server } from 'node:http';

export interface MockIdp {
  url: string;
  refreshCount: () => number;
  close: () => Promise<void>;
}

/**
 * Minimal mock IDP for refresh integration tests. Exposes:
 *   - POST /auth/refresh — increments counter, returns rotating Set-Cookie
 *     (session_at=NEW_AT_<n>, xs_csrf=NEW_CSRF_<n>).
 *   - GET  /me          — returns 200 only when the request carries the
 *     latest session_at; otherwise 401 (so a stale cookie surfaces clearly).
 *
 * `Domain=127.0.0.1` is intentional — Playwright's APIRequestContext stores
 * IP-host cookies fine as long as the storageState cookie domain matches the
 * request host. Tests verify cookie propagation end-to-end through Playwright.
 */
export function startMockIdp(port: number = 0): Promise<MockIdp> {
  let counter = 0;
  let lastAccess = 'INITIAL';
  const server: Server = createServer((req, res) => {
    if (req.url === '/auth/refresh' && req.method === 'POST') {
      counter++;
      lastAccess = `NEW_AT_${counter}`;
      const maxAge = 60;
      res.setHeader('Set-Cookie', [
        `session_at=${lastAccess}; Domain=127.0.0.1; Path=/; Max-Age=${maxAge}; HttpOnly`,
        `xs_csrf=NEW_CSRF_${counter}; Domain=127.0.0.1; Path=/`,
      ]);
      res.statusCode = 200;
      res.end('{}');
      return;
    }
    if (req.url === '/me' && req.method === 'GET') {
      const cookieHeader = req.headers.cookie || '';
      if (!cookieHeader.includes(`session_at=${lastAccess}`)) {
        res.statusCode = 401;
        res.end(JSON.stringify({ error: 'stale token', expected: lastAccess }));
        return;
      }
      res.statusCode = 200;
      res.end(JSON.stringify({ counter }));
      return;
    }
    res.statusCode = 404;
    res.end();
  });
  return new Promise((resolve) => {
    server.listen(port, '127.0.0.1', () => {
      const addr = server.address() as { port: number };
      resolve({
        url: `http://127.0.0.1:${addr.port}`,
        refreshCount: () => counter,
        close: () => new Promise<void>((r) => server.close(() => r())),
      });
    });
  });
}
