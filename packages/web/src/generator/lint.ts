import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { lintSelectors, type SelectorWarning } from './selector-rules';

export interface LintResult {
  ok: boolean;
  warnings: Array<SelectorWarning & { file: string }>;
}

function listTsFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  for (const name of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, name.name);
    if (name.isDirectory()) out.push(...listTsFiles(full));
    else if (name.name.endsWith('.ts')) out.push(full);
  }
  return out;
}

export async function lintTicket(ticketDir: string): Promise<LintResult> {
  const files = listTsFiles(ticketDir);
  const warnings: LintResult['warnings'] = [];
  for (const f of files) {
    const src = readFileSync(f, 'utf8');
    const r = lintSelectors(src);
    for (const w of r.warnings) warnings.push({ ...w, file: f });
  }
  return { ok: warnings.length === 0, warnings };
}
