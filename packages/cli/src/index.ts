import { createRequire } from 'node:module';
import { cac } from 'cac';
import pc from 'picocolors';
import { doctorCommand } from './commands/doctor';
import {
  type HttpAuthStrategy,
  type InitOptions,
  initCommand,
  type ProjectShape,
} from './commands/init';
import { initUpdateCommand } from './commands/init-update';

const require = createRequire(import.meta.url);
const VERSION = (require('../package.json') as { version: string }).version;

const VALID_SHAPES: ProjectShape[] = ['web', 'api', 'mixed'];
const VALID_AUTH_STRATEGIES: HttpAuthStrategy[] = ['bearer', 'apiKey', 'basic', 'oauth-cc', 'none'];
const KNOWN_COMMANDS = ['init', 'doctor'];

function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, (_, i) =>
    Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)),
  );
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i]![j]! =
        a[i - 1] === b[j - 1]
          ? dp[i - 1]![j - 1]!
          : 1 + Math.min(dp[i - 1]![j]!, dp[i]![j - 1]!, dp[i - 1]![j - 1]!);
    }
  }
  return dp[m]![n]!;
}

function didYouMean(input: string): string | undefined {
  let best: string | undefined;
  let bestDist = Number.POSITIVE_INFINITY;
  for (const cmd of KNOWN_COMMANDS) {
    const d = levenshtein(input.toLowerCase(), cmd);
    if (d < bestDist) {
      bestDist = d;
      best = cmd;
    }
  }
  return bestDist <= 3 ? best : undefined;
}

function unknownCommand(input: string): never {
  console.error(pc.red(`\n  error: Unknown command '${input}'\n`));
  const suggestion = didYouMean(input);
  if (suggestion) {
    console.error(`  Did you mean ${pc.cyan(suggestion)}?\n`);
  }
  console.error(`  Run ${pc.cyan('xera --help')} to see available commands.\n`);
  process.exit(1);
}

export default async function main(): Promise<void> {
  const cli = cac('xera');
  cli.help();
  cli.version(VERSION);
  cli.usage('<command> [options]');

  cli
    .command('init', 'Scaffold a new xera project in the current directory')
    .option('--update', 'Non-destructive refresh of an existing project')
    .option('-y, --yes', 'Accept all defaults (non-interactive)')
    .option('--shape <shape>', 'Project shape: web | api | mixed')
    // Jira flags
    .option('--ju, --jira-base-url <url>', 'Jira workspace URL')
    .option('--pk, --project-keys <keys>', 'Jira project key(s), comma-separated')
    .option('--sf, --story-field <field>', 'Jira field id for user story (default: description)')
    .option('--ac, --ac-field <field>', 'Jira field id for acceptance criteria')
    // Web flags
    .option('--su, --staging-url <url>', 'Web app staging URL')
    .option('--auth-enabled', 'App requires login to test most pages')
    .option('--no-auth-enabled', 'App does not require login')
    .option('--ro, --roles <roles>', 'Test user roles, comma-separated (default: admin,regular)')
    // HTTP flags
    .option('--au, --api-base-url <url>', 'API base URL')
    .option('--op, --openapi-path <path>', 'OpenAPI spec path or URL')
    .option(
      '--as, --auth-strategy <strategy>',
      `API auth strategy: ${VALID_AUTH_STRATEGIES.join(' | ')}`,
    )
    .option('--hr, --http-roles <roles>', 'HTTP test roles, comma-separated (default: user)')
    .example('xera init')
    .example('xera init -y --shape web')
    .example(
      'xera init -y --shape api --pk MYPROJ --ju https://myco.atlassian.net --au https://api.staging.example.com --as bearer',
    )
    .example(
      'xera init -y --shape mixed --pk PROJ --ju https://myco.atlassian.net --su https://staging.example.com --au https://api.staging.example.com',
    )
    .action(
      async (opts: {
        update?: boolean;
        yes?: boolean;
        shape?: string;
        jiraBaseUrl?: string;
        projectKeys?: string;
        storyField?: string;
        acField?: string;
        stagingUrl?: string;
        authEnabled?: boolean;
        roles?: string;
        apiBaseUrl?: string;
        openapiPath?: string;
        authStrategy?: string;
        httpRoles?: string;
      }) => {
        if (opts.update) {
          await initUpdateCommand({ yes: !!opts.yes });
          return;
        }
        const initOpts: InitOptions = { yes: !!opts.yes };
        if (opts.shape !== undefined) {
          if (!(VALID_SHAPES as string[]).includes(opts.shape)) {
            console.error(
              pc.red(`\n  error: --shape must be one of: ${VALID_SHAPES.join(', ')}\n`),
            );
            process.exit(1);
          }
          initOpts.shape = opts.shape as ProjectShape;
        }
        if (opts.authStrategy !== undefined) {
          if (!(VALID_AUTH_STRATEGIES as string[]).includes(opts.authStrategy)) {
            console.error(
              pc.red(
                `\n  error: --auth-strategy must be one of: ${VALID_AUTH_STRATEGIES.join(', ')}\n`,
              ),
            );
            process.exit(1);
          }
          initOpts.authStrategy = opts.authStrategy as HttpAuthStrategy;
        }
        if (opts.jiraBaseUrl !== undefined) initOpts.jiraBaseUrl = opts.jiraBaseUrl;
        if (opts.projectKeys !== undefined) initOpts.projectKeys = opts.projectKeys;
        if (opts.storyField !== undefined) initOpts.storyField = opts.storyField;
        if (opts.acField !== undefined) initOpts.acField = opts.acField;
        if (opts.stagingUrl !== undefined) initOpts.stagingUrl = opts.stagingUrl;
        if (opts.authEnabled !== undefined) initOpts.authEnabled = opts.authEnabled;
        if (opts.roles !== undefined) initOpts.roles = opts.roles;
        if (opts.apiBaseUrl !== undefined) initOpts.apiBaseUrl = opts.apiBaseUrl;
        if (opts.openapiPath !== undefined) initOpts.openapiPath = opts.openapiPath;
        if (opts.httpRoles !== undefined) initOpts.httpRoles = opts.httpRoles;
        await initCommand(initOpts);
      },
    );

  cli
    .command('doctor', 'Run a health check')
    .option('--strict <ticket>', 'Treat ticket-specific checks as required')
    .option('--logs <ticket>', 'Pretty-print xera.log for a ticket')
    .option('--usage', 'Show token/usage summary from recent runs')
    .action(async (opts: { strict?: string; logs?: string; usage?: boolean }) => {
      const exit = await doctorCommand(opts);
      process.exit(exit);
    });

  const rawArgs = process.argv.slice(2);

  // No args → show help
  if (rawArgs.length === 0) {
    cli.outputHelp();
    process.exit(0);
  }

  // Unknown command detection (first arg is not a flag and not a known command)
  const firstArg = rawArgs[0]!;
  if (!firstArg.startsWith('-') && !KNOWN_COMMANDS.includes(firstArg)) {
    unknownCommand(firstArg);
  }

  try {
    cli.parse(process.argv, { run: false });
    await cli.runMatchedCommand();
  } catch (e) {
    console.error(pc.red(`\n  error: ${(e as Error).message}\n`));
    process.exit(1);
  }
}
