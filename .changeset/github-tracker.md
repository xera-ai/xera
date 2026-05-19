---
'@xera-ai/core': minor
'@xera-ai/cli': minor
'@xera-ai/skills': minor
---

feat: support GitHub Issues as an alternative issue tracker

Adds a tracker-agnostic `IssueProvider` abstraction so projects can use
either Jira (existing default) or GitHub Issues. The GitHub backend uses
the GitHub MCP when available and falls back to the `gh` CLI — no token
env vars are required.

Configure via `xera.config.ts`:

```ts
export default defineConfig({
  github: { repo: 'owner/repo' },  // instead of `jira: { ... }`
  // ...rest unchanged
});
```

`xera init` adds a `--tracker github` flag (and an interactive prompt) so
scaffolds can target GitHub Issues from day one. GitHub ticket keys take
the form `GH-<number>` (e.g. `/xera-fetch GH-42`).

`xera doctor` checks `gh auth status` when the github tracker is configured
and the GitHub MCP is not in use, so auth issues surface before pipeline
runs. `xera-report` posts comments via `mcp__github__add_issue_comment` or
falls back to `gh issue comment`. `xera-promote` is tracker-agnostic.

Backwards-compatible: existing Jira configs are unchanged.
