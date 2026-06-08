import { spawn } from 'node:child_process';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { basename, extname, join, relative, resolve, sep } from 'node:path';
import pc from 'picocolors';

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.txt': 'text/plain; charset=utf-8',
};

function openBrowser(url: string): void {
  const cmd =
    process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'start' : 'xdg-open';
  const args = process.platform === 'win32' ? ['', url] : [url];
  try {
    spawn(cmd, args, { stdio: 'ignore', detached: true, shell: process.platform === 'win32' })
      .on('error', () => {})
      .unref();
  } catch {
    // best-effort
  }
}

function safeResolve(rootDir: string, urlPath: string): string | null {
  const decoded = decodeURIComponent(urlPath.split('?')[0] ?? '/');
  const clean = decoded === '/' ? '' : decoded.replace(/^\/+/, '');
  const target = resolve(rootDir, clean);
  const rel = relative(rootDir, target);
  if (rel.startsWith('..') || rel.split(sep).includes('..')) return null;
  return target;
}

/**
 * Static-serve `entryHtmlPath` (at `/`) plus any file under `rootDir`
 * (at its relative path). Tries `port` first; on EADDRINUSE falls back to
 * an ephemeral port. Opens the URL in the user's browser. Blocks until
 * SIGINT; resolves with the process exit code (0 on graceful shutdown).
 */
export async function serveHtmlFile(
  entryHtmlPath: string,
  port: number,
  rootDir: string,
  host = '127.0.0.1',
): Promise<number> {
  const entryAbs = resolve(entryHtmlPath);
  const rootAbs = resolve(rootDir);
  const entryName = basename(entryAbs);

  const server = createServer((req, res) => {
    const url = req.url ?? '/';
    const isEntry = url === '/' || url === `/${entryName}` || url.startsWith('/?') || url === '';
    const filePath = isEntry ? entryAbs : safeResolve(rootAbs, url);
    if (!filePath) {
      res.statusCode = 400;
      res.end('Bad Request');
      return;
    }
    if (!existsSync(filePath)) {
      res.statusCode = 404;
      res.end('Not Found');
      return;
    }
    try {
      const st = statSync(filePath);
      if (st.isDirectory()) {
        const indexPath = join(filePath, 'index.html');
        if (!existsSync(indexPath)) {
          res.statusCode = 404;
          res.end('Not Found');
          return;
        }
        const body = readFileSync(indexPath);
        res.setHeader('Content-Type', MIME['.html']!);
        res.end(body);
        return;
      }
      const type = MIME[extname(filePath).toLowerCase()] ?? 'application/octet-stream';
      const body = readFileSync(filePath);
      res.setHeader('Content-Type', type);
      res.end(body);
    } catch (err) {
      res.statusCode = 500;
      res.end(`Server Error: ${(err as Error).message}`);
    }
  });

  const boundPort = await new Promise<number>((resolvePort, rejectPort) => {
    const onError = (err: NodeJS.ErrnoException) => {
      if (err.code === 'EADDRINUSE' && port !== 0) {
        server.removeListener('error', onError);
        server.listen(0, host, () => {
          const addr = server.address() as AddressInfo | null;
          if (addr) resolvePort(addr.port);
          else rejectPort(new Error('failed to bind ephemeral port'));
        });
      } else {
        rejectPort(err);
      }
    };
    server.once('error', onError);
    server.listen(port, host, () => {
      server.removeListener('error', onError);
      const addr = server.address() as AddressInfo | null;
      if (addr) resolvePort(addr.port);
      else rejectPort(new Error('failed to bind port'));
    });
  });

  const url = `http://${host}:${boundPort}`;
  console.log(pc.cyan(`Serving ${entryAbs} at ${url}`));
  console.log(pc.dim('(Ctrl+C to stop)'));
  openBrowser(url);

  return new Promise<number>((resolveExit) => {
    const shutdown = () => {
      server.close(() => resolveExit(0));
    };
    process.once('SIGINT', shutdown);
    process.once('SIGTERM', shutdown);
  });
}
