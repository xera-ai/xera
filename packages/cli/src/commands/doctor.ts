import { existsSync } from 'node:fs';
import { NdjsonLogger, resolveArtifactPaths } from '@xera-ai/core';
import pc from 'picocolors';
import { runChecks } from '../checks';

export async function doctorCommand(opts: {
  strict?: string;
  logs?: string;
  usage?: boolean;
}): Promise<number> {
  const cwd = process.cwd();

  if (opts.logs) {
    const paths = resolveArtifactPaths(cwd, opts.logs);
    if (!existsSync(paths.logPath)) {
      console.log(`No log at ${paths.logPath}`);
      return 0;
    }
    for (const entry of NdjsonLogger.readAll(paths.logPath)) {
      console.log(`${entry.ts}  ${JSON.stringify(entry)}`);
    }
    return 0;
  }

  if (opts.usage) {
    console.log(
      'Token usage estimation requires log lines with tokens_in/tokens_out fields (added by skills).',
    );
    return 0;
  }

  const checks = await runChecks(cwd, opts.strict ? { ticket: opts.strict } : {});
  for (const c of checks) {
    const icon = c.ok ? pc.green('✓') : pc.red('✗');
    console.log(`${icon} ${c.name}${c.message ? pc.dim(` — ${c.message}`) : ''}`);
  }
  const allOk = checks.every((c) => c.ok);
  if (opts.strict) {
    return allOk ? 0 : 1;
  }
  return 0;
}
