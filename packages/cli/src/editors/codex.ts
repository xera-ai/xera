import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { serializeFrontmatter } from './frontmatter';
import type { Check, EditorAdapter } from './index';

export const codexAdapter: EditorAdapter = {
  name: 'codex',

  detect(cwd) {
    return existsSync(join(cwd, '.agents'));
  },

  scaffoldSkill(cwd, input) {
    const target = join(cwd, '.agents/skills', input.base, 'SKILL.md');
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, serializeFrontmatter(input.frontmatter.fields) + input.body);
  },

  // No scaffoldCommand — Codex has no project-level slash mechanism.

  doctorChecks(cwd, requiredSkills): Check[] {
    const skillsDir = join(cwd, '.agents/skills');
    const missing = requiredSkills.filter((b) => !existsSync(join(skillsDir, b, 'SKILL.md')));
    const check: Check = {
      name: 'xera skills present (codex)',
      ok: missing.length === 0,
    };
    if (missing.length) {
      check.message = `missing: ${missing.map((b) => `${b}/SKILL.md`).join(', ')} — run \`xera init --update --editor codex\``;
    }
    return [check];
  },
};
