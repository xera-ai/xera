---
'@xera-ai/cli': patch
'@xera-ai/core': patch
'@xera-ai/skills': patch
---

core,cli,skills: strict config schema + remove unwired `testOutdated` config docs

- `XeraConfigSchema` is now `strictObject` and rejects unknown top-level keys instead of silently stripping them. This surfaces config typos and aspirational keys (e.g. `testOutdated`, `report`) at parse time with a clear Zod error (#94).
- Docs (`CONFIGURATION.md`, `TROUBLESHOOTING.md`) and the `/xera-report` skill no longer reference the unwired `testOutdated.threshold` / `report.testOutdatedNotify` keys; those tuning hooks are tracked for a future release.
- Followup to #95 / #92: the http-only `.env.example` template comment now references `.env` (the canonical filename) instead of `.env.local`.
