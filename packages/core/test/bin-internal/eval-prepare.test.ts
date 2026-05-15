import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { evalPrepareCmd } from '../../src/bin-internal/eval-prepare';

function seedRepo(root: string): void {
  mkdirSync(join(root, 'fixtures/golden-eval/EVAL-001-x/golden'), { recursive: true });
  writeFileSync(join(root, 'fixtures/golden-eval/EVAL-001-x/story.md'), '# story');
  writeFileSync(
    join(root, 'fixtures/golden-eval/EVAL-001-x/meta.json'),
    JSON.stringify({
      id: 'EVAL-001',
      summary: 's',
      stages: ['feature-from-story', 'script-from-feature'],
    }),
  );
  writeFileSync(
    join(root, 'fixtures/golden-eval/EVAL-001-x/golden/test.feature'),
    'Feature: x\n  Scenario: y\n    Given z\n',
  );
  writeFileSync(
    join(root, 'fixtures/golden-eval/EVAL-001-x/golden/spec-requirements.md'),
    '- MUST x',
  );

  mkdirSync(join(root, 'fixtures/golden-tickets'), { recursive: true });
  writeFileSync(
    join(root, 'fixtures/golden-tickets/GOLD-001.json'),
    JSON.stringify({
      ticket: 'GOLD-001',
      scenarios: [],
      scenarioCounts: { total: 0, passed: 0, failed: 0, skipped: 0 },
      expected: { overall: 'PASS' },
    }),
  );

  mkdirSync(join(root, 'packages/prompts'), { recursive: true });
  for (const p of [
    'feature-from-story',
    'script-from-feature',
    'diagnose-failure',
    'eval-rubric',
  ]) {
    writeFileSync(
      join(root, `packages/prompts/${p}.md`),
      `---\nid: ${p}\nversion: 1.2.3\n---\nbody`,
    );
  }
}

let originalCwd: string;
let cwd: string;

beforeEach(() => {
  originalCwd = process.cwd();
  cwd = mkdtempSync(join(tmpdir(), 'xera-eval-prepare-'));
  seedRepo(cwd);
  process.chdir(cwd);
});

afterEach(() => {
  process.chdir(originalCwd);
  rmSync(cwd, { recursive: true, force: true });
});

describe('eval-prepare', () => {
  test('writes manifest + inputs tree and prints RUN_ID', async () => {
    const logs: string[] = [];
    const orig = console.log;
    console.log = (...a: unknown[]) => logs.push(a.join(' '));
    try {
      const exit = await evalPrepareCmd([], {
        now: () => new Date('2026-05-20T10:30:45Z'),
        getGitSha: () => 'a1b2c3d4',
      });
      expect(exit).toBe(0);
      const runIdLine = logs.find((l) => l.startsWith('RUN_ID='));
      expect(runIdLine).toBe('RUN_ID=20260520-103045-a1b2c3d');
      const runDir = join(cwd, '.xera/eval/20260520-103045-a1b2c3d');
      expect(existsSync(join(runDir, 'manifest.json'))).toBe(true);
      const manifest = JSON.parse(readFileSync(join(runDir, 'manifest.json'), 'utf8'));
      expect(manifest.tickets).toEqual(['EVAL-001', 'GOLD-001']);
      expect(manifest.stages).toEqual([
        'feature-from-story',
        'script-from-feature',
        'diagnose-failure',
      ]);
      expect(manifest.ticket_stages['EVAL-001']).toEqual([
        'feature-from-story',
        'script-from-feature',
      ]);
      expect(manifest.ticket_stages['GOLD-001']).toEqual(['diagnose-failure']);
      expect(manifest.prompt_versions['feature-from-story']).toBe('1.2.3');
      expect(existsSync(join(runDir, 'inputs/EVAL-001/story.md'))).toBe(true);
      expect(existsSync(join(runDir, 'inputs/EVAL-001/test.feature'))).toBe(true);
      expect(existsSync(join(runDir, 'inputs/GOLD-001/classifier-input.json'))).toBe(true);
      expect(existsSync(join(runDir, '.lock'))).toBe(true);
    } finally {
      console.log = orig;
    }
  });

  test('--ticket scopes to one ticket', async () => {
    const exit = await evalPrepareCmd(['--ticket=EVAL-001'], {
      now: () => new Date('2026-05-20T10:30:45Z'),
      getGitSha: () => 'a1b2c3d4',
    });
    expect(exit).toBe(0);
    const manifest = JSON.parse(
      readFileSync(join(cwd, '.xera/eval/20260520-103045-a1b2c3d/manifest.json'), 'utf8'),
    );
    expect(manifest.tickets).toEqual(['EVAL-001']);
    expect(manifest.flags.only_ticket).toBe('EVAL-001');
  });

  test('--ticket=BAD-ID fails fast', async () => {
    const errs: string[] = [];
    const orig = console.error;
    console.error = (...a: unknown[]) => errs.push(a.join(' '));
    try {
      const exit = await evalPrepareCmd(['--ticket=BAD-ID']);
      expect(exit).toBe(1);
      expect(errs.join('\n')).toContain('No golden fixture for BAD-ID');
    } finally {
      console.error = orig;
    }
  });

  test('--prompt=BAD-STAGE fails fast with list of valid stages', async () => {
    const errs: string[] = [];
    const orig = console.error;
    console.error = (...a: unknown[]) => errs.push(a.join(' '));
    try {
      const exit = await evalPrepareCmd(['--prompt=BAD-STAGE']);
      expect(exit).toBe(1);
      expect(errs.join('\n')).toContain('Unknown stage: BAD-STAGE');
      expect(errs.join('\n')).toContain('feature-from-story');
    } finally {
      console.error = orig;
    }
  });

  test('--prompt=diagnose-failure scopes stages to only diagnose-failure (and tickets to GOLD-*)', async () => {
    const exit = await evalPrepareCmd(['--prompt=diagnose-failure'], {
      now: () => new Date('2026-05-20T10:30:45Z'),
      getGitSha: () => 'a1b2c3d4',
    });
    expect(exit).toBe(0);
    const manifest = JSON.parse(
      readFileSync(join(cwd, '.xera/eval/20260520-103045-a1b2c3d/manifest.json'), 'utf8'),
    );
    expect(manifest.stages).toEqual(['diagnose-failure']);
    expect(manifest.tickets).toEqual(['GOLD-001']);
    expect(manifest.ticket_stages).toEqual({ 'GOLD-001': ['diagnose-failure'] });
  });

  test('skips a ticket whose declared stages do not intersect with --prompt filter', async () => {
    // Override EVAL-001 meta to declare only feature-from-story, then request script-from-feature.
    // There are no GOLD tickets applicable to script-from-feature either.
    // Expect exit 1 with "No tickets applicable".
    writeFileSync(
      join(cwd, 'fixtures/golden-eval/EVAL-001-x/meta.json'),
      JSON.stringify({ id: 'EVAL-001', summary: 's', stages: ['feature-from-story'] }),
    );
    const errs: string[] = [];
    const orig = console.error;
    console.error = (...a: unknown[]) => errs.push(a.join(' '));
    try {
      const exit = await evalPrepareCmd(['--prompt=script-from-feature']);
      expect(exit).toBe(1);
      expect(errs.join('\n')).toContain('No tickets applicable');
    } finally {
      console.error = orig;
    }
  });

  test('refuses to re-run with existing run-id unless --force', async () => {
    await evalPrepareCmd([], {
      now: () => new Date('2026-05-20T10:30:45Z'),
      getGitSha: () => 'a1b2c3d4',
    });
    const errs: string[] = [];
    const orig = console.error;
    console.error = (...a: unknown[]) => errs.push(a.join(' '));
    try {
      const exit2 = await evalPrepareCmd([], {
        now: () => new Date('2026-05-20T10:30:45Z'),
        getGitSha: () => 'a1b2c3d4',
      });
      expect(exit2).toBe(1);
      expect(errs.join('\n')).toContain('already exists');
    } finally {
      console.error = orig;
    }
  });
});
