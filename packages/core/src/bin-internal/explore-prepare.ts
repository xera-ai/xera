import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const VALID_CATEGORIES = [
  'negative',
  'boundary',
  'state-combination',
  'race',
  'error-recovery',
  'a11y',
  'security-smell',
  'non-functional',
] as const;

type Category = (typeof VALID_CATEGORIES)[number];

interface ParsedArgs {
  ticket: string;
  categoriesInclude: Category[];
  userHint: string;
}

function parseArgs(argv: string[]): ParsedArgs | { error: string } {
  let ticket: string | undefined;
  let categoriesRaw = '';
  let userHint = '';
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--categories') {
      const v = argv[++i];
      if (v !== undefined) categoriesRaw = v;
    } else if (a === '--user-hint') {
      const v = argv[++i];
      if (v !== undefined) userHint = v;
    } else if (a === '--help-stub') {
      /* no-op */
    } else if (a && !a.startsWith('--') && ticket === undefined) {
      ticket = a;
    } else {
      return { error: `unknown flag: ${a}` };
    }
  }
  if (!ticket) return { error: 'ticket key is required as a positional argument' };

  const categoriesInclude: Category[] = [];
  for (const slug of categoriesRaw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)) {
    if (!(VALID_CATEGORIES as readonly string[]).includes(slug)) {
      return { error: `invalid category: ${slug}` };
    }
    categoriesInclude.push(slug as Category);
  }

  return { ticket, categoriesInclude, userHint };
}

interface AdversarialInput {
  ticket: { id: string; summary: string; story: string; ac: string[] };
  existingFeature?: string;
  existingSpec?: string;
  adapter: 'web' | 'http';
  categoriesInclude: Category[];
  userHint?: string;
}

function parseStoryMd(content: string): { summary: string; ac: string[]; body: string } {
  // story.md format: optional frontmatter with `summary:` and `ac:` (yaml-ish list),
  // followed by the body. We do a minimal parse — full YAML is overkill here.
  const fmMatch = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!fmMatch) return { summary: '', ac: [], body: content };
  const [, fm, body] = fmMatch;
  const summaryMatch = fm!.match(/^summary:\s*(.+)$/m);
  const summary = summaryMatch?.[1]?.trim() ?? '';
  const ac: string[] = [];
  const acBlock = fm!.match(/^ac:\s*\n((?:\s*-\s.+\n?)+)/m);
  if (acBlock) {
    for (const line of acBlock[1]!.split('\n')) {
      const m = line.match(/^\s*-\s*(.+)$/);
      if (m) ac.push(m[1]!.trim());
    }
  }
  return { summary, ac, body: body!.trim() };
}

export async function explorePrepareCmd(argv: string[]): Promise<number> {
  const parsed = parseArgs(argv);
  if ('error' in parsed) {
    console.error(`[explore-prepare] ${parsed.error}`);
    return 1;
  }

  const cwd = process.cwd();
  const configPath = join(cwd, 'xera.config.ts');
  if (!existsSync(configPath)) {
    console.error('[explore-prepare] xera.config.ts not found — run inside a xera project');
    return 2;
  }

  const ticketDir = join(cwd, '.xera', parsed.ticket);
  const storyPath = join(ticketDir, 'story.md');
  if (!existsSync(storyPath)) {
    console.error(
      `[explore-prepare] no story for ${parsed.ticket} — run /xera-fetch ${parsed.ticket} first`,
    );
    return 2;
  }

  const story = readFileSync(storyPath, 'utf8');
  const { summary, ac, body } = parseStoryMd(story);

  let adapter: 'web' | 'http' = 'web';
  const metaPath = join(ticketDir, 'meta.json');
  if (existsSync(metaPath)) {
    try {
      const meta = JSON.parse(readFileSync(metaPath, 'utf8')) as { adapter?: string };
      if (meta.adapter === 'http') adapter = 'http';
    } catch {
      /* leave default web */
    }
  }

  const input: AdversarialInput = {
    ticket: { id: parsed.ticket, summary, story: body, ac },
    adapter,
    categoriesInclude: parsed.categoriesInclude,
  };

  const featurePath = join(ticketDir, 'test.feature');
  if (existsSync(featurePath)) input.existingFeature = readFileSync(featurePath, 'utf8');

  const specPath = join(ticketDir, 'spec.ts');
  if (existsSync(specPath)) input.existingSpec = readFileSync(specPath, 'utf8');

  if (parsed.userHint) input.userHint = parsed.userHint;

  const outPath = join(ticketDir, 'adversarial-input.json');
  writeFileSync(outPath, JSON.stringify(input, null, 2));
  console.log(`[explore-prepare] wrote ${outPath}`);
  return 0;
}
