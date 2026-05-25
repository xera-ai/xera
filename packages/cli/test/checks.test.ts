import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { writeAuthState } from '@xera-ai/core';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { runChecks } from '../src/checks';

// Helper: create a minimal web project with optional coverage config (plain object export)
function makeWebProject(coverageConfig?: string): string {
  const d = mkdtempSync(join(tmpdir(), 'xera-checks-'));
  mkdirSync(join(d, '.xera'), { recursive: true });
  const coverageBlock = coverageConfig ? `, coverage: ${coverageConfig}` : '';
  writeFileSync(
    join(d, 'xera.config.ts'),
    `export default {\n` +
      `  adapters: ['web'],\n` +
      `  jira: { baseUrl: 'https://example.atlassian.net', projectKeys: ['PROJ'], fields: { story: 'description' } },\n` +
      `  web: { baseUrl: { local: 'http://localhost:3000' }, defaultEnv: 'local' }${coverageBlock}\n` +
      `};\n`,
  );
  return d;
}

let dir: string;
const ORIG_KEY = process.env.XERA_AUTH_KEY;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'doctor-'));
  process.env.XERA_AUTH_KEY = 'a'.repeat(64);
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
  if (ORIG_KEY === undefined) delete process.env.XERA_AUTH_KEY;
  else process.env.XERA_AUTH_KEY = ORIG_KEY;
});

function writeMinHttpConfig(dir: string, withSpec = false) {
  // Use plain object default export (avoids @xera-ai/core resolution in tmp dir).
  writeFileSync(
    join(dir, 'xera.config.ts'),
    `export default {
  adapters: ['http'],
  jira: { baseUrl: 'https://x.atlassian.net', projectKeys: ['PROJ'], fields: { story: 'description' } },
  http: { baseUrl: { dev: 'http://localhost:65535' }, defaultEnv: 'dev', ${withSpec ? "spec: './openapi.yaml'," : ''} auth: { strategy: 'bearer', roles: { user: { tokenEnv: 'USER_TOKEN' } } } },
};`,
  );
  writeFileSync(join(dir, '.env'), `XERA_AUTH_KEY=${'a'.repeat(64)}\n`);
  mkdirSync(join(dir, '.claude', 'skills'), { recursive: true });
}

describe('doctor http checks', () => {
  test('reports ✗ when auth file missing', async () => {
    writeMinHttpConfig(dir);
    const checks = await runChecks(dir);
    const missing = checks.find((c) => c.name === 'http auth file present: user');
    expect(missing?.ok).toBe(false);
    expect(missing?.message).toContain('xera-internal auth-setup --role user');
  });

  test('reports ✓ when auth file present and fresh', async () => {
    writeMinHttpConfig(dir);
    mkdirSync(join(dir, '.xera', '.auth', 'http'), { recursive: true });
    writeAuthState(join(dir, '.xera', '.auth', 'http'), {
      role: 'user',
      strategy: 'apiToken',
      created_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + 3600_000).toISOString(),
      payload: { token: 't', type: 'bearer', header: 'Authorization', scheme: 'Bearer' },
    });
    const checks = await runChecks(dir);
    const fresh = checks.find((c) => c.name === 'http auth file present: user');
    expect(fresh?.ok).toBe(true);
    expect(fresh?.message).toMatch(/expires in/);
  });

  test('reports ✗ when auth file expired', async () => {
    writeMinHttpConfig(dir);
    mkdirSync(join(dir, '.xera', '.auth', 'http'), { recursive: true });
    writeAuthState(join(dir, '.xera', '.auth', 'http'), {
      role: 'user',
      strategy: 'apiToken',
      created_at: new Date(Date.now() - 1e7).toISOString(),
      expires_at: new Date(Date.now() - 1e6).toISOString(),
      payload: { token: 't', type: 'bearer', header: 'Authorization', scheme: 'Bearer' },
    });
    const checks = await runChecks(dir);
    const stale = checks.find((c) => c.name === 'http auth file fresh: user');
    expect(stale?.ok).toBe(false);
    expect(stale?.message).toContain('expired');
  });

  test('reports OpenAPI not configured (soft ok) when http.spec absent', async () => {
    writeMinHttpConfig(dir, false);
    const checks = await runChecks(dir);
    const oa = checks.find((c) => c.name === 'OpenAPI spec configured');
    expect(oa?.ok).toBe(true);
    expect(oa?.message).toContain('CONTRACT_DRIFT detection disabled');
  });
});

describe('runChecks xera skills layout', () => {
  // Required skill names — Claude Code's Skill tool requires
  // .claude/skills/<name>/SKILL.md (NOT .claude/skills/<name>.md).
  const REQUIRED = [
    'xera-run',
    'xera-fetch',
    'xera-feature',
    'xera-script',
    'xera-exec',
    'xera-report',
    'xera-promote',
  ];

  test('passes when all skills present as <name>/SKILL.md', async () => {
    const d = makeWebProject();
    try {
      for (const base of REQUIRED) {
        mkdirSync(join(d, '.claude/skills', base), { recursive: true });
        writeFileSync(join(d, '.claude/skills', base, 'SKILL.md'), `---\nname: ${base}\n---\n`);
      }
      const checks = await runChecks(d);
      const skills = checks.find((c) => c.name === 'xera skills present (claude)');
      expect(skills?.ok).toBe(true);
    } finally {
      rmSync(d, { recursive: true, force: true });
    }
  });

  test('flags legacy flat layout with migration hint', async () => {
    const d = makeWebProject();
    try {
      mkdirSync(join(d, '.claude/skills'), { recursive: true });
      for (const base of REQUIRED) {
        writeFileSync(join(d, '.claude/skills', `${base}.md`), `---\nname: ${base}\n---\n`);
      }
      const checks = await runChecks(d);
      const skills = checks.find((c) => c.name === 'xera skills present (claude)');
      expect(skills?.ok).toBe(false);
      expect(skills?.message ?? '').toContain('legacy flat layout');
      expect(skills?.message ?? '').toContain('xera init --update');
    } finally {
      rmSync(d, { recursive: true, force: true });
    }
  });
});

describe('runChecks ticket-specific (--strict <TICKET>)', () => {
  function writeStory(d: string, ticket: string, frontmatter: string): void {
    const dir = join(d, '.xera', ticket);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'story.md'), `---\n${frontmatter}\n---\n\n# story body\n`);
  }

  test('warns when graph-input.json missing for the ticket', async () => {
    const d = makeWebProject();
    try {
      writeStory(
        d,
        'PROJ-42',
        `ticketId: PROJ-42\nsummary: "x"\nstoryHash: h\nacceptanceCriteria:\n  - "AC1"`,
      );
      const checks = await runChecks(d, { ticket: 'PROJ-42' });
      const w = checks.find((c) => c.name.includes('PROJ-42') && c.name.includes('graph-input'));
      expect(w).toBeDefined();
      expect(w!.ok).toBe(false);
      expect(w!.message ?? '').toMatch(/missing/i);
    } finally {
      rmSync(d, { recursive: true, force: true });
    }
  });

  test('warns when graph-input.json is invalid JSON', async () => {
    const d = makeWebProject();
    try {
      writeStory(
        d,
        'PROJ-43',
        `ticketId: PROJ-43\nsummary: "x"\nstoryHash: h\nacceptanceCriteria:\n  - "AC1"`,
      );
      mkdirSync(join(d, '.xera/PROJ-43'), { recursive: true });
      writeFileSync(join(d, '.xera/PROJ-43/graph-input.json'), '{not json');
      const checks = await runChecks(d, { ticket: 'PROJ-43' });
      const w = checks.find((c) => c.name.includes('PROJ-43') && c.name.includes('graph-input'));
      expect(w).toBeDefined();
      expect(w!.ok).toBe(false);
      expect(w!.message ?? '').toMatch(/invalid/i);
    } finally {
      rmSync(d, { recursive: true, force: true });
    }
  });

  test('passes when graph-input.json present and parses', async () => {
    const d = makeWebProject();
    try {
      writeStory(
        d,
        'PROJ-44',
        `ticketId: PROJ-44\nsummary: "x"\nstoryHash: h\nacceptanceCriteria:\n  - "AC1"`,
      );
      mkdirSync(join(d, '.xera/PROJ-44'), { recursive: true });
      writeFileSync(
        join(d, '.xera/PROJ-44/graph-input.json'),
        JSON.stringify({ modifiesAreas: ['login'] }),
      );
      const checks = await runChecks(d, { ticket: 'PROJ-44' });
      const w = checks.find((c) => c.name.includes('PROJ-44') && c.name.includes('graph-input'));
      expect(w).toBeDefined();
      expect(w!.ok).toBe(true);
    } finally {
      rmSync(d, { recursive: true, force: true });
    }
  });

  test('warns when story.md frontmatter has no acceptanceCriteria AND config does not declare AC field', async () => {
    const d = makeWebProject();
    try {
      writeStory(d, 'PROJ-45', `ticketId: PROJ-45\nsummary: "x"\nstoryHash: h`);
      const checks = await runChecks(d, { ticket: 'PROJ-45' });
      const w = checks.find(
        (c) => c.name.includes('PROJ-45') && c.name.toLowerCase().includes('acceptance'),
      );
      expect(w).toBeDefined();
      expect(w!.ok).toBe(false);
      expect(w!.message ?? '').toMatch(/empty|missing/i);
    } finally {
      rmSync(d, { recursive: true, force: true });
    }
  });

  test('passes AC check when story has acceptanceCriteria array', async () => {
    const d = makeWebProject();
    try {
      writeStory(
        d,
        'PROJ-46',
        `ticketId: PROJ-46\nsummary: "x"\nstoryHash: h\nacceptanceCriteria:\n  - "AC1"\n  - "AC2"`,
      );
      const checks = await runChecks(d, { ticket: 'PROJ-46' });
      const w = checks.find(
        (c) => c.name.includes('PROJ-46') && c.name.toLowerCase().includes('acceptance'),
      );
      expect(w).toBeDefined();
      expect(w!.ok).toBe(true);
    } finally {
      rmSync(d, { recursive: true, force: true });
    }
  });

  test('AC check passes with provenance suffix when source: body-extraction', async () => {
    const d = makeWebProject();
    try {
      writeStory(
        d,
        'PROJ-46B',
        `ticketId: PROJ-46B\nsummary: "x"\nstoryHash: h\nacceptanceCriteria:\n  - "AC1"\nacceptanceCriteriaSource: body-extraction`,
      );
      const checks = await runChecks(d, { ticket: 'PROJ-46B' });
      const w = checks.find(
        (c) => c.name.includes('PROJ-46B') && c.name.toLowerCase().includes('acceptance'),
      );
      expect(w).toBeDefined();
      expect(w!.ok).toBe(true);
      expect(w!.message ?? '').toContain('body-extraction');
    } finally {
      rmSync(d, { recursive: true, force: true });
    }
  });

  test('AC check hint for source: none (skill body-extraction tried and failed)', async () => {
    const d = makeWebProject();
    try {
      writeStory(
        d,
        'PROJ-46C',
        `ticketId: PROJ-46C\nsummary: "x"\nstoryHash: h\nacceptanceCriteriaSource: none`,
      );
      const checks = await runChecks(d, { ticket: 'PROJ-46C' });
      const w = checks.find(
        (c) => c.name.includes('PROJ-46C') && c.name.toLowerCase().includes('acceptance'),
      );
      expect(w).toBeDefined();
      expect(w!.ok).toBe(false);
      // Should mention step 4 / body section, NOT just "set jira.fields.acceptanceCriteria".
      expect(w!.message ?? '').toMatch(/step 4|body|description/i);
    } finally {
      rmSync(d, { recursive: true, force: true });
    }
  });

  test('AC check is soft-ok with hint when config declares acceptanceCriteria field (AC in dedicated Jira field)', async () => {
    const d = mkdtempSync(join(tmpdir(), 'xera-checks-ac-'));
    try {
      mkdirSync(join(d, '.xera'), { recursive: true });
      writeFileSync(
        join(d, 'xera.config.ts'),
        `export default {\n` +
          `  adapters: ['web'],\n` +
          `  jira: { baseUrl: 'https://example.atlassian.net', projectKeys: ['PROJ'], fields: { story: 'description', acceptanceCriteria: 'customfield_10100' } },\n` +
          `  web: { baseUrl: { local: 'http://localhost:3000' }, defaultEnv: 'local' }\n` +
          `};\n`,
      );
      writeStory(d, 'PROJ-47', `ticketId: PROJ-47\nsummary: "x"\nstoryHash: h`);
      const checks = await runChecks(d, { ticket: 'PROJ-47' });
      const w = checks.find(
        (c) => c.name.includes('PROJ-47') && c.name.toLowerCase().includes('acceptance'),
      );
      // Configured AC field but story.md still missing AC — flag it (true root cause: Jira ticket has no AC).
      expect(w).toBeDefined();
      expect(w!.ok).toBe(false);
    } finally {
      rmSync(d, { recursive: true, force: true });
    }
  });

  test('skips ticket checks when no ticket provided', async () => {
    const d = makeWebProject();
    try {
      writeStory(d, 'PROJ-48', `ticketId: PROJ-48\nsummary: "x"\nstoryHash: h`);
      const checks = await runChecks(d);
      const w = checks.find((c) => c.name.includes('PROJ-48'));
      expect(w).toBeUndefined();
    } finally {
      rmSync(d, { recursive: true, force: true });
    }
  });

  test('warns when ticket dir is missing entirely', async () => {
    const d = makeWebProject();
    try {
      const checks = await runChecks(d, { ticket: 'PROJ-99' });
      const w = checks.find((c) => c.name.includes('PROJ-99'));
      expect(w).toBeDefined();
      expect(w!.ok).toBe(false);
      // Regression for #149: don't render the contradictory "exists — no artifact dir"
      // message. The check name asserts the dir is "present"; the message says where
      // it would be and what to do next.
      expect(w!.name).toContain('artifact directory present');
      expect(w!.name).not.toContain('exists');
      expect(w!.message ?? '').toContain('.xera/PROJ-99/');
      expect(w!.message ?? '').toContain('/xera-fetch PROJ-99');
    } finally {
      rmSync(d, { recursive: true, force: true });
    }
  });
});

describe('runChecks AGENTS.md', () => {
  test('flags missing AGENTS.md (informational)', async () => {
    const d = makeWebProject();
    try {
      const checks = await runChecks(d);
      const c = checks.find((x) => x.name === 'AGENTS.md present');
      expect(c).toBeDefined();
      expect(c!.ok).toBe(false);
      expect(c!.message ?? '').toMatch(/xera init/);
    } finally {
      rmSync(d, { recursive: true, force: true });
    }
  });

  test('passes when AGENTS.md exists', async () => {
    const d = makeWebProject();
    try {
      writeFileSync(join(d, 'AGENTS.md'), '# AGENTS.md\n');
      const checks = await runChecks(d);
      const c = checks.find((x) => x.name === 'AGENTS.md present');
      expect(c).toBeDefined();
      expect(c!.ok).toBe(true);
      expect(c!.message).toBeUndefined();
    } finally {
      rmSync(d, { recursive: true, force: true });
    }
  });
});

describe('runChecks coverage warnings', () => {
  test('warns when coverage.staleAfterDays > 90', async () => {
    const d = makeWebProject('{ staleAfterDays: 120 }');
    try {
      const checks = await runChecks(d);
      const warning = checks.find((c) => c.name.includes('coverage.staleAfterDays'));
      expect(warning).toBeDefined();
      expect(warning!.ok).toBe(false);
      expect(warning!.message ?? '').toContain('large window');
    } finally {
      rmSync(d, { recursive: true, force: true });
    }
  });

  test('no warning when staleAfterDays <= 90', async () => {
    const d = makeWebProject('{ staleAfterDays: 60 }');
    try {
      const checks = await runChecks(d);
      const warning = checks.find((c) => c.name.includes('coverage.staleAfterDays'));
      expect(warning).toBeUndefined();
    } finally {
      rmSync(d, { recursive: true, force: true });
    }
  });

  test('warns when criticalAreas contains a slug missing from snapshot', async () => {
    const d = makeWebProject(`{ criticalAreas: ['typo-area'] }`);
    mkdirSync(join(d, '.xera/graph'), { recursive: true });
    writeFileSync(
      join(d, '.xera/graph/snapshot.json'),
      JSON.stringify({
        schema_version: 1,
        generated_at: '2026-05-17T10:00:00.000Z',
        event_count: 0,
        events_hash: 'sha256:',
        tickets: {},
        scenarios: {},
        poms: {},
        areas: { checkout: { id: 'checkout' } },
        edges: [],
        latest_failures: {},
        acNodes: {},
        classifications: [],
      }),
    );
    try {
      const checks = await runChecks(d);
      const w = checks.find((c) => c.name.includes('typo-area'));
      expect(w).toBeDefined();
      expect(w!.ok).toBe(false);
    } finally {
      rmSync(d, { recursive: true, force: true });
    }
  });

  test('no warning when all criticalAreas exist in snapshot', async () => {
    const d = makeWebProject(`{ criticalAreas: ['checkout'] }`);
    mkdirSync(join(d, '.xera/graph'), { recursive: true });
    writeFileSync(
      join(d, '.xera/graph/snapshot.json'),
      JSON.stringify({
        schema_version: 1,
        generated_at: '2026-05-17T10:00:00.000Z',
        event_count: 0,
        events_hash: 'sha256:',
        tickets: {},
        scenarios: {},
        poms: {},
        areas: { checkout: { id: 'checkout' } },
        edges: [],
        latest_failures: {},
        acNodes: {},
        classifications: [],
      }),
    );
    try {
      const checks = await runChecks(d);
      const w = checks.find((c) => c.name.toLowerCase().includes('critical'));
      expect(w).toBeUndefined();
    } finally {
      rmSync(d, { recursive: true, force: true });
    }
  });

  test('warns when ticket has acs but no ACNode (snapshot stale)', async () => {
    const d = makeWebProject();
    mkdirSync(join(d, '.xera/graph'), { recursive: true });
    writeFileSync(
      join(d, '.xera/graph/snapshot.json'),
      JSON.stringify({
        schema_version: 1,
        generated_at: '2026-05-17T10:00:00.000Z',
        event_count: 0,
        events_hash: 'sha256:',
        tickets: {
          'PROJ-1': {
            id: 'PROJ-1',
            summary: 's',
            ac: ['x'],
            storyHash: 'h',
            modifiesAreas: [],
            fetchedAt: '2026-05-01T10:00:00.000Z',
          },
        },
        scenarios: {},
        poms: {},
        areas: {},
        edges: [],
        latest_failures: {},
        acNodes: {},
        classifications: [],
      }),
    );
    try {
      const checks = await runChecks(d);
      const w = checks.find(
        (c) => c.name.includes('PROJ-1') && c.name.toLowerCase().includes('ac'),
      );
      expect(w).toBeDefined();
      expect(w!.ok).toBe(false);
    } finally {
      rmSync(d, { recursive: true, force: true });
    }
  });
});
