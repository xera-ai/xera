---
"@xera-ai/cli": patch
---

fix(cli): `xera init --update` now also refreshes `.claude/commands/` (Claude Code slash-command discovery) in addition to `.claude/skills/`, and registers the `xera:coverage-prepare` script so the v0.8.0+ Coverage tab in the PR graph viewer works after upgrade.
