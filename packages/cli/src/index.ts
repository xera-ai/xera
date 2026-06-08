import { createRequire } from 'node:module';
import { ensureTsRuntime } from '@xera-ai/core';
import { cac } from 'cac';
import pc from 'picocolors';
import { type DashboardOptions, dashboardCommand } from './commands/dashboard';
import { doctorCommand } from './commands/doctor';
import {
  type HttpAuthStrategy,
  type InitOptions,
  initCommand,
  type ProjectShape,
} from './commands/init';
import { type InitUpdateOptions, initUpdateCommand } from './commands/init-update';
import { samplesRemoveCommand } from './commands/samples';
import { showReportCommand } from './commands/show-report';

const require = createRequire(import.meta.url);
const VERSION = (require('../package.json') as { version: string }).version;

const VALID_SHAPES: ProjectShape[] = ['web', 'api', 'mixed'];
const VALID_AUTH_STRATEGIES: HttpAuthStrategy[] = [
  'bearer',
  'apiKey',
  'basic',
  'oauth-cc',
  'custom',
  'none',
  'reuse-web-session',
];
const KNOWN_COMMANDS = ['init', 'doctor', 'samples', 'show-report', 'dashboard'];

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
  // Re-exec with a TS loader on Node versions that can't import xera.config.ts
  // natively, before any command (notably `doctor`) tries to load it. (#203)
  const reexecCode = ensureTsRuntime();
  if (reexecCode !== null) process.exit(reexecCode);

  const cli = cac('xera');
  cli.help();
  cli.version(VERSION);
  cli.usage('<command> [options]');

  cli
    .command('init', 'Scaffold a new xera project in the current directory')
    .option('--update', 'Non-destructive refresh of an existing project')
    .option('-y, --yes', 'Accept all defaults (non-interactive)')
    .option('--shape <shape>', 'Project shape: web | api | mixed')
    .option('--tracker <tracker>', 'Issue tracker: jira | github (default: jira)')
    .option(
      '--editor <list>',
      'Editor(s) to scaffold: claude,cursor,codex or "all" (default: auto-detect or all)',
    )
    // Jira flags (used when --tracker jira, the default)
    .option('--ju, --jira-base-url <url>', 'Jira workspace URL')
    .option('--pk, --project-keys <keys>', 'Jira project key(s), comma-separated')
    .option('--sf, --story-field <field>', 'Jira field id for user story (default: description)')
    .option('--ac, --ac-field <field>', 'Jira field id for acceptance criteria')
    // GitHub flags (used when --tracker github)
    .option('--gr, --github-repo <owner/repo>', 'GitHub repository for the github tracker')
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
    // Sample tickets (opt-in)
    .option(
      '--samples',
      'Scaffold sample ticket(s) under .xera/SAMPLE-001/ (web) or .xera/SAMPLE-HTTP-001/ (api) so /xera-run works out of the box',
    )
    .example('xera init')
    .example('xera init -y --shape web')
    .example('xera init -y --shape web --editor claude,cursor')
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
        tracker?: string;
        editor?: string;
        jiraBaseUrl?: string;
        projectKeys?: string;
        storyField?: string;
        acField?: string;
        githubRepo?: string;
        stagingUrl?: string;
        authEnabled?: boolean;
        roles?: string;
        apiBaseUrl?: string;
        openapiPath?: string;
        authStrategy?: string;
        httpRoles?: string;
        samples?: boolean;
      }) => {
        if (opts.update) {
          const updateOpts: InitUpdateOptions = { yes: !!opts.yes };
          if (opts.shape !== undefined) {
            if (!(VALID_SHAPES as string[]).includes(opts.shape)) {
              console.error(
                pc.red(`\n  error: --shape must be one of: ${VALID_SHAPES.join(', ')}\n`),
              );
              process.exit(1);
            }
            updateOpts.shape = opts.shape as ProjectShape;
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
            updateOpts.authStrategy = opts.authStrategy as HttpAuthStrategy;
          }
          if (opts.apiBaseUrl !== undefined) updateOpts.apiBaseUrl = opts.apiBaseUrl;
          if (opts.openapiPath !== undefined) updateOpts.openapiPath = opts.openapiPath;
          if (opts.httpRoles !== undefined) updateOpts.httpRoles = opts.httpRoles;
          if (opts.stagingUrl !== undefined) updateOpts.stagingUrl = opts.stagingUrl;
          // `--auth-enabled` is declared with a `--no-` counterpart, so cac
          // defaults `opts.authEnabled` to `true` even when the user passed
          // neither form. Gate on actual argv presence so init --update can
          // tell "user opted in" from "user said nothing" (issue #186).
          const authEnabledExplicit = process.argv.some(
            (a) => a === '--auth-enabled' || a === '--no-auth-enabled',
          );
          if (authEnabledExplicit && opts.authEnabled !== undefined) {
            updateOpts.authEnabled = opts.authEnabled;
          }
          if (opts.roles !== undefined) updateOpts.roles = opts.roles;
          if (opts.editor !== undefined) updateOpts.editor = opts.editor;
          await initUpdateCommand(updateOpts);
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
        if (opts.tracker !== undefined) {
          if (opts.tracker !== 'jira' && opts.tracker !== 'github') {
            console.error(pc.red('\n  error: --tracker must be "jira" or "github"\n'));
            process.exit(1);
          }
          initOpts.tracker = opts.tracker as 'jira' | 'github';
        }
        if (opts.jiraBaseUrl !== undefined) initOpts.jiraBaseUrl = opts.jiraBaseUrl;
        if (opts.projectKeys !== undefined) initOpts.projectKeys = opts.projectKeys;
        if (opts.storyField !== undefined) initOpts.storyField = opts.storyField;
        if (opts.acField !== undefined) initOpts.acField = opts.acField;
        if (opts.githubRepo !== undefined) initOpts.githubRepo = opts.githubRepo;
        if (opts.stagingUrl !== undefined) initOpts.stagingUrl = opts.stagingUrl;
        if (opts.authEnabled !== undefined) initOpts.authEnabled = opts.authEnabled;
        if (opts.roles !== undefined) initOpts.roles = opts.roles;
        if (opts.apiBaseUrl !== undefined) initOpts.apiBaseUrl = opts.apiBaseUrl;
        if (opts.openapiPath !== undefined) initOpts.openapiPath = opts.openapiPath;
        if (opts.httpRoles !== undefined) initOpts.httpRoles = opts.httpRoles;
        if (opts.editor !== undefined) initOpts.editor = opts.editor;
        if (opts.samples !== undefined) initOpts.samples = opts.samples;
        await initCommand(initOpts);
      },
    );

  cli
    .command('samples <action>', 'Manage scaffolded sample tickets (action: remove)')
    .option('-y, --yes', 'Skip confirmation; remove all installed samples')
    .action(async (action: string, opts: { yes?: boolean }) => {
      if (action !== 'remove') {
        console.error(pc.red(`\n  error: Unknown samples action '${action}'. Supported: remove\n`));
        process.exit(1);
      }
      const exit = await samplesRemoveCommand({ yes: !!opts.yes });
      process.exit(exit);
    });

  cli
    .command('doctor', 'Run a health check')
    .option(
      '--strict [ticket]',
      'Exit non-zero on any failing check; pass a ticket key to add ticket-specific checks',
    )
    .option('--logs <ticket>', 'Pretty-print xera.log for a ticket')
    .option('--usage', 'Show token/usage summary from recent runs')
    .action(async (opts: { strict?: string | boolean; logs?: string; usage?: boolean }) => {
      const exit = await doctorCommand(opts);
      process.exit(exit);
    });

  cli
    .command('show-report <ticket>', "Serve a run's Playwright HTML report in the browser")
    .option('--run <id>', 'Specific run id (default: latest)')
    .option('--host <host>', 'Bind host (default: 127.0.0.1)')
    .option('--port <port>', 'Bind port (default: 9323)')
    .example('xera show-report XFB-9')
    .example('xera show-report XFB-9 --run 2026-06-05T11-22-33')
    .action(async (ticket: string, opts: { run?: string; host?: string; port?: string }) => {
      const exit = await showReportCommand({
        ticket,
        ...(opts.run !== undefined && { run: opts.run }),
        ...(opts.host !== undefined && { host: opts.host }),
        ...(opts.port !== undefined && { port: opts.port }),
      });
      process.exit(exit);
    });

  cli
    .command('dashboard', 'Cross-ticket dashboard of latest test results')
    .option('--since <duration>', 'Filter recent failures (e.g. 24h, 7d)')
    .option('--classification <class>', 'Filter by classification (repeatable)')
    .option('--area <slug>', 'Filter to areas (repeatable)')
    .option('--failing-only', 'Drop PASS + NEVER_RUN rows')
    .option('--json', 'Emit JSON snapshot to stdout')
    .option('--html [path]', 'Write HTML to <path> (default .xera/dashboard.html)')
    .option('--serve', 'Serve HTML at 127.0.0.1:9323 and open browser')
    .option('--port <port>', 'Serve port (default: 9323)')
    .example('xera dashboard')
    .example('xera dashboard --failing-only --since 24h')
    .example('xera dashboard --serve')
    .action(
      async (opts: {
        since?: string;
        classification?: string | string[];
        area?: string | string[];
        failingOnly?: boolean;
        json?: boolean;
        html?: string | boolean;
        serve?: boolean;
        port?: string;
      }) => {
        const dashOpts: DashboardOptions = {};
        if (opts.since !== undefined) dashOpts.since = opts.since;
        if (opts.classification !== undefined) {
          dashOpts.classification = Array.isArray(opts.classification)
            ? opts.classification
            : [opts.classification];
        }
        if (opts.area !== undefined) {
          dashOpts.area = Array.isArray(opts.area) ? opts.area : [opts.area];
        }
        if (opts.failingOnly !== undefined) dashOpts.failingOnly = opts.failingOnly;
        if (opts.json !== undefined) dashOpts.json = opts.json;
        if (opts.html !== undefined) dashOpts.html = opts.html;
        if (opts.serve !== undefined) dashOpts.serve = opts.serve;
        if (opts.port !== undefined) dashOpts.port = opts.port;
        const exit = await dashboardCommand(dashOpts);
        process.exit(exit);
      },
    );

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
