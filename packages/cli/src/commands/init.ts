import { appendFileSync, existsSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import * as p from '@clack/prompts';
import { generateKey } from '@xera-ai/core';
import pc from 'picocolors';
import { TEMPLATE_DIR, copyDir, scaffoldFile } from '../scaffold';

const require = createRequire(import.meta.url);

export async function initCommand(opts: { yes: boolean }): Promise<void> {
  const cwd = process.cwd();
  p.intro(pc.cyan('xera v0.1.0 — project setup'));

  // Prompt user
  const answers = opts.yes
    ? {
        jiraBaseUrl: 'https://example.atlassian.net',
        projectKeys: 'JIRA',
        stagingUrl: 'http://localhost:3000',
        storyField: 'description',
        acceptanceCriteriaField: '',
        authEnabled: true,
        roles: 'admin,regular',
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
          stagingUrl: () =>
            p.text({
              message: 'Web app staging URL',
              placeholder: 'https://staging.example.com',
            }),
          storyField: () =>
            p.text({ message: 'Jira field id for user story', initialValue: 'description' }),
          acceptanceCriteriaField: () =>
            p.text({
              message: 'Jira field id for AC (leave empty if same as story)',
              initialValue: '',
            }),
          authEnabled: () =>
            p.confirm({
              message: 'Does your app require login to test most pages?',
              initialValue: true,
            }),
          roles: () =>
            p.text({ message: 'Test user roles (comma-separated)', initialValue: 'admin,regular' }),
        },
        {
          onCancel: () => {
            p.cancel('Aborted.');
            process.exit(0);
          },
        },
      );

  const vars = {
    jiraBaseUrl: answers.jiraBaseUrl,
    projectKeys: answers.projectKeys
      .split(',')
      .map((s: string) => s.trim())
      .filter(Boolean),
    stagingUrl: answers.stagingUrl,
    storyField: answers.storyField,
    acceptanceCriteriaField: answers.acceptanceCriteriaField,
    authEnabled: !!answers.authEnabled,
    roles: answers.roles
      .split(',')
      .map((s: string) => s.trim())
      .filter(Boolean),
    authKey: generateKey(),
  };

  scaffoldFile(join(cwd, 'xera.config.ts'), 'xera.config.ts.tmpl', vars);
  scaffoldFile(join(cwd, 'playwright.config.ts'), 'playwright.config.ts.tmpl', vars);
  scaffoldFile(join(cwd, 'tsconfig.json'), 'tsconfig.json.tmpl', vars);
  scaffoldFile(join(cwd, '.env.example'), 'env.example.tmpl', vars);
  if (vars.authEnabled) {
    scaffoldFile(join(cwd, 'shared/auth-setup.ts'), 'auth-setup.ts.tmpl', vars);
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

  // Seed SAMPLE-001
  copyDir(join(TEMPLATE_DIR, 'sample/SAMPLE-001'), join(cwd, '.xera/SAMPLE-001'));

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
  pkg.dependencies = pkg.dependencies ?? {};
  pkg.dependencies['@xera-ai/core'] = '^0.4.0';
  pkg.dependencies['@xera-ai/web'] = '^0.1.6';
  pkg.dependencies['@xera-ai/prompts'] = '^2.2.0';
  pkg.devDependencies = pkg.devDependencies ?? {};
  pkg.devDependencies['@playwright/test'] = '^1.48.0';
  pkg.devDependencies['@types/node'] = '^22.0.0';
  pkg.devDependencies['typescript'] = '^5.6.3';
  writeFileSync(pkgPath, JSON.stringify(pkg, null, 2));

  p.outro(
    pc.green(
      'xera initialized! Next: edit .env, customize shared/auth-setup.ts, then run `/xera-run SAMPLE-001` in Claude Code.',
    ),
  );
}
