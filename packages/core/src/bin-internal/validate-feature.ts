import { readFileSync, existsSync } from 'node:fs';
import { resolveArtifactPaths } from '../artifact/paths';
import { validateGherkin } from '@xera-ai/web';

export async function validateFeatureCmd(argv: string[]): Promise<number> {
  const ticket = argv[0];
  if (!ticket) { console.error('[xera:validate-feature] usage: validate-feature <TICKET>'); return 1; }
  const paths = resolveArtifactPaths(process.cwd(), ticket);
  if (!existsSync(paths.featurePath)) { console.error(`[xera:validate-feature] missing ${paths.featurePath}`); return 1; }
  const r = validateGherkin(readFileSync(paths.featurePath, 'utf8'));
  if (r.ok) { console.log('[xera:validate-feature] ok'); return 0; }
  for (const e of r.errors) console.error(`[xera:validate-feature] line ${e.line}: ${e.message}`);
  return 2;
}
