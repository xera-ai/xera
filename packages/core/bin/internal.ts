#!/usr/bin/env bun
import { config } from 'dotenv';
import { run } from '../src/bin-internal/index';

// Load .env.local (secrets, gitignored) then .env (defaults) so every
// xera-internal subcommand has access to credentials without requiring
// the caller to pre-load env.
config({ path: '.env.local' });
config();

const code = await run(process.argv.slice(2));
process.exit(code);
