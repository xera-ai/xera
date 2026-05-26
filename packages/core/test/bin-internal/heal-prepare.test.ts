import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { strToU8, zipSync } from 'fflate';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
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

// A minimal Playwright 1.60 trace event for a failed matcher assertion. The
// real trace carries this on `type: 'after'` events with `error`. Used by the
// happy-path and ariaSnapshot tests below.
function ariaErrorEvent(ariaSnapshot: string, errorMessage = 'Expect failed'): string {
  return JSON.stringify({
    type: 'after',
    callId: 'call@14',
    endTime: 2057.791,
    error: { name: 'Expect', message: errorMessage },
    result: { matches: false, timedOut: true, received: { ariaSnapshot } },
  });
}

describe('healPrepare (pure)', () => {
  test('happy path: returns full HealInput from classifier + normalized + POM + feature + trace', () => {
    seedTicket(cwd, 'JIRA-123', 'r1', {
      traceFiles: {
        '0-trace.trace': ariaErrorEvent('- button "Sign in"'),
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
    expect(result.domSnapshotAtFailure).toContain('button "Sign in"');
  });

  test('resolves trace.zip from a per-test subdir via report.json attachments (#200)', () => {
    const { runDir } = seedTicket(cwd, 'JIRA-200', 'r1');
    // Playwright writes the trace under a per-test subdir, NOT runDir/trace.zip.
    const testDir = join(runDir, 'JIRA-200-spec-ts-User-can-sign-in-chromium');
    mkdirSync(testDir, { recursive: true });
    const tracePath = join(testDir, 'trace.zip');
    writeFileSync(
      tracePath,
      zipSync({
        '0-trace.trace': strToU8(ariaErrorEvent('- button "Sign in"')),
      }),
    );
    writeFileSync(
      join(runDir, 'report.json'),
      JSON.stringify({
        suites: [
          {
            specs: [
              {
                title: 'User can sign in',
                tests: [{ results: [{ attachments: [{ name: 'trace', path: tracePath }] }] }],
              },
            ],
          },
        ],
      }),
    );
    const result = healPrepare(cwd, 'JIRA-200', 'r1', 'User can sign in');
    expect(result.domSnapshotAtFailure).toContain('button "Sign in"');
  });

  test('resolves trace.zip by globbing a per-test subdir when report.json is absent (#200)', () => {
    const { runDir } = seedTicket(cwd, 'JIRA-201', 'r1');
    const testDir = join(runDir, 'some-test-dir');
    mkdirSync(testDir, { recursive: true });
    writeFileSync(
      join(testDir, 'trace.zip'),
      zipSync({
        '0-trace.trace': strToU8(ariaErrorEvent('- heading "Glob hit" [level=1]')),
      }),
    );
    const result = healPrepare(cwd, 'JIRA-201', 'r1', 'User can sign in');
    expect(result.domSnapshotAtFailure).toContain('Glob hit');
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

  test('prefers ariaSnapshot from the error-bearing after event over the lex-sort .html fallback (#207)', () => {
    // SPA reality: Playwright captures the served response body as the only
    // `.html` resource (the empty pre-hydration shell). The actual rendered
    // DOM at failure time is recorded as an aria tree on the `after` event
    // that carries the assertion error. We must prefer that aria tree.
    seedTicket(cwd, 'JIRA-207', 'r1', {
      traceFiles: {
        'resources/8df76f3c47.html':
          '<!doctype html><html><body><div id="root"></div><script>/*setTimeout*/</script></body></html>',
        '0-trace.trace': [
          JSON.stringify({
            type: 'frame-snapshot',
            snapshot: {
              snapshotName: 'before@call@10',
              frameUrl: 'about:blank',
              html: ['HTML', {}, ['HEAD', {}], ['BODY', {}]],
            },
          }),
          ariaErrorEvent('- heading "API Keys" [level=1]'),
        ].join('\n'),
      },
    });
    const result = healPrepare(cwd, 'JIRA-207', 'r1', 'User can sign in');
    expect(result.domSnapshotAtFailure).toContain('heading "API Keys"');
    expect(result.domSnapshotAtFailure).not.toContain('id="root"');
    expect(result.domSnapshotAtFailure).not.toContain('setTimeout');
  });

  test('skips after events with no error and picks the one that has an aria snapshot', () => {
    // Real traces contain many successful `after` events. Only the one with
    // an `error` payload marks the failure point.
    seedTicket(cwd, 'JIRA-208', 'r1', {
      traceFiles: {
        '0-trace.trace': [
          JSON.stringify({
            type: 'after',
            callId: 'call@6',
            endTime: 540.8,
            result: { page: '<Page>' },
          }),
          JSON.stringify({
            type: 'after',
            callId: 'call@10',
            endTime: 552.8,
            result: { response: '<Response>' },
          }),
          ariaErrorEvent('- heading "Failure point" [level=1]'),
        ].join('\n'),
      },
    });
    const result = healPrepare(cwd, 'JIRA-208', 'r1', 'User can sign in');
    expect(result.domSnapshotAtFailure).toContain('heading "Failure point"');
  });

  test('scans every .trace entry in the zip, not just the first one (#207)', () => {
    // Playwright writes both a test-runner trace (`test.trace`, no
    // ariaSnapshot) and a library trace (`<idx>-trace.trace`, has it). The
    // first-by-iteration trace may be the test-runner one; we must keep
    // scanning until we find the matcher error with the aria tree.
    seedTicket(cwd, 'JIRA-210', 'r1', {
      traceFiles: {
        'test.trace': JSON.stringify({
          type: 'after',
          callId: 'hook@1',
          endTime: 1.0,
          // No `error` field — this is a successful test-runner-level "after".
        }),
        '0-trace.trace': ariaErrorEvent('- heading "Library trace win" [level=1]'),
      },
    });
    const result = healPrepare(cwd, 'JIRA-210', 'r1', 'User can sign in');
    expect(result.domSnapshotAtFailure).toContain('Library trace win');
  });

  test('falls back to lex-sort last .html when no ariaSnapshot is recorded', () => {
    // Non-SPA path: target is plain server-rendered HTML, the response body
    // IS the rendered DOM at failure time. ariaSnapshot may be absent.
    seedTicket(cwd, 'JIRA-209', 'r1', {
      traceFiles: {
        'resources/abc.html': '<html><body><h1>First</h1></body></html>',
        'resources/xyz.html': '<html><body><h1>Last</h1></body></html>',
        '0-trace.trace': JSON.stringify({
          type: 'after',
          callId: 'call@14',
          endTime: 100,
          error: { name: 'Expect', message: 'fail' },
          result: { matches: false },
        }),
      },
    });
    const result = healPrepare(cwd, 'JIRA-209', 'r1', 'User can sign in');
    expect(result.domSnapshotAtFailure).toContain('Last');
    expect(result.domSnapshotAtFailure).not.toContain('First');
  });

  test('falls back to lex-sort last .html when trace events are unparseable', () => {
    seedTicket(cwd, 'JIRA-123', 'r1', {
      traceFiles: {
        'resources/abc.html': '<html><body>A</body></html>',
        'resources/xyz.html': '<html><body>Z</body></html>',
        '0-trace.trace': 'not valid json\nalso garbage',
      },
    });
    const result = healPrepare(cwd, 'JIRA-123', 'r1', 'User can sign in');
    // Fallback: lex-sort puts 'xyz' last, so we get Z.
    expect(result.domSnapshotAtFailure).toContain('Z');
  });
});

describe('healPrepareCmd (CLI)', () => {
  test('writes heal-input.json to run dir and prints ok', async () => {
    seedTicket(cwd, 'JIRA-123', 'r1', {
      traceFiles: {
        '0-trace.trace': ariaErrorEvent('- button "Sign in"'),
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
