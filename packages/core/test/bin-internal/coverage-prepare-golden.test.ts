import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';
import { coveragePrepareCmd } from '../../src/bin-internal/coverage-prepare';

const here = dirname(fileURLToPath(import.meta.url));
const fixtureDir = join(here, '../../../../fixtures/golden-coverage');
const DEFINE_PATH = resolve(here, '../../src/config/define.ts');

function setupGoldenProject(fixtureName: string, coverageConfig = ''): string {
  const dir = mkdtempSync(join(tmpdir(), `xera-coverage-${fixtureName}-`));
  mkdirSync(join(dir, '.xera/graph'), { recursive: true });
  writeFileSync(
    join(dir, 'xera.config.ts'),
    `import { defineConfig } from '${DEFINE_PATH}';\n` +
      `export default defineConfig({\n` +
      `  jira: { baseUrl: 'https://example.atlassian.net', projectKeys: ['PROJ'], fields: { story: 'description' } },\n` +
      `  web: { baseUrl: { local: 'http://localhost:3000' }, defaultEnv: 'local' },\n` +
      `  adapters: ['web']${coverageConfig ? `, coverage: ${coverageConfig}` : ''}\n` +
      `});\n`,
  );
  copyFileSync(join(fixtureDir, `${fixtureName}.json`), join(dir, '.xera/graph/snapshot.json'));
  return dir;
}

describe('coverage-prepare against golden fixtures', () => {
  test('mixed.json end-to-end matches expected report', async () => {
    const dir = setupGoldenProject('mixed');
    const prevCwd = process.cwd();
    process.chdir(dir);
    try {
      const code = await coveragePrepareCmd([
        '--snapshot-ts',
        '2026-05-17T10:00:00.000Z',
        '--no-emit-event',
        '--snapshot-file',
        join(dir, '.xera/graph/snapshot.json'),
      ]);
      expect(code).toBe(0);
      const got = JSON.parse(readFileSync(join(dir, '.xera/coverage/report.json'), 'utf8'));
      const expected = JSON.parse(readFileSync(join(fixtureDir, 'mixed.expected.json'), 'utf8'));
      expect(got).toEqual(expected);
    } finally {
      process.chdir(prevCwd);
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('critical-boost.json with criticalAreas: ["checkout"]', async () => {
    const dir = setupGoldenProject('critical-boost', `{ criticalAreas: ['checkout'] }`);
    const prevCwd = process.cwd();
    process.chdir(dir);
    try {
      const code = await coveragePrepareCmd([
        '--snapshot-ts',
        '2026-05-17T10:00:00.000Z',
        '--no-emit-event',
        '--snapshot-file',
        join(dir, '.xera/graph/snapshot.json'),
      ]);
      expect(code).toBe(0);
      const got = JSON.parse(readFileSync(join(dir, '.xera/coverage/report.json'), 'utf8'));
      const expected = JSON.parse(
        readFileSync(join(fixtureDir, 'critical-boost.expected.json'), 'utf8'),
      );
      expect(got).toEqual(expected);
    } finally {
      process.chdir(prevCwd);
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
