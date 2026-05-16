import { mkdirSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { RenderOpts } from '../graph/render';
import { renderHtml, transformForVisNetwork } from '../graph/render';
import { deriveSnapshot, loadAllEvents } from '../graph/store';

function parseDepth(s: string | undefined): 1 | 2 | 3 {
  const n = s ? Number.parseInt(s, 10) : 2;
  if (n === 1 || n === 3) return n;
  return 2;
}

function decidePerformanceMode(nodeCount: number): 'full' | 'ticket-only' | 'text-fallback' {
  if (nodeCount > 2000) return 'text-fallback';
  if (nodeCount > 500) return 'ticket-only';
  return 'full';
}

export async function graphRenderCmd(argv: string[]): Promise<number> {
  let outPath: string | undefined;
  let ticketId: string | undefined;
  let since: string | undefined;
  let depth: 1 | 2 | 3 = 2;

  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--out') outPath = argv[++i];
    else if (argv[i] === '--ticket') ticketId = argv[++i];
    else if (argv[i] === '--since') since = argv[++i];
    else if (argv[i] === '--depth') depth = parseDepth(argv[++i]);
  }

  const repoRoot = process.cwd();
  const finalPath = outPath ?? join(repoRoot, '.xera/graph.html');

  const snap = deriveSnapshot(loadAllEvents(repoRoot));
  const totalNodeCount =
    Object.keys(snap.tickets).length +
    Object.keys(snap.scenarios).length +
    Object.keys(snap.poms).length +
    Object.keys(snap.areas).length;
  const performanceMode = decidePerformanceMode(totalNodeCount);

  if (performanceMode === 'text-fallback') {
    const txtPath = finalPath.replace(/\.html$/, '.txt');
    mkdirSync(dirname(txtPath), { recursive: true });
    writeFileSync(
      txtPath,
      `Graph too large for HTML viewer (${totalNodeCount} nodes). Use 'xera:graph-query --format text' instead.\n`,
    );
    console.log(`[graph-render] graph too large (${totalNodeCount} nodes); wrote ${txtPath}`);
    return 0;
  }

  const opts: RenderOpts = { depth, performanceMode };
  if (ticketId) opts.ticketId = ticketId;
  if (since) opts.since = since;

  const data = transformForVisNetwork(snap, opts);
  const html = renderHtml({ data, stats: data.stats, generatedAt: new Date().toISOString() });

  mkdirSync(dirname(finalPath), { recursive: true });
  const tmpPath = `${finalPath}.tmp`;
  writeFileSync(tmpPath, html);
  renameSync(tmpPath, finalPath);

  console.log(
    `[graph-render] wrote ${finalPath} (${data.stats.tickets} tickets · ${data.stats.scenarios} scenarios · ${html.length} bytes)`,
  );
  return 0;
}
