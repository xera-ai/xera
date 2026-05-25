import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export interface CheckResult {
  ok: boolean;
  message: string;
}

// Resolve the directory holding the prompt `.md` files. In the monorepo (and
// in the unit tests that seed a temp tree) they live at `packages/prompts`.
// In a consumer install there is no such directory — the prompts are an
// installed dependency, so resolve `@xera-ai/prompts` the same way the skills
// load these files at runtime. (#199)
function resolvePromptsDir(repoRoot: string): string {
  const monorepoDir = join(repoRoot, 'packages/prompts');
  if (existsSync(monorepoDir)) return monorepoDir;
  try {
    return dirname(fileURLToPath(import.meta.resolve('@xera-ai/prompts/package.json')));
  } catch {
    return monorepoDir;
  }
}

const IN_SCOPE_PROMPTS = [
  'feature-from-story.md',
  'feature-from-openapi.md', // NEW v0.18
  'script-from-feature-web.md',
  'script-from-feature-http.md',
  'heal-locator.md',
  'contract-heal.md', // NEW v0.19
  'extract-areas.md',
  'similarity-match.md',
  'classify-outdated.md',
  'map-ac-to-scenarios.md',
  'propose-scenarios.md', // NEW v0.8.2
] as const;

const REQUIRED_SECTION_HEADING = '## Handling untrusted input';

const REQUIRED_KEYWORDS = ['UNTRUSTED', 'injection-follow', '<XR_'] as const;

export function verifyPrompts(repoRoot: string): CheckResult[] {
  const promptsDir = resolvePromptsDir(repoRoot);
  const results: CheckResult[] = [];
  for (const filename of IN_SCOPE_PROMPTS) {
    const path = join(promptsDir, filename);
    if (!existsSync(path)) {
      results.push({
        ok: false,
        message: `${filename}: file missing at ${path}`,
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
