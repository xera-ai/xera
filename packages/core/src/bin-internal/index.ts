import { execCmd } from './exec';
import { fetchCmd } from './fetch';
import { lintCmd } from './lint';
import { normalizeCmd } from './normalize';
import { postCmd } from './post';
import { promoteCmd } from './promote';
import { reportCmd } from './report';
import { statusCmd } from './status-cmd';
import { typecheckCmd } from './typecheck';
import { unlockCmd } from './unlock';
import { validateFeatureCmd } from './validate-feature';

const COMMANDS: Record<string, (argv: string[]) => Promise<number>> = {
  fetch: fetchCmd,
  'validate-feature': validateFeatureCmd,
  typecheck: typecheckCmd,
  lint: lintCmd,
  exec: execCmd,
  normalize: normalizeCmd,
  report: reportCmd,
  post: postCmd,
  status: statusCmd,
  unlock: unlockCmd,
  promote: promoteCmd,
};

export async function run(argv: string[]): Promise<number> {
  const [cmd, ...rest] = argv;
  if (!cmd || !COMMANDS[cmd]) {
    console.error(
      `Usage: xera-internal <command> [args...]\nCommands: ${Object.keys(COMMANDS).join(', ')}`,
    );
    return 1;
  }
  try {
    return await COMMANDS[cmd]!(rest);
  } catch (err) {
    console.error(`[xera:${cmd}] failed: ${(err as Error).message}`);
    return 4;
  }
}
