import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadConfig } from '../config/load';
import type { XeraConfig } from '../config/schema';
import {
  buildCoverageReport,
  buildWhyArea,
  buildWhyTicket,
  type RenderOptions,
  renderMarkdown,
} from '../coverage';
import { appendEvents, deriveSnapshot, loadAllEvents } from '../graph/store';
import type { Event, Snapshot } from '../graph/types';
import { ulid } from '../graph/ulid';

interface ParsedArgs {
  snapshotTs?: string;
  emitEvent: boolean;
  why?: string;
  json: boolean;
  all: boolean;
  snapshotFile?: string;
}

function parseArgs(argv: string[]): ParsedArgs {
  const args: ParsedArgs = { emitEvent: true, json: false, all: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--snapshot-ts') {
      const v = argv[++i];
      if (v !== undefined) args.snapshotTs = v;
    } else if (a === '--no-emit-event') args.emitEvent = false;
    else if (a === '--why') {
      const v = argv[++i];
      if (v !== undefined) args.why = v;
    } else if (a === '--json') args.json = true;
    else if (a === '--all') args.all = true;
    else if (a === '--snapshot-file') {
      const v = argv[++i];
      if (v !== undefined) args.snapshotFile = v;
    } else if (a === '--help-stub') {
      /* no-op for test scaffold */
    } else {
      console.error(`[coverage-prepare] unknown flag: ${a}`);
      return { ...args, emitEvent: false };
    }
  }
  return args;
}

const TICKET_RE = /^[A-Z][A-Z0-9]*-\d+$/;

export async function coveragePrepareCmd(argv: string[]): Promise<number> {
  const args = parseArgs(argv);

  const cwd = process.cwd();
  let config: XeraConfig;
  try {
    config = await loadConfig(cwd);
  } catch (e) {
    console.error(`[coverage-prepare] ${(e as Error).message}`);
    return 2;
  }

  let snap: Snapshot;
  if (args.snapshotFile) {
    snap = JSON.parse(readFileSync(args.snapshotFile, 'utf8')) as Snapshot;
  } else {
    snap = deriveSnapshot(loadAllEvents(cwd));
  }

  const now = args.snapshotTs ? new Date(args.snapshotTs) : new Date();

  if (args.why) {
    const out = TICKET_RE.test(args.why)
      ? buildWhyTicket(args.why, snap, config.coverage, now)
      : buildWhyArea(args.why, snap, config.coverage, now);
    process.stdout.write(out);
    return 0;
  }

  const report = buildCoverageReport(snap, config.coverage, now);

  if (args.json) {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    return 0;
  }

  const outDir = join(cwd, '.xera/coverage');
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, 'report.json'), JSON.stringify(report, null, 2));
  const renderOpts: RenderOptions = { includeCovered: args.all };
  writeFileSync(join(outDir, 'report.md'), renderMarkdown(report, renderOpts));

  if (args.emitEvent && config.coverage.autoSnapshotOnCoverage) {
    const event: Event = {
      event_id: ulid(),
      schema_version: 1,
      ts: now.toISOString(),
      actor: 'xera-coverage',
      type: 'coverage.snapshot',
      payload: {
        ts: now.toISOString(),
        windowDays: config.coverage.staleAfterDays,
        areas: report.areas.map((a) => ({
          id: a.id,
          status: a.status,
          risk: a.risk,
          breakdown: a.breakdown,
        })),
        tickets: report.tickets.map((t) => ({
          id: t.id,
          acCount: t.acCount,
          satisfiedCount: t.satisfiedCount,
          gapScore: t.gapScore,
        })),
      },
    };
    appendEvents(cwd, [event], { skill: 'coverage', ticketId: 'session', now });
  }

  return 0;
}
