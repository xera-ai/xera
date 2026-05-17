import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { CoverageInput, RenderOpts } from '../graph/render';
import { renderHtml, transformForVisNetwork } from '../graph/render';
import { deriveSnapshot, loadAllEvents } from '../graph/store';
import type { CoverageSnapshotPayload, Event } from '../graph/types';

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
  let includeCoverage = false;

  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--out') outPath = argv[++i];
    else if (argv[i] === '--ticket') ticketId = argv[++i];
    else if (argv[i] === '--since') since = argv[++i];
    else if (argv[i] === '--depth') depth = parseDepth(argv[++i]);
    else if (argv[i] === '--include-coverage') includeCoverage = true;
  }

  const repoRoot = process.cwd();
  const finalPath = outPath ?? join(repoRoot, '.xera/graph.html');

  const events = loadAllEvents(repoRoot);
  const snap = deriveSnapshot(events);
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

  let coverage: CoverageInput | undefined;
  if (includeCoverage) {
    const reportPath = join(repoRoot, '.xera/coverage/report.json');
    if (existsSync(reportPath)) {
      const report = JSON.parse(readFileSync(reportPath, 'utf8'));
      const snapshots = events
        .filter(
          (e): e is Extract<Event, { type: 'coverage.snapshot' }> => e.type === 'coverage.snapshot',
        )
        .map((e) => e.payload as CoverageSnapshotPayload);
      coverage = { report, snapshots };
    } else {
      console.warn(
        '[graph-render] --include-coverage: report.json not found; run /xera-coverage first',
      );
    }
  }

  const data = transformForVisNetwork(snap, opts);
  const renderInput: Parameters<typeof renderHtml>[0] = {
    data,
    stats: data.stats,
    generatedAt: new Date().toISOString(),
  };
  if (coverage) renderInput.coverage = coverage;
  const html = renderHtml(renderInput);

  mkdirSync(dirname(finalPath), { recursive: true });
  const tmpPath = `${finalPath}.tmp`;
  writeFileSync(tmpPath, html);
  renameSync(tmpPath, finalPath);

  console.log(
    `[graph-render] wrote ${finalPath} (${data.stats.tickets} tickets · ${data.stats.scenarios} scenarios · ${html.length} bytes)`,
  );
  return 0;
}
