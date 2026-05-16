---
'@xera-ai/core': patch
'@xera-ai/cli': patch
---

load dotenv at xera-internal entry point so all subcommands have env vars; revert dotenv from playwright.config.ts templates
