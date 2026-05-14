import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';

export interface TypecheckResult {
  ok: boolean;
  errors: string[];
}

/**
 * Walks up from `start` looking for the first `tsconfig.json`. Returns null if
 * none is found before reaching the filesystem root.
 */
function findNearestTsconfig(start: string): string | null {
  let dir = start;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const candidate = join(dir, 'tsconfig.json');
    if (existsSync(candidate)) return candidate;
    const parent = dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

/**
 * Type-check the ticket's TypeScript files using the project's root tsconfig.
 * Errors are filtered to those whose path contains the ticket directory, so the
 * skill sees only the locally relevant ones.
 */
export async function typecheckTicket(ticketDir: string): Promise<TypecheckResult> {
  const tsconfig = findNearestTsconfig(ticketDir);
  if (!tsconfig) {
    return {
      ok: false,
      errors: [
        `No tsconfig.json found walking up from ${ticketDir}. Run \`xera init\` to scaffold one at the project root.`,
      ],
    };
  }

  const proc = spawnSync('npx', ['tsc', '--noEmit', '-p', tsconfig], { encoding: 'utf8' });
  if (proc.status === 0) return { ok: true, errors: [] };

  const out = `${proc.stdout ?? ''}${proc.stderr ?? ''}`;
  const allErrors = out.split('\n').filter((line) => /error TS\d+/.test(line));
  // Keep errors that originate inside the ticket dir; if none match, fall back
  // to all errors so callers don't see "ok" for a broken root.
  const ticketErrors = allErrors.filter((line) => line.includes(ticketDir));
  return {
    ok: false,
    errors: ticketErrors.length > 0 ? ticketErrors : allErrors,
  };
}
