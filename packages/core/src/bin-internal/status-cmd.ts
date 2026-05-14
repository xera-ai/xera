import { resolveArtifactPaths } from '../artifact/paths';
import { readStatus } from '../artifact/status';

export async function statusCmd(argv: string[]): Promise<number> {
  const ticket = argv[0];
  if (!ticket) { console.error('[xera:status] usage: status <TICKET>'); return 1; }
  const paths = resolveArtifactPaths(process.cwd(), ticket);
  const s = readStatus(paths.statusPath);
  if (!s) { console.log(`[xera:status] no status yet for ${ticket}`); return 0; }
  console.log(`${ticket}: ${s.result} (${s.classification}, conf=${s.confidence}) — ${s.scenarios.passed}/${s.scenarios.total} passed, last run ${s.lastRun}`);
  for (const h of s.history.slice(0, 5)) console.log(`  ${h.ts}  ${h.result}  ${h.class}`);
  return 0;
}
