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
  scaffoldCommand?(cwd: string, input: SkillInput): void;
  legacyMigrate?(cwd: string, base: string): boolean;
  doctorChecks(cwd: string, requiredSkills: string[]): Check[];
}

// Populated by Tasks 4 (claude), 5 (cursor), 6 (codex).
// Imports added once each adapter file exists.
export const editors: Partial<Record<EditorName, EditorAdapter>> = {};
