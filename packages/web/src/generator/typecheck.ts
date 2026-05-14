import { spawnSync } from 'node:child_process';

export interface TypecheckResult {
  ok: boolean;
  errors: string[];
}

export async function typecheckTicket(ticketDir: string): Promise<TypecheckResult> {
  const proc = spawnSync('npx', ['tsc', '--noEmit', '--project', ticketDir], { encoding: 'utf8' });
  if (proc.status === 0) return { ok: true, errors: [] };
  const out = (proc.stdout || '') + (proc.stderr || '');
  const errors = out.split('\n').filter(line => /error TS\d+/.test(line));
  return { ok: false, errors };
}
