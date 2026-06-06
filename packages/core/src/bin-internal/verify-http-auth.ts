import { loadConfig } from '../config/load';

interface VerifyOpts {
  role: string;
  path: string;
  method: string;
}

function parseOpts(argv: string[]): VerifyOpts {
  let role = '';
  let path = '';
  let method = 'GET';
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    const next = argv[i + 1];
    if (flag === '--role' && next) {
      role = next;
      i++;
    } else if (flag === '--path' && next) {
      path = next;
      i++;
    } else if (flag === '--method' && next) {
      method = next.toUpperCase();
      i++;
    }
  }
  if (!role || !path) {
    throw new Error(
      'Usage: xera-internal verify-http-auth --role <name> --path </api/health> [--method GET]',
    );
  }
  return { role, path, method };
}

export async function verifyHttpAuthCmd(argv: string[]): Promise<number> {
  let opts: VerifyOpts;
  try {
    opts = parseOpts(argv);
  } catch (e) {
    console.error(`[xera:verify-http-auth] ${(e as Error).message}`);
    return 1;
  }
  const cwd = process.cwd();
  const cfg = await loadConfig(cwd);
  if (!cfg.http) {
    console.error(`[xera:verify-http-auth] xera.config.ts has no http block.`);
    return 1;
  }
  const envName = process.env.XERA_ENV ?? cfg.http.defaultEnv;
  const baseURL = cfg.http.baseUrl[envName] ?? cfg.http.baseUrl[cfg.http.defaultEnv];
  if (!baseURL) {
    console.error(`[xera:verify-http-auth] no baseUrl found for env '${envName}'.`);
    return 1;
  }
  process.env.XERA_BASE_URL = baseURL;

  const playwright = await import('@playwright/test');
  const { newAuthedContext } = await import('@xera-ai/http');
  let ctx: Awaited<ReturnType<typeof newAuthedContext>> | null = null;
  try {
    ctx = await newAuthedContext({ request: playwright.request }, opts.role);
  } catch (e) {
    console.error(
      `[xera:verify-http-auth] failed to build authed context: ${(e as Error).message}`,
    );
    return 1;
  }
  const fullUrl = opts.path.startsWith('http')
    ? opts.path
    : `${baseURL.endsWith('/') ? baseURL.slice(0, -1) : baseURL}${opts.path.startsWith('/') ? opts.path : `/${opts.path}`}`;
  try {
    let res: Awaited<ReturnType<typeof ctx.get>>;
    if (opts.method === 'GET') res = await ctx.get(fullUrl);
    else if (opts.method === 'HEAD') res = await ctx.head(fullUrl);
    else if (opts.method === 'POST') res = await ctx.post(fullUrl);
    else if (opts.method === 'PUT') res = await ctx.put(fullUrl);
    else if (opts.method === 'DELETE') res = await ctx.delete(fullUrl);
    else {
      console.error(`[xera:verify-http-auth] unsupported --method '${opts.method}'.`);
      return 1;
    }
    const status = res.status();
    const ok = status >= 200 && status < 300;
    if (ok) {
      console.log(
        `[xera:verify-http-auth] ✓ ${opts.method} ${fullUrl} → ${status} — role '${opts.role}' auth file works.`,
      );
      return 0;
    }
    const hint =
      status === 401 || status === 403
        ? ` ${status === 403 ? '(CSRF or scope problem — check `npx xera doctor` for the CSRF check)' : '(token/cookie likely expired — re-run `auth-setup --shape http`)'}`
        : '';
    console.error(
      `[xera:verify-http-auth] ✗ ${opts.method} ${fullUrl} → ${status} — auth file did NOT work.${hint}`,
    );
    return 1;
  } finally {
    if (ctx) await ctx.dispose();
  }
}
