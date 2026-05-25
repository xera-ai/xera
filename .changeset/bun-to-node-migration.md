---
'@xera-ai/cli': minor
'@xera-ai/core': minor
'@xera-ai/web': minor
'@xera-ai/http': minor
'@xera-ai/prompts': minor
'@xera-ai/skills': minor
---

Migrate the toolchain from Bun to Node.js + Vitest + npm. Published bins now use a `node` shebang and the runtime no longer depends on Bun APIs (Node >=22 required); builds use tsup. End-user workflows — skills, `xera init` scaffolding, `doctor`, and the graph-viewer CI template — now invoke `npx xera-internal` and npm instead of `bun run xera:*`.
