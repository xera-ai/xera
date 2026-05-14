import { promotePom } from '@xera/web';

export async function promoteCmd(argv: string[]): Promise<number> {
  const [ticket, className] = argv;
  if (!ticket || !className) {
    console.error('[xera:promote] usage: promote <TICKET> <PomClassName>');
    return 1;
  }
  await promotePom({ repoRoot: process.cwd(), ticket, className });
  console.log(`[xera:promote] moved ${className} → shared/page-objects/`);
  return 0;
}
