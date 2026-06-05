import { claudeAdapter } from './claude';
import { codexAdapter } from './codex';
import { cursorAdapter } from './cursor';
import type { ParsedFrontmatter } from './frontmatter';

export type EditorName = 'claude' | 'cursor' | 'codex';
export const ALL_EDITORS: readonly EditorName[] = ['claude', 'cursor', 'codex'] as const;

export interface SkillInput {
  /** Slug like 'xera-run', no .md suffix */
  base: string;
  /** Body text AFTER frontmatter — bytes from @xera-ai/skills */
  body: string;
  /** Parsed frontmatter from the source .md file */
  frontmatter: ParsedFrontmatter;
}

export interface Check {
  name: string;
  ok: boolean;
  message?: string;
}

export interface EditorAdapter {
  name: EditorName;
  detect(cwd: string): boolean;
  scaffoldSkill(cwd: string, input: SkillInput): void;
  /**
   * Write an editor-specific slash command file. Optional because not all
   * editors have a project-level slash mechanism (e.g. Codex), and not all
   * editors need one alongside the skill (Claude Code now resolves slash
   * commands through the Skill tool, so the dual `.claude/commands/` write
   * was retired — see legacyCleanup).
   */
  scaffoldCommand?(cwd: string, input: SkillInput): void;
  legacyMigrate?(cwd: string, base: string): boolean;
  /**
   * One-shot cleanup of files retired by a layout/design change (e.g. the
   * `.claude/commands/<skill>.md` files made redundant when Claude Code
   * started resolving `/<skill>` through the Skill tool). Returns true if
   * something was removed. Init / init --update call this per skill so users
   * upgrading land in the current layout without manual cleanup.
   */
  legacyCleanup?(cwd: string, base: string): boolean;
  doctorChecks(cwd: string, requiredSkills: string[]): Check[];
}

export const editors: Record<EditorName, EditorAdapter> = {
  claude: claudeAdapter,
  cursor: cursorAdapter,
  codex: codexAdapter,
};
