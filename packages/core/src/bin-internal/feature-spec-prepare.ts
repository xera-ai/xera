import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { isAbsolute, resolve } from 'node:path';
import { hashString } from '../artifact/hash';
import { readMeta, writeMeta } from '../artifact/meta';
import { resolveArtifactPaths } from '../artifact/paths';
import { loadConfig } from '../config/load';
import { PROMPTS_VERSION, XERA_VERSION } from '../versions';

interface ParsedArgs {
  key: string;
  spec?: string;
  tags: string[];
  operationIds: string[];
  paths: string[];
}

function parseArgs(argv: string[]): ParsedArgs | null {
  const key = argv[0];
  if (!key || key.startsWith('--')) return null;
  const out: ParsedArgs = { key, tags: [], operationIds: [], paths: [] };
  for (let i = 1; i < argv.length; i++) {
    const flag = argv[i];
    const val = argv[i + 1];
    if (val === undefined) break;
    if (flag === '--spec') out.spec = val;
    else if (flag === '--tag') out.tags.push(val);
    else if (flag === '--operation') out.operationIds.push(val);
    else if (flag === '--path') out.paths.push(val);
    else continue;
    i++;
  }
  return out;
}

interface SpecInputOp {
  method: string;
  path: string;
  operationId?: string;
  summary?: string;
  description?: string;
  tags: string[];
  parameters: unknown[];
  requestBodySchema?: unknown;
  requestBodyExample?: unknown;
  responses: Array<{ status: string; description?: string; schema?: unknown }>;
}

function buildFilter(args: ParsedArgs) {
  const filter: { tags?: string[]; operationIds?: string[]; paths?: string[] } = {};
  if (args.tags.length) filter.tags = args.tags;
  if (args.operationIds.length) filter.operationIds = args.operationIds;
  if (args.paths.length) filter.paths = args.paths;
  return Object.keys(filter).length > 0 ? filter : undefined;
}

function happyStatus(responses: SpecInputOp['responses']): string | undefined {
  return responses.find((r) => /^2\d\d$/.test(r.status))?.status;
}

function acLineFor(op: SpecInputOp): string {
  const happy = happyStatus(op.responses);
  const errors = op.responses.filter((r) => !/^2\d\d$/.test(r.status)).map((r) => r.status);
  const base = happy
    ? `${op.method} ${op.path} returns ${happy}`
    : `${op.method} ${op.path} responds per spec`;
  return errors.length ? `${base}; documented errors: ${errors.join(', ')}` : base;
}

function filterDescription(args: ParsedArgs): string | undefined {
  const parts: string[] = [];
  if (args.tags.length) parts.push(`tags: ${args.tags.join(', ')}`);
  if (args.operationIds.length) parts.push(`operations: ${args.operationIds.join(', ')}`);
  if (args.paths.length) parts.push(`paths: ${args.paths.join(', ')}`);
  return parts.length ? parts.join('; ') : undefined;
}

function renderSyntheticStory(
  key: string,
  summary: string,
  storyHash: string,
  ops: SpecInputOp[],
  specRef: string,
  info: { title: string; version: string },
  filterDesc: string | undefined,
): string {
  const acLines = ops.map(acLineFor);
  const yaml: string[] = [
    '---',
    `ticketId: ${key}`,
    `summary: ${JSON.stringify(summary)}`,
    `storyHash: ${storyHash}`,
  ];
  if (acLines.length > 0) {
    yaml.push('acceptanceCriteria:');
    for (const ac of acLines) yaml.push(`  - ${JSON.stringify(ac)}`);
  }
  yaml.push('acceptanceCriteriaSource: openapi', '---', '');

  const coverage = filterDesc
    ? `This ticket covers ${ops.length} operation(s) (${filterDesc}).`
    : `This ticket covers ${ops.length} operation(s).`;
  const body: string[] = [
    `# ${key}: ${summary}`,
    '',
    '## Story',
    '',
    `Generated from OpenAPI spec \`${specRef}\` (${info.title} ${info.version}).`,
    coverage,
    '',
    '## Operations',
    '',
    ...ops.map((o) => `- **${o.method}** \`${o.path}\`${o.summary ? ` — ${o.summary}` : ''}`),
    '',
    '## Acceptance Criteria',
    '',
    ...acLines.map((ac) => `- ${ac}`),
    '',
  ];
  return yaml.join('\n') + body.join('\n');
}

export async function featureSpecPrepareCmd(argv: string[]): Promise<number> {
  const args = parseArgs(argv);
  if (!args) {
    console.error(
      '[xera:feature-spec-prepare] usage: feature-spec-prepare <KEY> [--spec PATH] [--tag T]... [--operation OPID]... [--path P]...',
    );
    return 1;
  }

  const cwd = process.cwd();
  const paths = resolveArtifactPaths(cwd, args.key); // throws on invalid key → caught by run()
  const outPath = resolve(paths.ticketDir, 'spec-input.json');

  const writeEmpty = (reason: string) => {
    mkdirSync(paths.ticketDir, { recursive: true });
    writeFileSync(
      outPath,
      JSON.stringify({ key: args.key, source: 'openapi', operations: [], reason }, null, 2),
    );
  };

  let config: Awaited<ReturnType<typeof loadConfig>> | null = null;
  try {
    config = await loadConfig(cwd);
  } catch (err) {
    if (!args.spec) {
      writeEmpty(`loadConfig failed: ${(err as Error).message}`);
      console.warn(`[xera:feature-spec-prepare] ${(err as Error).message}; wrote empty spec-input`);
      return 0;
    }
  }

  const specRef = args.spec ?? config?.http?.spec;
  if (!specRef) {
    writeEmpty('no OpenAPI spec configured (set http.spec in xera.config or pass --spec)');
    console.log('[xera:feature-spec-prepare] no spec configured; wrote empty spec-input');
    return 0;
  }

  const isUrl = specRef.startsWith('http://') || specRef.startsWith('https://');
  const resolvedSpec = isUrl ? specRef : isAbsolute(specRef) ? specRef : resolve(cwd, specRef);

  const { loadOpenApi, extractOperations, extractInfo } = await import('@xera-ai/http');
  const doc = await loadOpenApi(resolvedSpec);
  if (doc === null) {
    writeEmpty(`spec unreachable or not found at ${specRef}`);
    console.warn(`[xera:feature-spec-prepare] could not load ${specRef}; wrote empty spec-input`);
    return 0;
  }

  const filter = buildFilter(args);
  const ops = extractOperations(doc, filter) as SpecInputOp[];
  const info = extractInfo(doc);
  if (ops.length === 0) {
    const all = extractOperations(doc).map((o) => `${o.method} ${o.path}`);
    writeEmpty(`filter matched no operations (available: ${all.join(', ') || 'none'})`);
    console.warn(
      '[xera:feature-spec-prepare] filter matched no operations; wrote empty spec-input',
    );
    return 0;
  }

  const specHash = hashString(JSON.stringify({ specRef, info, ops }));

  const existing = readMeta(paths.metaPath);
  if (existing?.spec_hash === specHash && existsSync(paths.storyPath) && existsSync(outPath)) {
    console.log(`[xera:feature-spec-prepare] current (${args.key})`);
    return 0;
  }

  const filterDesc = filterDescription(args);
  const summary = filterDesc ? `${info.title} API — ${filterDesc}` : `${info.title} API`;

  const specInput: Record<string, unknown> = {
    key: args.key,
    source: 'openapi',
    specRef,
    info,
    operations: ops,
    spec_hash: specHash,
  };
  if (filter) specInput.filter = filter;

  mkdirSync(paths.ticketDir, { recursive: true });
  writeFileSync(outPath, JSON.stringify(specInput, null, 2));
  writeFileSync(
    paths.storyPath,
    renderSyntheticStory(args.key, summary, specHash, ops, specRef, info, filterDesc),
  );

  writeMeta(paths.metaPath, {
    ticket: args.key,
    adapter: 'http',
    source: 'openapi',
    xera_version: XERA_VERSION,
    prompts_version: PROMPTS_VERSION,
    ...(existing ?? {}),
    story_hash: specHash,
    spec_hash: specHash,
    fetched_at: new Date().toISOString(),
  });

  console.log(`[xera:feature-spec-prepare] wrote ${ops.length} operation(s) for ${args.key}`);
  return 0;
}
