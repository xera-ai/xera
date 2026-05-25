# xera v0.18 — Feature-from-OpenAPI (`/xera-feature --from-spec`) Design

**Status:** Draft for review
**Date:** 2026-05-25
**Author:** thanh@trinity-technology.com
**Scope:** Add a `--from-spec` mode to `/xera-feature` that generates a Gherkin `test.feature` (and a synthetic story node) directly from an OpenAPI document, without a fetched Jira/GitHub ticket as the source. Targets the `http` adapter. Reuses the existing `feature → script → exec → report` pipeline downstream — only the *source* of the feature changes.
**Depends on:** v0.7 HTTP adapter (`@xera-ai/http`, `loadOpenApi`, `http.spec` config, `script-from-feature-http.md`), v0.3 prompt-injection defense (nonce-wrapped untrusted input).
**Roadmap origin:** v0.7 spec §14 ("`xera-feature --from-spec openapi.yaml` — generate tickets from OpenAPI without a Jira story") and v0.8 spec §15 (deferred from v0.8; "with AC matrix existing, OpenAPI-derived AC ↔ Scenario mapping has a target node type").

**Out of scope (deferred — each gets its own spec when feedback warrants):**

- **CONTRACT_DRIFT on web traces / self-heal auto-PR for CONTRACT_DRIFT.** Separate v0.x item (next-plan priority #1).
- **Auto-detecting that a project is "API-first" and auto-running `--from-spec` from `/xera-run`.** `--from-spec` is opt-in, never auto-chained (mirrors `/xera-explore`).
- **Synthetic graph linkage of an endpoint as a first-class node** (`endpoint` node type, `/xera-impact` on schema change). That is the v1.0 cross-adapter-graph item; here the OpenAPI-derived ticket is a normal `ticket` node.
- **Round-tripping generated AC back into Jira/GitHub.** `--from-spec` produces local artifacts only; promotion to a tracker is the user's call via a separately-created ticket.
- **Multi-file / split OpenAPI bundles beyond `$ref` dereferencing.** `loadOpenApi` already deref's `$ref`; we do not add glob-merge of multiple spec files.
- **Webhook / callbacks / `oneOf`/`anyOf` discriminator scenario explosion.** v0.18 generates from the primary request/response schema; complex polymorphism is summarized, not exhaustively enumerated.

---

## 1. Goals & Scope

### 1.1 Goal

Today every `/xera-feature` run requires a fetched story: the skill stops with *"No story.md yet. Run `/xera-fetch {{TICKET}}` first."* (`packages/skills/xera-feature.md:10`). For API-first teams the source of truth is an OpenAPI document, not a Jira ticket. They should be able to point xera at `openapi.yaml` (already configured as `http.spec`) and get Gherkin scenarios + a runnable Playwright/HTTP spec, without first authoring a tracker ticket.

The goal: `/xera-feature <KEY> --from-spec` produces the same `.xera/<KEY>/` artifact shape an ordinary ticket would (`story.md`, `test.feature`, `meta.json`), so that **everything downstream is unchanged** — `/xera-script`, `/xera-exec`, `/xera-report`, `/xera-promote`, graph recording, and coverage all operate on the synthetic ticket exactly as on a real one.

### 1.2 In-scope deliverables

1. **`extractOperations` in `@xera-ai/http`** (`packages/http/src/openapi/extract.ts`): a pure, deterministic function that flattens a dereferenced OpenAPI document into a normalized, hashable list of operations (method, path, operationId, summary, description, tags, parameters, request-body schema/example, documented responses). Plus `extractInfo(doc)` → `{ title, version }`. This is the richer companion to the existing `findOperation` (single lookup) — `extractOperations` enumerates *all* matching operations.

2. **`feature-spec-prepare` internal subcommand** (`packages/core/src/bin-internal/feature-spec-prepare.ts`), dispatched via `npx xera-internal feature-spec-prepare <KEY> [filters]`. Deterministic data assembly only — **no LLM**. It loads the OpenAPI spec (`config.http.spec` or `--spec` override) via `loadOpenApi`, applies filters, computes a stable `spec_hash`, and writes:
   - `.xera/<KEY>/spec-input.json` — the generation context for the prompt.
   - `.xera/<KEY>/story.md` — a synthetic, human-readable story (so `/xera-script`, graph, and coverage have a story node + frontmatter).
   - `.xera/<KEY>/meta.json` — `adapter: 'http'`, `source: 'openapi'`, `spec_hash`, `story_hash` (= `spec_hash`).

3. **`feature-from-openapi.md` prompt** (`packages/prompts/feature-from-openapi.md`, v1.0.0): API-flavored Gherkin generation rules. One Scenario per operation happy-path + one per documented non-2xx response, request/response-status/schema steps, concrete example values, v0.3 untrusted-input handling.

4. **`/xera-feature` skill `--from-spec` branch** (`packages/skills/xera-feature.md`): detect the flag, run `feature-spec-prepare`, read `spec-input.json`, nonce-wrap it, follow `feature-from-openapi.md`, write + validate `test.feature`, stamp meta. The existing story-based flow is left byte-for-byte intact below the branch.

5. **`meta.json` schema extension** (`packages/core/src/artifact/meta.ts`): `source` enum gains `'openapi'`; new optional `spec_hash` field. No other fields change — feature-drift detection reuses the existing `feature_generated_from_story_hash === story_hash` invariant (the synthetic story's `storyHash` *is* the `spec_hash`).

6. **CLI wiring** (`packages/cli/src/commands/init.ts`, `init-update.ts`): scaffold `xera:feature-spec-prepare` into the consumer `package.json`, gated on `wantsHttp` (same gate as `xera:openapi-resolve`).

7. **`verify-prompts` + doctor** (`packages/core/src/bin-internal/verify-prompts.ts`): add `'feature-from-openapi.md'` to `IN_SCOPE_PROMPTS`; extend the test/doctor seed fixtures with a valid copy.

8. **Docs** (same PR): `CLAUDE.md` codebase map (12 → 13 prompts, new subcommand), `AGENTS.md` (`/xera-feature` description), `docs/CONFIGURATION.md` (`--from-spec` flags), `docs/TROUBLESHOOTING.md` (a "feature from spec produced nothing" row).

### 1.3 Out-of-scope (deferred)

See the header block. Briefly: no CONTRACT_DRIFT-on-web work, no auto-chaining from `/xera-run`, no endpoint graph node, no tracker round-trip, no multi-file merge, no polymorphism explosion.

### 1.4 Why a new prompt instead of reusing `feature-from-story.md`?

`feature-from-story.md` (`packages/prompts/feature-from-story.md`) is explicitly **user-facing / UI-flavored**: its hard rules say *"Steps must be user-facing, not implementation-facing"* and *"Authentication setup belongs in xera's auth state"* (rule 4). OpenAPI scenarios are the inverse — they are request/response/status/schema assertions against an HTTP API. Forcing them through the UI prompt would either violate that prompt's contract or dilute it. A dedicated `feature-from-openapi.md` keeps each prompt's rules sharp and its inputs typed (`spec-input.json` is structured, not free-text markdown).

The synthetic `story.md` is written anyway, but it is **not** the feature-generation input — it exists so the *downstream* tools (script, graph, coverage), which key off `story.md` + `meta.json`, see a consistent ticket node.

### 1.5 Why require a user-supplied `<KEY>` instead of auto-generating one?

The artifact directory, the graph `ticket` node id, coverage rows, and any future promotion all key off the ticket id. An auto-generated id (hash, timestamp) would be unstable across re-runs and meaningless in the graph. We require a caller-supplied key matching the existing `TICKET_RE` (`packages/core/src/artifact/paths.ts:3`), e.g. `API-PETS-001`, `PETSTORE-001`. The skill prompts for one if omitted. Re-running with the same key + unchanged spec slice is idempotent (drift-skip).

### 1.6 Success criteria

- `npx @xera-ai/cli init --shape api` then `/xera-feature API-PETS-001 --from-spec` produces a valid `test.feature` that `xera:validate-feature` accepts, with one Scenario per operation happy-path and per documented error response.
- Re-running with no spec change reports "up to date" and does nothing (drift-skip), exactly like the story path.
- `/xera-script API-PETS-001` then `/xera-exec` then `/xera-report` work on the synthetic ticket with zero from-spec-specific code.
- `feature-spec-prepare` is fully deterministic and unit-tested against `fixtures/mock-api/openapi.yaml`; no LLM in the binary.
- Missing/unreachable spec degrades gracefully with an actionable message (mirrors `openapi-resolve`'s `openapi: null` behavior), never a stack trace.

---

## 2. Architecture

### 2.1 Pipeline placement

```
                         ┌────────────────────────── existing story path ──────────────────────────┐
/xera-fetch TICKET ─────▶ story.md ──┐
                                     ├─▶ /xera-feature TICKET ─▶ test.feature ─▶ /xera-script ─▶ …
/xera-feature KEY --from-spec ───────┘   (feature-from-openapi.md, via feature-spec-prepare)
   │
   └─ writes synthetic story.md + spec-input.json + meta(source:openapi) first
```

`--from-spec` is a *front-half replacement* for `/xera-fetch` + the story branch of `/xera-feature`. From `test.feature` onward the pipeline is identical.

### 2.2 `extractOperations` (`packages/http/src/openapi/extract.ts`)

The existing core `OpenAPIDocument` type (`packages/core/src/classifier/contract-drift.ts:15-20`) is intentionally narrow (only `responses` + `requestBody`, for drift checks). Extraction needs more, so it reads the dereferenced raw document under a loose local shape rather than widening the shared classifier type.

```ts
export interface ExtractedParam {
  name: string;
  in: 'path' | 'query' | 'header' | 'cookie';
  required: boolean;
  schema?: unknown;
  description?: string;
  example?: unknown;
}

export interface ExtractedResponse {
  status: string;            // '200', '404', 'default'
  description?: string;
  schema?: unknown;          // first content media-type schema, if any
}

export interface ExtractedOperation {
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  path: string;              // '/pets/{id}'
  operationId?: string;
  summary?: string;
  description?: string;
  tags: string[];
  parameters: ExtractedParam[];
  requestBodySchema?: unknown;
  requestBodyExample?: unknown;
  responses: ExtractedResponse[];
}

export interface ExtractFilter {
  tags?: string[];           // include op if any tag matches
  operationIds?: string[];
  paths?: string[];          // exact path-template match
}

export function extractOperations(doc: unknown, filter?: ExtractFilter): ExtractedOperation[];
export function extractInfo(doc: unknown): { title: string; version: string };
```

Determinism rules (critical for stable `spec_hash`):

- Iterate `paths` in **sorted** key order, then methods in fixed `['get','post','put','patch','delete']` order.
- Parameters sorted by `(in, name)`.
- Responses sorted by status string.
- No `Date.now()`, no randomness, no env reads.
- When `filter` is provided, an operation is included if it matches **any** of the supplied filter dimensions (tag OR operationId OR path). When `filter` is empty/undefined, all operations are included.

`exactOptionalPropertyTypes` is on — build each object with conditional assignment, never assign `undefined`.

### 2.3 `feature-spec-prepare` subcommand

`npx xera-internal feature-spec-prepare <KEY> [--tag T]… [--operation OPID]… [--path P]… [--spec PATH_OR_URL]`

```
1. Validate <KEY> via resolveArtifactPaths (throws on bad key → caught by run() → exit 4).
2. loadConfig(cwd). spec source = --spec ?? config.http?.spec.
   - If neither set → write spec-input.json {operations:[], reason:'no spec'} and
     print an actionable message; return 0 with an empty operations array
     (skill treats empty as "nothing to generate" and stops). Rationale: mirror
     openapi-resolve's never-throw-on-missing-spec posture.
3. Resolve relative path against cwd (isAbsolute/resolve), URLs pass through.
4. doc = await loadOpenApi(resolvedSpec). If null → spec-input.json {operations:[],
     reason:'spec unreachable'} ; print warning ; return 0.
5. ops = extractOperations(doc, filter). info = extractInfo(doc).
   - If filters yielded zero ops → reason:'filter matched no operations (available: …)'.
6. spec_hash = hashString(JSON.stringify({ specRef, info, ops })) // sha256: prefix
7. Idempotency: if existing meta.spec_hash === spec_hash AND story.md + spec-input.json
     exist → print "[xera:feature-spec-prepare] current (KEY)" ; return 0.
8. Write spec-input.json (see §2.4).
9. Render + write synthetic story.md (see §2.5).
10. writeMeta: { ticket:KEY, adapter:'http', source:'openapi', spec_hash,
     story_hash:spec_hash, fetched_at:now, xera_version, prompts_version,
     ...preserve any existing downstream fields }.
11. Print "[xera:feature-spec-prepare] wrote N operations for KEY". return 0.
```

The binary **never** invokes Claude and **never** writes `test.feature` — that is the skill's job (AI step). This honors the repo's skill↔binary boundary (CLAUDE.md "Graph subcommands MUST stay deterministic" generalizes to all prep subcommands).

### 2.4 `spec-input.json` shape

```jsonc
{
  "key": "API-PETS-001",
  "source": "openapi",
  "specRef": "./openapi.yaml",          // path or URL as configured (not the resolved abs path)
  "info": { "title": "Petstore", "version": "1.0.0" },
  "filter": { "tags": ["pets"] },        // echo of applied filter (omitted if none)
  "operations": [ /* ExtractedOperation[] */ ],
  "spec_hash": "sha256:…"
}
```

This is the data the prompt consumes. It is what the skill nonce-wraps as untrusted input (§5.1 / §6).

### 2.5 Synthetic `story.md`

Rendered deterministically by `feature-spec-prepare` (mirrors `fetch.ts`'s `renderStory`, `packages/core/src/bin-internal/fetch.ts:141`), so downstream story-readers are satisfied:

```md
---
ticketId: API-PETS-001
summary: "Petstore API — pets"
storyHash: sha256:…            # == spec_hash
acceptanceCriteria:
  - "GET /pets returns 200 with a list of pets"
  - "POST /pets creates a pet and returns 201"
  - "GET /pets/{id} returns 200 for a known id, 404 otherwise"
acceptanceCriteriaSource: openapi
---
# API-PETS-001: Petstore API — pets

## Story

Generated from OpenAPI spec `./openapi.yaml` (Petstore 1.0.0).
This ticket covers 3 operation(s) tagged `pets`.

## Operations

- **GET** `/pets` — List all pets
- **POST** `/pets` — Create a pet
- **GET** `/pets/{id}` — Get a pet by id

## Acceptance Criteria

- GET /pets returns 200 with a list of pets
- POST /pets creates a pet and returns 201
- GET /pets/{id} returns 200 for a known id, 404 otherwise
```

One AC line is synthesized per operation: `"<METHOD> <path> returns <happy-status> …"` plus the documented error statuses. `acceptanceCriteriaSource: openapi` is the new provenance value (the `renderStory` enum in `fetch.ts` would need `'openapi'`, but `feature-spec-prepare` writes its own renderer — see §2.6 — so we don't touch `fetch.ts`).

### 2.6 Why `feature-spec-prepare` has its own renderer

`fetch.ts:renderStory` is private to `fetch.ts` and its `acSource` union is `'jira-field' | 'body-extraction' | 'none'`. Rather than export and widen it (touching the fetch path + its provenance semantics consumed by `xera doctor --strict`), `feature-spec-prepare` carries a small local `renderSyntheticStory(...)`. The two renderers share the same *frontmatter shape* (a documented invariant, see §10) but stay decoupled. This keeps the change isolated to from-spec code — same isolation rationale as the v0.5 plan's `domSnapshotAtFailure` decision.

---

## 3. Config schema additions

**None.** `--from-spec` reuses the existing optional `http.spec` field (`packages/core/src/config/schema.ts`, `HttpSchema.spec`). The only new surface is the `--spec` CLI override (resolved in the binary, not persisted). Doctor already warns when `http.spec` is configured-but-unreachable; no new check is required, though §4.3 adds an info-level hint.

---

## 4. CLI surface

### 4.1 `/xera-feature <KEY> --from-spec` (skill flags)

| Flag | Meaning |
|---|---|
| `--from-spec` | Switch to OpenAPI source mode. |
| `--spec <path-or-url>` | Override `config.http.spec`. |
| `--tag <name>` (repeatable) | Include only operations with this tag. |
| `--operation <operationId>` (repeatable) | Include only these operations. |
| `--path <template>` (repeatable) | Include only these path templates (e.g. `/pets/{id}`). |

With no filter flags, all operations are included; the skill warns and suggests filtering when the count is large (> 20) to avoid an unwieldy mega-feature.

### 4.2 Scaffolded script

`init.ts` / `init-update.ts` add (gated on `wantsHttp`, alongside `xera:openapi-resolve`):

```ts
if (wantsHttp) pkg.scripts['xera:feature-spec-prepare'] = 'xera-internal feature-spec-prepare';
```

### 4.3 Doctor

No new failing check. Optional info-level hint when `http.spec` is set: *"OpenAPI configured — you can generate features without a ticket via `/xera-feature <KEY> --from-spec`."* (Low priority; can land with docs only.)

---

## 5. Skills + prompts

### 5.1 `packages/skills/xera-feature.md` (modified)

Insert a branch **before** current step 1. Pseudocode of the added section:

```
0. If the invocation includes `--from-spec`:
   a. Determine <KEY>. If missing, ask for one (must look like API-PETS-001).
   b. Run: npx xera-internal feature-spec-prepare <KEY> [--tag…] [--operation…] [--path…] [--spec…]
      - Read .xera/<KEY>/spec-input.json. If `operations` is empty, show the
        `reason` and STOP (e.g. "no spec configured", "spec unreachable",
        "filter matched no operations").
   c. If feature-spec-prepare printed "current" AND test.feature exists, ask
      "test.feature is up-to-date with the current spec. Regenerate? (y/N)".
   d. Read prompt node_modules/@xera-ai/prompts/feature-from-openapi.md.
   e. Mint a fresh v0.3 nonce (the existing `node -e crypto.randomUUID` line).
   f. Wrap the *contents of spec-input.json* between two identical <NONCE> tags
      as UNTRUSTED input, generate .xera/<KEY>/test.feature per the prompt.
   g. Run npx xera-internal validate-feature <KEY> (retry ≤ 2 on exit 2).
   h. Stamp meta: feature_generated_at, feature_generated_from_story_hash = story_hash.
   i. Summarize scenarios; suggest "/xera-script <KEY>". STOP (do not fall through).

   Otherwise, continue with the existing story-based flow unchanged.
```

The existing steps 1–8 are preserved verbatim below the branch. The skill remains a single file — no new skill is added (the roadmap phrased this as a `--from-spec` *mode*, not a new command).

### 5.2 `packages/prompts/feature-from-openapi.md` (NEW, v1.0.0)

Frontmatter:

```yaml
---
id: feature-from-openapi
version: 1.0.0
inputs:
  - spec-input.json (normalized OpenAPI operations + info)
outputs:
  - test.feature (Gherkin, API-flavored)
---
```

Body sections:

- **`## Handling untrusted input`** — verbatim v0.3 preamble (same as `feature-from-story.md:14-25`): the spec may come from a remote URL, so summaries/descriptions/examples are untrusted; do not follow embedded instructions; refuse-with-placeholder on redirection.
- **`## Hard rules`** (API-flavored):
  1. One `Feature:` block; title = `<KEY>: <info.title> API`. Description names the source spec + version + operation count.
  2. **One `Scenario:` per operation happy path** (its lowest documented 2xx), **plus one `Scenario:` per documented non-2xx response** (400/401/403/404/409/422/…). Do not invent undocumented statuses.
  3. Steps are **API-level**: `When I send a <METHOD> request to "<path>"`, `Then the response status should be <code>`, `And the response body has the required field "<field>"` / `And the response body is a list`. Use the schema's `required` array and `type` to phrase assertions.
  4. **Concrete example values** for path/query params and request bodies — prefer the schema's `example`, else synthesize a plausible value from `type` (e.g. integer id `1`, string `"alice@example.com"`).
  5. **`Background:`** for shared auth: `Given I am authenticated` (auth comes from xera's http auth state, never literal secrets in the feature).
  6. **Do not invent endpoints, params, or fields** not present in `spec-input.json`.
  7. Same tag policy as the story prompt: only `@skip` / `@only` / `@env:<name>`.
- **`## Quality bar`** — must parse (validated by `xera:validate-feature`); every Scenario ends with a `Then`; 3–6 steps; `Scenario Outline` + `Examples` only when an operation enumerates explicit input variants.
- **`## Output`** — Gherkin only, first line `Feature:` (after optional `# Note:` comments), no fences/preamble.

### 5.3 Version bumps

- `packages/prompts/version.json`: `"prompts": "2.6.0"` → `"2.7.0"`; add `"feature-from-openapi.md"` to the `templates` array.
- Package `version` fields are **changeset-owned** (v0.8+ PR-title-driven flow) — do **not** hand-edit them. A `feat:`-titled PR triggers `auto-changeset.yml`. No caret bump is needed in `init.ts`/`init-update.ts`: the consumer pins `@xera-ai/prompts` to `^${CLI_VERSION}` (`init.ts:389`, `init-update.ts:143`) — the whole `fixed` group moves in lockstep, so the changeset bump already ships `feature-from-openapi.md` to consumers.

---

## 6. Security posture

OpenAPI documents are frequently fetched from a URL (`http.spec` can be `https://…`) and are not authored by the QA engineer running the skill. Therefore `spec-input.json` content (operation summaries, descriptions, schema `description`/`example` strings) is treated as **untrusted input** and nonce-wrapped per the v0.3 defense before entering the generation context — identical to how `story.md` is wrapped in the existing flow. The `feature-from-openapi.md` prompt carries the same refusal rules. No new scrub rules are introduced; no security-sensitive file (`scrub-rules.ts`, `encrypt.ts`) is touched.

The binary writes only inside `.xera/<KEY>/` (path-validated by `resolveArtifactPaths`) and reads only the configured spec path/URL.

---

## 7. Artifact layout

```
.xera/API-PETS-001/
├── spec-input.json        # NEW — generation context (operations + info + spec_hash)
├── story.md               # synthetic, source: openapi
├── test.feature           # generated by /xera-feature --from-spec
├── meta.json              # adapter: http, source: openapi, spec_hash
└── … (spec.ts, runs/, etc. produced by the unchanged downstream pipeline)
```

`spec-input.json` is a sibling of the existing `openapi-input.json` (written by `openapi-resolve` for `/xera-script`). They are distinct: `openapi-input.json` is the *full* deref'd doc for script generation; `spec-input.json` is the *filtered, normalized operation slice* for feature generation. Both are gitignore-eligible scratch (consumer's `.gitignore` already ignores transient `.xera` artifacts per existing convention; confirm in plan).

---

## 8. Mock targets & golden fixtures

Reuse the existing v0.7 mock so no new fixture app is needed:

- **`fixtures/mock-api/openapi.yaml`** — already present (used by CONTRACT_DRIFT http fixtures). `extractOperations` and `feature-spec-prepare` unit tests load it directly.
- **`fixtures/golden-tickets-http/`** — unchanged; from-spec does not add classifier fixtures.
- **(Optional, deferrable) `fixtures/golden-eval/EVAL-010-feature-from-openapi/`** — a placeholder eval rubric shell (`meta.json` + minimal `golden/`) following the v0.5 EVAL-007 precedent. The rubric itself can land in a follow-up; v0.18 does not block on eval scoring.

---

## 9. Test plan

### 9.1 Unit — `packages/http/test/openapi/extract.test.ts`
- Flattens `fixtures/mock-api/openapi.yaml` into the expected operation count.
- Deterministic ordering: two calls produce byte-identical JSON.
- Filters: by `tag`, by `operationId`, by `path`; union semantics across dimensions; empty filter = all.
- `extractInfo` returns `{ title, version }`; tolerates a spec missing `info` (defaults).
- Operations missing `operationId` / `tags` / `requestBody` handled without throwing (optional fields omitted, not `undefined`).

### 9.2 Unit — `packages/core/test/bin-internal/feature-spec-prepare.test.ts`
- Happy path: writes `spec-input.json` + `story.md` + `meta.json` with `source:'openapi'`, `adapter:'http'`, matching `spec_hash`/`story_hash`.
- Idempotency: second run with unchanged spec prints "current" and does not rewrite (assert mtime / content stable).
- Drift: changing the spec (or filter) changes `spec_hash` and rewrites.
- Filter application + the "filter matched no operations" empty path.
- No-spec-configured and unreachable-spec paths: `operations: []` + `reason`, exit 0, no throw.
- Invalid key → caught (exit 4) via `run()`.
- `afterEach` restores `process.cwd()` (golden-tickets cwd-sensitivity reflex).

### 9.3 Prompt governance
- `packages/core/test/bin-internal/verify-prompts.test.ts`: extend `seedPrompts` with a valid `feature-from-openapi.md`; assert it is in scope.
- `packages/core/test/bin-internal/doctor.test.ts`: extend `seedGoodRepo` similarly so doctor's verify-prompts pass still holds.

### 9.4 Integration
- Extend the http integration suite: run `feature-spec-prepare API-PETS-001` against `fixtures/mock-api/openapi.yaml`, assert artifacts, then run `xera:validate-feature` against a committed golden `test.feature` fixture (deterministic — feature *generation* is LLM-driven and excluded from CI; we validate the *prepare* output + that a representative feature validates).

### 9.5 CLI
- `packages/cli/test/`: assert `xera init --shape api` scaffolds the `xera:feature-spec-prepare` script; `--shape web` does not.

---

## 10. Migration & back-compat

- **No breaking change.** The story-based `/xera-feature TICKET` path is untouched; `--from-spec` is purely additive.
- `meta.json` gains an optional `spec_hash` and a new `source` enum value `'openapi'`. Existing `meta.json` files (no `spec_hash`, `source` absent or `jira`/`local`) parse unchanged — `MetaJsonSchema` keeps both fields optional. Older xera versions reading a from-spec `meta.json` would reject the unknown `source` value; this is forward-incompat only (new artifacts on old binaries), acceptable since artifacts and binary ship together.
- **Documented invariant:** the synthetic `story.md` frontmatter shape (`ticketId`, `summary`, `storyHash`, `acceptanceCriteria`, `acceptanceCriteriaSource`) must stay byte-compatible with `fetch.ts:renderStory` output so story-readers (doctor, graph, coverage) need no branching. A test asserts the two renderers emit the same frontmatter keys.

---

## 11. Risks & mitigations

| Risk | Mitigation |
|---|---|
| Huge specs → unwieldy mega-feature, slow/expensive generation. | Skill warns + suggests `--tag`/`--operation`/`--path` filtering above 20 operations. Filters are first-class. |
| `extractOperations` non-determinism breaks `spec_hash` drift-skip. | Strict sorting (paths, methods, params, responses); no time/random/env; unit test asserts byte-stable output across two calls. |
| Core `OpenAPIDocument` type too narrow for extraction. | Extraction reads the deref'd doc under its own loose local shape; the shared classifier type is left unchanged. |
| Remote-URL spec injection via descriptions/examples. | v0.3 nonce-wrap + `feature-from-openapi.md` refusal rules (§6). |
| Generated API Gherkin doesn't map cleanly to `script-from-feature-http.md`. | Steps phrased as request/status/schema assertions — the same vocabulary `script-from-feature-http.md` already expects from http tickets. Integration test exercises the chain. |
| Consumers scaffold a prompts version missing the new template. | Non-issue: the consumer pins `@xera-ai/prompts` to `^${CLI_VERSION}` (lockstep `fixed` group), so the changeset bump ships the new prompt automatically. |

---

## 12. Resolved decisions

1. **`--from-spec` is a mode of `/xera-feature`, not a new skill.** Matches the roadmap phrasing and reuses the prompt-pointer + validate-feature plumbing the skill already owns.
2. **Caller supplies `<KEY>`.** Stability of the artifact dir + graph node id outweighs the convenience of auto-generation (§1.5).
3. **Dedicated `feature-from-openapi.md` prompt.** API Gherkin and UI Gherkin have incompatible step vocabularies (§1.4).
4. **Binary stays LLM-free; story.md is synthetic but real-shaped.** Honors the skill↔binary determinism boundary; keeps downstream tools unmodified.
5. **`spec_hash` reuses the `story_hash` drift slot.** No new feature-drift meta field; the synthetic story's `storyHash` is the `spec_hash`.
6. **Reuse `fixtures/mock-api/openapi.yaml`.** No new mock target.

---

## 13. Roadmap context

What v0.18 unlocks / relates to:

- **Next-plan #4 (AGENTS.md scaffolding)** is independent and can land in parallel.
- **Next-plan #1 (CONTRACT_DRIFT on web traces + heal)** is unaffected; from-spec produces http tickets that already flow through the v0.7 CONTRACT_DRIFT classifier on execution.
- **v1.0 cross-adapter graph linkage** (endpoint as first-class node): once endpoints are graph nodes, `feature-spec-prepare` could attach `satisfies`/`covers` edges from generated scenarios to endpoint nodes — but that is explicitly out of scope here; v0.18 treats the OpenAPI-derived ticket as an ordinary `ticket` node.
