import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { isAbsolute, join, resolve } from 'node:path';
import { resolveArtifactPaths } from '../artifact/paths';
import { loadConfig } from '../config/load';

interface OpenApiInput {
  openapi: unknown | null;
  reason?: string;
}

export async function openapiResolveCmd(argv: string[]): Promise<number> {
  const ticket = argv[0];
  if (!ticket) {
    console.error('[xera:openapi-resolve] usage: openapi-resolve <TICKET>');
    return 1;
  }

  const cwd = process.cwd();
  const paths = resolveArtifactPaths(cwd, ticket);
  if (!existsSync(paths.ticketDir)) {
    mkdirSync(paths.ticketDir, { recursive: true });
  }
  const outPath = join(paths.ticketDir, 'openapi-input.json');

  const writeOut = (out: OpenApiInput) => {
    writeFileSync(outPath, JSON.stringify(out, null, 2));
  };

  let config: Awaited<ReturnType<typeof loadConfig>>;
  try {
    config = await loadConfig(cwd);
  } catch (err) {
    writeOut({ openapi: null, reason: `loadConfig failed: ${(err as Error).message}` });
    console.warn(`[xera:openapi-resolve] ${(err as Error).message}; wrote openapi: null`);
    return 0;
  }

  const spec = config.http?.spec;
  if (!spec) {
    writeOut({ openapi: null, reason: 'http.spec not configured' });
    console.log(`[xera:openapi-resolve] wrote ${outPath} (openapi: null — http.spec not set)`);
    return 0;
  }

  const isUrl = spec.startsWith('http://') || spec.startsWith('https://');
  const resolvedSpec = isUrl ? spec : isAbsolute(spec) ? spec : resolve(cwd, spec);

  try {
    const { loadOpenApi } = await import('@xera-ai/http');
    const doc = await loadOpenApi(resolvedSpec);
    if (doc === null) {
      writeOut({ openapi: null, reason: `spec unreachable or not found at ${spec}` });
      console.warn(`[xera:openapi-resolve] could not load ${spec}; wrote openapi: null`);
      return 0;
    }
    writeOut({ openapi: doc });
    const opCount = Object.keys((doc as { paths?: Record<string, unknown> }).paths ?? {}).length;
    console.log(`[xera:openapi-resolve] wrote ${outPath} (${opCount} paths from ${spec})`);
    return 0;
  } catch (err) {
    writeOut({ openapi: null, reason: (err as Error).message });
    console.warn(
      `[xera:openapi-resolve] error loading ${spec}: ${(err as Error).message}; wrote openapi: null`,
    );
    return 0;
  }
}
