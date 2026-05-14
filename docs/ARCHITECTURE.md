# xera Architecture (v0.1)

For the full spec see [the design doc](superpowers/specs/2026-05-14-xera-core-web-design.md). This is a shorter overview for developers contributing to xera itself.

## Layers

```
End user (QA)
  │ uses `bunx xera init` once
  │ then `/xera-*` slash commands in Claude Code
  ▼
Skills (`.claude/skills/xera-*.md`)
  │ tell the session LLM what to do
  │ session LLM calls `bun run xera:*`
  ▼
`xera-internal` binary (in @xera-ai/core)
  │ deterministic helpers only
  │ writes artifacts to .xera/<TICKET>/
  ▼
@xera-ai/web — Playwright adapter
  │ generator helpers (validate, typecheck, lint)
  │ executor + trace normalizer + secret scrubber
  ▼
Playwright + the user's app under test
```

## Key invariants

- The public CLI exposes only `init` and `doctor`. Everything else is via skills.
- Skill prompts + `xera-internal` form a closed pair: the skill knows when to call which subcommand and what to do with its output.
- Every `xera-internal` subcommand reads from disk and writes to disk. No subcommand keeps state across invocations.
- AI work happens in the QA's Claude Code session — there is no `claude` binary shell-out from `xera-internal`.
- Secret scrubbing is deterministic and runs before LLM ever sees normalized run data.

## Packages

| Package | Responsibility | Public bin |
|---|---|---|
| `@xera-ai/core` | Config, paths, hashing, lock, log, Jira client, classifier framework, auth state | `xera-internal` |
| `@xera-ai/cli` | Public CLI: `init`, `doctor` | `xera` |
| `@xera-ai/web` | Playwright adapter | — |
| `@xera-ai/skills` | Claude Code skill `.md` files | — |
| `@xera-ai/prompts` | Versioned LLM prompt templates | — |

## Extension model

To add a new test adapter (mobile, API, performance, security):

1. Create `packages/<adapter>/` implementing `TestAdapter` from `@xera-ai/core/adapter`.
2. Add the adapter id to `xera.config.ts.adapters`.
3. Write per-adapter generator helpers and a trace normalizer.
4. Reuse the classifier framework, status writer, Jira comment builder, and skills as-is.

The classifier and reporter are adapter-agnostic by design.
