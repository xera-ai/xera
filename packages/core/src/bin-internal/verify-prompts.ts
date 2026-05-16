import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export interface CheckResult {
  ok: boolean;
  message: string;
}

const IN_SCOPE_PROMPTS = [
  'feature-from-story.md',
  'script-from-feature.md',
  'heal-locator.md',
  'extract-areas.md',
  'similarity-match.md',
  'classify-outdated.md',
] as const;

const REQUIRED_SECTION_HEADING = '## Handling untrusted input';

const REQUIRED_KEYWORDS = ['UNTRUSTED', 'injection-follow', '<XR_'] as const;

export function verifyPrompts(repoRoot: string): CheckResult[] {
  const promptsDir = join(repoRoot, 'packages/prompts');
  const results: CheckResult[] = [];
  for (const filename of IN_SCOPE_PROMPTS) {
    const path = join(promptsDir, filename);
    if (!existsSync(path)) {
      results.push({
        ok: false,
        message: `${filename}: file missing at packages/prompts/${filename}`,
      });
      continue;
    }
    const text = readFileSync(path, 'utf8');
    if (!text.includes(REQUIRED_SECTION_HEADING)) {
      results.push({
        ok: false,
        message: `${filename}: missing required section "${REQUIRED_SECTION_HEADING}"`,
      });
      continue;
    }
    for (const keyword of REQUIRED_KEYWORDS) {
      if (!text.includes(keyword)) {
        results.push({
          ok: false,
          message: `${filename}: missing required keyword "${keyword}" (expected in "${REQUIRED_SECTION_HEADING}" section)`,
        });
      }
    }
  }
  return results;
}

export async function verifyPromptsCmd(_argv: string[]): Promise<number> {
  const results = verifyPrompts(process.cwd());
  if (results.length === 0) {
    console.log('[xera:verify-prompts] ok');
    return 0;
  }
  for (const r of results) console.error(`[xera:verify-prompts] ${r.message}`);
  return 1;
}
