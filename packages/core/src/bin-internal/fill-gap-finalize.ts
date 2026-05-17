import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';

const ProposalsSchema = z.object({
  proposals: z.array(
    z.object({
      id: z.string().min(1),
      ticketId: z.string().min(1),
      title: z.string().min(1),
      rationale: z.string().min(1),
      gherkin: z.string().min(1),
      satisfiesAcs: z.array(z.number().int().nonnegative()),
    }),
  ),
});

interface ParsedArgs {
  accept: string;
  ticket: string;
  source?: string;
  force: boolean;
}

function parseArgs(argv: string[]): ParsedArgs | { error: string } {
  let accept: string | undefined;
  let ticket: string | undefined;
  let source: string | undefined;
  let force = false;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--accept') {
      const v = argv[++i];
      if (v !== undefined) accept = v;
    } else if (a === '--ticket') {
      const v = argv[++i];
      if (v !== undefined) ticket = v;
    } else if (a === '--source') {
      const v = argv[++i];
      if (v !== undefined) source = v;
    } else if (a === '--force') {
      force = true;
    } else if (a === '--help-stub') {
      /* no-op */
    } else {
      return { error: `unknown flag: ${a}` };
    }
  }
  if (!accept || !ticket) return { error: 'required: --accept <proposal-id> --ticket <TICKET>' };
  const out: ParsedArgs = { accept, ticket, force };
  if (source !== undefined) out.source = source;
  return out;
}

function formatDraft(
  ticketId: string,
  proposal: z.infer<typeof ProposalsSchema>['proposals'][number],
): string {
  const lines = [
    `# Draft scenario for ${ticketId}`,
    '',
    `> ${proposal.rationale}`,
    '',
    proposal.gherkin,
    '',
  ];
  if (proposal.satisfiesAcs.length > 0) {
    lines.push(`<!-- satisfiesAcs: [${proposal.satisfiesAcs.join(', ')}] -->`);
    lines.push('');
  }
  return lines.join('\n');
}

export async function fillGapFinalizeCmd(argv: string[]): Promise<number> {
  if (argv.includes('--help-stub')) {
    /* test scaffold no-op */
  }
  const parsed = parseArgs(argv);
  if ('error' in parsed) {
    console.error(`[fill-gap-finalize] ${parsed.error}`);
    return 1;
  }

  const cwd = process.cwd();
  const sourcePath = parsed.source ?? join(cwd, '.xera/coverage/proposals.json');
  if (!existsSync(sourcePath)) {
    console.error(`[fill-gap-finalize] source not found: ${sourcePath}`);
    return 2;
  }

  let proposals: z.infer<typeof ProposalsSchema>;
  try {
    const raw = JSON.parse(readFileSync(sourcePath, 'utf8'));
    proposals = ProposalsSchema.parse(raw);
  } catch (e) {
    console.error(`[fill-gap-finalize] invalid proposals: ${(e as Error).message}`);
    return 2;
  }

  const proposal = proposals.proposals.find((p) => p.id === parsed.accept);
  if (!proposal) {
    console.error(`[fill-gap-finalize] proposal id "${parsed.accept}" not in source`);
    return 2;
  }

  const ticketDir = join(cwd, '.xera', parsed.ticket);
  mkdirSync(ticketDir, { recursive: true });
  const draftPath = join(ticketDir, 'feature.draft.md');
  if (existsSync(draftPath) && !parsed.force) {
    console.error(`[fill-gap-finalize] ${draftPath} exists; pass --force to overwrite`);
    return 3;
  }
  writeFileSync(draftPath, formatDraft(parsed.ticket, proposal));
  return 0;
}
