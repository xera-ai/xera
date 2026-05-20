import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { graphRecordCmd } from '../../src/bin-internal/graph-record';
import { loadAllEvents } from '../../src/graph/store';

let root: string;
let prevCwd: string;
beforeEach(() => {
  prevCwd = process.cwd();
  root = mkdtempSync(join(tmpdir(), 'xera-graph-record-'));
  process.chdir(root);
});
afterEach(() => {
  process.chdir(prevCwd);
  rmSync(root, { recursive: true, force: true });
});

function seedFetch(ticket: string) {
  const dir = join(root, '.xera', ticket);
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, 'story.md'),
    `---
ticketId: ${ticket}
summary: "Login page"
storyHash: abc123
acceptanceCriteria:
  - "User can log in"
linked_issues:
  - { ticketId: "ABC-200", relation: relates }
---

# story body
`,
  );
  writeFileSync(
    join(dir, 'graph-input.json'),
    JSON.stringify({
      modifiesAreas: ['login'],
    }),
  );
}

describe('graph-record fetch', () => {
  test('emits ticket.fetched + edge.discovered jira-linked', async () => {
    seedFetch('ABC-100');
    const exit = await graphRecordCmd(['fetch', 'ABC-100']);
    expect(exit).toBe(0);
    const events = loadAllEvents(root);
    const types = events.map((e) => e.type);
    expect(types).toContain('ticket.fetched');
    expect(types).toContain('edge.discovered');
    const fetched = events.find((e) => e.type === 'ticket.fetched');
    expect((fetched!.payload as { modifiesAreas: string[] }).modifiesAreas).toEqual(['login']);
  });

  test('exits 1 when story.md missing', async () => {
    const exit = await graphRecordCmd(['fetch', 'ABC-100']);
    expect(exit).toBe(1);
  });

  test('warns to stderr when graph-input.json is missing and falls back to []', async () => {
    seedFetch('ABC-101');
    // Remove the seeded graph-input.json to simulate the skipped step-5 case.
    rmSync(join(root, '.xera', 'ABC-101', 'graph-input.json'));
    const w = captureWarn();
    try {
      const exit = await graphRecordCmd(['fetch', 'ABC-101']);
      expect(exit).toBe(0);
      const joined = w.lines.join('\n');
      expect(joined).toContain('graph-input.json');
      expect(joined).toContain('ABC-101');
      expect(joined).toContain('modifiesAreas=[]');
      const events = loadAllEvents(root);
      const fetched = events.find((e) => e.type === 'ticket.fetched');
      expect((fetched!.payload as { modifiesAreas: string[] }).modifiesAreas).toEqual([]);
    } finally {
      w.restore();
    }
  });

  test('warns to stderr when graph-input.json is invalid JSON and falls back to []', async () => {
    seedFetch('ABC-102');
    writeFileSync(join(root, '.xera', 'ABC-102', 'graph-input.json'), '{not json');
    const w = captureWarn();
    try {
      const exit = await graphRecordCmd(['fetch', 'ABC-102']);
      expect(exit).toBe(0);
      const joined = w.lines.join('\n');
      expect(joined).toContain('graph-input.json');
      expect(joined).toContain('invalid');
      expect(joined).toContain('ABC-102');
    } finally {
      w.restore();
    }
  });
});

describe('graph-record promote', () => {
  test('emits pom.promoted', async () => {
    const exit = await graphRecordCmd([
      'promote',
      '--pom-id',
      'pom123',
      '--from',
      '.xera/ABC-100/poms/Login.ts',
      '--to',
      'shared/poms/Login.ts',
    ]);
    expect(exit).toBe(0);
    const events = loadAllEvents(root);
    expect(events).toHaveLength(1);
    expect(events[0]!.type).toBe('pom.promoted');
  });
});

describe('graph-record dispute', () => {
  test('emits classification.disputed event', async () => {
    const exit = await graphRecordCmd([
      'dispute',
      '--run-id',
      'r1',
      '--scenario-id',
      'sc-1',
      '--from',
      'TEST_OUTDATED',
      '--to',
      'REAL_BUG',
      '--actor',
      'qa@example.com',
      '--reason',
      'AI got it wrong; this IS a real bug',
    ]);
    expect(exit).toBe(0);
    const events = loadAllEvents(root);
    const dispute = events.find((e) => e.type === 'classification.disputed');
    expect(dispute).toBeDefined();
    expect((dispute!.payload as any).originalClassification).toBe('TEST_OUTDATED');
    expect((dispute!.payload as any).disputedTo).toBe('REAL_BUG');
    expect((dispute!.payload as any).qaActor).toBe('qa@example.com');
    expect((dispute!.payload as any).qaReason).toBe('AI got it wrong; this IS a real bug');
  });

  test('dispute exits 1 when required flags missing', async () => {
    const exit = await graphRecordCmd(['dispute', '--run-id', 'r1']);
    expect(exit).toBe(1);
  });
});

async function seedFetchAndScenarios(ticket: string, scenarioNames: string[]): Promise<void> {
  // Use the script recorder to register scenarios in the graph via a Gherkin file.
  const dir = join(root, '.xera', ticket);
  mkdirSync(join(dir, 'feature'), { recursive: true });
  mkdirSync(join(dir, 'poms'), { recursive: true });
  const featureBody = scenarioNames
    .map((n) => `Scenario: ${n}\n  Given a precondition\n`)
    .join('\n');
  writeFileSync(join(dir, 'feature', `${ticket}.feature`), `Feature: Test feature\n${featureBody}`);
  writeFileSync(join(dir, 'poms', 'X.ts'), 'export class X {}');
  const code = await graphRecordCmd(['script', ticket]);
  if (code !== 0) throw new Error(`seed script failed with ${code}`);
}

function seedNormalizedRun(
  ticket: string,
  runId: string,
  scenarios: Array<{ name: string; outcome: 'PASS' | 'FAIL' | 'SKIPPED' }>,
): void {
  const runDir = join(root, '.xera', ticket, 'runs', runId);
  mkdirSync(runDir, { recursive: true });
  writeFileSync(join(runDir, 'normalized.json'), JSON.stringify({ scenarios }));
}

function seedClassifierInput(
  ticket: string,
  scenarios: Array<{ name: string; class: string; confidence: 'low' | 'medium' | 'high' }>,
): void {
  const dir = join(root, '.xera', ticket);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'classifier-input.json'), JSON.stringify({ scenarios }));
}

function captureWarn(): { restore: () => void; lines: string[] } {
  const original = console.warn;
  const lines: string[] = [];
  console.warn = (...args: unknown[]) => {
    lines.push(args.map((a) => String(a)).join(' '));
  };
  return {
    lines,
    restore: () => {
      console.warn = original;
    },
  };
}

describe('graph-record exec — scenario name mismatch warning', () => {
  test('warns and suggests closest match when test name does not match graph scenario', async () => {
    const ticket = 'ESS-7';
    await seedFetchAndScenarios(ticket, [
      'Visiting a protected route while signed out redirects to the login page',
    ]);
    seedNormalizedRun(ticket, 'run-1', [
      // Missing "the" — should not match the seeded scenario name.
      {
        name: 'Visiting a protected route while signed out redirects to login page',
        outcome: 'PASS',
      },
    ]);
    const w = captureWarn();
    try {
      const exit = await graphRecordCmd(['exec', ticket, '--run-id', 'run-1']);
      expect(exit).toBe(0);
      const joined = w.lines.join('\n');
      expect(joined).toContain('1 of 1');
      expect(joined).toContain('redirects to login page');
      expect(joined).toContain('Did you mean');
      expect(joined).toContain('redirects to the login page');
    } finally {
      w.restore();
    }
  });

  test('no warning when all scenario names match the graph', async () => {
    const ticket = 'ESS-8';
    await seedFetchAndScenarios(ticket, ['User logs in successfully']);
    seedNormalizedRun(ticket, 'run-2', [{ name: 'User logs in successfully', outcome: 'PASS' }]);
    const w = captureWarn();
    try {
      const exit = await graphRecordCmd(['exec', ticket, '--run-id', 'run-2']);
      expect(exit).toBe(0);
      expect(w.lines.join('\n')).toBe('');
    } finally {
      w.restore();
    }
  });

  test('no warning when the ticket has no graph scenarios yet (cannot validate)', async () => {
    const ticket = 'ESS-100';
    seedNormalizedRun(ticket, 'run-3', [{ name: 'whatever', outcome: 'PASS' }]);
    const w = captureWarn();
    try {
      const exit = await graphRecordCmd(['exec', ticket, '--run-id', 'run-3']);
      expect(exit).toBe(0);
      expect(w.lines.join('\n')).toBe('');
    } finally {
      w.restore();
    }
  });
});

describe('graph-record classify — scenario name mismatch warning', () => {
  test('warns and suggests closest match when classifier scenario name does not match graph', async () => {
    const ticket = 'ESS-9';
    await seedFetchAndScenarios(ticket, ['Redirect to login preserves the original destination']);
    seedClassifierInput(ticket, [
      {
        name: 'Redirect to login preserves original destination',
        class: 'PASS',
        confidence: 'high',
      },
    ]);
    const w = captureWarn();
    try {
      const exit = await graphRecordCmd(['classify', ticket, '--run-id', 'run-c1']);
      expect(exit).toBe(0);
      const joined = w.lines.join('\n');
      expect(joined).toContain('classifier-input.json');
      expect(joined).toContain('Did you mean');
      expect(joined).toContain('preserves the original destination');
    } finally {
      w.restore();
    }
  });
});

describe('graph-record script — priority auto-detection', () => {
  test('upgrades scenario without explicit @p tag to p0 when AC mentions auth keyword', async () => {
    const ticket = 'ABC-AUTH';
    const dir = join(root, '.xera', ticket);
    mkdirSync(join(dir, 'feature'), { recursive: true });
    mkdirSync(join(dir, 'poms'), { recursive: true });
    mkdirSync(join(dir, 'tests'), { recursive: true });
    writeFileSync(
      join(dir, 'feature', `${ticket}.feature`),
      `Feature: Login
Scenario: User can log in with valid credentials
  Given a registered user
  When they submit the login form
  Then they reach the dashboard
`,
    );
    writeFileSync(join(dir, 'poms', 'LoginPage.ts'), 'export class LoginPage {}');
    writeFileSync(join(dir, 'tests', `${ticket}.spec.ts`), '// test');
    const exit = await graphRecordCmd(['script', ticket]);
    expect(exit).toBe(0);
    const events = loadAllEvents(root);
    const scenarios = events.filter((e) => e.type === 'scenario.generated');
    expect(scenarios.length).toBe(1);
    const payload = scenarios[0]!.payload as { priority: 'p0' | 'p1' | 'p2' };
    expect(payload.priority).toBe('p0');
  });

  test('respects explicit @p2 tag even when keyword present', async () => {
    const ticket = 'ABC-EXP';
    const dir = join(root, '.xera', ticket);
    mkdirSync(join(dir, 'feature'), { recursive: true });
    mkdirSync(join(dir, 'poms'), { recursive: true });
    writeFileSync(
      join(dir, 'feature', `${ticket}.feature`),
      `Feature: x
@p2
Scenario: Edge case admin login
  Given x
`,
    );
    writeFileSync(join(dir, 'poms', 'X.ts'), 'export class X {}');
    const exit = await graphRecordCmd(['script', ticket]);
    expect(exit).toBe(0);
    const events = loadAllEvents(root);
    const scenarios = events.filter((e) => e.type === 'scenario.generated');
    const payload = scenarios[0]!.payload as { priority: 'p0' | 'p1' | 'p2' };
    expect(payload.priority).toBe('p2');
  });

  test('keeps p1 default when no keywords match', async () => {
    const ticket = 'ABC-RGB';
    const dir = join(root, '.xera', ticket);
    mkdirSync(join(dir, 'feature'), { recursive: true });
    mkdirSync(join(dir, 'poms'), { recursive: true });
    writeFileSync(
      join(dir, 'feature', `${ticket}.feature`),
      `Feature: theme
Scenario: User changes background color
  Given x
`,
    );
    writeFileSync(join(dir, 'poms', 'X.ts'), 'export class X {}');
    const exit = await graphRecordCmd(['script', ticket]);
    expect(exit).toBe(0);
    const events = loadAllEvents(root);
    const scenarios = events.filter((e) => e.type === 'scenario.generated');
    const payload = scenarios[0]!.payload as { priority: 'p0' | 'p1' | 'p2' };
    expect(payload.priority).toBe('p1');
  });
});

describe('graph-record script — uses edges for route-less POMs', () => {
  test('emits uses edges for a POM class without "Page" suffix and empty route', async () => {
    const ticket = 'NAV-1';
    const dir = join(root, '.xera', ticket);
    mkdirSync(join(dir, 'page-objects'), { recursive: true });
    writeFileSync(
      join(dir, 'test.feature'),
      `Feature: Logout
Scenario: User signs out from the dashboard
  Given a signed-in user
  When they click Sign out
  Then they land on the login page

Scenario: User signs out from settings
  Given a signed-in user on settings
  When they click Sign out
  Then they land on the login page
`,
    );
    writeFileSync(
      join(dir, 'page-objects', 'NavigationBar.ts'),
      `export class NavigationBar {
  constructor(private page: import('@playwright/test').Page) {}
  signOut() { return this.page.getByRole('button', { name: 'Sign out' }).click(); }
}
`,
    );
    writeFileSync(
      join(dir, 'spec.ts'),
      `import { NavigationBar } from './page-objects/NavigationBar';
test('signs out from dashboard', async ({ page }) => {
  const nav = new NavigationBar(page);
  await nav.signOut();
});
test('signs out from settings', async ({ page }) => {
  const nav = new NavigationBar(page);
  await nav.signOut();
});
`,
    );
    const exit = await graphRecordCmd(['script', ticket]);
    expect(exit).toBe(0);
    const events = loadAllEvents(root);
    const usesEdges = events.filter(
      (e) => e.type === 'edge.discovered' && (e.payload as { kind: string }).kind === 'uses',
    );
    expect(usesEdges.length).toBe(2);
    const poms = events.filter((e) => e.type === 'pom.generated');
    expect(poms.length).toBe(1);
    const pomId = (poms[0]!.payload as { pomId: string }).pomId;
    for (const edge of usesEdges) {
      expect((edge.payload as { to: string }).to).toBe(pomId);
    }
  });

  test('still emits uses edges for conventional *Page POMs (regression guard)', async () => {
    const ticket = 'NAV-2';
    const dir = join(root, '.xera', ticket);
    mkdirSync(join(dir, 'page-objects'), { recursive: true });
    writeFileSync(
      join(dir, 'test.feature'),
      `Feature: Login
Scenario: User logs in
  Given x
`,
    );
    writeFileSync(
      join(dir, 'page-objects', 'LoginPage.ts'),
      `export class LoginPage {
  constructor(private page: import('@playwright/test').Page) {}
  async goto() { return this.page.goto('/login'); }
}
`,
    );
    writeFileSync(
      join(dir, 'spec.ts'),
      `import { LoginPage } from './page-objects/LoginPage';
test('logs in', async ({ page }) => {
  const login = new LoginPage(page);
  await login.goto();
});
`,
    );
    const exit = await graphRecordCmd(['script', ticket]);
    expect(exit).toBe(0);
    const events = loadAllEvents(root);
    const usesEdges = events.filter(
      (e) => e.type === 'edge.discovered' && (e.payload as { kind: string }).kind === 'uses',
    );
    expect(usesEdges.length).toBe(1);
  });
});
