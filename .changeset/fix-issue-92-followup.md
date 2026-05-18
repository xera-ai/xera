---
'@xera-ai/core': patch
---

core: actually force `.env` to win over `.env.local` (followup to #103)

PR #103 added a warning when `.env.local` exists but didn't actually
override Bun's auto-load behavior. Bun pre-loads `.env.local` *before*
the `xera-internal` script runs, and dotenv's default `override: false`
meant the `config()` call couldn't replace those values — so the warning
was technically misleading and the silent-override bug from issue #92
was still present.

The bin entry point now also reads `.env.local` and `.env` directly:
for any key present in both files, it forces the `.env` value into
`process.env`, overwriting whatever Bun pre-loaded. Only keys that
actually appear in `.env.local` are touched, so shell-injected and
CI-injected env vars remain untouched.

A subprocess-based regression test exercises the real Bun pre-load +
loader interaction so future drift surfaces immediately.
