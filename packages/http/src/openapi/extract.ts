const VERBS = ['get', 'post', 'put', 'patch', 'delete'] as const;
type Verb = (typeof VERBS)[number];

const PARAM_LOCATIONS = ['path', 'query', 'header', 'cookie'] as const;
type ParamLocation = (typeof PARAM_LOCATIONS)[number];

export interface ExtractedParam {
  name: string;
  in: ParamLocation;
  required: boolean;
  schema?: unknown;
  description?: string;
  example?: unknown;
}

export interface ExtractedResponse {
  status: string;
  description?: string;
  schema?: unknown;
}

export interface ExtractedOperation {
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  path: string;
  operationId?: string;
  summary?: string;
  description?: string;
  tags: string[];
  parameters: ExtractedParam[];
  requestBodySchema?: unknown;
  requestBodyExample?: unknown;
  responses: ExtractedResponse[];
}

export interface ExtractFilter {
  tags?: string[];
  operationIds?: string[];
  paths?: string[];
}

interface RawContent {
  schema?: unknown;
  example?: unknown;
  examples?: Record<string, { value?: unknown }>;
}
interface RawParam {
  name?: string;
  in?: string;
  required?: boolean;
  schema?: unknown;
  description?: string;
  example?: unknown;
}
interface RawOp {
  operationId?: string;
  summary?: string;
  description?: string;
  tags?: string[];
  parameters?: RawParam[];
  requestBody?: { content?: Record<string, RawContent> };
  responses?: Record<string, { description?: string; content?: Record<string, RawContent> }>;
}
interface RawPathItem extends Partial<Record<Verb, RawOp>> {
  parameters?: RawParam[];
}
interface RawDoc {
  info?: { title?: string; version?: string };
  paths?: Record<string, RawPathItem>;
}

function isParamLocation(s: string | undefined): s is ParamLocation {
  return s !== undefined && (PARAM_LOCATIONS as readonly string[]).includes(s);
}

/** First content media type (alphabetical) that carries a schema. Deterministic. */
function firstContent(content?: Record<string, RawContent>): RawContent | undefined {
  if (!content) return undefined;
  for (const key of Object.keys(content).sort()) {
    const c = content[key];
    if (c && (c.schema !== undefined || c.example !== undefined || c.examples !== undefined))
      return c;
  }
  return undefined;
}

function contentExample(c: RawContent | undefined): unknown {
  if (!c) return undefined;
  if (c.example !== undefined) return c.example;
  if (c.examples) {
    const first = Object.keys(c.examples).sort()[0];
    if (first !== undefined) return c.examples[first]?.value;
  }
  return undefined;
}

function extractParams(
  pathLevel: RawParam[] | undefined,
  opLevel: RawParam[] | undefined,
): ExtractedParam[] {
  const byKey = new Map<string, ExtractedParam>();
  const add = (raw: RawParam) => {
    if (!raw.name || !isParamLocation(raw.in)) return;
    const out: ExtractedParam = {
      name: raw.name,
      in: raw.in,
      required: raw.required === true || raw.in === 'path',
    };
    if (raw.schema !== undefined) out.schema = raw.schema;
    if (raw.description !== undefined) out.description = raw.description;
    if (raw.example !== undefined) out.example = raw.example;
    byKey.set(`${out.in}:${out.name}`, out);
  };
  for (const p of pathLevel ?? []) add(p);
  for (const p of opLevel ?? []) add(p); // operation-level overrides path-level
  return [...byKey.values()].sort((a, b) =>
    a.in === b.in ? a.name.localeCompare(b.name) : a.in.localeCompare(b.in),
  );
}

function extractResponses(responses: RawOp['responses']): ExtractedResponse[] {
  if (!responses) return [];
  return Object.keys(responses)
    .sort()
    .map((status) => {
      const r = responses[status];
      const c = firstContent(r?.content);
      const out: ExtractedResponse = { status };
      if (r?.description !== undefined) out.description = r.description;
      if (c?.schema !== undefined) out.schema = c.schema;
      return out;
    });
}

function buildOperation(
  method: Verb,
  path: string,
  op: RawOp,
  pathLevelParams: RawParam[] | undefined,
): ExtractedOperation {
  const out: ExtractedOperation = {
    method: method.toUpperCase() as ExtractedOperation['method'],
    path,
    tags: [...(op.tags ?? [])].sort(),
    parameters: extractParams(pathLevelParams, op.parameters),
    responses: extractResponses(op.responses),
  };
  if (op.operationId !== undefined) out.operationId = op.operationId;
  if (op.summary !== undefined) out.summary = op.summary;
  if (op.description !== undefined) out.description = op.description;
  const reqContent = firstContent(op.requestBody?.content);
  if (reqContent?.schema !== undefined) out.requestBodySchema = reqContent.schema;
  const reqExample = contentExample(reqContent);
  if (reqExample !== undefined) out.requestBodyExample = reqExample;
  return out;
}

function matchesFilter(op: ExtractedOperation, filter?: ExtractFilter): boolean {
  if (!filter) return true;
  const checks: boolean[] = [];
  if (filter.tags?.length) checks.push(op.tags.some((t) => filter.tags!.includes(t)));
  if (filter.operationIds?.length)
    checks.push(op.operationId !== undefined && filter.operationIds.includes(op.operationId));
  if (filter.paths?.length) checks.push(filter.paths.includes(op.path));
  if (checks.length === 0) return true; // filter object with no active dimension = include all
  return checks.some(Boolean);
}

/**
 * Flatten a dereferenced OpenAPI document into a deterministic, hashable list of
 * operations. Ordering is stable (paths asc, methods in fixed verb order) so the
 * caller can hash the result for drift detection.
 */
export function extractOperations(doc: unknown, filter?: ExtractFilter): ExtractedOperation[] {
  const d = (doc ?? {}) as RawDoc;
  const paths = d.paths ?? {};
  const out: ExtractedOperation[] = [];
  for (const path of Object.keys(paths).sort()) {
    const item = paths[path];
    if (!item) continue;
    for (const verb of VERBS) {
      const op = item[verb];
      if (!op) continue;
      const built = buildOperation(verb, path, op, item.parameters);
      if (matchesFilter(built, filter)) out.push(built);
    }
  }
  return out;
}

export function extractInfo(doc: unknown): { title: string; version: string } {
  const d = (doc ?? {}) as RawDoc;
  return { title: d.info?.title ?? 'API', version: d.info?.version ?? '0.0.0' };
}
