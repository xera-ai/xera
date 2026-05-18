import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { type EditorName, ALL_EDITORS } from './index';

const MARKERS: Record<EditorName, string> = {
  claude: '.claude',
  cursor: '.cursor',
  codex: '.agents',
};

export function detectEditors(cwd: string): EditorName[] {
  return ALL_EDITORS.filter((name) => existsSync(join(cwd, MARKERS[name])));
}
