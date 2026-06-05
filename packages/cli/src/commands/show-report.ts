import { spawn } from 'node:child_process';
import { existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import pc from 'picocolors';

export interface ShowReportOptions {
  ticket: string;
  run?: string;
  host?: string;
  port?: string;
}

/**
 * Resolves the latest run dir for a ticket, or a specific --run if given.
 * Run ids are timestamped/lex-sortable, so newest = lex-max.
 */
function resolveRunDir(cwd: string, ticket: string, run?: string): string | null {
  const runsDir = join(cwd, '.xera', ticket, 'runs');
  if (!existsSync(runsDir)) return null;
  if (run) {
    const explicit = join(runsDir, run);
    return existsSync(explicit) ? explicit : null;
  }
  const entries = readdirSync(runsDir).filter((e) => {
    try {
      return statSync(join(runsDir, e)).isDirectory();
    } catch {
      return false;
    }
  });
  if (entries.length === 0) return null;
  entries.sort();
  return join(runsDir, entries[entries.length - 1]!);
}

export async function showReportCommand(opts: ShowReportOptions): Promise<number> {
  const cwd = process.cwd();
  const runDir = resolveRunDir(cwd, opts.ticket, opts.run);
  if (!runDir) {
    if (opts.run) {
      console.error(
        pc.red(`\n  error: run '${opts.run}' not found under .xera/${opts.ticket}/runs/\n`),
      );
    } else {
      console.error(
        pc.red(
          `\n  error: no runs found for ${opts.ticket}. Run \`xera-internal exec ${opts.ticket}\` first.\n`,
        ),
      );
    }
    return 1;
  }
  const htmlDir = join(runDir, 'html');
  if (!existsSync(htmlDir)) {
    console.error(
      pc.red(
        `\n  error: no HTML report at ${htmlDir}\n` +
          `  Re-run exec with --reporter=html to produce one:\n` +
          `    xera-internal exec ${opts.ticket} --reporter=html\n`,
      ),
    );
    return 1;
  }
  const host = opts.host ?? '127.0.0.1';
  const port = opts.port ?? '9323';
  console.log(pc.cyan(`Serving ${htmlDir} at http://${host}:${port}`));
  console.log(pc.dim('(Ctrl+C to stop)'));
  const args = ['playwright', 'show-report', htmlDir, '--host', host, '--port', port];
  return new Promise((resolve) => {
    const child = spawn('npx', args, { stdio: 'inherit', env: process.env });
    child.on('error', (e) => {
      console.error(pc.red(`\n  error: failed to launch playwright: ${e.message}\n`));
      resolve(1);
    });
    child.on('close', (code) => resolve(code ?? 0));
  });
}
