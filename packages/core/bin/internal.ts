#!/usr/bin/env bun
import { existsSync } from 'node:fs';
import { config } from 'dotenv';
import { run } from '../src/bin-internal/index';

// xera canonicalizes on `.env` (gitignored; see `xera init`, `xera doctor`,
// scaffolded `.gitignore`). Earlier versions also loaded `.env.local` first,
// which silently overrode `.env` when both files existed — see issue #92. We
// now load only `.env`; if `.env.local` is present, warn loudly so legacy
// users migrate rather than wondering why their values are ignored.
if (existsSync('.env.local')) {
  console.error(
    '\nwarning: .env.local detected but ignored. xera uses .env only — ' +
      'merge values from .env.local into .env and delete .env.local to silence this warning.\n',
  );
}
config();

const code = await run(process.argv.slice(2));
process.exit(code);
