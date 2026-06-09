# auth-refresh fixtures

Test-only assets that exercise the v0.24 refresh runtime (Phase B) end-to-end.

## `mock-idp.ts`

A minimal node:http server that pretends to be an Identity Provider.

- `POST /auth/refresh` — increments an internal counter and returns two
  rotating `Set-Cookie` headers (`session_at=NEW_AT_<n>`, `xs_csrf=NEW_CSRF_<n>`).
- `GET /me` — returns 200 only when the request carries the most recent
  `session_at` value; otherwise 401. This makes it trivial to assert "the
  refresh actually rotated cookies and the next request used the new value."

The fixture binds to `127.0.0.1` on an OS-assigned port so concurrent test
processes don't clash. `Domain=127.0.0.1` on the issued cookies is intentional —
Playwright's `APIRequestContext` handles IP-host cookies as long as the
storageState cookie domain matches the request host.

Consumers:
- `packages/http/test/integration/refresh-mock-idp.test.ts`

## Why not a `xera.config.ts`?

The plan listed a config fixture under Task 12 for symmetry with other
adapters, but the integration test wires `attachRefreshProxy` directly with a
hand-built payload. A real consumer-shaped config isn't needed to exercise
the runtime; if a future test wants one, add it alongside `mock-idp.ts`.
