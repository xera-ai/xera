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
npx xera doctor
```

## 2. `Atlassian MCP not connecting`

The MCP server isn't running in your Claude Code session. Either:

- Install/enable the Atlassian connector for Claude Code, or
- Fall back to REST: set `JIRA_EMAIL` + `JIRA_API_TOKEN` in `.env` and re-run.

## 2b. GitHub tracker: `gh issue view … failed` / `not authenticated`

This project is configured with `github: { repo: 'owner/repo' }` and the `gh` CLI is the fallback when the GitHub MCP isn't connected. Run `gh auth status` to confirm authentication, then `gh auth login` if needed. Alternatively, connect the GitHub MCP server in your editor session and set `XERA_MCP_GITHUB=1` for the subprocess that runs `xera-internal fetch`. `xera doctor` validates both paths.

## 3. `Playwright browser not installed`

```bash
npx playwright install chromium
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

The shared/auth-setup.ts couldn't log in. Most often: selectors changed in your login page. Edit it manually to match your current UI. Run `npx xera-internal exec <TICKET>` to test in isolation.

## 8. `.lock file stale`

Another xera run was killed mid-run. To force-clear:

```bash
npx xera-internal unlock <TICKET> --force
```

## 9. `Skill not found in Claude Code`

The `.claude/skills/` directory is missing or out of date.

```bash
# In your project:
npx xera init --update
# Restart Claude Code to refresh skill discovery.
```

### Skill not discovered in Cursor / Codex

If `/xera-run` works in Claude Code but Cursor's slash menu doesn't list xera commands (or Codex's agent doesn't pick up the xera-run skill), the project was scaffolded before multi-editor support. Run:

```bash
xera init --update --editor cursor   # or --editor codex, or --editor all
```

`xera doctor` flags this case with `xera skills present (cursor): missing`.

## 10. `Auth file not found for role 'X'` (v0.7+ http adapter)

The runtime helper `newAuthedContext` couldn't find `.xera/.auth/http/<role>.json`. Run pre-authentication:

```bash
npx xera-internal auth-setup --role X
```

Or `npx xera-internal auth-setup` to set up every role at once.

## 11. `Auth file expired for role 'X'` (v0.7+ http adapter)

Token aged past `http.auth.ttl`. xera does NOT auto-refresh at run time (avoids surprise side effects). Re-run:

```bash
npx xera-internal auth-setup --role X
```

## 12. `CONTRACT_DRIFT detected` (v0.7+)

The captured response doesn't match the OpenAPI schema for that endpoint. Two common causes:

- **Backend changed legitimately** — update `openapi.yaml` (and re-generate test assertions) to match.
- **Bug in backend** — the spec is correct; the server diverged. File a bug.

The classifier is deterministic — it diffs your `http.spec` against the captured `respBody`. If you're confident the spec is stale, ignore the bucket and regenerate via `/xera-script <TICKET>`. v0.9 will add auto-PR healing.

## 13. `OpenAPI spec not configured` warning

Soft warning when `http.spec` is unset. CONTRACT_DRIFT detection and schema-derived edge cases are disabled, but xera still generates tests from the Jira story alone. To enable richer http coverage:

- Ask backend dev to export an OpenAPI spec (Spring/FastAPI/NestJS auto-generate them).
- Point `http.spec` at the path or URL in `xera.config.ts`.

## 13b. `/xera-feature --from-spec` produced no scenarios (v0.18+)

`feature-spec-prepare` wrote an empty `spec-input.json` (its `operations` array is empty) and the skill stopped. Check the `reason` field in `.xera/<KEY>/spec-input.json`:

- **`no OpenAPI spec configured`** — set `http.spec` in `xera.config.ts`, or pass `--spec <path-or-url>` on the command.
- **`spec unreachable or not found`** — the path/URL is wrong or the server is down. Verify it loads (a local file must exist; a URL must return 200).
- **`filter matched no operations`** — your `--tag` / `--operation` / `--path` filter excluded everything. The message lists the available operations; adjust the filter (or drop it to include all).

## 13c. Web test `CONTRACT_DRIFT` never fires

`/xera-report` classifies a web failure as `REAL_BUG`/`TEST_BUG` even though an API the UI called drifted from the contract. Check, in order:

- **No spec configured** — set `web.spec` (or `http.spec` for mixed) to your OpenAPI path/URL.
- **Recorder not attached / no `network.jsonl`** — the web CONTRACT_DRIFT path needs the `xeraNetwork` recorder (see CONFIGURATION → `web`). Without it, no calls are captured to match. Confirm `.xera/<TICKET>/runs/<runId>/network.jsonl` exists after a run.
- **The drifting call isn't a documented endpoint** — web drift only flags **documented** endpoints (a status/schema mismatch on a path that exists in OpenAPI). Calls to undocumented endpoints (and page/asset loads) are intentionally ignored to avoid false positives.

**Contract self-heal refused.** When `/xera-report` classifies CONTRACT_DRIFT it may try to rewrite the `spec.ts` assertion to the OpenAPI contract. It refuses (and reports a category) when: `web-no-assertion` (UI test — nothing to rewrite); `no-spec` (no OpenAPI configured); `unsupported-edit` (the fix needs more than one assertion line); `real-bug` (the server response violates the contract — rewriting the test would hide a real bug); `low-confidence`. A `real-bug` refusal means investigate the backend, not the test. Heal is http-focused and never auto-commits — it stages with `git add` on a verified pass.

## 14. `XERA_AUTH_KEY mismatch — cannot decrypt`

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
npx xera-internal graph-snapshot
```

This rebuilds `.xera/graph/snapshot.json` from `events/` in < 1s.

### Backfill from existing project (pre-v0.6)

If you upgraded an existing project to v0.6, your historical tickets are not in the graph yet:

```bash
npx xera-internal graph-backfill --dry-run    # preview
npx xera-internal graph-backfill              # commit events
```

Generates one `ticket.fetched` event per existing `.xera/<TICKET>/` directory.

### LLM cost surprise

Check `.xera/cost-log.jsonl` (gitignored, per-machine). `xera doctor` summarizes the past 7 days.

### TEST_OUTDATED false positive

If `xera-report` flagged a scenario as TEST_OUTDATED but you believe it's a real bug:

1. Use the dispute prompt during `/xera-report` (or run manually):
   ```bash
   npx xera-internal graph-record dispute \
     --run-id <RUN_ID> --scenario-id <SHA> \
     --from TEST_OUTDATED --to REAL_BUG \
     --actor "$(git config user.email)" \
     --reason "..."
   ```
2. The TEST_OUTDATED confidence threshold (currently 0.7) is not yet user-configurable; if false positives are common, capture disputes (step 1) and file an issue with a sample run so we can tune the default.
3. v0.7+ will use dispute events to refine classifier behavior automatically.

### Impact list too large

If `/xera-impact` returns >50 scenarios, the markdown report shows the top 20 by score and writes the full list to `.xera/impact/<TICKET>.json`. To narrow:

- Use `--depth 1` to skip cross-ticket (jira-linked) and similarity edges
- Use `--min-priority p0` to focus on critical scenarios only
- Raise `xera.config.run.autoImpact.threshold` in config

### Impact list always empty

If `/xera-impact` returns no scenarios even though there should be coverage:

1. Run `xera doctor` to confirm the graph is up-to-date
2. Run `npx xera-internal graph-query --ticket <TICKET>` to verify the ticket has `modifies` edges
3. If the ticket has no `modifies` edges, re-fetch: `/xera-fetch <TICKET>` (the v0.6.0 `extract-areas.md` prompt populates them at fetch time)

### Viewer too slow / blank

If `.xera/graph.html` opens but renders slowly or appears blank:

1. Check graph size: `npx xera-internal graph-query --format text | head` — if you have > 500 nodes, the renderer auto-switches to ticket-only mode.
2. Filter the view: `npx xera-internal graph-render --since 30d` or `--ticket <SOME_ID>` to narrow the rendered subset.
3. Check browser console for errors (vis-network may fail to initialize on very old browsers; Chrome/Firefox/Safari from the past 3 years all work).

### Viewer artifact not appearing on PRs

Verify the workflow file was scaffolded:
```bash
ls .github/workflows/xera-graph.yml
```

If missing, run `npx @xera-ai/cli init --update` to refresh the scaffold (v0.6.3+).

### Auto-trigger never prompts

If `/xera-run <TICKET>` never asks about re-running impacted scenarios, the threshold may be too high. v0.6.4 defaults to `8.0`. Lower it:

```typescript
// xera.config.ts
export default defineConfig({
  run: {
    autoImpact: { threshold: 5.0 },
  },
});
```

The prompt fires only when at least one scenario's risk score exceeds the threshold. P0 scenarios with direct `modifies-same-area` edges score around 14; P1 around 11. Most P2 scenarios score below 8.

### `/xera-coverage` says `acBackfillNeeded` after running (v0.8+)

Most likely the AI declined to map some scenarios (low confidence). Re-run the backfill step and then re-run the coverage report:

```bash
npx xera-internal ac-coverage-backfill-prepare
# /xera-coverage will then continue with the backfill prompt
```

Persistent unmapped scenarios indicate either an ambiguous AC text or a scenario that doesn't actually assert any AC (it's a setup/fixture scenario). These are safe to leave unmapped — they won't appear in future AC gap lists.

### `/xera-coverage --viewer` shows empty Trend tab (v0.8.1+)

The Trend tab reads `coverage.snapshot` events from event history. It requires at least two snapshots from different days to render a line. Run `/xera-coverage` on multiple separate days and the tab will populate.

If `autoSnapshotOnCoverage: false` is set in `xera.config.ts`, events are not emitted and the Trend tab will stay empty. Enable it in config:

```typescript
export default defineConfig({
  coverage: {
    autoSnapshotOnCoverage: true,
  },
});
```

### `criticalArea "<slug>" missing from snapshot` doctor warning (v0.8+)

Either the slug is misspelled or no ticket has been fetched that modifies that area yet. To check whether the area exists in the graph:

```bash
npx xera-internal graph-query --area <slug>
```

If the area is not found, check for typos in `coverage.criticalAreas` in `xera.config.ts`. If the slug is intentional and no tickets modify it yet (e.g. a brand-new area), the warning is informational and can be ignored until tickets accumulate.

### `/xera-fill-gap` returns "no tickets / no unsatisfied ACs" (v0.8+)

**Area mode** (`/xera-fill-gap <area>`) requires at least one ticket with a `modifies` edge pointing to that area. Verify:

```bash
npx xera-internal graph-query --area <slug>
```

**AC mode** (`/xera-fill-gap --ticket <TICKET>`) requires at least one unsatisfied acceptance criterion on that ticket. Check:

```bash
# Run coverage report for that specific ticket
/xera-coverage --why <TICKET>
```

If the ticket is missing entirely from the graph (no fetch event), run `/xera-fetch <TICKET>` first and then retry `/xera-fill-gap`.
