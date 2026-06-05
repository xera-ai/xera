import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';
import { readAuthState } from '../auth/state';
import { loadConfig } from '../config/load';
import { resolveOpenApiSpec } from '../config/schema';

interface DiscoverOpts {
  role: string;
}

function parseOpts(argv: string[]): DiscoverOpts {
  let role = '';
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--role' && argv[i + 1]) {
      role = argv[i + 1]!;
      i++;
    }
  }
  if (!role) throw new Error('--role <name> is required');
  return { role };
}

function hostnameOf(url: string | undefined): string {
  if (!url) return '';
  try {
    return new URL(url).hostname;
  } catch {
    return '';
  }
}

export async function httpAuthDiscoverPrepare(argv: string[]): Promise<number> {
  let opts: DiscoverOpts;
  try {
    opts = parseOpts(argv);
  } catch (e) {
    console.error(`[xera:http-auth-discover] ${(e as Error).message}`);
    return 1;
  }
  const cwd = process.cwd();
  const cfg = await loadConfig(cwd);
  if (!cfg.http) {
    console.error(`[xera:http-auth-discover] xera.config.ts has no http block.`);
    return 1;
  }
  if (cfg.http.auth.strategy !== 'reuse-web-session') {
    console.error(
      `[xera:http-auth-discover] http.auth.strategy is '${cfg.http.auth.strategy}', expected 'reuse-web-session'. Switch the strategy first.`,
    );
    return 1;
  }
  const webEntry = readAuthState(join(cwd, '.xera', '.auth'), opts.role);
  if (!webEntry || webEntry.strategy !== 'storageState') {
    console.error(
      `[xera:http-auth-discover] No web auth file at .xera/.auth/${opts.role}.json (strategy='storageState'). Run: npx xera-internal auth-setup --role ${opts.role} --shape web`,
    );
    return 1;
  }
  const allCookies = ((webEntry.payload as { cookies?: unknown }).cookies ?? []) as Array<{
    name: string;
    value: string;
    domain: string;
    path: string;
    expires?: number;
    httpOnly?: boolean;
    sameSite?: string;
  }>;
  const nowSec = Math.floor(Date.now() / 1000);
  const specPath = resolveOpenApiSpec(cfg);
  const fallbackHost = specPath?.startsWith('http')
    ? specPath
    : cfg.http.baseUrl[cfg.http.defaultEnv];
  const apiHostHint = hostnameOf(fallbackHost);

  const input = {
    role: opts.role,
    apiHostHint,
    cookies: allCookies.map((c) => {
      const out: Record<string, unknown> = {
        name: c.name,
        domain: c.domain,
        path: c.path,
        httpOnly: !!c.httpOnly,
        sameSite: c.sameSite ?? 'Lax',
      };
      if (c.expires && c.expires > 0) {
        out.expiresInSeconds = Math.max(0, c.expires - nowSec);
      }
      return out;
    }),
  };

  const outDir = join(cwd, '.xera', '.auth');
  mkdirSync(outDir, { recursive: true });
  const outPath = join(outDir, `http-auth-discover-input-${opts.role}.json`);
  writeFileSync(outPath, JSON.stringify(input, null, 2));
  console.log(
    `[xera:http-auth-discover] wrote ${outPath} (${input.cookies.length} cookies, names + metadata only)`,
  );
  return 0;
}

const DiscoveryOutputSchema = z.object({
  domainContains: z.string(),
  access: z.object({ cookieName: z.string(), confidence: z.number(), reason: z.string() }),
  refresh: z
    .object({ cookieName: z.string(), confidence: z.number(), reason: z.string() })
    .nullable(),
  csrf: z
    .object({
      cookieName: z.string(),
      header: z.string(),
      confidence: z.number(),
      reason: z.string(),
    })
    .nullable(),
  notes: z.string(),
});

export async function httpAuthDiscoverFinalize(argv: string[]): Promise<number> {
  let opts: DiscoverOpts;
  try {
    opts = parseOpts(argv);
  } catch (e) {
    console.error(`[xera:http-auth-discover] ${(e as Error).message}`);
    return 1;
  }
  const cwd = process.cwd();
  const outPath = join(cwd, '.xera', '.auth', `http-auth-discover-output-${opts.role}.json`);
  if (!existsSync(outPath)) {
    console.error(`[xera:http-auth-discover] LLM output missing at ${outPath}.`);
    return 1;
  }
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(outPath, 'utf8'));
  } catch (e) {
    console.error(
      `[xera:http-auth-discover] LLM output is not valid JSON: ${(e as Error).message}`,
    );
    return 1;
  }
  const parsed = DiscoveryOutputSchema.safeParse(raw);
  if (!parsed.success) {
    console.error(
      `[xera:http-auth-discover] LLM output failed schema validation: ${parsed.error.message}`,
    );
    return 1;
  }
  const result = parsed.data;
  if (result.notes.startsWith('injection-follow refused')) {
    console.error(
      `[xera:http-auth-discover] refusal detected — the LLM judged the cookies input as an injection attempt. No proposal emitted.`,
    );
    return 1;
  }
  const inputPath = join(cwd, '.xera', '.auth', `http-auth-discover-input-${opts.role}.json`);
  if (!existsSync(inputPath)) {
    console.error(
      `[xera:http-auth-discover] input file missing at ${inputPath}. Run prepare first.`,
    );
    return 1;
  }
  const input = JSON.parse(readFileSync(inputPath, 'utf8')) as { cookies: Array<{ name: string }> };
  const names = new Set(input.cookies.map((c) => c.name));
  const nominated: string[] = [result.access.cookieName];
  if (result.refresh) nominated.push(result.refresh.cookieName);
  if (result.csrf) nominated.push(result.csrf.cookieName);
  for (const n of nominated) {
    if (!names.has(n)) {
      console.error(
        `[xera:http-auth-discover] nominated cookie '${n}' not in captured cookies. Captured: ${[...names].join(', ')}.`,
      );
      return 1;
    }
  }
  if (!result.domainContains) {
    console.error(`[xera:http-auth-discover] LLM emitted an empty domainContains; refusing.`);
    return 1;
  }
  const lines: string[] = [];
  lines.push(`// Paste under http.auth.roles.${opts.role} in xera.config.ts:`);
  lines.push(`reuseWebSession: {`);
  lines.push(`  domainContains: '${result.domainContains}',`);
  lines.push(`  cookies: {`);
  lines.push(`    access: { match: { literal: '${result.access.cookieName}' } },`);
  if (result.refresh) {
    lines.push(`    refresh: { match: { literal: '${result.refresh.cookieName}' } },`);
  }
  if (result.csrf) {
    lines.push(
      `    csrf: { match: { literal: '${result.csrf.cookieName}' }, header: '${result.csrf.header}' },`,
    );
  }
  lines.push(`  },`);
  lines.push(`},`);
  for (const l of lines) console.log(l);
  console.log('');
  const confidenceParts = [`access: ${result.access.confidence}`];
  if (result.refresh) confidenceParts.push(`refresh: ${result.refresh.confidence}`);
  if (result.csrf) confidenceParts.push(`csrf: ${result.csrf.confidence}`);
  console.log(`Confidence — ${confidenceParts.join(', ')}`);
  if (result.notes) console.log(`Notes: ${result.notes}`);
  return 0;
}
