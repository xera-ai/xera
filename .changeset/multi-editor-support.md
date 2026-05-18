---
'@xera-ai/cli': patch
---

cli: scaffold skills + commands for Cursor and OpenAI Codex CLI alongside Claude Code

`xera init` and `xera init --update` now accept `--editor <list>` where
`<list>` is a comma-separated subset of `claude`, `cursor`, `codex`, or
`all`. With `--yes` and no existing editor markers (`.claude/`,
`.cursor/`, `.agents/`), the default is `all` — fresh projects get
integration for every supported editor. With existing markers, only
detected editors are scaffolded (treats existing layout as the user's
choice). Interactive mode shows a multi-select with `claude` pre-checked.

`xera init --update` without `--editor` refreshes only editors already
present (does not surprise-add a new editor). To opt in to a new editor
on an existing project: `xera init --update --editor cursor`.

`xera doctor` runs per-editor checks under distinct names
(`xera skills present (claude)`, `(cursor)`, `(codex)`) so multi-editor
projects don't see false negatives.

Implementation: new `packages/cli/src/editors/` module with one adapter
per editor (`claude.ts`, `cursor.ts`, `codex.ts`) implementing a shared
`EditorAdapter` interface. Single source of truth for skill bodies stays
in `@xera-ai/skills`; Cursor's RULE.md frontmatter is transformed at
scaffold time.

Behavior change to note for users tracking local edits: `init --update`
no longer prompts per-skill on diffs (the 3-way prompt from PR #106). It
now always overwrites with the latest `@xera-ai/skills` content, after
auto-migrating any legacy flat `.claude/skills/<name>.md` layout. Commit
local edits in your consumer repo before running `--update` if you want
to preserve them.
