import { spawnSync } from 'node:child_process';

// `xera.config.ts` is loaded via a bare dynamic `import()`. Node only strips
// TypeScript types from a `.ts` import natively from v22.18 / v23.6 onward
// (`process.features.typescript` becomes 'strip' or 'transform'); on older Node
// the import throws ERR_UNKNOWN_FILE_EXTENSION. Registering a loader after the
// process has started races Node's own (possibly half-disabled) .ts handling,
// so the only reliable fix is to have the loader present from process startup.
// The bin entry points call `ensureTsRuntime()` first: on affected Node it
// re-execs the same command with the tsx loader pre-imported, then exits with
// the child's code. On Node with native stripping (and on the re-exec'd child,
// guarded by an env sentinel) it is a no-op. (#203)

const REEXEC_SENTINEL = 'XERA_TS_RUNTIME';

export function nodeHasNativeTs(): boolean {
  return Boolean((process.features as { typescript?: unknown }).typescript);
}

export function needsTsReexec(opts: { nativeTs: boolean; alreadyReexeced: boolean }): boolean {
  return !opts.nativeTs && !opts.alreadyReexeced;
}

// Returns the child's exit code when it re-execs (the caller must exit with it),
// or null when no re-exec is needed and execution should continue normally.
export function ensureTsRuntime(): number | null {
  const decision = needsTsReexec({
    nativeTs: nodeHasNativeTs(),
    alreadyReexeced: process.env[REEXEC_SENTINEL] === '1',
  });
  if (!decision) return null;
  // Resolve tsx relative to THIS module (core depends on tsx) so it loads
  // regardless of the consumer's CWD or node_modules layout, then pass it as a
  // real `--import` arg (handles paths with spaces, unlike NODE_OPTIONS).
  const tsxLoader = import.meta.resolve('tsx');
  const result = spawnSync(process.execPath, ['--import', tsxLoader, ...process.argv.slice(1)], {
    stdio: 'inherit',
    env: { ...process.env, [REEXEC_SENTINEL]: '1' },
  });
  if (result.error) throw result.error;
  return result.status ?? 1;
}
