# xera — CONTRACT_DRIFT on Web Traces + Self-Heal — Implementation Plan

> **For agentic workers:** Steps use checkbox (`- [ ]`) syntax. Two phases; Phase 1 (detection) is independently shippable. Reuse `superpowers:test-driven-development`.

**Goal:** (1) Detect `CONTRACT_DRIFT` on Playwright **web** tests by matching captured network calls against OpenAPI (reusing `classifyContractDrift`); (2) self-heal `CONTRACT_DRIFT` by rewriting a `spec.ts` assertion (http-focused; web refuses), parallel to the v0.5 selector heal.

**Spec:** `docs/superpowers/specs/2026-05-25-xera-contract-drift-web-and-heal-design.md`

**Architecture:** An opt-in `xeraNetwork` Playwright fixture (no-op unless `XERA_NETWORK_LOG` set by `xera:exec`) records scrubbed `{scenario,method,url,status,respBody}` to a `network.jsonl` sidecar. The web normalizer prefers that sidecar and fills `failure.networkAtFailure` per scenario. `report.ts` runs the existing `classifyContractDrift` per FAIL scenario and stamps only the ones that drift. Heal mirrors v0.5: `contract-heal-prepare` (deterministic) → `contract-heal.md` (nonce-wrapped strict-JSON) → verbatim `spec.ts` line replace → `xera:exec` re-run → `git add`/`checkout`.

**Key constraints:** `classifyContractDrift` is **untouched** (reused). `page.on('response')` bodies are buffered (safe to read) — unlike the http `APIRequestContext` proxy which drains them. Recorder must be a no-op without `XERA_NETWORK_LOG`. `exactOptionalPropertyTypes` + `noUncheckedIndexedAccess` on.

---

## Phase 1 — Detection

### Task 1.1: config — `web.spec` + `resolveOpenApiSpec`
- Create: failing test in `packages/core/test/config/` (or extend existing) asserting `resolveOpenApiSpec` returns `http.spec ?? web.spec`.
- `packages/core/src/config/schema.ts`: add `spec: z.string().optional()` to `WebSchema`.
- Add + export `resolveOpenApiSpec(config)`. Run `cd packages/core && npx vitest run config && npm run typecheck`.

### Task 1.2: web network recorder — TDD
- Create `packages/web/src/network-recorder/index.ts` with a **pure** `formatNetworkLine(entry)` + `recordResponseLine(logPath, entry)` (testable without a browser) and the `xeraNetwork` fixture wrapping them + `stripBase(url, baseUrl)`.
- Create `packages/web/test/network-recorder/recorder.test.ts`: `stripBase` strips configured base → path; `recordResponseLine` appends one scrubbed JSONL line; secrets in body scrubbed; non-JSON body → `respBody` omitted; **no write when logPath falsy**.
- Export from `packages/web/src/index.ts`. Run `cd packages/web && npx vitest run network-recorder && npm run typecheck`.

### Task 1.3: exec sets `XERA_NETWORK_LOG`
- In the exec runner (core exec subcommand / `packages/web/src/executor`), set `XERA_NETWORK_LOG=<runDir>/network.jsonl` alongside `XERA_BASE_URL`. Extend the exec test to assert the env var is set.

### Task 1.4: normalizer prefers the sidecar — TDD
- `packages/web/src/trace-normalizer/normalize.ts`: if `<runDir>/network.jsonl` exists, parse it (has `scenario` + bodies) as the network source; correlate to scenarios by `scenario === sc.name`; fall back to the existing trace `.network` all-FAIL attach when no sidecar.
- Extend `packages/web/test/trace-normalizer/normalize.test.ts`: sidecar present → per-scenario `networkAtFailure` with bodies; absent → unchanged behavior.

### Task 1.5: report.ts web CONTRACT_DRIFT — TDD
- `packages/core/src/bin-internal/report.ts`: after the http block, add a branch for `meta.adapter !== 'http'` (web/mixed) when `resolveOpenApiSpec(config)` set and normalized scenarios carry `networkAtFailure`: per FAIL scenario, build `ContractDriftCall[]` from that scenario's entries (`respBody = n.responseBody`), run `classifyContractDrift`, stamp **only** that scenario on a hit.
- Test (`packages/core/test/bin-internal/report.*` or a new file): web fixture, one scenario drifts (undocumented status / missing required field) → only it stamped CONTRACT_DRIFT; others untouched; no spec → no stamping. Restore `process.cwd()` in `afterEach`.

### Task 1.6: scaffold the recorder fixture
- `packages/cli/templates/*`: provide a base-`test` fixture (or extend `auth-setup.ts.tmpl`) that composes `xeraNetwork`; scaffold for web/mixed. Add `spec` hint to web/mixed config templates.
- `init.ts` / `init-update.ts`: wire the fixture file for web/mixed. CLI scaffold test: web/mixed projects include the fixture; api unaffected.

### Task 1.7: docs (Phase 1)
- `CONFIGURATION.md` (`web.spec`, recorder, `XERA_NETWORK_LOG`), `TROUBLESHOOTING.md` (web CONTRACT_DRIFT not firing → configure spec + enable recorder), `CLAUDE.md`, `AGENTS.md`.

### Phase 1 verification
- [ ] `npm run typecheck` + `npm run lint` clean.
- [ ] `npx vitest run packages/core packages/web` green.
- [ ] CLI scaffold tests green (build CLI first for spawn tests).

---

## Phase 2 — Self-Heal

### Task 2.1: `contract-heal.md` prompt (NEW v1.0.0)
- Write per spec §3.3 — verbatim v0.3 untrusted-input preamble, decision rules (status / renamed-field), refusal enum (`real-bug`, `web-no-assertion`, `ambiguous`, `low-confidence`, `unsupported-edit`), strict JSON output. **User-facing copy — match the spec.**
- `packages/prompts/version.json`: add `contract-heal.md`, bump `prompts` minor.

### Task 2.2: `contract-heal-prepare` — TDD
- Create `packages/core/src/bin-internal/contract-heal-prepare.ts` per spec §3.2: read classifier-input + normalized + OpenAPI (`loadOpenApi` + `findOperation`) + locate the `spec.ts` assertion line (regex) + gherkin step. Web adapter → `refusable: 'web-no-assertion'`. No locatable line → `unsupported-edit`. Write `contract-heal-input.json`.
- Create `packages/core/test/bin-internal/contract-heal-prepare.test.ts`: http happy path (status assertion located), web short-circuit, unsupported-edit, invalid key throws, cwd restored.
- Register in `bin-internal/index.ts` COMMANDS.

### Task 2.3: verify-prompts + doctor seeds
- Add `contract-heal.md` to `IN_SCOPE_PROMPTS`; extend `verify-prompts.test.ts` `seedPrompts` + `doctor.test.ts` `seedGoodRepo` + a 1-line in-scope assertion.

### Task 2.4: `xera-report` skill — CONTRACT_DRIFT heal branch
- Extend the heal sub-flow: when the first-by-priority failing scenario is CONTRACT_DRIFT and adapter is http, run `contract-heal-prepare`, mint nonce, wrap (respBody + openapi snippet), follow `contract-heal.md`, parse strict JSON, low-confidence downgrade, verbatim replace `specLineContent → newAssertionLine` in `spec.ts`, re-run `xera:exec`, `git add`/`git checkout HEAD -- spec.ts`. Share the `.heal-attempted` single-heal sentinel. Web CONTRACT_DRIFT → report-only. **User-facing copy.**

### Task 2.5: scaffold script + docs (Phase 2)
- `init.ts`/`init-update.ts`: add `xera:contract-heal-prepare` script.
- Docs: note the CONTRACT_DRIFT heal in `xera-report` (CLAUDE.md/AGENTS.md), `TROUBLESHOOTING.md` heal refusal categories.

### Phase 2 verification
- [ ] `npm run typecheck` + `npm run lint` clean.
- [ ] `npx vitest run packages/core` green incl. `contract-heal-prepare`, `verify-prompts`, `doctor`.
- [ ] `feat:`-titled PR(s) → `auto-changeset.yml`; no hand-edited versions.

---

## Notes
- The `xeraNetwork` fixture's `page.on('response')` integration is exercised in nightly e2e, not unit tests; keep the JSONL-writing logic in pure helpers so it's unit-testable.
- Don't touch `classifyContractDrift` / `scrub-rules.ts` (security-sensitive; reuse only).
- Two PRs recommended (Phase 1, then Phase 2) to keep diffs reviewable; both `feat:`.
