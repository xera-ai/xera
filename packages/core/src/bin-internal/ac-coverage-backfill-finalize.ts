import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';
import { appendEvents } from '../graph/store';
import type { Event } from '../graph/types';
import { SCHEMA_VERSION } from '../graph/types';
import { ulid } from '../graph/ulid';

const DecisionsSchema = z.object({
  mappings: z.array(
    z.object({
      scenarioId: z.string().min(1),
      satisfiesAcs: z.array(z.number().int().nonnegative()),
      confidence: z.number().min(0).max(1),
    }),
  ),
});

interface ParsedArgs {
  inputFile?: string;
  snapshotTs?: string;
}

function parseArgs(argv: string[]): ParsedArgs {
  const args: ParsedArgs = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--input') args.inputFile = argv[++i];
    else if (a === '--snapshot-ts') args.snapshotTs = argv[++i];
    else if (a === '--help-stub') {
      /* no-op */
    } else {
      console.error(`[ac-coverage-backfill-finalize] unknown flag: ${a}`);
      return args;
    }
  }
  return args;
}

export async function acCoverageBackfillFinalizeCmd(argv: string[]): Promise<number> {
  const args = parseArgs(argv);
  const cwd = process.cwd();
  const inputPath = args.inputFile ?? join(cwd, '.xera/coverage/ac-backfill-decisions.json');

  if (!existsSync(inputPath)) {
    console.error(`[ac-coverage-backfill-finalize] decisions file not found: ${inputPath}`);
    return 2;
  }

  let parsed: z.infer<typeof DecisionsSchema>;
  try {
    const raw = JSON.parse(readFileSync(inputPath, 'utf8'));
    parsed = DecisionsSchema.parse(raw);
  } catch (e) {
    console.error(`[ac-coverage-backfill-finalize] invalid decisions: ${(e as Error).message}`);
    return 2;
  }

  if (parsed.mappings.length === 0) return 0;

  // Group mappings by ticketId (extracted from scenarioId prefix)
  const byTicket: Record<string, z.infer<typeof DecisionsSchema>['mappings']> = {};
  for (const m of parsed.mappings) {
    const ticketId = m.scenarioId.split('#')[0];
    if (!ticketId) continue;
    if (!byTicket[ticketId]) byTicket[ticketId] = [];
    byTicket[ticketId].push(m);
  }

  const ts = args.snapshotTs ?? new Date().toISOString();
  const now = new Date(ts);

  for (const [ticketId, mappings] of Object.entries(byTicket)) {
    const event: Event = {
      event_id: ulid(),
      schema_version: SCHEMA_VERSION,
      ts,
      actor: 'xera-coverage',
      type: 'ac-coverage.backfilled',
      payload: { ts, ticketId, mappings },
    };
    appendEvents(cwd, [event], { skill: 'ac-coverage', ticketId, now });
  }

  return 0;
}
