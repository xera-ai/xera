import { describe, expect, test } from 'bun:test';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promotePom } from '../../src/generator/promote';

describe('promotePom', () => {
  test('moves POM file and rewrites spec.ts import', async () => {
    const root = mkdtempSync(join(tmpdir(), 'xera-prom-'));
    const ticketDir = join(root, '.xera/JIRA-1');
    mkdirSync(join(ticketDir, 'page-objects'), { recursive: true });
    mkdirSync(join(root, 'shared/page-objects'), { recursive: true });
    writeFileSync(join(ticketDir, 'page-objects/LoginPage.ts'), `export class LoginPage {}\n`);
    writeFileSync(
      join(ticketDir, 'spec.ts'),
      `import { LoginPage } from './page-objects/LoginPage';\nnew LoginPage();\n`,
    );

    await promotePom({ repoRoot: root, ticket: 'JIRA-1', className: 'LoginPage' });

    expect(existsSync(join(root, 'shared/page-objects/LoginPage.ts'))).toBe(true);
    expect(existsSync(join(ticketDir, 'page-objects/LoginPage.ts'))).toBe(false);
    const newSpec = readFileSync(join(ticketDir, 'spec.ts'), 'utf8');
    expect(newSpec).toContain(`from '../../shared/page-objects/LoginPage'`);

    rmSync(root, { recursive: true });
  });

  test('refuses promote when shared/page-objects already has different class with same name', async () => {
    const root = mkdtempSync(join(tmpdir(), 'xera-prom-'));
    const ticketDir = join(root, '.xera/JIRA-1');
    mkdirSync(join(ticketDir, 'page-objects'), { recursive: true });
    mkdirSync(join(root, 'shared/page-objects'), { recursive: true });
    writeFileSync(
      join(root, 'shared/page-objects/LoginPage.ts'),
      `export class LoginPage { old() {} }\n`,
    );
    writeFileSync(
      join(ticketDir, 'page-objects/LoginPage.ts'),
      `export class LoginPage { newm() {} }\n`,
    );

    await expect(
      promotePom({ repoRoot: root, ticket: 'JIRA-1', className: 'LoginPage' }),
    ).rejects.toThrow(/already exists/);

    rmSync(root, { recursive: true });
  });
});
