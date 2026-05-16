---
'@xera-ai/cli': patch
---

load .env.local then .env in playwright.config.ts so credentials are available to Playwright
