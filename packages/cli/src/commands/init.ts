import { appendFileSync, existsSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import * as p from '@clack/prompts';
import { generateKey } from '@xera-ai/core';
import pc from 'picocolors';
import { copyDir, scaffoldFile, TEMPLATE_DIR } from '../scaffold';

const require = createRequire(import.meta.url);

export type ProjectShape = 'web' | 'api' | 'mixed';

export async function initCommand(opts: { yes: boolean; shape?: ProjectShape }): Promise<void> {
  const cwd = process.cwd();
  p.intro(pc.cyan('xera — project setup'));

  // Determine shape first
  const shape: ProjectShape =
    opts.shape ??
    (opts.yes
      ? 'web'
      : ((await p.select({
          message: 'What kind of testing does this project do?',
          initialValue: 'web' as ProjectShape,
          options: [
            { value: 'web', label: 'Web UI only (Playwright browser tests)' },
            { value: 'api', label: 'HTTP API only (REST/GraphQL endpoint tests, no browser)' },
            { value: 'mixed', label: 'Both (some UI tickets, some API tickets, in one repo)' },
          ],
        })) as ProjectShape));

  if (typeof shape === 'symbol') {
    p.cancel('Aborted.');
    process.exit(0);
  }

  const wantsWeb = shape === 'web' || shape === 'mixed';
  const wantsHttp = shape === 'api' || shape === 'mixed';

  // Base (Jira) questions — all shapes
  const baseAnswers = opts.yes
    ? {
        jiraBaseUrl: 'https://example.atlassian.net',
        projectKeys: 'JIRA',
        storyField: 'description',
        acceptanceCriteriaField: '',
      }
    : await p.group(
        {
          jiraBaseUrl: () =>
            p.text({ message: 'Jira workspace URL', placeholder: 'https://x.atlassian.net' }),
          projectKeys: () =>
            p.text({
              message: 'Jira project key(s) (comma-separated)',
              placeholder: 'JIRA',
            }),
          storyField: () =>
            p.text({ message: 'Jira field id for user story', initialValue: 'description' }),
          acceptanceCriteriaField: () =>
            p.text({
              message: 'Jira field id for AC (leave empty if same as story)',
              initialValue: '',
            }),
        },
        {
          onCancel: () => {
            p.cancel('Aborted.');
            process.exit(0);
          },
        },
      );

  // Web questions — only when wantsWeb
  const webAnswers = !wantsWeb
    ? null
    : opts.yes
      ? { stagingUrl: 'http://localhost:3000', authEnabled: true, roles: 'admin,regular' }
      : await p.group(
          {
            stagingUrl: () =>
              p.text({
                message: 'Web app staging URL',
                placeholder: 'https://staging.example.com',
              }),
            authEnabled: () =>
              p.confirm({
                message: 'Does your app require login to test most pages?',
                initialValue: true,
              }),
            roles: () =>
              p.text({
                message: 'Test user roles (comma-separated)',
                initialValue: 'admin,regular',
              }),
          },
          {
            onCancel: () => {
              p.cancel('Aborted.');
              process.exit(0);
            },
          },
        );

  // HTTP questions — only when wantsHttp
  const httpAnswers = !wantsHttp
    ? null
    : opts.yes
      ? {
          apiBaseUrl: 'http://localhost:4111',
          openapiPath: './openapi.yaml',
          authStrategy: 'bearer',
          httpRoles: 'user',
        }
      : await p.group(
          {
            apiBaseUrl: () =>
              p.text({
                message: 'API base URL',
                placeholder: 'https://api.staging.example.com',
              }),
            openapiPath: () =>
              p.text({
                message: 'OpenAPI spec path (relative or URL — leave empty to skip)',
                initialValue: './openapi.yaml',
              }),
            authStrategy: () =>
              p.select({
                message: 'API auth strategy',
                initialValue: 'bearer',
                options: [
                  { value: 'bearer', label: 'Bearer token (env var)' },
                  { value: 'apiKey', label: 'API key (header)' },
                  { value: 'basic', label: 'Basic auth (env vars)' },
                  { value: 'oauth-cc', label: 'OAuth client_credentials' },
                  { value: 'none', label: 'None / public API' },
                ],
              }),
            httpRoles: () =>
              p.text({ message: 'HTTP roles (comma-separated)', initialValue: 'user' }),
          },
          {
            onCancel: () => {
              p.cancel('Aborted.');
              process.exit(0);
            },
          },
        );

  const vars = {
    shape,
    wantsWeb,
    wantsHttp,
    jiraBaseUrl: baseAnswers.jiraBaseUrl,
    projectKeys: baseAnswers.projectKeys
      .split(',')
      .map((s: string) => s.trim())
      .filter(Boolean),
    storyField: baseAnswers.storyField,
    acceptanceCriteriaField: baseAnswers.acceptanceCriteriaField,

    // web-only fields, default empty when not present:
    stagingUrl: webAnswers?.stagingUrl ?? '',
    authEnabled: !!webAnswers?.authEnabled,
    roles: webAnswers
      ? webAnswers.roles
          .split(',')
          .map((s: string) => s.trim())
          .filter(Boolean)
      : [],

    // http-only fields:
    apiBaseUrl: httpAnswers?.apiBaseUrl ?? '',
    openapiPath: httpAnswers?.openapiPath ?? '',
    authStrategy: (httpAnswers?.authStrategy as string | undefined) ?? 'none',
    httpRoles: httpAnswers
      ? (httpAnswers.httpRoles as string)
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

  // Seed sample tickets by shape
  if (wantsWeb) {
    copyDir(join(TEMPLATE_DIR, 'sample/SAMPLE-001'), join(cwd, '.xera/SAMPLE-001'));
  }
  if (wantsHttp) {
    copyDir(join(TEMPLATE_DIR, 'sample/SAMPLE-HTTP-001'), join(cwd, '.xera/SAMPLE-HTTP-001'));
  }

  // Copy skill .md files from @xera-ai/skills into BOTH .claude/skills/ (for the
  // Skill tool) AND .claude/commands/ (for Claude Code slash-command discovery).
  const skillsSrc = require.resolve('@xera-ai/skills/package.json');
  const skillsDir = join(skillsSrc, '..');
  for (const target of ['.claude/skills', '.claude/commands']) {
    copyDir(skillsDir, join(cwd, target));
    for (const name of ['package.json', 'version.json']) {
      const f = join(cwd, target, name);
      if (existsSync(f)) unlinkSync(f);
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
  pkg.scripts['xera:disputes'] = 'xera-internal disputes';

  pkg.dependencies = pkg.dependencies ?? {};
  pkg.dependencies['@xera-ai/core'] = '^0.8.0';
  pkg.dependencies['@xera-ai/prompts'] = '^0.8.0';
  if (wantsWeb) pkg.dependencies['@xera-ai/web'] = '^0.8.0';
  if (wantsHttp) pkg.dependencies['@xera-ai/http'] = '^0.8.0';

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
  1) Set your auth credentials in .env.local:
       USER_BEARER_TOKEN=...
  2) Run pre-authentication:
       bun run xera:auth-setup
  3) Try the sample:
       Open Claude Code in this directory and run: /xera-run SAMPLE-HTTP-001
`
      : shape === 'mixed'
        ? `
Next:
  1) Set credentials in .env.local (both web logins and API tokens)
  2) Run pre-authentication:
       bun run xera:auth-setup
  3) Try samples:
       /xera-run SAMPLE-001        # UI
       /xera-run SAMPLE-HTTP-001   # API
`
        : `
Next:
  1) Set your Jira credentials in .env.local
  2) Run pre-authentication:
       bun run xera:auth-setup
  3) Try the sample:
       Open Claude Code in this directory and run: /xera-run SAMPLE-001
`;

  p.note(nextSteps.trim(), 'Next steps');

  p.outro(pc.green('xera initialized!'));
}
