---
'@xera-ai/cli': patch
---

cli: scaffold skills at `.claude/skills/<name>/SKILL.md` so Claude Code's Skill tool discovers them

`xera init` previously wrote skills as flat `.claude/skills/<name>.md` files.
Claude Code's slash-command discovery (`.claude/commands/<name>.md`) found
them, so `/xera-run` etc. worked — but the Skill tool only discovers skills
under `.claude/skills/<name>/SKILL.md` (directory + `SKILL.md` inside). Net
effect: when `/xera-run` told the model to invoke `/xera-fetch` mid-pipeline,
the Skill tool couldn't find it and the user had to run the steps manually.

This applied to **all 12 scaffolded skills** (xera-run, xera-fetch,
xera-feature, xera-script, xera-exec, xera-report, xera-promote, xera-impact,
xera-coverage, xera-fill-gap, xera-explore, xera-eval) — every one of them
went through the same flat-file scaffold loop.

Changes:

- `xera init` writes skills to `.claude/skills/<name>/SKILL.md` (directory
  layout the Skill tool requires) and keeps the flat `.claude/commands/<name>.md`
  for slash-command discovery — both surfaces now work.
- `xera init --update` migrates legacy flat skills in-place: if it finds the
  old `.claude/skills/<name>.md` and the new `<name>/SKILL.md` is missing, it
  moves the content into the new path (preserving any local edits) and removes
  the old file. A single overwrite prompt still applies to both targets.
- `xera doctor` flags the legacy flat layout with a clear hint pointing users
  at `xera init --update` to migrate.
- New integration test pins the scaffold layout; new doctor unit tests cover
  the pass / legacy-flat detection paths.
