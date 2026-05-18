---
'@xera-ai/core': patch
'@xera-ai/http': patch
---

core,http: stop loading `.env.local` and fix stale error message (closes #92)

The init/doctor side of #92 was already fixed in #95/#100 — but the runtime
still preserved the silent-override trap the bug reporter described:

- `packages/core/bin/internal.ts` loaded `.env.local` *before* `.env`. With
  dotenv's default `override: false`, that meant `.env.local` always won —
  so a stale empty value in `.env.local` silently masked the real value in
  `.env` (~30-minute debug session in the report).
- `packages/http/src/auth-setup/preset.ts` raised
  `Auth env var '...' is not set. Add it to .env.local.`, contradicting
  `xera init` / `xera doctor` / `.gitignore` (all canonicalized on `.env`).

Now:

- `xera-internal` loads `.env` only. If `.env.local` exists, it prints a
  loud warning telling the user to merge values into `.env` and delete
  `.env.local`. Legacy users get a clear migration prompt instead of a
  silent break or a silent override.
- The HTTP auth error message points at `.env`.
- A regression test pins the canonical filename in the error so future
  drift is caught.
