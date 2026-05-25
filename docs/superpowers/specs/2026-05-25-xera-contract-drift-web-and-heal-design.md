# xera — CONTRACT_DRIFT on Web Traces + Self-Heal Design

**Status:** Draft for review
**Date:** 2026-05-25
**Author:** thanh@trinity-technology.com
**Scope:** Two linked capabilities, both scoped as "v0.9 roadmap" in the v0.7 HTTP-adapter spec §14:
1. **Detection** — match network calls made during a Playwright **web** test against the configured OpenAPI document and emit `CONTRACT_DRIFT` (today it fires only for the `http` adapter).
2. **Self-heal** — when a scenario is classified `CONTRACT_DRIFT`, auto-propose a fix to the **test's assertions in `spec.ts`** (rewrite expected status / response-shape / request-body to the current contract), parallel to the v0.5 `SELECTOR_DRIFT` POM heal. Heal targets HTTP tests; web `CONTRACT_DRIFT` is reported but refused for heal.

**Depends on:** v0.7 HTTP adapter (`classifyContractDrift`, `loadOpenApi`, `findOperation`, `http.spec`), v0.5 self-heal (`heal-prepare` + the `xera-report` heal sub-flow + `heal-locator.md`), v0.3 nonce-wrapped untrusted input.

**Resolved design decisions (from review):**
- **Web network data** comes from an **opt-in network recorder** (Playwright fixture) that captures method/url/status + bodies into a sidecar JSONL — reusing the existing `classifyContractDrift`. Detection degrades to method/url/status matching when bodies are absent.
- **Self-heal target** is `spec.ts` assertions, **primarily HTTP**. Web `CONTRACT_DRIFT` heal refuses (`web-no-assertion`) — a UI test doesn't assert on the network response directly.

**Out of scope (deferred):**
- **Auto-PR creation.** Heal stages the `spec.ts` change with `git add` (parallel to v0.5); opening a PR is the user's `git` step. ("auto-PR" in the roadmap = the staged-change workflow, not GitHub PR automation.)
- **Deep schema validation.** Reuses today's shallow `matchesSchema` (presence of `required` fields, top-level `type`). Nested/`oneOf`/`anyOf` validation stays out (same limit as http v0.7).
- **Request-body contract drift on web.** v1 matches response status + response-body shape. Request-body drift detection is http-only (the http classifier already sees request bodies).
- **Multi-line / multi-assertion heal.** One assertion line per heal (parallels v0.5's single-line POM replace). Multi-line edits → refuse `unsupported-edit`.
- **Time-correlating network calls to the exact failing step.** Calls are correlated to a scenario by test title; intra-scenario step correlation is deferred.

---

## 1. Goals & Scope

### 1.1 Goal

A web UI test can fail *because the backend contract drifted* — e.g. the login API now returns `201` instead of `200`, or dropped a field the UI depends on. Today xera classifies that as `REAL_BUG` or `TEST_BUG` with no contract insight, because web network calls are never matched against OpenAPI. Goal #1: when a spec is configured, match the web test's captured calls against OpenAPI and surface `CONTRACT_DRIFT` with the offending call + expectation.

Goal #2: once `CONTRACT_DRIFT` is detectable, close the loop the way v0.5 did for `SELECTOR_DRIFT` — propose a precise edit to the test's assertion, apply it, re-run, and stage on green. For HTTP tests the assertion is concrete (`expect(res.status()).toBe(200)`); for web tests there is no response assertion to rewrite, so the heal refuses and the detection stands as a diagnostic.

### 1.2 In-scope deliverables

**Detection**
1. **`web.spec` config field** (`packages/core/src/config/schema.ts`) + a `resolveOpenApiSpec(config)` helper returning `config.http?.spec ?? config.web?.spec`. Web/mixed projects can now point at OpenAPI.
2. **Web network recorder** (`packages/web/src/network-recorder/`): a Playwright fixture (`xeraNetwork`) that, **only when `XERA_NETWORK_LOG` is set**, subscribes to `page.on('response')`, scrubs and appends `{scenario,method,url,status,reqBody?,respBody}` JSONL. No-op otherwise (zero overhead in plain `playwright test`).
3. **Exec wiring**: `xera:exec` sets `XERA_NETWORK_LOG=<runDir>/network.jsonl`.
4. **Normalizer**: prefer the `network.jsonl` sidecar (richer, has bodies + per-scenario `scenario` tag) over the native trace `.network`; carry entries into `failure.networkAtFailure`, correlated per scenario by title.
5. **report.ts web branch**: per FAIL scenario, build `ContractDriftCall[]` from that scenario's `networkAtFailure` and run the **existing** `classifyContractDrift`; stamp **only** the scenarios whose calls drift (per-scenario, unlike http's all-FAIL stamp).

**Self-heal**
6. **`contract-heal.md` prompt** (`packages/prompts/`, v1.0.0): apply (rewrite one `spec.ts` assertion line) or refuse (fixed enum). v0.3 nonce-wrapped.
7. **`contract-heal-prepare` subcommand** (`packages/core/src/bin-internal/`): assemble `contract-heal-input.json` (drifting call + OpenAPI expectation + the `spec.ts` assertion line + gherkin step). No LLM. Emits a `web-no-assertion` short-circuit for web adapter.
8. **`xera-report` skill**: extend the heal sub-flow with a `CONTRACT_DRIFT` branch (http only), sharing the single-heal sentinel, low-confidence downgrade, and apply→re-run→stage/revert loop.
9. **`verify-prompts`**: add `contract-heal.md` to `IN_SCOPE_PROMPTS` (+ test/doctor seeds).

**Scaffold + fixtures + docs** (see §7–§9).

### 1.3 Why reuse `classifyContractDrift` rather than a web-specific matcher

The matcher (`matchPath` template + verb + status enum + shallow `matchesSchema`) is adapter-agnostic — it takes `ContractDriftCall[]` (`method`, `url`, `status`, `respBody`) + an `OpenAPIDocument`. Web calls, once captured, are exactly that shape. Reusing it means one matcher, one set of semantics, and the v0.7 golden http fixtures keep guarding it. The only web-specific work is *getting the calls* (the recorder) and *where to stamp* (per-scenario).

### 1.4 Success criteria

- A web/mixed project with `web.spec` (or `http.spec`) configured and the `xeraNetwork` fixture enabled: a test that fails because an API returned an undocumented status / dropped a required field is classified `CONTRACT_DRIFT`, with the offending `METHOD url → status` in the rationale.
- With no spec configured, or the recorder disabled, web runs behave exactly as today (no regression, no overhead).
- For an **http** ticket classified `CONTRACT_DRIFT`, `/xera-report` proposes a `spec.ts` assertion edit, applies it, re-runs `xera:exec`, and stages on green / reverts on red — single attempt.
- For a **web** ticket classified `CONTRACT_DRIFT`, the heal refuses with `web-no-assertion`; the detection still reports.
- `classifyContractDrift` is unchanged; the v0.7 http golden fixtures still pass.

---

## 2. Architecture — Detection

### 2.1 Config: where the spec comes from for web

`WebSchema` gains `spec: z.string().optional()`. New pure helper in `packages/core/src/config/` (e.g. `resolveOpenApiSpec(config): string | undefined` = `config.http?.spec ?? config.web?.spec`). Rationale: web-only projects have no `http` block, so they need `web.spec`; mixed projects can keep a single `http.spec` and have it apply to web too. Doctor's existing "OpenAPI spec configured" check generalizes to the resolved value.

### 2.2 Web network recorder (`packages/web/src/network-recorder/`)

A Playwright fixture, exported from `@xera-ai/web`, that the consumer's base `test` extends. Unlike the http adapter's `APIRequestContext` proxy (which **drains** the body — see `trace-recorder.ts:5-10`), **`page.on('response')` bodies are buffered by Playwright and safe to read** via `response.body()` / `response.json()` without affecting the test.

```ts
// fixture (auto), no-op unless XERA_NETWORK_LOG is set
xeraNetwork: [async ({ page }, use, testInfo) => {
  const logPath = process.env.XERA_NETWORK_LOG;
  if (logPath) {
    page.on('response', async (res) => {
      const req = res.request();
      // best-effort body capture; ignore binary / non-JSON
      let respBody: unknown;
      try { respBody = scrubBodyJson(await res.json()); } catch { /* skip non-JSON */ }
      appendFileSync(logPath, JSON.stringify({
        scenario: testInfo.title,
        method: req.method(),
        url: stripBase(res.url()),            // path-only, base stripped for matchPath
        status: res.status(),
        respBody,
      }) + '\n');
    });
  }
  await use(undefined);
}, { auto: true }],
```

- **Opt-in & overhead-free:** does nothing unless `XERA_NETWORK_LOG` is set (only `xera:exec` sets it). Plain `playwright test` is unaffected.
- **Scrubbing at capture** via the shared `@xera-ai/core` scrub fns (same as http recorder).
- **URL normalization:** strip the configured `baseUrl` so `url` is a path (`/users/1`) that `matchPath` can template-match. Query strings handled by the classifier (`split('?')`).
- **Bodies are best-effort:** non-JSON / binary responses record `respBody: undefined`; the classifier then checks only status + path (graceful degrade).

### 2.3 Exec wiring

`xera:exec` (`packages/web/src/executor/` + the core exec subcommand that injects `XERA_BASE_URL`) additionally sets `XERA_NETWORK_LOG=<runDir>/network.jsonl`. The recorder appends there; the file lands beside `trace.zip` and `report.json` in the run dir.

### 2.4 Normalizer: prefer the sidecar

`packages/web/src/trace-normalizer/normalize.ts`: if `<runDir>/network.jsonl` exists, parse it as the network source (it has bodies + a `scenario` tag) **instead of** the native trace `.network`. Correlate each entry to its scenario by `scenario === sc.name` (falling back to the existing all-FAIL attach when entries lack a scenario tag). Entries flow into the existing `failure.networkAtFailure` slot — no shape change. Scrub remains applied.

### 2.5 report.ts: per-scenario web CONTRACT_DRIFT

Today the http block (`report.ts:46-119`) loads the spec, builds calls from `normalized.json.http.calls`, runs `classifyContractDrift`, and **stamps every FAIL scenario** when it fires. For web, the calls live per-scenario in `networkAtFailure`, so we stamp **per scenario**:

```
const spec = resolveOpenApiSpec(config);
if (meta.adapter !== 'http' && spec && hasNetworkData(normalized)) {
  const openapi = await loadOpenApi(spec);
  if (openapi) {
    for (const sc of input.scenarios where outcome === 'FAIL') {
      const calls = (normalized scenario by name).failure.networkAtFailure
                      .map(n => ({ method:n.method, url:n.url, status:n.status, respBody:n.responseBody }));
      const drift = classifyContractDrift({ calls, openapi });
      if (drift) stamp THIS scenario: { class: 'CONTRACT_DRIFT', rationale: drift.rationale, confidence:'high' };
    }
  }
}
```

This runs **before** aggregation, alongside the existing http override. CONTRACT_DRIFT's high priority in `aggregate.ts` is preserved. Per-scenario stamping avoids over-claiming on web runs where one scenario drifted and others failed for unrelated reasons.

**Documented-endpoint filter (critical):** a web page emits responses for HTML, JS/CSS, images, and third-party calls — almost none in OpenAPI. `classifyContractDrift` returns CONTRACT_DRIFT on the *first* unmatched URL ("endpoint not found"), so feeding raw page responses would false-positive on essentially every web test. Therefore the web branch **pre-filters** each scenario's calls to those where `findOperation(openapi, method, url) !== null` (a documented path+method) before classifying. Web drift is thus scoped to **status/schema mismatches on known endpoints**, never "undocumented endpoint" (which is meaningless noise for web). The http path keeps its existing behavior (it only ever sees deliberate `request.*` calls). `findOperation` is the already-exported matcher from `@xera-ai/http`.

---

## 3. Architecture — Self-Heal (parallel to v0.5)

### 3.1 High-level flow (extends the existing `xera-report` heal sub-flow)

```
/xera-report <TICKET>
  └─ after classifier-output, for the FIRST scenario by priority:
       ├─ class == SELECTOR_DRIFT  → existing v0.5 locator heal (unchanged)
       └─ class == CONTRACT_DRIFT  → NEW contract heal:
            Phase A: npx xera-internal contract-heal-prepare <TICKET> <RUN_ID> "<SCENARIO>"
                       → contract-heal-input.json   (no LLM)
                       (web adapter → input.refusable='web-no-assertion'; skill refuses, STOP)
            Phase B: mint nonce, wrap (respBody + openapi snippet) untrusted,
                     read contract-heal.md, write contract-heal-output.json (strict JSON)
            Phase C: apply | refuse (same loop as v0.5):
                       apply  → verbatim replace specLineContent→newAssertionLine in spec.ts,
                                run xera:exec, exit 0 → git add spec.ts; exit 3/4 → git checkout HEAD -- spec.ts
                       refuse → report reason + refusalCategory, STOP
            Single-heal guard: shared .heal-attempted sentinel (one heal per /xera-report run,
              whether SELECTOR_DRIFT or CONTRACT_DRIFT).
```

### 3.2 `contract-heal-prepare` (`packages/core/src/bin-internal/contract-heal-prepare.ts`)

Deterministic assembly (no LLM):
1. Read `classifier-input.json`; find the target CONTRACT_DRIFT scenario.
2. Read `normalized.json`; get the drifting call (`method`, `url`, `status`, `respBody`). For http use `http.calls`; for web use the scenario's `networkAtFailure`.
3. `loadOpenApi(resolveOpenApiSpec(config))` + `findOperation(spec, method, url)` → the expected `responses` (documented status set) + the matched status's response `schema` (expected `required` fields).
4. Locate the assertion line in `spec.ts` (`specFile`, `specLine`, `specLineContent` verbatim) via regex: status assertions (`expect(res.status()).toBe(<n>)`, `toBe(<actualOrExpected>)`) and property assertions referencing the drifted field. Record the best single candidate.
5. `gherkinStep` from `test.feature` (best-effort, as v0.5).
6. **Web short-circuit:** if `meta.adapter !== 'http'`, write `contract-heal-input.json` with `refusable: 'web-no-assertion'` and exit 0 — the skill refuses without an LLM call.
7. Write `.xera/<TICKET>/runs/<RUN_ID>/contract-heal-input.json`. If no assertion line is locatable → `refusable: 'unsupported-edit'`.

### 3.3 `contract-heal.md` prompt (v1.0.0)

Frontmatter (`id: contract-heal`, inputs `contract-heal-input.json` wrapped, outputs `contract-heal-output.json`). Sections: `## Handling untrusted input` (verbatim v0.3 preamble — the response body + OpenAPI text are untrusted), `## Decision rules`, `## Refusal rules`, `## Quality rules`, `## Output format (strict)`.

**Decision rules** (apply when the *test* is stale vs. a legitimately-changed contract):
- Expected status changed (e.g. doc says `201`, test asserts `200`) → rewrite the status assertion.
- A `required` field renamed/moved and OpenAPI reflects the new name → rewrite the property assertion.

**Refusal rules** (fixed enum):
- `real-bug` — the response violates OpenAPI (the *server* is wrong, not the test) → not a test fix; escalate.
- `web-no-assertion` — web adapter; no response assertion to rewrite.
- `ambiguous` — multiple candidate assertion lines / unclear which to edit.
- `low-confidence` — single candidate, weak signal.
- `unsupported-edit` — change needs multi-line / structural edit.

**Output (strict JSON):** `{ decision: "apply"|"refuse", newAssertionLine: string|null, specLineContent: string|null, reason: string, confidence: "low"|"medium"|"high", refusalCategory: <enum>|null }`. Low-confidence apply → downgraded to refuse by the skill (defense-in-depth, as v0.5).

### 3.4 `xera-report` skill changes

Insert the CONTRACT_DRIFT branch where the heal target is chosen. Reuse the existing nonce mint + sentinel guard + apply/verify loop, swapping `heal-prepare`→`contract-heal-prepare`, `heal-locator.md`→`contract-heal.md`, POM file→`spec.ts`. The verbatim-line-replace + `xera:exec` re-run + `git add`/`git checkout HEAD -- spec.ts` semantics are identical to v0.5.

---

## 4. Data shapes

### 4.1 `network.jsonl` (one line per response; written by the recorder)
```jsonc
{ "scenario": "User can sign in", "method": "POST", "url": "/api/login", "status": 201, "respBody": { "token": "[redacted]" } }
```

### 4.2 `contract-heal-input.json` (Phase A)
```jsonc
{
  "ticket": "GH-12", "runId": "...", "scenarioName": "...",
  "adapter": "http",
  "refusable": null,                       // or 'web-no-assertion' | 'unsupported-edit'
  "drift": { "method": "POST", "url": "/users", "status": 200, "respBody": { /* scrubbed */ } },
  "expected": { "documentedStatuses": ["201","422","401"], "requiredFields": ["id","email"] },
  "assertion": {
    "specFile": ".xera/GH-12/spec.ts", "specLine": 31,
    "specLineContent": "    expect(res.status()).toBe(200);"
  },
  "gherkinStep": "When I create a user"
}
```

### 4.3 `contract-heal-output.json` (Phase B, LLM-written) — strict, see §3.3.

---

## 5. Affected files

| File | Change |
|---|---|
| `packages/core/src/config/schema.ts` | Add `spec?` to `WebSchema`; export `resolveOpenApiSpec`. |
| `packages/web/src/network-recorder/index.ts` | **NEW.** `xeraNetwork` fixture + `stripBase` helper. Exported from `packages/web/src/index.ts`. |
| `packages/web/src/executor/*` (+ core exec subcommand) | Set `XERA_NETWORK_LOG=<runDir>/network.jsonl`. |
| `packages/web/src/trace-normalizer/normalize.ts` | Prefer `network.jsonl` sidecar; correlate per scenario by title. |
| `packages/core/src/bin-internal/report.ts` | Add per-scenario web CONTRACT_DRIFT branch using `resolveOpenApiSpec` + `classifyContractDrift`. |
| `packages/prompts/contract-heal.md` | **NEW** v1.0.0. |
| `packages/prompts/version.json` | Add `contract-heal.md`; bump `prompts` minor. |
| `packages/core/src/bin-internal/contract-heal-prepare.ts` | **NEW.** Assembles `contract-heal-input.json`. |
| `packages/core/src/bin-internal/index.ts` | Register `contract-heal-prepare`. |
| `packages/core/src/bin-internal/verify-prompts.ts` | Add `contract-heal.md` to `IN_SCOPE_PROMPTS`. |
| `packages/skills/xera-report.md` | Add CONTRACT_DRIFT heal branch (http); web → report-only. |
| `packages/cli/src/commands/init.ts`, `init-update.ts` | Scaffold the `xeraNetwork` fixture into the consumer base `test` (web/mixed); add `xera:contract-heal-prepare` script. |
| `packages/cli/templates/*` | Base-test fixture template; web/mixed config `spec` hint. |
| Tests | `network-recorder`, normalizer sidecar, report web-drift, `contract-heal-prepare`, `verify-prompts`/doctor seeds. |
| Docs | `CONFIGURATION.md` (`web.spec`, recorder), `TROUBLESHOOTING.md` (web CONTRACT_DRIFT not firing → spec/recorder), `CLAUDE.md`, `AGENTS.md`. |

---

## 6. Phasing

The work splits cleanly; the plan delivers in two phases (optionally two PRs):
- **Phase 1 — Detection:** config + recorder + exec env + normalizer + report.ts + scaffold + fixtures/tests. Independently valuable (CONTRACT_DRIFT shows up on web).
- **Phase 2 — Heal:** `contract-heal.md` + `contract-heal-prepare` + skill branch + verify-prompts. Builds on Phase 1's detection but also serves the existing http CONTRACT_DRIFT.

---

## 7. Test plan

- **`packages/web/test/network-recorder/`** — fixture appends scrubbed JSONL only when `XERA_NETWORK_LOG` set; no-op otherwise; non-JSON body → `respBody` omitted; secrets scrubbed.
- **`packages/web/test/trace-normalizer/`** — sidecar `network.jsonl` preferred over trace `.network`; per-scenario correlation by title.
- **`packages/core/test/bin-internal/report.*`** — web fixture where one FAIL scenario's call drifts (undocumented status / missing required field) → only that scenario stamped CONTRACT_DRIFT; non-drifting FAIL scenarios untouched; no spec configured → no stamping.
- **`packages/core/test/bin-internal/contract-heal-prepare.test.ts`** — assembles input from http normalized + spec; locates the status assertion line; web adapter → `refusable: 'web-no-assertion'`; no locatable line → `unsupported-edit`; invalid key throws.
- **`verify-prompts` + doctor** seeds extended for `contract-heal.md`.
- **Reuse** `fixtures/golden-tickets-http/GOLD-HTTP-003-contract-drift/` for the http heal-prepare path; add a small web fixture with a `network.jsonl` for detection.

---

## 8. Security posture

- Response bodies + OpenAPI text are **untrusted** → nonce-wrapped per v0.3 before entering the heal prompt; `contract-heal.md` carries the preamble (`verify-prompts` enforces it).
- The recorder scrubs at capture via the existing `@xera-ai/core` scrub fns; the normalizer re-scrubs defensively. **No relaxation** of `scrub-rules.ts`.
- Heal writes only inside `spec.ts` under `.xera/<TICKET>/`; verbatim-line match prevents corrupt partial writes; `git checkout` reverts on failed verification.

---

## 9. Risks & mitigations

| Risk | Mitigation |
|---|---|
| Native Playwright trace lacks reliable response bodies. | Opt-in recorder writes a sidecar `network.jsonl` with bodies; detection degrades to status/path match without it. |
| Recorder reading bodies perturbs the test. | `page.on('response')` bodies are buffered by Playwright (unlike `APIRequestContext`); reading is side-effect-free. Best-effort try/catch; never throws into the test. |
| Over-claiming CONTRACT_DRIFT on web (coarse all-FAIL stamp). | Web stamps **per scenario** using that scenario's own calls. |
| Heal rewrites a test that should fail (real backend bug). | `real-bug` refusal category; low-confidence downgrade; single-heal guard; `git` review gate before commit. |
| Consumer base-`test` wiring varies. | Recorder is a no-op unless `XERA_NETWORK_LOG` is set; scaffolded into new web/mixed projects; `init --update` adds it; documented for hand-wiring. |
| `classifyContractDrift` regression. | Untouched; reused as-is; v0.7 http goldens still guard it. |

---

## 10. Resolved decisions

1. **Reuse `classifyContractDrift`** — one matcher for both adapters; web only adds capture + per-scenario stamping.
2. **Opt-in recorder, env-gated** — zero overhead off `xera:exec`; reliable bodies on it.
3. **Heal edits `spec.ts`, http-focused** — web `CONTRACT_DRIFT` refuses `web-no-assertion`; detection still reports.
4. **Per-scenario web stamping** — avoids the http path's coarse all-FAIL stamp.
5. **"auto-PR" = staged change** — `git add` on green, same review gate as v0.5; no GitHub automation.
6. **Two-phase delivery** — detection ships independently of heal.
