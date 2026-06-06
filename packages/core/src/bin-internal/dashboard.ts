import { writeFileSync } from 'node:fs';
import { type CollectOpts, collectDashboard, renderHtml, renderText } from '../dashboard';

interface DashboardOpts extends CollectOpts {
  json?: boolean;
  htmlPath?: string;
}

function parseOpts(argv: string[]): DashboardOpts {
  const opts: DashboardOpts = {};
  const classifications: string[] = [];
  const areas: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    const next = argv[i + 1];
    if (a === '--json') opts.json = true;
    else if (a === '--failing-only') opts.failingOnly = true;
    else if (a === '--since' && next) {
      opts.since = next;
      i++;
    } else if (a === '--classification' && next) {
      classifications.push(next);
      i++;
    } else if (a === '--area' && next) {
      areas.push(next);
      i++;
    } else if (a === '--html' && next) {
      opts.htmlPath = next;
      i++;
    } else if (a.startsWith('--')) {
      throw new Error(`unknown flag: ${a}`);
    }
  }
  if (classifications.length) opts.classifications = classifications;
  if (areas.length) opts.areas = areas;
  return opts;
}

export async function dashboardCmd(argv: string[]): Promise<number> {
  let opts: DashboardOpts;
  try {
    opts = parseOpts(argv);
  } catch (e) {
    console.error(`[xera:dashboard] ${(e as Error).message}`);
    return 1;
  }
  try {
    const snap = await collectDashboard(process.cwd(), opts);
    if (opts.json) {
      console.log(JSON.stringify(snap, null, 2));
      return 0;
    }
    if (opts.htmlPath) {
      writeFileSync(opts.htmlPath, renderHtml(snap));
      console.log(`[xera:dashboard] wrote ${opts.htmlPath}`);
      return 0;
    }
    console.log(renderText(snap, { color: process.stdout.isTTY ?? false }));
    return 0;
  } catch (e) {
    console.error(`[xera:dashboard] ${(e as Error).message}`);
    return 1;
  }
}
