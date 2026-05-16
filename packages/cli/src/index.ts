import { cac } from 'cac';
import pc from 'picocolors';
import { doctorCommand } from './commands/doctor';
import { initCommand, type ProjectShape } from './commands/init';
import { initUpdateCommand } from './commands/init-update';

const VERSION = '0.1.0';

const VALID_SHAPES: ProjectShape[] = ['web', 'api', 'mixed'];

export default async function main(): Promise<void> {
  const cli = cac('xera');
  cli.help();
  cli.version(VERSION);

  cli
    .command('init', 'Scaffold a new xera project in the current directory')
    .option('--update', 'Non-destructive refresh of an existing project')
    .option('-y, --yes', 'Accept all defaults (non-interactive)')
    .option('--shape <shape>', 'Project shape: web | api | mixed')
    .action(async (opts: { update?: boolean; yes?: boolean; shape?: string }) => {
      if (opts.update) {
        await initUpdateCommand({ yes: !!opts.yes });
        return;
      }
      const initOpts: { yes: boolean; shape?: ProjectShape } = { yes: !!opts.yes };
      if (opts.shape !== undefined) {
        if (!(VALID_SHAPES as string[]).includes(opts.shape)) {
          console.error(pc.red(`[xera] --shape must be one of: ${VALID_SHAPES.join(', ')}`));
          process.exit(1);
        }
        initOpts.shape = opts.shape as ProjectShape;
      }
      await initCommand(initOpts);
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
