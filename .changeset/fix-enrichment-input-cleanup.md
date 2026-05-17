---
"@xera-ai/core": patch
"@xera-ai/skills": patch
---

fix(core,skills): `xera:graph-enrich` now checks the graph snapshot before the input file (so an un-fetched candidate gets the actionable `/xera-fetch <TICKET>` hint), and deletes `enrichment-input.json` after a successful enrich so stray re-invocations can't replay stale LLM output. The `/xera-report` lazy-similarity step now pre-validates the candidate is in the graph and notes that the Write tool auto-creates the candidate directory.
