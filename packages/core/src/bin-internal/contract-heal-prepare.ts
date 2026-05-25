import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { readMeta } from '../artifact/meta';
import { resolveArtifactPaths } from '../artifact/paths';
import { loadConfig } from '../config/load';
import { resolveOpenApiSpec } from '../config/schema';

export type ContractRefusal = 'web-no-assertion' | 'unsupported-edit' | 'no-spec' | null;

export interface ContractHealInput {
  ticket: string;
  runId: string;
  scenarioName: string;
  adapter: string;
  /** Set when the deterministic step already knows heal can't proceed; skill refuses without an LLM call. */
  refusable: ContractRefusal;
  drift?: { method: string; url: string; status: number; respBody?: unknown };
  expected?: { documentedStatuses: string[]; requiredFields: string[] };
  assertion?: { specFile: string; specLine: number; specLineContent: string };
  gherkinStep?: string;
}

interface HttpCall {
  method: string;
  url: string;
  status: number;
  respBody?: unknown;
}

interface OpenApiOperationView {
  responses?: Record<string, { content?: Record<string, { schema?: { required?: string[] } }> }>;
}

function findGherkinStep(featureText: string): string {
  for (const line of featureText.split('\n')) {
    if (/^\s*(When|Then)\b/.test(line)) return line.trim();
  }
  return '';
}

function locateStatusAssertion(
  specPath: string,
): { specFile: string; specLine: number; specLineContent: string } | null {
  if (!existsSync(specPath)) return null;
  const lines = readFileSync(specPath, 'utf8').split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    // http specs assert on the response status, e.g. expect(res.status()).toBe(200)
    if (line.includes('.status()') && line.includes('.toBe(')) {
      return { specFile: specPath, specLine: i + 1, specLineContent: line };
    }
  }
  return null;
}

export async function contractHealPrepare(
  repoRoot: string,
  ticket: string,
  runId: string,
  scenarioName: string,
): Promise<ContractHealInput> {
  const paths = resolveArtifactPaths(repoRoot, ticket);
  const meta = readMeta(paths.metaPath);
  const adapter = meta?.adapter ?? 'web';
  const base: ContractHealInput = { ticket, runId, scenarioName, adapter, refusable: null };

  // Web tests don't assert on the network response directly — nothing to rewrite.
  if (adapter !== 'http') return { ...base, refusable: 'web-no-assertion' };

  const config = await loadConfig(repoRoot);
  const spec = resolveOpenApiSpec(config);
  if (!spec) return { ...base, refusable: 'no-spec' };

  const normalizedPath = join(paths.runsDir, runId, 'normalized.json');
  const norm = existsSync(normalizedPath)
    ? (JSON.parse(readFileSync(normalizedPath, 'utf8')) as { http?: { calls?: HttpCall[] } })
    : {};
  const calls = norm.http?.calls ?? [];

  const { loadOpenApi, findOperation } = await import('@xera-ai/http');
  const openapi = await loadOpenApi(spec);
  if (!openapi) return { ...base, refusable: 'no-spec' };

  // The call under test = the first call to a documented endpoint.
  const found = calls
    .map((c) => ({ call: c, op: findOperation(openapi, c.method, c.url) }))
    .find((x) => x.op !== null);
  if (!found?.op) return { ...base, refusable: 'unsupported-edit' };

  const operation = found.op.operation as OpenApiOperationView;
  const documentedStatuses = Object.keys(operation.responses ?? {});
  const happy = documentedStatuses.find((s) => /^2\d\d$/.test(s));
  const requiredFields =
    (happy && operation.responses?.[happy]?.content?.['application/json']?.schema?.required) ?? [];

  const assertion = locateStatusAssertion(paths.specPath);
  if (!assertion) return { ...base, refusable: 'unsupported-edit' };

  const gherkinStep = existsSync(paths.featurePath)
    ? findGherkinStep(readFileSync(paths.featurePath, 'utf8'))
    : '';

  const out: ContractHealInput = {
    ...base,
    drift: {
      method: found.call.method,
      url: found.call.url,
      status: found.call.status,
    },
    expected: { documentedStatuses, requiredFields: [...requiredFields] },
    assertion,
    gherkinStep,
  };
  if (found.call.respBody !== undefined) out.drift!.respBody = found.call.respBody;
  return out;
}

export async function contractHealPrepareCmd(argv: string[]): Promise<number> {
  const [ticket, runId, ...scenarioParts] = argv;
  if (!ticket || !runId || scenarioParts.length === 0) {
    console.error(
      '[xera:contract-heal-prepare] usage: contract-heal-prepare <TICKET> <RUN_ID> <SCENARIO_NAME>',
    );
    return 1;
  }
  const scenarioName = scenarioParts.join(' ');
  const result = await contractHealPrepare(process.cwd(), ticket, runId, scenarioName);
  const paths = resolveArtifactPaths(process.cwd(), ticket);
  const outPath = join(paths.runsDir, runId, 'contract-heal-input.json');
  writeFileSync(outPath, JSON.stringify(result, null, 2));
  console.log(
    `[xera:contract-heal-prepare] wrote ${outPath}${result.refusable ? ` (refusable: ${result.refusable})` : ''}`,
  );
  return 0;
}
