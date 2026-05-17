import { describe, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fillGapFinalizeCmd } from '../../src/bin-internal/fill-gap-finalize';
import { fillGapPrepareCmd } from '../../src/bin-internal/fill-gap-prepare';
import { appendEvents } from '../../src/graph/store';
import type { Event } from '../../src/graph/types';

const CORE_DEFINE_PATH = resolve(__dirname, '../../src/config/define.ts');

function eid(seed: string): string {
  const digits = seed
    .replace(/[^0-9]/g, '')
    .padEnd(20, '0')
    .slice(0, 20);
  return `01HXYZ${digits}`;
}

function makeProject(): string {
  const dir = mkdtempSync(join(tmpdir(), 'xera-fg-rt-'));
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

describe('fill-gap area-mode round-trip', () => {
  test('prepare → simulated AI → finalize writes feature.draft.md', async () => {
    const dir = makeProject();
    const events: Event[] = [
      {
        event_id: eid('20260515100000'),
        schema_version: 1,
        ts: '2026-05-15T10:00:00.000Z',
        actor: 'test',
        type: 'ticket.fetched',
        payload: {
          ticketId: 'PROJ-101',
          summary: 'Add Apple Pay',
          ac: ['Apple Pay selectable', 'Order confirms after pay'],
          jiraLinks: [],
          storyHash: 'h',
          modifiesAreas: ['checkout'],
        },
      },
    ];
    appendEvents(dir, events, { skill: 'fetch', ticketId: 'PROJ-101' });

    const prevCwd = process.cwd();
    process.chdir(dir);
    try {
      // 1. Prepare context
      expect(await fillGapPrepareCmd(['--area', 'checkout'])).toBe(0);
      const ctxPath = join(dir, '.xera/coverage/checkout/context.json');
      const ctx = JSON.parse(readFileSync(ctxPath, 'utf8'));
      expect(ctx.tickets[0].id).toBe('PROJ-101');

      // 2. Simulate AI proposals
      const proposalsPath = join(dir, '.xera/coverage/checkout/proposals.json');
      writeFileSync(
        proposalsPath,
        JSON.stringify({
          proposals: [
            {
              id: 'P1',
              ticketId: 'PROJ-101',
              title: 'Apple Pay happy path',
              rationale: 'Covers AC 0 + 1 with the primary user flow.',
              gherkin:
                'Scenario: Apple Pay happy path\n  Given user is on /checkout\n  When user selects Apple Pay\n  Then order confirms',
              satisfiesAcs: [0, 1],
            },
            {
              id: 'P2',
              ticketId: 'PROJ-101',
              title: 'Apple Pay declined',
              rationale: 'Covers error path.',
              gherkin:
                'Scenario: Apple Pay declined\n  Given user is on /checkout\n  When Apple Pay declines\n  Then error message shows',
              satisfiesAcs: [],
            },
          ],
        }),
      );

      // 3. Finalize P1
      expect(
        await fillGapFinalizeCmd([
          '--accept',
          'P1',
          '--ticket',
          'PROJ-101',
          '--source',
          proposalsPath,
        ]),
      ).toBe(0);

      const draft = readFileSync(join(dir, '.xera/PROJ-101/feature.draft.md'), 'utf8');
      expect(draft).toContain('# Draft scenario for PROJ-101');
      expect(draft).toContain('Scenario: Apple Pay happy path');
      expect(draft).toContain('satisfiesAcs: [0, 1]');
    } finally {
      process.chdir(prevCwd);
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
