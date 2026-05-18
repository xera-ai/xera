import { detectEditors } from './detect';
import { ALL_EDITORS, type EditorName } from './index';

export interface ResolveOptions {
  flag: string | undefined;
  cwd: string;
  isUpdate: boolean;
  isYes: boolean;
  prompt?: () => Promise<EditorName[]>;
}

function parseFlag(flag: string): EditorName[] {
  if (flag === 'all') return [...ALL_EDITORS];
  const parts = flag
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  if (parts.length === 0) {
    throw new Error(`--editor: empty value. Valid: ${ALL_EDITORS.join(', ')} (or 'all').`);
  }
  const bad = parts.filter((p) => !(ALL_EDITORS as readonly string[]).includes(p));
  if (bad.length) {
    throw new Error(
      `--editor: unknown value(s) [${bad.join(', ')}]. Valid: ${ALL_EDITORS.join(', ')} (or 'all').`,
    );
  }
  return parts as EditorName[];
}

export async function resolveEditors(opts: ResolveOptions): Promise<EditorName[]> {
  if (opts.flag !== undefined) return parseFlag(opts.flag);
  const detected = detectEditors(opts.cwd);
  if (opts.isUpdate) return detected;
  if (detected.length > 0) return detected;
  if (opts.isYes) return [...ALL_EDITORS];
  if (opts.prompt) return opts.prompt();
  return [...ALL_EDITORS]; // safety net; shouldn't reach here with normal CLI plumbing
}
