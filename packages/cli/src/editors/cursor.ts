import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { type FrontmatterValue, serializeFrontmatter } from './frontmatter';
import type { Check, EditorAdapter, SkillInput } from './index';

function ruleFrontmatter(input: SkillInput): Record<string, FrontmatterValue> {
  const desc = input.frontmatter.fields.description;
  if (desc === undefined) {
    throw new Error(
      `Cursor scaffold requires 'description' in source frontmatter for ${input.base}`,
    );
  }
  return { description: desc, alwaysApply: false };
}

function commandFrontmatter(input: SkillInput): Record<string, FrontmatterValue> {
  const desc = input.frontmatter.fields.description;
  if (desc === undefined) {
    throw new Error(
      `Cursor scaffold requires 'description' in source frontmatter for ${input.base}`,
    );
  }
  return { description: desc };
}

function write(target: string, content: string): void {
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, content);
}

export const cursorAdapter: EditorAdapter = {
  name: 'cursor',

  detect(cwd) {
    return existsSync(join(cwd, '.cursor'));
  },

  scaffoldSkill(cwd, input) {
    const path = join(cwd, '.cursor/rules', input.base, 'RULE.md');
    write(path, serializeFrontmatter(ruleFrontmatter(input)) + input.body);
  },

  scaffoldCommand(cwd, input) {
    const path = join(cwd, '.cursor/commands', `${input.base}.md`);
    write(path, serializeFrontmatter(commandFrontmatter(input)) + input.body);
  },

  doctorChecks(cwd, requiredSkills): Check[] {
    const rulesDir = join(cwd, '.cursor/rules');
    const cmdsDir = join(cwd, '.cursor/commands');
    const missing: string[] = [];
    for (const base of requiredSkills) {
      if (!existsSync(join(rulesDir, base, 'RULE.md'))) missing.push(`${base}/RULE.md`);
      if (!existsSync(join(cmdsDir, `${base}.md`))) missing.push(`commands/${base}.md`);
    }
    const check: Check = {
      name: 'xera skills present (cursor)',
      ok: missing.length === 0,
    };
    if (missing.length)
      check.message = `missing: ${missing.join(', ')} — run \`xera init --update --editor cursor\``;
    return [check];
  },
};
