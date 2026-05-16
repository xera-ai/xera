import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import * as p from '@clack/prompts';
import pc from 'picocolors';

const require = createRequire(import.meta.url);

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
  pkg.dependencies['@xera-ai/core'] = '^0.4.0';
  pkg.dependencies['@xera-ai/web'] = '^0.2.0';
  pkg.dependencies['@xera-ai/prompts'] = '^2.1.1';
  writeFileSync(pkgPath, JSON.stringify(pkg, null, 2));

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
