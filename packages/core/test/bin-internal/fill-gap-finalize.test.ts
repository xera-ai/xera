import { describe, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fillGapFinalizeCmd } from '../../src/bin-internal/fill-gap-finalize';

function makeProject(): string {
  const dir = mkdtempSync(join(tmpdir(), 'xera-fill-fin-'));
  mkdirSync(join(dir, '.xera/coverage/checkout'), { recursive: true });
  return dir;
}

describe('fill-gap-finalize subcommand', () => {
  test('exports fillGapFinalizeCmd returning Promise<number>', () => {
    expect(typeof fillGapFinalizeCmd).toBe('function');
    expect(fillGapFinalizeCmd(['--help-stub'])).toBeInstanceOf(Promise);
  });

  test('requires --accept <id> and --ticket <ID>', async () => {
    expect(await fillGapFinalizeCmd([])).toBe(1);
    expect(await fillGapFinalizeCmd(['--accept', 'P1'])).toBe(1);
    expect(await fillGapFinalizeCmd(['--ticket', 'PROJ-1'])).toBe(1);
  });
});

describe('fill-gap-finalize end-to-end', () => {
  test('writes feature.draft.md for accepted proposal', async () => {
    const dir = makeProject();
    writeFileSync(
      join(dir, '.xera/coverage/checkout/proposals.json'),
      JSON.stringify({
        proposals: [
          {
            id: 'P1',
            ticketId: 'PROJ-101',
            title: 'Customer pays with Apple Pay',
            rationale: 'Ticket adds Apple Pay; no scenario tests this path.',
            gherkin:
              'Scenario: Customer pays with Apple Pay\n  Given user is on /checkout\n  When user selects Apple Pay\n  Then order confirms',
            satisfiesAcs: [0, 1],
          },
        ],
      }),
    );
    const prevCwd = process.cwd();
    process.chdir(dir);
    try {
      const code = await fillGapFinalizeCmd([
        '--accept',
        'P1',
        '--ticket',
        'PROJ-101',
        '--source',
        join(dir, '.xera/coverage/checkout/proposals.json'),
      ]);
      expect(code).toBe(0);
      const draft = readFileSync(join(dir, '.xera/PROJ-101/feature.draft.md'), 'utf8');
      expect(draft).toContain('Scenario: Customer pays with Apple Pay');
      expect(draft).toContain('Given user is on /checkout');
      expect(draft).toContain('# Draft scenario for PROJ-101');
    } finally {
      process.chdir(prevCwd);
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('exit 2 when proposal id not found', async () => {
    const dir = makeProject();
    writeFileSync(
      join(dir, '.xera/coverage/checkout/proposals.json'),
      JSON.stringify({ proposals: [] }),
    );
    const prevCwd = process.cwd();
    process.chdir(dir);
    try {
      const code = await fillGapFinalizeCmd([
        '--accept',
        'P99',
        '--ticket',
        'PROJ-101',
        '--source',
        join(dir, '.xera/coverage/checkout/proposals.json'),
      ]);
      expect(code).toBe(2);
    } finally {
      process.chdir(prevCwd);
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('exit 2 when proposals JSON is malformed', async () => {
    const dir = makeProject();
    writeFileSync(
      join(dir, '.xera/coverage/checkout/proposals.json'),
      JSON.stringify({ proposals: [{ id: 'P1' /* missing required fields */ }] }),
    );
    const prevCwd = process.cwd();
    process.chdir(dir);
    try {
      const code = await fillGapFinalizeCmd([
        '--accept',
        'P1',
        '--ticket',
        'PROJ-101',
        '--source',
        join(dir, '.xera/coverage/checkout/proposals.json'),
      ]);
      expect(code).toBe(2);
    } finally {
      process.chdir(prevCwd);
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('exit 3 + does not overwrite when draft exists without --force', async () => {
    const dir = makeProject();
    writeFileSync(
      join(dir, '.xera/coverage/checkout/proposals.json'),
      JSON.stringify({
        proposals: [
          {
            id: 'P1',
            ticketId: 'PROJ-101',
            title: 't',
            rationale: 'r',
            gherkin: 'Scenario: x\n  Given y',
            satisfiesAcs: [],
          },
        ],
      }),
    );
    mkdirSync(join(dir, '.xera/PROJ-101'), { recursive: true });
    writeFileSync(join(dir, '.xera/PROJ-101/feature.draft.md'), 'EXISTING CONTENT');
    const prevCwd = process.cwd();
    process.chdir(dir);
    try {
      const code = await fillGapFinalizeCmd([
        '--accept',
        'P1',
        '--ticket',
        'PROJ-101',
        '--source',
        join(dir, '.xera/coverage/checkout/proposals.json'),
      ]);
      expect(code).toBe(3);
      const content = readFileSync(join(dir, '.xera/PROJ-101/feature.draft.md'), 'utf8');
      expect(content).toBe('EXISTING CONTENT');
    } finally {
      process.chdir(prevCwd);
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('--force overwrites existing draft', async () => {
    const dir = makeProject();
    writeFileSync(
      join(dir, '.xera/coverage/checkout/proposals.json'),
      JSON.stringify({
        proposals: [
          {
            id: 'P1',
            ticketId: 'PROJ-101',
            title: 't',
            rationale: 'r',
            gherkin: 'Scenario: x\n  Given y',
            satisfiesAcs: [],
          },
        ],
      }),
    );
    mkdirSync(join(dir, '.xera/PROJ-101'), { recursive: true });
    writeFileSync(join(dir, '.xera/PROJ-101/feature.draft.md'), 'EXISTING');
    const prevCwd = process.cwd();
    process.chdir(dir);
    try {
      const code = await fillGapFinalizeCmd([
        '--accept',
        'P1',
        '--ticket',
        'PROJ-101',
        '--force',
        '--source',
        join(dir, '.xera/coverage/checkout/proposals.json'),
      ]);
      expect(code).toBe(0);
      const content = readFileSync(join(dir, '.xera/PROJ-101/feature.draft.md'), 'utf8');
      expect(content).not.toContain('EXISTING');
      expect(content).toContain('Scenario: x');
    } finally {
      process.chdir(prevCwd);
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
