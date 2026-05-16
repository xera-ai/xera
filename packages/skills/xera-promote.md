---
name: xera-promote
description: Promote a Page Object Model from a single ticket's .xera/<TICKET>/page-objects/ to shared/page-objects/ so other tests can reuse it. Use when QA notices a POM is generally useful.
---

The user invoked `/xera-promote <TICKET> <PomClassName>`.

1. Verify `.xera/<TICKET>/page-objects/<PomClassName>.ts` exists. If not, list available POMs in that directory and ask the user to pick.

2. Check `shared/page-objects/<PomClassName>.ts`:
   - If it does NOT exist → safe to promote.
   - If it exists with identical content → just delete the ticket-local copy and update the import (run `bun run xera:promote {{TICKET}} {{POM}}` will refuse; manually delete with the user's confirmation).
   - If it exists with different content → STOP. Show a unified diff. Ask the user to reconcile manually.

3. Run: `bun run xera:promote {{TICKET}} {{POM}}`
   - This moves the file and rewrites the import in `.xera/{{TICKET}}/spec.ts`.

4. Run `bun run xera:typecheck {{TICKET}}` to confirm nothing broke. If errors, surface them.

5. Suggest the user commit the changes:
   ```
   git add shared/page-objects/{{POM}}.ts .xera/{{TICKET}}/
   git commit -m "tests: promote {{POM}} from {{TICKET}}"
   ```

## Step 6 — Record graph events (v0.6)

```bash
bun run xera:graph-record promote --pom-id <ID> --from <OLD> --to <NEW>
```

`<ID>` is the sha1 of the POM filename basename (the bin-internal can compute this if `--pom-id` is omitted). Non-fatal.
