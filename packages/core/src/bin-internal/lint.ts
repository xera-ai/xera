import { lintTicket } from '@xera-ai/web';
import { resolveArtifactPaths } from '../artifact/paths';

export async function lintCmd(argv: string[]): Promise<number> {
  const ticket = argv[0];
  if (!ticket) {
    console.error('[xera:lint] usage: lint <TICKET>');
    return 1;
  }
  const paths = resolveArtifactPaths(process.cwd(), ticket);
  const r = await lintTicket(paths.ticketDir);
  if (r.ok) {
    console.log('[xera:lint] ok');
    return 0;
  }
  for (const w of r.warnings)
    console.error(`[xera:lint] ${w.file}:${w.line} [${w.rule}] ${w.message}`);
  return 2;
}
