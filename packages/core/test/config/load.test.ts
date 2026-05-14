import { describe, expect, test } from 'bun:test';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { loadConfig } from '../../src/config/load';

const defineModulePath = resolve(__dirname, '../../src/config/define.ts');

describe('loadConfig', () => {
  test('finds and parses xera.config.ts in given dir', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'xera-cfg-'));
    writeFileSync(
      join(dir, 'xera.config.ts'),
      `import { defineConfig } from '${defineModulePath}';
       export default defineConfig({
         jira: { baseUrl: 'https://x.atlassian.net', projectKeys: ['X'], fields: { story: 'description' } },
         web: { baseUrl: { staging: 'https://x.com' }, defaultEnv: 'staging' },
         adapters: ['web'],
       });`,
    );
    const cfg = await loadConfig(dir);
    expect(cfg.jira.projectKeys).toEqual(['X']);
    expect(cfg.web.auth.strategy).toBe('none');
    rmSync(dir, { recursive: true });
  });

  test('throws when xera.config.ts missing', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'xera-cfg-'));
    await expect(loadConfig(dir)).rejects.toThrow(/xera\.config\.ts not found/);
    rmSync(dir, { recursive: true });
  });
});
