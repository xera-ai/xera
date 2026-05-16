# xera Troubleshooting

The 10 most common errors and how to fix them.

## 1. `Jira authentication rejected` / HTTP 401

The token in `.env` is missing, expired, or for the wrong account.

```bash
# Generate a new API token at:
https://id.atlassian.com/manage-profile/security/api-tokens
# Then edit .env:
JIRA_EMAIL=your-email@company.com
JIRA_API_TOKEN=<paste-here>
# Verify:
bunx xera doctor
```

## 2. `Atlassian MCP not connecting`

The MCP server isn't running in your Claude Code session. Either:

- Install/enable the Atlassian connector for Claude Code, or
- Fall back to REST: set `JIRA_EMAIL` + `JIRA_API_TOKEN` in `.env` and re-run.

## 3. `Playwright browser not installed`

```bash
bunx playwright install chromium
```

## 4. `Web baseUrl unreachable`

`xera doctor` will tell you which URL fails. Common causes: VPN required, staging environment down, wrong port. Update `xera.config.ts.web.baseUrl` and re-run doctor.

## 5. `tsc errors in generated spec`

The AI emitted code that doesn't type-check. The skill retries automatically up to 2 times. If it still fails:

- Edit `.xera/<TICKET>/spec.ts` manually.
- Re-run `/xera-script` to regenerate, or `/xera-exec` to run as-is.

## 6. `Gherkin parse error`

The skill retries automatically. If it still fails, open `.xera/<TICKET>/test.feature` and inspect — usually missing colon after `Scenario` or stray quotes.

## 7. `Auth setupScript failing`

The shared/auth-setup.ts couldn't log in. Most often: selectors changed in your login page. Edit it manually to match your current UI. Run `bun run xera:exec <TICKET>` to test in isolation.

## 8. `.lock file stale`

Another xera run was killed mid-run. To force-clear:

```bash
bunx xera-internal unlock <TICKET> --force
```

## 9. `Skill not found in Claude Code`

The `.claude/skills/` directory is missing or out of date.

```bash
# In your project:
bunx xera init --update
# Restart Claude Code to refresh skill discovery.
```

## 10. `XERA_AUTH_KEY mismatch — cannot decrypt`

You either regenerated the key in `.env` or deleted `.env`. The auth state cache is unreadable. Fix:

```bash
# Option A — accept the loss and refresh all auth states:
rm -rf .xera/.auth/
# Next exec will regenerate fresh state for each role.
# Option B — restore the previous key value if you have it.
```

Do not regenerate `XERA_AUTH_KEY` unless you accept losing cached auth state.

### Graph snapshot stale / out of date

If `xera doctor` warns the snapshot is stale, run:

```bash
bun run xera:graph-snapshot
```

This rebuilds `.xera/graph/snapshot.json` from `events/` in < 1s.

### Backfill from existing project (pre-v0.6)

If you upgraded an existing project to v0.6, your historical tickets are not in the graph yet:

```bash
bun run xera:graph-backfill --dry-run    # preview
bun run xera:graph-backfill              # commit events
```

Generates one `ticket.fetched` event per existing `.xera/<TICKET>/` directory.

### LLM cost surprise

Check `.xera/cost-log.jsonl` (gitignored, per-machine). `xera doctor` summarizes the past 7 days.
