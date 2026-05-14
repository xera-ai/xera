import { resolveArtifactPaths } from '../artifact/paths';
import { typecheckTicket } from '@xera-ai/web';

export async function typecheckCmd(argv: string[]): Promise<number> {
  const ticket = argv[0];
  if (!ticket) { console.error('[xera:typecheck] usage: typecheck <TICKET>'); return 1; }
  const paths = resolveArtifactPaths(process.cwd(), ticket);
  const r = await typecheckTicket(paths.ticketDir);
  if (r.ok) { console.log('[xera:typecheck] ok'); return 0; }
  for (const e of r.errors) console.error(`[xera:typecheck] ${e}`);
  return 2;
}
