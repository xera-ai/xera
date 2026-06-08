import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { serveHtmlFile } from '../serve';

export interface DashboardOptions {
  since?: string;
  classification?: string[];
  area?: string[];
  failingOnly?: boolean;
  json?: boolean;
  html?: string | boolean;
  serve?: boolean;
  port?: string;
}

function buildBinaryArgs(opts: DashboardOptions, htmlPath: string | undefined): string[] {
  const args = ['xera-internal', 'dashboard'];
  if (opts.since) args.push('--since', opts.since);
  for (const c of opts.classification ?? []) args.push('--classification', c);
  for (const a of opts.area ?? []) args.push('--area', a);
  if (opts.failingOnly) args.push('--failing-only');
  if (opts.json) args.push('--json');
  if (htmlPath) args.push('--html', htmlPath);
  return args;
}

function spawnBinary(args: string[], cwd: string): Promise<number> {
  return new Promise((resolvePromise) => {
    const child = spawn('npx', args, { cwd, stdio: 'inherit' });
    child.on('close', (code) => resolvePromise(code ?? 1));
    child.on('error', () => resolvePromise(1));
  });
}

/**
 * Wraps `xera-internal dashboard`. Defaults to text mode (passes flags through).
 *
 * Modes:
 *  - default / `--json`: stdio is inherited from the binary
 *  - `--html [path]`: writes HTML to <path> (default `.xera/dashboard.html`)
 *  - `--serve`: writes HTML to a tmp file, then serves it via `serveHtmlFile`
 *    and opens the browser; blocks until SIGINT
 */
export async function dashboardCommand(
  opts: DashboardOptions,
  cwd: string = process.cwd(),
): Promise<number> {
  const port = opts.port ? Number.parseInt(opts.port, 10) : 9323;

  if (opts.serve) {
    const tmpHtml = join(tmpdir(), `xera-dashboard-${Date.now()}.html`);
    const code = await spawnBinary(buildBinaryArgs(opts, tmpHtml), cwd);
    if (code !== 0) return code;
    return serveHtmlFile(tmpHtml, port, cwd);
  }

  const htmlPath =
    typeof opts.html === 'string'
      ? opts.html
      : opts.html === true
        ? join(cwd, '.xera', 'dashboard.html')
        : undefined;

  return spawnBinary(buildBinaryArgs(opts, htmlPath), cwd);
}
