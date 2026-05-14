import { describe, expect, test } from 'bun:test';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { typecheckTicket } from '../../src/generator/typecheck';

describe('typecheckTicket', () => {
  test('returns ok=true for valid file', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'xera-tc-'));
    writeFileSync(join(dir, 'tsconfig.json'), JSON.stringify({ compilerOptions: { strict: true, target: 'ES2022', module: 'ESNext', moduleResolution: 'Bundler' } }));
    writeFileSync(join(dir, 'spec.ts'), `export const x: number = 1;`);
    const r = await typecheckTicket(dir);
    expect(r.ok).toBe(true);
  });

  test('returns ok=false with errors for broken file', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'xera-tc-'));
    writeFileSync(join(dir, 'tsconfig.json'), JSON.stringify({ compilerOptions: { strict: true, target: 'ES2022', module: 'ESNext', moduleResolution: 'Bundler' } }));
    writeFileSync(join(dir, 'spec.ts'), `export const x: number = 'string';`);
    const r = await typecheckTicket(dir);
    expect(r.ok).toBe(false);
    expect(r.errors[0]).toBeDefined();
    rmSync(dir, { recursive: true });
  });
});
