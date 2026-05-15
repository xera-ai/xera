import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { strToU8, zipSync } from 'fflate';
import { type HealInput, healPrepare, healPrepareCmd } from '../../src/bin-internal/heal-prepare';

function seedTicket(
  root: string,
  ticket: string,
  runId: string,
  opts: {
    classifierScenarios?: Array<{
      name: string;
      outcome: string;
      class: string;
      confidence: string;
      rationale: string;
    }>;
    normalizedScenarios?: Array<{
      name: string;
      outcome: 'PASS' | 'FAIL' | 'SKIPPED';
      failure?: { errorMessage?: string };
    }>;
    pomContent?: string;
    featureContent?: string;
    traceFiles?: Record<string, string>;
  } = {},
): { ticketDir: string; runDir: string; pomFile: string } {
  const ticketDir = join(root, '.xera', ticket);
  const runDir = join(ticketDir, 'runs', runId);
  const pomDir = join(ticketDir, 'page-objects');
  mkdirSync(runDir, { recursive: true });
  mkdirSync(pomDir, { recursive: true });
  const pomFile = join(pomDir, 'LoginPage.ts');

  writeFileSync(
    join(ticketDir, 'classifier-input.json'),
    JSON.stringify({
      runId,
      scenarios: opts.classifierScenarios ?? [
        {
          name: 'User can sign in',
          outcome: 'FAIL',
          class: 'SELECTOR_DRIFT',
          confidence: 'high',
          rationale: 'r',
        },
      ],
      scenarioCounts: { total: 1, passed: 0, failed: 1, skipped: 0 },
    }),
  );

  writeFileSync(
    join(runDir, 'normalized.json'),
    JSON.stringify({
      runId,
      outcome: 'FAIL',
      scenarios: opts.normalizedScenarios ?? [
        {
          name: 'User can sign in',
          outcome: 'FAIL',
          failure: {
            errorMessage:
              "Locator: getByRole('button', { name: 'Sign in' })\nExpected: visible\nReceived: <element(s) not found>",
          },
        },
      ],
      scrubbed_fields_count: 0,
    }),
  );

  writeFileSync(
    pomFile,
    opts.pomContent ??
      `import { Page } from '@playwright/test';

export class LoginPage {
  constructor(private page: Page) {}
  emailInput = this.page.getByLabel('Email');
  passwordInput = this.page.getByLabel('Password');
  signInButton = this.page.getByRole('button', { name: 'Sign in' });
}
`,
  );

  writeFileSync(
    join(ticketDir, 'test.feature'),
    opts.featureContent ??
      `Feature: Login

  Scenario: User can sign in
    Given I am on the login page
    When I click the "Sign in" button
    Then I see the dashboard
`,
  );

  if (opts.traceFiles !== undefined) {
    const u8files: Record<string, Uint8Array> = {};
    for (const [name, content] of Object.entries(opts.traceFiles)) {
      u8files[name] = strToU8(content);
    }
    writeFileSync(join(runDir, 'trace.zip'), zipSync(u8files));
  }

  return { ticketDir, runDir, pomFile };
}

let originalCwd: string;
let cwd: string;

beforeEach(() => {
  originalCwd = process.cwd();
  cwd = mkdtempSync(join(tmpdir(), 'xera-heal-prepare-'));
  process.chdir(cwd);
});

afterEach(() => {
  process.chdir(originalCwd);
  rmSync(cwd, { recursive: true, force: true });
});

describe('healPrepare (pure)', () => {
  test('happy path: returns full HealInput from classifier + normalized + POM + feature + trace', () => {
    seedTicket(cwd, 'JIRA-123', 'r1', {
      traceFiles: {
        'resources/abc.html': '<html><body><button>Log in</button></body></html>',
        'trace.trace': JSON.stringify({
          type: 'snapshot',
          snapshot: { resourceName: 'resources/abc.html' },
        }),
      },
    });
    const result = healPrepare(cwd, 'JIRA-123', 'r1', 'User can sign in');
    expect(result.ticket).toBe('JIRA-123');
    expect(result.runId).toBe('r1');
    expect(result.scenarioName).toBe('User can sign in');
    expect(result.failedLocator.raw).toBe("getByRole('button', { name: 'Sign in' })");
    expect(result.failedLocator.kind).toBe('role');
    expect(result.failedLocator.pomFile).toContain('LoginPage.ts');
    expect(result.failedLocator.pomLine).toBeGreaterThan(0);
    expect(result.failedLocator.pomLineContent).toContain('signInButton');
    expect(result.failedLocator.pomMethodName).toBe('signInButton');
    expect(result.gherkinStep).toContain('Sign in');
    expect(result.domSnapshotAtFailure).toContain('<button>Log in</button>');
  });

  test('classifies kind=test-id when locator uses getByTestId', () => {
    seedTicket(cwd, 'JIRA-123', 'r1', {
      normalizedScenarios: [
        {
          name: 'User can sign in',
          outcome: 'FAIL',
          failure: { errorMessage: "Locator: getByTestId('login-btn')\nExpected: visible" },
        },
      ],
      pomContent: `export class LoginPage {
  signInButton = this.page.getByTestId('login-btn');
}
`,
    });
    const result = healPrepare(cwd, 'JIRA-123', 'r1', 'User can sign in');
    expect(result.failedLocator.kind).toBe('test-id');
  });

  test('classifies kind=css-class when locator uses .locator with CSS', () => {
    seedTicket(cwd, 'JIRA-123', 'r1', {
      normalizedScenarios: [
        {
          name: 'User can sign in',
          outcome: 'FAIL',
          failure: { errorMessage: "Locator: locator('.MuiButton-root-3xyz')\nExpected: visible" },
        },
      ],
      pomContent: `export class LoginPage {
  signInButton = this.page.locator('.MuiButton-root-3xyz');
}
`,
    });
    const result = healPrepare(cwd, 'JIRA-123', 'r1', 'User can sign in');
    expect(result.failedLocator.kind).toBe('css-class');
  });

  test('throws when scenario not in classifier-input', () => {
    seedTicket(cwd, 'JIRA-123', 'r1');
    expect(() => healPrepare(cwd, 'JIRA-123', 'r1', 'Nonexistent scenario')).toThrow(
      /scenario not found/i,
    );
  });

  test('throws when normalized.json missing the failure', () => {
    seedTicket(cwd, 'JIRA-123', 'r1', {
      normalizedScenarios: [{ name: 'User can sign in', outcome: 'PASS' }],
    });
    expect(() => healPrepare(cwd, 'JIRA-123', 'r1', 'User can sign in')).toThrow(/no failure/i);
  });

  test('throws when failedLocator regex cannot extract from errorMessage', () => {
    seedTicket(cwd, 'JIRA-123', 'r1', {
      normalizedScenarios: [
        {
          name: 'User can sign in',
          outcome: 'FAIL',
          failure: { errorMessage: 'something else, no Locator: line' },
        },
      ],
    });
    expect(() => healPrepare(cwd, 'JIRA-123', 'r1', 'User can sign in')).toThrow(
      /cannot extract.*locator/i,
    );
  });

  test('throws when POM line containing the locator cannot be located', () => {
    seedTicket(cwd, 'JIRA-123', 'r1', {
      pomContent: `export class LoginPage {
  // POM does not contain the failing locator
}
`,
    });
    expect(() => healPrepare(cwd, 'JIRA-123', 'r1', 'User can sign in')).toThrow(
      /POM line not found/i,
    );
  });

  test('throws when page-objects directory does not exist at all', () => {
    seedTicket(cwd, 'JIRA-123', 'r1');
    // Remove the page-objects dir entirely (seedTicket creates it; this test asserts behavior when it's absent).
    rmSync(join(cwd, '.xera/JIRA-123/page-objects'), { recursive: true, force: true });
    expect(() => healPrepare(cwd, 'JIRA-123', 'r1', 'User can sign in')).toThrow(
      /POM line not found/i,
    );
  });

  test('returns empty gherkinStep when feature has no When/Then line', () => {
    seedTicket(cwd, 'JIRA-123', 'r1', {
      featureContent: 'Feature: Login\n  # no scenarios with steps\n',
    });
    const result = healPrepare(cwd, 'JIRA-123', 'r1', 'User can sign in');
    expect(result.gherkinStep).toBe('');
  });

  test('returns empty domSnapshotAtFailure when trace.zip is missing', () => {
    seedTicket(cwd, 'JIRA-123', 'r1');
    const result = healPrepare(cwd, 'JIRA-123', 'r1', 'User can sign in');
    expect(result.domSnapshotAtFailure).toBe('');
  });
});

describe('healPrepareCmd (CLI)', () => {
  test('writes heal-input.json to run dir and prints ok', async () => {
    seedTicket(cwd, 'JIRA-123', 'r1', {
      traceFiles: {
        'resources/abc.html': '<html><body><button>Log in</button></body></html>',
        'trace.trace': JSON.stringify({
          type: 'snapshot',
          snapshot: { resourceName: 'resources/abc.html' },
        }),
      },
    });
    const logs: string[] = [];
    const orig = console.log;
    console.log = (...a: unknown[]) => logs.push(a.join(' '));
    try {
      const exit = await healPrepareCmd(['JIRA-123', 'r1', 'User can sign in']);
      expect(exit).toBe(0);
      expect(logs.join('\n')).toContain('[xera:heal-prepare] wrote');
    } finally {
      console.log = orig;
    }
    const written: HealInput = JSON.parse(
      readFileSync(join(cwd, '.xera/JIRA-123/runs/r1/heal-input.json'), 'utf8'),
    );
    expect(written.failedLocator.raw).toContain('getByRole');
  });

  test('exits 1 with usage on missing args', async () => {
    const errs: string[] = [];
    const orig = console.error;
    console.error = (...a: unknown[]) => errs.push(a.join(' '));
    try {
      const exit = await healPrepareCmd([]);
      expect(exit).toBe(1);
      expect(errs.join('\n')).toContain('usage');
    } finally {
      console.error = orig;
    }
  });

  test('exits 1 and prints error on prepare failure', async () => {
    seedTicket(cwd, 'JIRA-123', 'r1');
    const errs: string[] = [];
    const orig = console.error;
    console.error = (...a: unknown[]) => errs.push(a.join(' '));
    try {
      const exit = await healPrepareCmd(['JIRA-123', 'r1', 'Nonexistent']);
      expect(exit).toBe(1);
      expect(errs.join('\n')).toContain('scenario not found');
    } finally {
      console.error = orig;
    }
  });
});
