import { describe, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { coveragePrepareCmd } from '../../src/bin-internal/coverage-prepare';
import { appendEvents } from '../../src/graph/store';
import type { Event } from '../../src/graph/types';

const DEFINE_PATH = resolve(__dirname, '../../src/config/define.ts');

function makeProject(): string {
  const dir = mkdtempSync(join(tmpdir(), 'xera-coverage-'));
  mkdirSync(join(dir, '.xera', 'graph'), { recursive: true });
  writeFileSync(
    join(dir, 'xera.config.ts'),
    `import { defineConfig } from '${DEFINE_PATH}';\n` +
      `export default defineConfig({\n` +
      `  jira: { baseUrl: 'https://example.atlassian.net', projectKeys: ['PROJ'], fields: { story: 'description' } },\n` +
      `  web: { baseUrl: { local: 'http://localhost:3000' }, defaultEnv: 'local' },\n` +
      `  adapters: ['web'],\n` +
      `});\n`,
  );
  return dir;
}

function eid(seed: string): string {
  const digits = seed
    .replace(/[^0-9]/g, '')
    .padEnd(20, '0')
    .slice(0, 20);
  return `01HXYZ${digits}`;
}

function captureStdout(fn: () => Promise<unknown>): Promise<string> {
  const original = process.stdout.write.bind(process.stdout);
  const captured: string[] = [];
  (process.stdout as { write: typeof process.stdout.write }).write = ((
    chunk: string | Uint8Array,
  ) => {
    captured.push(typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString('utf8'));
    return true;
  }) as typeof process.stdout.write;
  return fn()
    .finally(() => {
      (process.stdout as { write: typeof process.stdout.write }).write = original;
    })
    .then(() => captured.join(''));
}

describe('coverage-prepare subcommand', () => {
  test('exports coveragePrepareCmd returning Promise<number>', () => {
    expect(typeof coveragePrepareCmd).toBe('function');
    const r = coveragePrepareCmd(['--help-stub']);
    expect(r).toBeInstanceOf(Promise);
  });
});

describe('coverage-prepare end-to-end', () => {
  test('writes report.json + report.md to .xera/coverage/ with empty events', async () => {
    const dir = makeProject();
    const prevCwd = process.cwd();
    process.chdir(dir);
    try {
      const code = await coveragePrepareCmd([
        '--snapshot-ts',
        '2026-05-17T10:00:00.000Z',
        '--no-emit-event',
      ]);
      expect(code).toBe(0);
      const json = JSON.parse(readFileSync(join(dir, '.xera/coverage/report.json'), 'utf8'));
      expect(json.windowDays).toBe(30);
      expect(json.areas).toEqual([]);
      const md = readFileSync(join(dir, '.xera/coverage/report.md'), 'utf8');
      expect(md).toContain('Coverage report');
    } finally {
      process.chdir(prevCwd);
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('coverage-prepare --why', () => {
  test('--why <area-slug> prints area drill-down', async () => {
    const dir = makeProject();
    const events: Event[] = [
      {
        event_id: eid('20260515100000'),
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
      },
      {
        event_id: eid('20260515100001'),
        schema_version: 1,
        ts: '2026-05-15T10:00:01.000Z',
        actor: 'test',
        type: 'edge.discovered',
        payload: {
          kind: 'modifies',
          from: 'PROJ-1',
          to: 'checkout',
          source: 'extract-areas',
        },
      },
    ];
    appendEvents(dir, events, { skill: 'fetch', ticketId: 'PROJ-1' });
    const prevCwd = process.cwd();
    process.chdir(dir);
    try {
      const stdout = await captureStdout(() =>
        coveragePrepareCmd([
          '--snapshot-ts',
          '2026-05-17T10:00:00.000Z',
          '--no-emit-event',
          '--why',
          'checkout',
        ]),
      );
      expect(stdout).toContain('Area: checkout');
      expect(stdout).toContain('UNCOVERED');
      expect(stdout).toContain('PROJ-1');
    } finally {
      process.chdir(prevCwd);
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('--why <TICKET-id> prints ticket drill-down', async () => {
    const dir = makeProject();
    const events: Event[] = [
      {
        event_id: eid('20260512100000'),
        schema_version: 1,
        ts: '2026-05-12T10:00:00.000Z',
        actor: 'test',
        type: 'ticket.fetched',
        payload: {
          ticketId: 'PROJ-105',
          summary: 'Add tax',
          ac: ['Subtotal', 'Tax'],
          jiraLinks: [],
          storyHash: 'h',
          modifiesAreas: [],
        },
      },
    ];
    appendEvents(dir, events, { skill: 'fetch', ticketId: 'PROJ-105' });
    const prevCwd = process.cwd();
    process.chdir(dir);
    try {
      const stdout = await captureStdout(() =>
        coveragePrepareCmd([
          '--snapshot-ts',
          '2026-05-17T10:00:00.000Z',
          '--no-emit-event',
          '--why',
          'PROJ-105',
        ]),
      );
      expect(stdout).toContain('Ticket: PROJ-105');
      expect(stdout).toContain('0/2 ACs covered');
      expect(stdout).toContain('✗ AC-0  Subtotal');
    } finally {
      process.chdir(prevCwd);
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('coverage-prepare event emission', () => {
  test('emits coverage.snapshot when emitEvent=true and autoSnapshotOnCoverage=true', async () => {
    const dir = makeProject();
    const prevCwd = process.cwd();
    process.chdir(dir);
    try {
      const code = await coveragePrepareCmd(['--snapshot-ts', '2026-05-17T10:00:00.000Z']);
      expect(code).toBe(0);
      const monthDir = join(dir, '.xera/graph/events/2026-05');
      const files = readdirSync(monthDir).filter((f) => f.endsWith('.jsonl'));
      const coverageFile = files.find((f) => f.includes('-coverage-'));
      expect(coverageFile).toBeDefined();
      const content = readFileSync(join(monthDir, `${coverageFile}`), 'utf8').trim();
      const event = JSON.parse(content);
      expect(event.type).toBe('coverage.snapshot');
      expect(event.payload.windowDays).toBe(30);
    } finally {
      process.chdir(prevCwd);
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('does NOT emit when --no-emit-event', async () => {
    const dir = makeProject();
    const prevCwd = process.cwd();
    process.chdir(dir);
    try {
      await coveragePrepareCmd(['--snapshot-ts', '2026-05-17T10:00:00.000Z', '--no-emit-event']);
      const monthDir = join(dir, '.xera/graph/events/2026-05');
      let files: string[] = [];
      try {
        files = readdirSync(monthDir);
      } catch {
        /* not created */
      }
      expect(files.filter((f) => f.includes('-coverage-')).length).toBe(0);
    } finally {
      process.chdir(prevCwd);
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('does NOT emit when --why is used', async () => {
    const dir = makeProject();
    const prevCwd = process.cwd();
    process.chdir(dir);
    try {
      await captureStdout(() =>
        coveragePrepareCmd(['--snapshot-ts', '2026-05-17T10:00:00.000Z', '--why', 'missing']),
      );
      const monthDir = join(dir, '.xera/graph/events/2026-05');
      let files: string[] = [];
      try {
        files = readdirSync(monthDir);
      } catch {
        /* not created */
      }
      expect(files.filter((f) => f.includes('-coverage-')).length).toBe(0);
    } finally {
      process.chdir(prevCwd);
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('does NOT emit when --json', async () => {
    const dir = makeProject();
    const prevCwd = process.cwd();
    process.chdir(dir);
    try {
      await captureStdout(() =>
        coveragePrepareCmd(['--snapshot-ts', '2026-05-17T10:00:00.000Z', '--json']),
      );
      const monthDir = join(dir, '.xera/graph/events/2026-05');
      let files: string[] = [];
      try {
        files = readdirSync(monthDir);
      } catch {
        /* not created */
      }
      expect(files.filter((f) => f.includes('-coverage-')).length).toBe(0);
    } finally {
      process.chdir(prevCwd);
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

function seedCoveredAreaEvents(dir: string): void {
  const events: Event[] = [
    {
      event_id: eid('20260510100000a'),
      schema_version: 1,
      ts: '2026-05-10T10:00:00.000Z',
      actor: 'test',
      type: 'ticket.fetched',
      payload: {
        ticketId: 'PROJ-1',
        summary: 's',
        ac: [],
        jiraLinks: [],
        storyHash: 'h',
        modifiesAreas: ['login'],
      },
    },
    {
      event_id: eid('20260510110000b'),
      schema_version: 1,
      ts: '2026-05-10T11:00:00.000Z',
      actor: 'test',
      type: 'scenario.generated',
      payload: {
        scenarioId: 'PROJ-1#scenario-0',
        ticketId: 'PROJ-1',
        name: 'Login',
        gherkin: '...',
        priority: 'p1',
        featureHash: 'h',
        generatedAt: '2026-05-10T11:00:00.000Z',
      },
    },
    {
      event_id: eid('20260510110001c'),
      schema_version: 1,
      ts: '2026-05-10T11:00:01.000Z',
      actor: 'test',
      type: 'pom.generated',
      payload: {
        pomId: 'LoginPage',
        ticketId: 'PROJ-1',
        filePath: 'p.ts',
        route: '/login',
        locators: [],
        scope: 'local',
      },
    },
    {
      event_id: eid('20260510110002d'),
      schema_version: 1,
      ts: '2026-05-10T11:00:02.000Z',
      actor: 'test',
      type: 'edge.discovered',
      payload: {
        kind: 'uses',
        from: 'PROJ-1#scenario-0',
        to: 'LoginPage',
        source: 'xera-script',
      },
    },
    {
      event_id: eid('20260510110003e'),
      schema_version: 1,
      ts: '2026-05-10T11:00:03.000Z',
      actor: 'test',
      type: 'edge.discovered',
      payload: {
        kind: 'covers',
        from: 'LoginPage',
        to: 'login',
        source: 'xera-script',
      },
    },
    {
      event_id: eid('20260515100000f'),
      schema_version: 1,
      ts: '2026-05-15T10:00:00.000Z',
      actor: 'test',
      type: 'run.classified',
      payload: {
        scenarioId: 'PROJ-1#scenario-0',
        runId: 'r1',
        classification: 'PASS',
        confidence: 'high',
      },
    },
  ];
  appendEvents(dir, events, { skill: 'fetch', ticketId: 'PROJ-1' });
}

describe('coverage-prepare --all flag', () => {
  test('--all shows COVERED rows in markdown', async () => {
    const dir = makeProject();
    seedCoveredAreaEvents(dir);
    const prevCwd = process.cwd();
    process.chdir(dir);
    try {
      await coveragePrepareCmd([
        '--snapshot-ts',
        '2026-05-17T10:00:00.000Z',
        '--no-emit-event',
        '--all',
      ]);
      const md = readFileSync(join(dir, '.xera/coverage/report.md'), 'utf8');
      expect(md).toContain('COVERED — 1 area');
      expect(md).toMatch(/#1\s+login/);
    } finally {
      process.chdir(prevCwd);
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('default (no --all) shows collapsed COVERED line', async () => {
    const dir = makeProject();
    seedCoveredAreaEvents(dir);
    const prevCwd = process.cwd();
    process.chdir(dir);
    try {
      await coveragePrepareCmd(['--snapshot-ts', '2026-05-17T10:00:00.000Z', '--no-emit-event']);
      const md = readFileSync(join(dir, '.xera/coverage/report.md'), 'utf8');
      expect(md).toContain('COVERED — 1 area (collapsed; show with --all)');
      expect(md).not.toMatch(/#1\s+login/);
    } finally {
      process.chdir(prevCwd);
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
