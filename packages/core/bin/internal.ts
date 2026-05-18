#!/usr/bin/env bun
import { existsSync, readFileSync } from 'node:fs';
import { config, parse } from 'dotenv';
import { run } from '../src/bin-internal/index';

// xera canonicalizes on `.env` (gitignored; see `xera init`, `xera doctor`,
// scaffolded `.gitignore`). The Bun runtime auto-loads dotenv files BEFORE
// this script runs, and Bun's precedence puts `.env.local` ahead of `.env` —
// so a stale value in `.env.local` would silently override the canonical
// value in `.env` (issue #92, post-#103 followup).
//
// Mitigation: warn when `.env.local` exists AND surgically force `.env`'s
// values to win for any key present in both files. We touch only keys
// already in `.env.local` so shell-injected and CI-injected env vars
// (which the user did not put in `.env.local`) stay untouched.
if (existsSync('.env.local')) {
  console.error(
    '\nwarning: .env.local detected — xera uses .env as the canonical source. ' +
      'Values in .env will be forced to win for any key in both files; ' +
      'merge values into .env and delete .env.local to silence this warning.\n',
  );
  if (existsSync('.env')) {
    const localKeys = Object.keys(parse(readFileSync('.env.local')));
    const envValues = parse(readFileSync('.env'));
    for (const k of localKeys) {
      const v = envValues[k];
      if (v !== undefined) process.env[k] = v;
    }
  }
}
// Safety net for non-Bun invocations (Bun already auto-loaded `.env`).
config();

const code = await run(process.argv.slice(2));
process.exit(code);
