import { existsSync, readFileSync } from 'node:fs';
import { config, parse } from 'dotenv';

// xera canonicalizes on `.env` (gitignored; see `xera init`, `xera doctor`,
// scaffolded `.gitignore`). When a legacy `.env.local` also exists, force
// `.env`'s values to win for any key present in both files — otherwise a stale
// `.env.local` would silently mask the canonical `.env` value (issue #92).
// We touch only keys already in `.env.local` so shell-injected and CI-injected
// env vars (which the user did not put in `.env.local`) stay untouched.
export function loadEnv(): void {
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
  config();
}
