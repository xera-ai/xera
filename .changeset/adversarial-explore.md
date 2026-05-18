---
"@xera-ai/cli": minor
"@xera-ai/core": minor
"@xera-ai/web": minor
"@xera-ai/http": minor
"@xera-ai/prompts": minor
"@xera-ai/skills": minor
---

skills: add /xera-explore (experimental) — opt-in adversarial scenario generator beyond AC

Introduces `/xera-explore <TICKET>`, a QA-internal skill that proposes 5-10 adversarial Gherkin scenarios beyond the ticket's acceptance criteria (negative paths, boundaries, races, a11y, security smells, etc.). Output lands in `.xera/<TICKET>/explore.feature` (separate from `test.feature`) tagged `@adversarial` for selective execution. The skill is opt-in and NOT auto-chained from `/xera-run`.

- New prompt: `adversarial-scenarios.md` v0.1.0 — 8-category heuristic checklist, concrete-value rule, NONCE-wrapped untrusted input handling.
- New skill: `xera-explore.md` — interactive UX with two QA checkpoints (category focus + concrete concern hint, then per-proposal acceptance).
- New binaries: `explore-prepare`, `explore-finalize`.
- Status: experimental. No golden-eval coverage yet; no `xera.config.ts.explore` knobs yet (both deferred). Graph event emission deferred to next release.
