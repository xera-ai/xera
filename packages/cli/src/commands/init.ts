import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import * as p from '@clack/prompts';
import { generateKey } from '@xera-ai/core';
import pc from 'picocolors';
import { scaffoldFile } from '../scaffold';

const require = createRequire(import.meta.url);
const CLI_VERSION = (require('../package.json') as { version: string }).version;

export type ProjectShape = 'web' | 'api' | 'mixed';
export type HttpAuthStrategy = 'bearer' | 'apiKey' | 'basic' | 'oauth-cc' | 'none';

export interface InitOptions {
  yes: boolean;
  shape?: ProjectShape;
  // Jira flags
  jiraBaseUrl?: string;
  projectKeys?: string;
  storyField?: string;
  acField?: string;
  // Web flags
  stagingUrl?: string;
  authEnabled?: boolean;
  roles?: string;
  // HTTP flags
  apiBaseUrl?: string;
  openapiPath?: string;
  authStrategy?: HttpAuthStrategy;
  httpRoles?: string;
}

function cancel(): never {
  p.cancel('Aborted.');
  process.exit(0);
}

async function prompt<T>(
  flag: T | undefined,
  defaultValue: T | undefined,
  ask: () => Promise<T | symbol>,
): Promise<T> {
  if (flag !== undefined) return flag;
  if (defaultValue !== undefined) return defaultValue;
  const val = await ask();
  if (typeof val === 'symbol') cancel();
  return val as T;
}

export async function initCommand(opts: InitOptions): Promise<void> {
  const cwd = process.cwd();

  // Non-TTY without --yes: prompts will hang — bail early with guidance
  if (!process.stdin.isTTY && !opts.yes) {
    console.error(pc.red('\n  error: stdin is not a TTY — interactive prompts cannot run.\n'));
    console.error(`  Pass ${pc.cyan('-y / --yes')} and use flags to run non-interactively:\n`);
    console.error(`    xera init -y --shape web --pk MYPROJ --ju https://myco.atlassian.net\n`);
    console.error(`  Run ${pc.cyan('xera init --help')} to see all available flags.\n`);
    process.exit(1);
  }

  p.intro(pc.cyan('xera — project setup'));

  // Determine shape first
  const shape: ProjectShape = await prompt<ProjectShape>(
    opts.shape,
    opts.yes ? 'web' : undefined,
    () =>
      p.select({
        message: 'What kind of testing does this project do?',
        initialValue: 'web' as ProjectShape,
        options: [
          { value: 'web', label: 'Web UI only (Playwright browser tests)' },
          { value: 'api', label: 'HTTP API only (REST/GraphQL endpoint tests, no browser)' },
          { value: 'mixed', label: 'Both (some UI tickets, some API tickets, in one repo)' },
        ],
      }) as Promise<ProjectShape | symbol>,
  );

  const wantsWeb = shape === 'web' || shape === 'mixed';
  const wantsHttp = shape === 'api' || shape === 'mixed';

  // Base (Jira) questions — all shapes
  const jiraBaseUrl = await prompt(
    opts.jiraBaseUrl,
    opts.yes ? 'https://example.atlassian.net' : undefined,
    () => p.text({ message: 'Jira workspace URL', placeholder: 'https://x.atlassian.net' }),
  );
  const projectKeys = await prompt(opts.projectKeys, opts.yes ? 'JIRA' : undefined, () =>
    p.text({ message: 'Jira project key(s) (comma-separated)', placeholder: 'JIRA' }),
  );
  const storyField = await prompt(opts.storyField, opts.yes ? 'description' : undefined, () =>
    p.text({ message: 'Jira field id for user story', initialValue: 'description' }),
  );
  const acceptanceCriteriaField = await prompt(opts.acField, opts.yes ? '' : undefined, () =>
    p.text({
      message: 'Jira field id for AC (leave empty if same as story)',
      initialValue: '',
    }),
  );

  // Web questions — only when wantsWeb
  let stagingUrl = '';
  let authEnabled = false;
  let roles = '';
  if (wantsWeb) {
    stagingUrl = await prompt(opts.stagingUrl, opts.yes ? 'http://localhost:3000' : undefined, () =>
      p.text({
        message: 'Web app staging URL',
        placeholder: 'https://staging.example.com',
      }),
    );
    authEnabled = await prompt(opts.authEnabled, opts.yes ? true : undefined, () =>
      p.confirm({ message: 'Does your app require login to test most pages?', initialValue: true }),
    );
    roles = await prompt(opts.roles, opts.yes ? 'admin,regular' : undefined, () =>
      p.text({ message: 'Test user roles (comma-separated)', initialValue: 'admin,regular' }),
    );
  }

  // HTTP questions — only when wantsHttp
  let apiBaseUrl = '';
  let openapiPath = '';
  let authStrategy: HttpAuthStrategy = 'none';
  let httpRoles = '';
  if (wantsHttp) {
    apiBaseUrl = await prompt(opts.apiBaseUrl, opts.yes ? 'http://localhost:4111' : undefined, () =>
      p.text({ message: 'API base URL', placeholder: 'https://api.staging.example.com' }),
    );
    openapiPath = await prompt(opts.openapiPath, opts.yes ? './openapi.yaml' : undefined, () =>
      p.text({
        message: 'OpenAPI spec path (relative or URL — leave empty to skip)',
        initialValue: './openapi.yaml',
      }),
    );
    authStrategy = await prompt<HttpAuthStrategy>(
      opts.authStrategy,
      opts.yes ? 'bearer' : undefined,
      () =>
        p.select({
          message: 'API auth strategy',
          initialValue: 'bearer' as HttpAuthStrategy,
          options: [
            { value: 'bearer', label: 'Bearer token (env var)' },
            { value: 'apiKey', label: 'API key (header)' },
            { value: 'basic', label: 'Basic auth (env vars)' },
            { value: 'oauth-cc', label: 'OAuth client_credentials' },
            { value: 'none', label: 'None / public API' },
          ],
        }) as Promise<HttpAuthStrategy | symbol>,
    );
    httpRoles = await prompt(opts.httpRoles, opts.yes ? 'user' : undefined, () =>
      p.text({ message: 'HTTP roles (comma-separated)', initialValue: 'user' }),
    );
  }

  const vars = {
    shape,
    wantsWeb,
    wantsHttp,
    jiraBaseUrl,
    projectKeys: projectKeys
      .split(',')
      .map((s: string) => s.trim())
      .filter(Boolean),
    storyField,
    acceptanceCriteriaField,
    stagingUrl,
    authEnabled,
    roles: roles
      ? roles
          .split(',')
          .map((s: string) => s.trim())
          .filter(Boolean)
      : [],
    apiBaseUrl,
    openapiPath,
    authStrategy,
    httpRoles: httpRoles
      ? httpRoles
          .split(',')
          .map((s: string) => s.trim())
          .filter(Boolean)
      : [],
    authKey: generateKey(),
  };

  // xera.config.ts — by shape
  const configTmpl =
    shape === 'web'
      ? 'xera.config.ts.tmpl'
      : shape === 'api'
        ? 'http-xera.config.ts.tmpl'
        : 'mixed-xera.config.ts.tmpl';
  scaffoldFile(join(cwd, 'xera.config.ts'), configTmpl, vars);

  // playwright.config.ts — api uses http-only template (no browser)
  const pwTmpl = shape === 'api' ? 'http-playwright.config.ts.tmpl' : 'playwright.config.ts.tmpl';
  scaffoldFile(join(cwd, 'playwright.config.ts'), pwTmpl, vars);

  scaffoldFile(join(cwd, 'tsconfig.json'), 'tsconfig.json.tmpl', vars);

  // env example — pick by shape
  if (shape === 'api') {
    scaffoldFile(join(cwd, '.env.example'), 'http-env.example.tmpl', vars);
  } else {
    scaffoldFile(join(cwd, '.env.example'), 'env.example.tmpl', vars);
  }

  // auth-setup.ts — scaffold if either adapter needs auth
  if (wantsWeb || wantsHttp) {
    scaffoldFile(join(cwd, 'shared/auth-setup.ts'), 'auth-setup.ts.tmpl', vars);
  }

  // Scaffold GitHub Actions viewer workflow (v0.6.3+)
  scaffoldFile(join(cwd, '.github/workflows/xera-graph.yml'), 'xera-graph.yml.template', vars);

  // openapi.yaml placeholder for api/mixed when a relative path is configured
  if (wantsHttp && vars.openapiPath && !vars.openapiPath.startsWith('http')) {
    const openapiTarget = join(cwd, vars.openapiPath);
    if (!existsSync(openapiTarget)) {
      scaffoldFile(openapiTarget, 'openapi.yaml.tmpl', vars);
    }
  }

  // .gitignore additions
  const gitignorePath = join(cwd, '.gitignore');
  const gitignoreAdditions = [
    '',
    '# xera',
    '.env',
    '.xera/**/runs/',
    '.xera/.auth/',
    '.xera/graph/snapshot.json',
    '.xera/cost-log.jsonl',
    'node_modules/',
  ].join('\n');
  if (existsSync(gitignorePath)) {
    const current = readFileSync(gitignorePath, 'utf8');
    if (!current.includes('# xera')) appendFileSync(gitignorePath, gitignoreAdditions);
  } else {
    writeFileSync(gitignorePath, `${gitignoreAdditions.trim()}\n`);
  }

  // Copy skill .md files from @xera-ai/skills into BOTH:
  //   .claude/skills/<name>/SKILL.md  — Claude Code's Skill tool discovery
  //                                     (REQUIRES the directory + SKILL.md
  //                                     layout; a flat .md is not discovered)
  //   .claude/commands/<name>.md      — Claude Code's slash-command discovery
  //                                     (flat .md file, becomes /<name>)
  const skillsPkgPath = require.resolve('@xera-ai/skills/package.json');
  const skillsSrcDir = join(skillsPkgPath, '..');
  const SKILL_IGNORE = new Set(['package.json', 'version.json', 'CHANGELOG.md']);
  for (const name of readdirSync(skillsSrcDir)) {
    if (SKILL_IGNORE.has(name)) continue;
    if (!name.endsWith('.md')) continue;
    const content = readFileSync(join(skillsSrcDir, name));
    const base = name.replace(/\.md$/, '');
    // Skill tool: directory + SKILL.md
    const skillFile = join(cwd, '.claude/skills', base, 'SKILL.md');
    mkdirSync(dirname(skillFile), { recursive: true });
    writeFileSync(skillFile, content);
    // Slash command: flat .md
    const cmdFile = join(cwd, '.claude/commands', name);
    mkdirSync(dirname(cmdFile), { recursive: true });
    writeFileSync(cmdFile, content);
  }

  // Add npm scripts
  const pkgPath = join(cwd, 'package.json');
  const pkg = existsSync(pkgPath)
    ? JSON.parse(readFileSync(pkgPath, 'utf8'))
    : { name: 'xera-project', private: true, type: 'module' };
  pkg.scripts = pkg.scripts ?? {};
  // Core workflow (all shapes)
  pkg.scripts['xera:fetch'] = 'xera-internal fetch';
  pkg.scripts['xera:validate-feature'] = 'xera-internal validate-feature';
  pkg.scripts['xera:typecheck'] = 'xera-internal typecheck';
  pkg.scripts['xera:lint'] = 'xera-internal lint';
  pkg.scripts['xera:exec'] = 'xera-internal exec';
  pkg.scripts['xera:normalize'] = 'xera-internal normalize';
  pkg.scripts['xera:report'] = 'xera-internal report';
  pkg.scripts['xera:post'] = 'xera-internal post';
  pkg.scripts['xera:status'] = 'xera-internal status';
  pkg.scripts['xera:unlock'] = 'xera-internal unlock';
  pkg.scripts['xera:promote'] = 'xera-internal promote';
  pkg.scripts['xera:auth-setup'] = 'xera-internal auth-setup';
  // Graph
  pkg.scripts['xera:graph-record'] = 'xera-internal graph-record';
  pkg.scripts['xera:graph-snapshot'] = 'xera-internal graph-snapshot';
  pkg.scripts['xera:graph-query'] = 'xera-internal graph-query';
  pkg.scripts['xera:graph-backfill'] = 'xera-internal graph-backfill';
  pkg.scripts['xera:graph-enrich'] = 'xera-internal graph-enrich';
  pkg.scripts['xera:graph-render'] = 'xera-internal graph-render';
  // Impact / heal / disputes
  pkg.scripts['xera:impact-prepare'] = 'xera-internal impact-prepare';
  pkg.scripts['xera:heal-prepare'] = 'xera-internal heal-prepare';
  pkg.scripts['xera:disputes'] = 'xera-internal disputes';
  // Adversarial explore (v0.9+)
  pkg.scripts['xera:explore-prepare'] = 'xera-internal explore-prepare';
  pkg.scripts['xera:explore-finalize'] = 'xera-internal explore-finalize';

  pkg.dependencies = pkg.dependencies ?? {};
  pkg.dependencies['@xera-ai/core'] = `^${CLI_VERSION}`;
  pkg.dependencies['@xera-ai/prompts'] = `^${CLI_VERSION}`;
  if (wantsWeb) pkg.dependencies['@xera-ai/web'] = `^${CLI_VERSION}`;
  if (wantsHttp) pkg.dependencies['@xera-ai/http'] = `^${CLI_VERSION}`;

  pkg.devDependencies = pkg.devDependencies ?? {};
  pkg.devDependencies['@playwright/test'] = '^1.60.0';
  pkg.devDependencies['@types/node'] = '^25.8.0';
  pkg.devDependencies['typescript'] = '^6.0.3';
  writeFileSync(pkgPath, JSON.stringify(pkg, null, 2));

  // Shape-aware next steps
  const nextSteps =
    shape === 'api'
      ? `
Next:
  1) Copy .env.example to .env and set your auth credentials:
       cp .env.example .env
       # then edit .env to set USER_BEARER_TOKEN=...
  2) Run pre-authentication:
       bun run xera:auth-setup
  3) Start testing:
       Open Claude Code in this directory and run: /xera-run <TICKET>
`
      : shape === 'mixed'
        ? `
Next:
  1) Copy .env.example to .env and set credentials (both web logins and API tokens):
       cp .env.example .env
  2) Run pre-authentication:
       bun run xera:auth-setup
  3) Start testing:
       Open Claude Code in this directory and run: /xera-run <TICKET>
`
        : `
Next:
  1) Copy .env.example to .env and set your Jira credentials:
       cp .env.example .env
  2) Run pre-authentication:
       bun run xera:auth-setup
  3) Start testing:
       Open Claude Code in this directory and run: /xera-run <TICKET>
`;

  p.note(nextSteps.trim(), 'Next steps');

  p.outro(pc.green('xera initialized!'));
}
