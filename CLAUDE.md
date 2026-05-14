# CLAUDE.md

Instructions for Claude Code working in this repository.

Claude Code follows the agent instructions in [`AGENTS.md`](AGENTS.md). Read that first.

## Claude Code–specific notes

**This repo *is* the framework that hooks into Claude Code skills.** When developing here, you are working *on* the skill files in `packages/skills/*.md` and the prompts in `packages/prompts/*.md` that end users will run inside their own Claude Code sessions. Treat those as user-facing copy: don't paraphrase, don't condense, don't add commentary outside the frontmatter — match the implementation plan verbatim.

**Don't invoke `/xera-*` skills inside this repo.** They expect a consumer project layout (`.xera/<TICKET>/`, a `xera.config.ts`, etc.) — running them here will fail or do nothing useful. Test them by scaffolding into `/tmp/xera-starter` or similar via `bunx @xera-ai/cli init`.

**MCP / connectors you can use:**
- **Atlassian MCP** (`mcp__plugin_engineering_atlassian__*`) — useful for testing Jira integration without REST tokens. The `xera-fetch` skill auto-detects this.
- **GitHub MCP** if connected — handy for PR review of changes.
- Don't rely on either MCP being present in unit tests; tests must work with stubbed fetch.

**When tasks span the skills + prompts boundary**, remember:
- Skills (`packages/skills/*.md`) tell the session LLM the *workflow*: which `bun run xera:*` to call, what to read, what to write, in what order.
- Prompts (`packages/prompts/*.md`) tell the session LLM *how to do AI generation/diagnosis*: rules for Gherkin output, selector strategy, classifier decision tree, etc.
- A skill calling a prompt template reads the prompt's frontmatter + body and follows its instructions in the same session. The prompt is data the skill points at, not a separate sub-agent.

## Quick reference

| Task | Command |
|---|---|
| Run all tests | `bun test` |
| Type check one package | `cd packages/<pkg> && bun run typecheck` |
| Lint everything | `bun run lint` |
| Format everything | `bun run lint:fix` |
| Try the CLI locally | `cd /tmp && mkdir t && cd t && bunx @xera-ai/cli init --yes` |
| Verify package on npm | `curl -s https://registry.npmjs.org/@xera-ai/<pkg>/latest \| python3 -m json.tool` |
| Update spec/plan flow | See [AGENTS.md § Spec → plan → implement](AGENTS.md#spec--plan--implement) |
