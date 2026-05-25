import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const src = (p: string) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
  resolve: {
    // Resolve workspace packages to their TypeScript source so tests run
    // without a build step (replaces the old `source`/Bun export condition).
    alias: [
      { find: /^@xera-ai\/core$/, replacement: src('packages/core/src/index.ts') },
      { find: /^@xera-ai\/core\/adapter$/, replacement: src('packages/core/src/adapter/types.ts') },
      { find: /^@xera-ai\/web$/, replacement: src('packages/web/src/index.ts') },
      { find: /^@xera-ai\/http$/, replacement: src('packages/http/src/index.ts') },
      { find: /^@xera-ai\/http\/runtime$/, replacement: src('packages/http/src/runtime/index.ts') },
    ],
  },
  test: {
    include: ['packages/**/test/**/*.test.ts'],
    // Tests call process.chdir and depend on a stable cwd for cwd-sensitive
    // fixtures (golden-tickets); worker threads forbid chdir, so use forks.
    pool: 'forks',
  },
});
