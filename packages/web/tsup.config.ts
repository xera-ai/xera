import { defineConfig } from 'tsup';

export default defineConfig({
  entry: { index: 'src/index.ts' },
  format: 'esm',
  target: 'node22',
  platform: 'node',
  outDir: 'dist',
  clean: true,
  dts: false,
  shims: false,
  // Externalize every bare import (node builtins, deps, workspace siblings);
  // bundle only this package's own relative source.
  external: [/^[^./]/],
});
