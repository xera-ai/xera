import { writeFileSync } from 'node:fs';
import { type CollectOpts, collectDashboard, renderHtml, renderText } from '../dashboard';

interface DashboardOpts extends CollectOpts {
  json?: boolean;
  htmlPath?: string;
}

// Accept BOTH `--flag value` (space) and `--flag=value` (equals) forms to match
// Playwright's CLI convention (and `xera-internal exec --reporter=...` since #224).
function takeValue(
  argv: string[],
  i: number,
  flag: string,
): { value: string; consumed: number } | null {
  const a = argv[i]!;
  if (a === flag) {
    const next = argv[i + 1];
    if (next === undefined) throw new Error(`${flag} requires a value`);
    return { value: next, consumed: 2 };
  }
  if (a.startsWith(`${flag}=`)) {
    return { value: a.slice(flag.length + 1), consumed: 1 };
  }
  return null;
}

function parseOpts(argv: string[]): DashboardOpts {
  const opts: DashboardOpts = {};
  const classifications: string[] = [];
  const areas: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === '--json') {
      opts.json = true;
      continue;
    }
    if (a === '--failing-only') {
      opts.failingOnly = true;
      continue;
    }
    const sinceTake = takeValue(argv, i, '--since');
    if (sinceTake) {
      opts.since = sinceTake.value;
      i += sinceTake.consumed - 1;
      continue;
    }
    const classTake = takeValue(argv, i, '--classification');
    if (classTake) {
      classifications.push(classTake.value);
      i += classTake.consumed - 1;
      continue;
    }
    const areaTake = takeValue(argv, i, '--area');
    if (areaTake) {
      areas.push(areaTake.value);
      i += areaTake.consumed - 1;
      continue;
    }
    const htmlTake = takeValue(argv, i, '--html');
    if (htmlTake) {
      opts.htmlPath = htmlTake.value;
      i += htmlTake.consumed - 1;
      continue;
    }
    if (a.startsWith('--')) {
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
