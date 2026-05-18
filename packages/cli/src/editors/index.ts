import type { ParsedFrontmatter } from './frontmatter';
import { claudeAdapter } from './claude';
import { codexAdapter } from './codex';
import { cursorAdapter } from './cursor';

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
  scaffoldCommand?(cwd: string, input: SkillInput): void;
  legacyMigrate?(cwd: string, base: string): boolean;
  doctorChecks(cwd: string, requiredSkills: string[]): Check[];
}

export const editors: Record<EditorName, EditorAdapter> = {
  claude: claudeAdapter,
  cursor: cursorAdapter,
  codex: codexAdapter,
};
