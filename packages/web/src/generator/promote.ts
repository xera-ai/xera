import { existsSync, readFileSync, writeFileSync, renameSync } from 'node:fs';
import { join } from 'node:path';

export interface PromoteInput {
  repoRoot: string;
  ticket: string;
  className: string;
}

export async function promotePom(input: PromoteInput): Promise<void> {
  const fromDir = join(input.repoRoot, '.xera', input.ticket, 'page-objects');
  const toDir = join(input.repoRoot, 'shared', 'page-objects');
  const file = `${input.className}.ts`;
  const fromPath = join(fromDir, file);
  const toPath = join(toDir, file);

  if (!existsSync(fromPath)) {
    throw new Error(`POM ${file} not found at ${fromPath}`);
  }
  if (existsSync(toPath)) {
    throw new Error(`POM ${file} already exists at ${toPath}. Reconcile manually before promoting.`);
  }

  renameSync(fromPath, toPath);

  const specPath = join(input.repoRoot, '.xera', input.ticket, 'spec.ts');
  if (existsSync(specPath)) {
    const src = readFileSync(specPath, 'utf8');
    const updated = src.replace(
      new RegExp(`from\\s+['"]\\./page-objects/${input.className}['"]`, 'g'),
      `from '../../shared/page-objects/${input.className}'`,
    );
    writeFileSync(specPath, updated);
  }
}
