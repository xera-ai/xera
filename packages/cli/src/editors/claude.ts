import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { serializeFrontmatter } from './frontmatter';
import type { Check, EditorAdapter, SkillInput } from './index';

function renderSource(input: SkillInput): string {
  return serializeFrontmatter(input.frontmatter.fields) + input.body;
}

export const claudeAdapter: EditorAdapter = {
  name: 'claude',

  detect(cwd) {
    return existsSync(join(cwd, '.claude'));
  },

  scaffoldSkill(cwd, input) {
    const target = join(cwd, '.claude/skills', input.base, 'SKILL.md');
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, renderSource(input));
  },

  // scaffoldCommand intentionally omitted (#231).
  //
  // Earlier `xera init` wrote the same content twice: once as a skill
  // (`.claude/skills/<base>/SKILL.md`) and once as a custom slash command
  // (`.claude/commands/<base>.md`). Current Claude Code resolves `/<name>`
  // through the Skill tool against `.claude/skills/`, making the second
  // write redundant and a drift hazard if one location gets stale.

  legacyMigrate(cwd, base) {
    const flat = join(cwd, '.claude/skills', `${base}.md`);
    const dir = join(cwd, '.claude/skills', base, 'SKILL.md');
    if (!existsSync(flat) || existsSync(dir)) return false;
    const content = readFileSync(flat);
    mkdirSync(dirname(dir), { recursive: true });
    writeFileSync(dir, content);
    unlinkSync(flat);
    return true;
  },

  legacyCleanup(cwd, base) {
    // Remove the retired `.claude/commands/<base>.md` slash-command file
    // scaffolded by older `xera init` runs (see scaffoldCommand note above).
    const legacy = join(cwd, '.claude/commands', `${base}.md`);
    if (!existsSync(legacy)) return false;
    unlinkSync(legacy);
    return true;
  },

  doctorChecks(cwd, requiredSkills): Check[] {
    const skillsDir = join(cwd, '.claude/skills');
    if (!existsSync(skillsDir)) {
      return [{ name: 'xera skills present (claude)', ok: false, message: 'run `xera init`' }];
    }
    const missing: string[] = [];
    const legacyFlat: string[] = [];
    for (const base of requiredSkills) {
      if (existsSync(join(skillsDir, base, 'SKILL.md'))) continue;
      if (existsSync(join(skillsDir, `${base}.md`))) legacyFlat.push(base);
      else missing.push(base);
    }
    const check: Check = {
      name: 'xera skills present (claude)',
      ok: missing.length === 0 && legacyFlat.length === 0,
    };
    if (missing.length) {
      check.message = `missing: ${missing.map((b) => `${b}/SKILL.md`).join(', ')}`;
    } else if (legacyFlat.length) {
      check.message = `legacy flat layout — run \`xera init --update --editor claude\` to migrate`;
    }
    return [check];
  },
};
