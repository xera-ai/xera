/**
 * Unit test for the conditional issue-tracker rendering in xera.config.ts
 * templates. These run without a built dist (no CLI binary needed) so they
 * stay green even before `npm run build`.
 */

import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';
import { scaffoldFile } from '../src/scaffold';

interface ScaffoldVars {
  useJiraTracker: boolean;
  useGithubTracker: boolean;
  jiraBaseUrl: string;
  projectKeys: string[];
  storyField: string;
  acceptanceCriteriaField: string;
  githubRepo: string;
  stagingUrl: string;
  authEnabled: boolean;
  roles: string[];
  apiBaseUrl: string;
  openapiPath: string;
  authStrategy: string;
  httpRoles: string[];
}

function jiraVars(overrides: Partial<ScaffoldVars> = {}): ScaffoldVars {
  return {
    useJiraTracker: true,
    useGithubTracker: false,
    jiraBaseUrl: 'https://x.atlassian.net',
    projectKeys: ['PROJ'],
    storyField: 'description',
    acceptanceCriteriaField: '',
    githubRepo: '',
    stagingUrl: 'https://staging.example.com',
    authEnabled: false,
    roles: [],
    apiBaseUrl: 'https://api.example.com',
    openapiPath: '',
    authStrategy: 'none',
    httpRoles: [],
    ...overrides,
  };
}

function githubVars(overrides: Partial<ScaffoldVars> = {}): ScaffoldVars {
  return jiraVars({
    useJiraTracker: false,
    useGithubTracker: true,
    jiraBaseUrl: '',
    projectKeys: [],
    storyField: 'description',
    acceptanceCriteriaField: '',
    githubRepo: 'octocat/hello-world',
    ...overrides,
  });
}

function render(template: string, vars: ScaffoldVars): string {
  const tmp = mkdtempSync(join(tmpdir(), 'xera-tracker-scaffold-'));
  try {
    const target = join(tmp, 'out.ts');
    scaffoldFile(target, template, vars as unknown as Record<string, unknown>);
    return readFileSync(target, 'utf8');
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

describe('xera.config.ts.tmpl tracker variants', () => {
  test('jira tracker renders a jira block and no github block', () => {
    const out = render('xera.config.ts.tmpl', jiraVars());
    expect(out).toContain('jira: {');
    expect(out).toContain("baseUrl: 'https://x.atlassian.net'");
    expect(out).not.toContain('github: {');
  });

  test('github tracker renders a github block and no jira block', () => {
    const out = render('xera.config.ts.tmpl', githubVars());
    expect(out).toContain("github: { repo: 'octocat/hello-world' }");
    expect(out).not.toContain('jira: {');
  });
});

describe('http-xera.config.ts.tmpl tracker variants', () => {
  test('github tracker renders github block in the api shape', () => {
    const out = render('http-xera.config.ts.tmpl', githubVars());
    expect(out).toContain("github: { repo: 'octocat/hello-world' }");
    expect(out).not.toContain('jira: {');
  });
});

describe('mixed-xera.config.ts.tmpl tracker variants', () => {
  test('github tracker renders github block in the mixed shape', () => {
    const out = render('mixed-xera.config.ts.tmpl', githubVars());
    expect(out).toContain("github: { repo: 'octocat/hello-world' }");
    expect(out).not.toContain('jira: {');
  });
});

describe('.env.example tracker variants', () => {
  test('jira tracker emits JIRA_EMAIL / JIRA_API_TOKEN', () => {
    const out = render('env.example.tmpl', jiraVars());
    expect(out).toContain('JIRA_EMAIL=');
    expect(out).toContain('JIRA_API_TOKEN=');
    expect(out).not.toContain('gh auth login');
  });

  test('github tracker omits JIRA_* and mentions gh auth login', () => {
    const out = render('env.example.tmpl', githubVars());
    expect(out).not.toContain('JIRA_EMAIL=');
    expect(out).not.toContain('JIRA_API_TOKEN=');
    expect(out).toContain('gh auth login');
  });

  test('http env example switches identically by tracker', () => {
    const jira = render('http-env.example.tmpl', jiraVars());
    expect(jira).toContain('JIRA_EMAIL=');
    const github = render('http-env.example.tmpl', githubVars());
    expect(github).not.toContain('JIRA_EMAIL=');
    expect(github).toContain('gh auth login');
  });
});

// Issue #190: render() leaked nested {{#if}}/{{/if}} tags into output,
// producing a syntactically-broken xera.config.ts on every fresh init.
describe('xera.config.ts.tmpl nested {{#if}} handling (issue #190)', () => {
  test('github tracker leaves no orphaned template tags', () => {
    const out = render('xera.config.ts.tmpl', githubVars());
    expect(out).not.toContain('{{');
    expect(out).not.toContain('}}');
  });

  test('jira tracker with empty acceptanceCriteriaField (inner-false, outer-true) leaves no orphaned tags', () => {
    const out = render('xera.config.ts.tmpl', jiraVars({ acceptanceCriteriaField: '' }));
    expect(out).not.toContain('{{');
    expect(out).not.toContain('}}');
    // The inner block's body must be gone too — no orphan `acceptanceCriteria:` key.
    expect(out).not.toContain('acceptanceCriteria:');
  });

  test('jira tracker with acceptanceCriteriaField set (inner-true, outer-true) emits the field and no tags', () => {
    const out = render(
      'xera.config.ts.tmpl',
      jiraVars({ acceptanceCriteriaField: 'customfield_10010' }),
    );
    expect(out).not.toContain('{{');
    expect(out).not.toContain('}}');
    expect(out).toContain("acceptanceCriteria: 'customfield_10010'");
  });
});
