import { resolveArtifactPaths } from '../artifact/paths';
import { forceUnlock, isLockStale, readLock } from '../lock/file-lock';

export async function unlockCmd(argv: string[]): Promise<number> {
  const ticket = argv[0];
  if (!ticket) {
    console.error('[xera:unlock] usage: unlock <TICKET> [--force]');
    return 1;
  }
  const paths = resolveArtifactPaths(process.cwd(), ticket);
  const lock = readLock(paths.lockPath);
  if (!lock) {
    console.log(`[xera:unlock] no lock for ${ticket}`);
    return 0;
  }
  const force = argv.includes('--force');
  if (!force && !isLockStale(paths.lockPath)) {
    console.error(
      `[xera:unlock] lock is held by PID ${lock.pid} on ${lock.hostname} (active). Pass --force to override.`,
    );
    return 1;
  }
  forceUnlock(paths.lockPath);
  console.log(`[xera:unlock] released`);
  return 0;
}
