import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, test } from 'vitest';
import { coveragePrepareCmd } from '../../src/bin-internal/coverage-prepare';
import { graphRenderCmd } from '../../src/bin-internal/graph-render';
import { appendEvents } from '../../src/graph/store';
import type { Event } from '../../src/graph/types';

const CORE_DEFINE_PATH = resolve(__dirname, '../../src/config/define.ts');

function makeProject(): string {
  const dir = mkdtempSync(join(tmpdir(), 'xera-render-cov-'));
  mkdirSync(join(dir, '.xera/graph'), { recursive: true });
  writeFileSync(
    join(dir, 'xera.config.ts'),
    `import { defineConfig } from '${CORE_DEFINE_PATH}';\n` +
      `export default defineConfig({\n` +
      `  jira: { baseUrl: 'https://example.atlassian.net', projectKeys: ['PROJ'], fields: { story: 'description' } },\n` +
      `  web: { baseUrl: { local: 'http://localhost:3000' }, defaultEnv: 'local' },\n` +
      `  adapters: ['web'],\n` +
      `});\n`,
  );
  return dir;
}

describe('graph-render --include-coverage end-to-end', () => {
  test('coverage-prepare → graph-render produces HTML with Coverage tab', async () => {
    const dir = makeProject();
    const events: Event[] = [
      {
        event_id: '01HXYZ20260515100000000000',
        schema_version: 1,
        ts: '2026-05-15T10:00:00.000Z',
        actor: 'test',
        type: 'ticket.fetched',
        payload: {
          ticketId: 'PROJ-1',
          summary: 'Add feature',
          ac: [],
          jiraLinks: [],
          storyHash: 'h',
          modifiesAreas: ['checkout'],
        },
      } as Event,
    ];
    appendEvents(dir, events, { skill: 'fetch', ticketId: 'PROJ-1' });

    const prevCwd = process.cwd();
    process.chdir(dir);
    try {
      // 1. Generate report + coverage.snapshot event
      await coveragePrepareCmd(['--snapshot-ts', '2026-05-17T10:00:00.000Z']);

      // 2. Render with coverage
      await graphRenderCmd(['--include-coverage', '--out', join(dir, 'graph.html')]);
      const html = readFileSync(join(dir, 'graph.html'), 'utf8');

      expect(html).toContain('data-tab="coverage"');
      expect(html).toContain('coverage-map-canvas');
      expect(html).toContain('coverage-list-table');
      expect(html).toContain('coverage-trend-svg');
      // The report area must be embedded in window.__COVERAGE__
      expect(html).toContain('"UNCOVERED"');
      expect(html).toContain('"id":"checkout"');
    } finally {
      process.chdir(prevCwd);
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
