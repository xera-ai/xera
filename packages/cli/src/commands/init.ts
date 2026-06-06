import { appendFileSync, existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import * as p from '@clack/prompts';
import { generateKey } from '@xera-ai/core';
import pc from 'picocolors';
import { type EditorName, editors } from '../editors';
import { parseFrontmatter } from '../editors/frontmatter';
import { resolveEditors } from '../editors/resolve';
import { samplesForShape, scaffoldSample } from '../samples';
import { scaffoldFile } from '../scaffold';

const require = createRequire(import.meta.url);
const CLI_VERSION = (require('../package.json') as { version: string }).version;

export type ProjectShape = 'web' | 'api' | 'mixed';
export type IssueTracker = 'jira' | 'github';
export type HttpAuthStrategy =
  | 'bearer'
  | 'apiKey'
  | 'basic'
  | 'oauth-cc'
  | 'custom'
  | 'none'
  | 'reuse-web-session';

export interface InitOptions {
  yes: boolean;
  shape?: ProjectShape;
  /** Issue tracker to bind to. Defaults to 'jira'. */
  tracker?: IssueTracker;
  /** Comma-separated editor names or "all"; defaults follow resolveEditors() */
  editor?: string;
  // Jira flags
  jiraBaseUrl?: string;
  projectKeys?: string;
  storyField?: string;
  acField?: string;
  // GitHub flags
  githubRepo?: string;
  // Web flags
  stagingUrl?: string;
  authEnabled?: boolean;
  roles?: string;
  // HTTP flags
  apiBaseUrl?: string;
  openapiPath?: string;
  authStrategy?: HttpAuthStrategy;
  httpRoles?: string;
  // Opt-in sample tickets (.xera/SAMPLE-001 + .xera/SAMPLE-HTTP-001 by shape)
  samples?: boolean;
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

  // Issue tracker — Jira (default) or GitHub Issues
  const tracker: IssueTracker = await prompt<IssueTracker>(
    opts.tracker,
    opts.yes ? 'jira' : undefined,
    () =>
      p.select({
        message: 'Where do you track tickets?',
        initialValue: 'jira' as IssueTracker,
        options: [
          { value: 'jira', label: 'Jira (Atlassian MCP or REST API)' },
          { value: 'github', label: 'GitHub Issues (GitHub MCP or `gh` CLI — no token required)' },
        ],
      }) as Promise<IssueTracker | symbol>,
  );

  // Jira-specific questions (skipped when tracker === 'github')
  let jiraBaseUrl = '';
  let projectKeys = '';
  let storyField = 'description';
  let acceptanceCriteriaField = '';
  let githubRepo = '';
  if (tracker === 'jira') {
    jiraBaseUrl = await prompt(
      opts.jiraBaseUrl,
      opts.yes ? 'https://example.atlassian.net' : undefined,
      () => p.text({ message: 'Jira workspace URL', placeholder: 'https://x.atlassian.net' }),
    );
    projectKeys = await prompt(opts.projectKeys, opts.yes ? 'JIRA' : undefined, () =>
      p.text({ message: 'Jira project key(s) (comma-separated)', placeholder: 'JIRA' }),
    );
    storyField = await prompt(opts.storyField, opts.yes ? 'description' : undefined, () =>
      p.text({ message: 'Jira field id for user story', initialValue: 'description' }),
    );
    acceptanceCriteriaField = await prompt(opts.acField, opts.yes ? '' : undefined, () =>
      p.text({
        message: 'Jira field id for AC (leave empty if same as story)',
        initialValue: '',
      }),
    );
  } else {
    githubRepo = await prompt(opts.githubRepo, opts.yes ? 'owner/repo' : undefined, () =>
      p.text({
        message: 'GitHub repo (owner/name)',
        placeholder: 'octocat/hello-world',
        validate: (v) =>
          /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(v ?? '') ? undefined : 'must be owner/repo',
      }),
    );
  }

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
    // For mixed projects (web + http), ask first whether the API shares the
    // web SSO session — if yes, pre-select reuse-web-session so the user
    // doesn't have to know the exact strategy name. (QA4)
    let sharesWebSession = false;
    if (wantsWeb && !opts.yes && !opts.authStrategy) {
      const ans = await p.confirm({
        message:
          'Does the API share an SSO session with the web app? (shared parent-domain cookies)',
        initialValue: false,
      });
      if (p.isCancel(ans)) {
        p.cancel('Cancelled.');
        process.exit(0);
      }
      sharesWebSession = ans === true;
    }
    const defaultStrategy: HttpAuthStrategy = sharesWebSession ? 'reuse-web-session' : 'bearer';
    authStrategy = await prompt<HttpAuthStrategy>(
      opts.authStrategy,
      opts.yes ? defaultStrategy : undefined,
      () =>
        p.select({
          message: 'API auth strategy',
          initialValue: defaultStrategy,
          options: [
            { value: 'reuse-web-session', label: 'Reuse web SSO session (shared cookies)' },
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
    tracker,
    useJiraTracker: tracker === 'jira',
    useGithubTracker: tracker === 'github',
    jiraBaseUrl,
    projectKeys: projectKeys
      ? projectKeys
          .split(',')
          .map((s: string) => s.trim())
          .filter(Boolean)
      : [],
    storyField,
    acceptanceCriteriaField,
    githubRepo,
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
    isReuseWebSession: authStrategy === 'reuse-web-session',
    isNotReuseWebSession: authStrategy !== 'reuse-web-session',
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

  // AGENTS.md — orient any AI agent (Claude/Cursor/Codex all read it). Never
  // clobber a user-curated file: scaffold only when absent.
  const agentsTarget = join(cwd, 'AGENTS.md');
  if (existsSync(agentsTarget)) {
    p.log.info('kept existing AGENTS.md');
  } else {
    scaffoldFile(agentsTarget, 'AGENTS.md.tmpl', vars);
    p.log.success('scaffolded AGENTS.md');
  }

  // openapi.yaml placeholder for api/mixed when a relative path is configured
  if (wantsHttp && vars.openapiPath && !vars.openapiPath.startsWith('http')) {
    const openapiTarget = join(cwd, vars.openapiPath);
    if (!existsSync(openapiTarget)) {
      scaffoldFile(openapiTarget, 'openapi.yaml.tmpl', vars);
    }
  }

  // Opt-in sample tickets — `--samples` flag. Idempotent: scaffoldSample skips
  // files that already exist so users don't lose hand edits on re-init.
  if (opts.samples) {
    const sampleVars = { ...vars, cliVersion: CLI_VERSION };
    for (const sample of samplesForShape(shape)) {
      const { written, skipped } = scaffoldSample(cwd, sample, sampleVars);
      if (written.length > 0) {
        p.log.success(`scaffolded sample ${sample.id} (${written.length} files)`);
      }
      if (skipped.length > 0) {
        p.log.info(`sample ${sample.id}: skipped ${skipped.length} existing file(s)`);
      }
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

  // Resolve editor targets. Falls back to interactive multi-select prompt if
  // no flag, no --yes, and no editor markers already present in the cwd.
  const editorTargets = await resolveEditors({
    flag: opts.editor,
    cwd,
    isUpdate: false,
    isYes: opts.yes,
    prompt: async () => {
      const choice = await p.multiselect({
        message: 'Which editor(s) should xera scaffold for?',
        options: [
          { value: 'claude', label: 'Claude Code (.claude/skills/, .claude/commands/)' },
          { value: 'cursor', label: 'Cursor (.cursor/rules/, .cursor/commands/)' },
          { value: 'codex', label: 'OpenAI Codex CLI (.agents/skills/)' },
        ],
        initialValues: ['claude'],
        required: true,
      });
      if (typeof choice === 'symbol') cancel();
      return choice as EditorName[];
    },
  });

  // Scaffold each skill into each target editor.
  const skillsPkgPath = require.resolve('@xera-ai/skills/package.json');
  const skillsSrcDir = join(skillsPkgPath, '..');
  const SKILL_IGNORE = new Set(['package.json', 'version.json', 'CHANGELOG.md']);
  for (const name of readdirSync(skillsSrcDir)) {
    if (SKILL_IGNORE.has(name)) continue;
    if (!name.endsWith('.md')) continue;
    const raw = readFileSync(join(skillsSrcDir, name), 'utf8');
    const { frontmatter, body } = parseFrontmatter(raw);
    const base = name.replace(/\.md$/, '');
    const skillInput = { base, body, frontmatter };
    for (const editorName of editorTargets) {
      const adapter = editors[editorName];
      // Clean retired files first (idempotent) so a re-init on a stale tree
      // doesn't leave .claude/commands/<xera-*>.md ghosts behind. (#231)
      adapter.legacyCleanup?.(cwd, base);
      adapter.scaffoldSkill(cwd, skillInput);
      adapter.scaffoldCommand?.(cwd, skillInput);
    }
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
  pkg.scripts['xera:contract-heal-prepare'] = 'xera-internal contract-heal-prepare';
  pkg.scripts['xera:disputes'] = 'xera-internal disputes';
  if (wantsHttp) pkg.scripts['xera:openapi-resolve'] = 'xera-internal openapi-resolve';
  if (wantsHttp) pkg.scripts['xera:feature-spec-prepare'] = 'xera-internal feature-spec-prepare';
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
  const editorLines = editorTargets
    .map((e) => {
      if (e === 'claude') return '       Claude Code:       /xera-run <TICKET>';
      if (e === 'cursor') return '       Cursor:            /xera-run <TICKET>  (slash menu)';
      if (e === 'codex')
        return '       OpenAI Codex CLI:  type "run xera for <TICKET>" — Codex picks up the xera-run skill';
      return '';
    })
    .join('\n');

  const trackerLine =
    tracker === 'github'
      ? `  0) GitHub tracker: make sure \`gh auth login\` has been run (or the GitHub MCP is connected in this editor).`
      : `  0) Set your Jira credentials in .env (JIRA_EMAIL, JIRA_API_TOKEN) unless the Atlassian MCP is connected.`;

  const nextSteps =
    shape === 'api'
      ? `
Next:
${trackerLine}
  1) Copy .env.example to .env and set your auth credentials:
       cp .env.example .env
       # then edit .env to set USER_BEARER_TOKEN=...
  2) Run pre-authentication:
       npx xera-internal auth-setup
  3) Start testing:
${editorLines}
`
      : shape === 'mixed'
        ? `
Next:
${trackerLine}
  1) Copy .env.example to .env and set credentials (both web logins and API tokens):
       cp .env.example .env
  2) Run pre-authentication:
       npx xera-internal auth-setup
  3) Start testing:
${editorLines}
`
        : `
Next:
${trackerLine}
  1) Copy .env.example to .env and set credentials:
       cp .env.example .env
  2) Run pre-authentication:
       npx xera-internal auth-setup
  3) Start testing:
${editorLines}
`;

  const sampleIds = opts.samples ? samplesForShape(shape).map((s) => s.id) : [];
  const sampleHint =
    sampleIds.length > 0
      ? `\n  Sample ticket(s) scaffolded — try it out:\n${sampleIds
          .map((id) => `       /xera-run ${id}`)
          .join('\n')}\n  Remove later with: xera samples remove`
      : '';

  p.note((nextSteps.trim() + sampleHint).trim(), 'Next steps');

  p.outro(pc.green('xera initialized!'));
}
