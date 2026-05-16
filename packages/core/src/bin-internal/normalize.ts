import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { readMeta } from '../artifact/meta';
import { resolveArtifactPaths } from '../artifact/paths';

export async function normalizeCmd(argv: string[]): Promise<number> {
  const ticket = argv[0];
  if (!ticket) {
    console.error('[xera:normalize] usage: normalize <TICKET> [--run=<runId>]');
    return 1;
  }
  const paths = resolveArtifactPaths(process.cwd(), ticket);
  const runArg = argv.find((a) => a.startsWith('--run='));
  const runId = runArg
    ? runArg.split('=')[1]!
    : readdirSync(paths.runsDir)
        .filter((n) => !n.startsWith('.'))
        .sort()
        .pop()!;
  if (!runId) {
    console.error('[xera:normalize] no run found');
    return 1;
  }
  const runDir = join(paths.runsDir, runId);
  if (!existsSync(runDir)) {
    console.error(`[xera:normalize] runs/${runId} missing`);
    return 1;
  }

  const meta = readMeta(paths.metaPath);
  const adapter = meta?.adapter ?? 'web';

  if (adapter === 'http') {
    const { normalizeHttpRun } = await import('@xera-ai/http');
    await normalizeHttpRun({ runId, runDir });
    console.log(`[xera:normalize] wrote normalized.json (http)`);
    return 0;
  }

  const { normalizeRun } = await import('@xera-ai/web');
  const r = await normalizeRun({ runId, runDir });
  console.log(
    `[xera:normalize] wrote normalized.json (scrubbed_fields_count=${r.scrubbed_fields_count})`,
  );
  return 0;
}
