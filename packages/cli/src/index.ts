import { cac } from 'cac';
import pc from 'picocolors';
import { initCommand } from './commands/init';
import { initUpdateCommand } from './commands/init-update';
import { doctorCommand } from './commands/doctor';

const VERSION = '0.1.0';

export default async function main(): Promise<void> {
  const cli = cac('xera');
  cli.help();
  cli.version(VERSION);

  cli
    .command('init', 'Scaffold a new xera project in the current directory')
    .option('--update', 'Non-destructive refresh of an existing project')
    .option('-y, --yes', 'Accept all defaults (non-interactive)')
    .action(async (opts: { update?: boolean; yes?: boolean }) => {
      if (opts.update) await initUpdateCommand({ yes: !!opts.yes });
      else await initCommand({ yes: !!opts.yes });
    });

  cli
    .command('doctor', 'Run a health check')
    .option('--strict <ticket>', 'Treat ticket-specific checks as required')
    .option('--logs <ticket>', 'Pretty-print xera.log for a ticket')
    .option('--usage', 'Show token/usage summary from recent runs')
    .action(async (opts: { strict?: string; logs?: string; usage?: boolean }) => {
      const exit = await doctorCommand(opts);
      process.exit(exit);
    });

  try {
    cli.parse(process.argv, { run: false });
    await cli.runMatchedCommand();
  } catch (e) {
    console.error(pc.red(`[xera] ${(e as Error).message}`));
    process.exit(1);
  }
}
