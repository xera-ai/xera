import { describe, expect, test } from 'bun:test';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { scanSharedPoms } from '../../src/generator/pom-scan';

describe('scanSharedPoms', () => {
  test('lists exported classes from shared/page-objects/*.ts', () => {
    const root = mkdtempSync(join(tmpdir(), 'xera-pom-'));
    mkdirSync(join(root, 'shared/page-objects'), { recursive: true });
    writeFileSync(join(root, 'shared/page-objects/LoginPage.ts'), `export class LoginPage {}\n`);
    writeFileSync(join(root, 'shared/page-objects/DashboardPage.ts'), `export class DashboardPage {}\n`);
    const found = scanSharedPoms(root);
    expect(found.map(p => p.className).sort()).toEqual(['DashboardPage', 'LoginPage']);
    expect(found[0]?.absolutePath).toMatch(/page-objects/);
    rmSync(root, { recursive: true });
  });
});
