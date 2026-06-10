---
"@xera-ai/core": minor
"@xera-ai/http": minor
"@xera-ai/cli": minor
"@xera-ai/web": patch
"@xera-ai/skills": patch
"@xera-ai/prompts": patch
---

feat: auth refresh for reuse-web-session (closes #221)

Two complementary refresh mechanisms eliminate the "auth expired mid-suite" failure mode for reuse-web-session projects:

**Pre-flight refresh (automatic, always on):** `xera-internal exec` and `xera-internal stage-auth` check the http auth file at Step 0. If it's within `http.auth.refreshBuffer` of expiring AND the web auth file is still fresh, they auto-re-derive the http file from the still-valid web `storageState`. No IDP calls; just a fresh AES-encrypted file. Covers ~80% of pain (single-ticket runs under 15 minutes).

**Mid-suite refresh (opt-in):** new `reuseWebSession.refresh: { endpoint, method, csrfHeader? }` config block enables a runtime proxy on `newAuthedContext`. The proxy auto-refreshes via your configured endpoint before each request that would arrive after expiry. Updates cookies in place via `Set-Cookie` parsing, persists encrypted, re-lifts CSRF header per request. Generic IDP-agnostic — works with any endpoint that returns 2xx with a new access cookie via `Set-Cookie` (Microsoft Entra, Okta). Auth0 (body-returned tokens) falls back to pre-flight only.

Concurrent refreshes guarded by a process-local mutex. Single attempt; failure throws typed `RefreshFailedError` with response status + endpoint. Includes in-house `parseSetCookie` (RFC 6265 minimal), mock IDP fixture for integration testing.

New env vars: `XERA_REFRESH_BUFFER_MS` (default 60_000), `XERA_REFRESH_TTL_MS` (default 900_000).

Backwards-compat: projects without `refresh` config behave exactly as v0.23.
