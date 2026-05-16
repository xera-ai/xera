import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import * as p from '@clack/prompts';
import pc from 'picocolors';

const require = createRequire(import.meta.url);
const CLI_VERSION = (require('../package.json') as { version: string }).version;

export async function initUpdateCommand(_opts: { yes: boolean }): Promise<void> {
  const cwd = process.cwd();
  p.intro(pc.cyan('xera init --update'));

  // Bump deps to latest
  const pkgPath = join(cwd, 'package.json');
  if (!existsSync(pkgPath)) {
    p.cancel('No package.json found — run `xera init` first.');
    process.exit(1);
  }
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
  pkg.dependencies = pkg.dependencies ?? {};
  // Bump existing entries to latest; only add adapters that were already present
  pkg.dependencies['@xera-ai/core'] = `^${CLI_VERSION}`;
  pkg.dependencies['@xera-ai/prompts'] = `^${CLI_VERSION}`;
  if (pkg.dependencies['@xera-ai/web']) pkg.dependencies['@xera-ai/web'] = `^${CLI_VERSION}`;
  if (pkg.dependencies['@xera-ai/http']) pkg.dependencies['@xera-ai/http'] = `^${CLI_VERSION}`;

  pkg.scripts = pkg.scripts ?? {};
  pkg.scripts['xera:auth-setup'] = 'xera-internal auth-setup';
  pkg.scripts['xera:graph-record'] = 'xera-internal graph-record';
  pkg.scripts['xera:graph-snapshot'] = 'xera-internal graph-snapshot';
  pkg.scripts['xera:graph-query'] = 'xera-internal graph-query';
  pkg.scripts['xera:graph-backfill'] = 'xera-internal graph-backfill';
  pkg.scripts['xera:graph-enrich'] = 'xera-internal graph-enrich';
  pkg.scripts['xera:graph-render'] = 'xera-internal graph-render';
  pkg.scripts['xera:impact-prepare'] = 'xera-internal impact-prepare';
  pkg.scripts['xera:heal-prepare'] = 'xera-internal heal-prepare';
  pkg.scripts['xera:disputes'] = 'xera-internal disputes';
  writeFileSync(pkgPath, JSON.stringify(pkg, null, 2));

  // Scaffold GitHub Actions viewer workflow (v0.6.3+)
  const wfDir = join(cwd, '.github/workflows');
  mkdirSync(wfDir, { recursive: true });
  try {
    const cliPkgPath = require.resolve('@xera-ai/cli/package.json');
    const cliTplPath = join(cliPkgPath, '..', 'templates/xera-graph.yml.template');
    copyFileSync(cliTplPath, join(wfDir, 'xera-graph.yml'));
    p.log.info('scaffolded .github/workflows/xera-graph.yml');
  } catch (_e) {
    // CLI templates not resolvable in this environment; skip workflow scaffold.
    // Users can re-run `xera init` to get it.
    p.log.warn('skipped xera-graph.yml scaffold (re-run `xera init` to create it)');
  }

  // Refresh skills with 3-way diff
  const skillsSrc = require.resolve('@xera-ai/skills/package.json');
  const newSkillsDir = join(skillsSrc, '..');
  const localSkillsDir = join(cwd, '.claude/skills');

  for (const name of readdirSync(newSkillsDir)) {
    if (!name.endsWith('.md')) continue;
    const newContent = readFileSync(join(newSkillsDir, name), 'utf8');
    const localPath = join(localSkillsDir, name);
    if (!existsSync(localPath)) {
      writeFileSync(localPath, newContent);
      p.log.info(`+ ${name}`);
      continue;
    }
    const localContent = readFileSync(localPath, 'utf8');
    if (localContent === newContent) {
      p.log.info(`= ${name}`);
      continue;
    }
    const choice = await p.select({
      message: `${name} differs from package version`,
      options: [
        { value: 'keep', label: 'Keep local' },
        { value: 'overwrite', label: 'Overwrite with package version' },
      ],
    });
    if (choice === 'overwrite') {
      writeFileSync(localPath, newContent);
      p.log.success(`overwrote ${name}`);
    } else {
      p.log.warn(`kept local ${name}`);
    }
  }

  p.outro(pc.green('Update complete. Run `xera doctor` to verify.'));
}
