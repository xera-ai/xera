import { createRequire } from 'node:module';

const _require = createRequire(import.meta.url);

function loadPackageVersion(): string {
  // In source: import.meta.url = .../src/versions.ts → ../package.json = package root ✓
  // In bundle: import.meta.url = .../dist/bin/internal.js → ../../package.json = package root ✓
  for (const rel of ['../package.json', '../../package.json']) {
    try {
      return (_require(rel) as { version: string }).version;
    } catch {}
  }
  return 'unknown';
}

export const XERA_VERSION = loadPackageVersion();

function loadPromptsVersion(): string {
  try {
    return (_require('@xera-ai/prompts/version.json') as { prompts: string }).prompts;
  } catch {
    return 'unknown';
  }
}

export const PROMPTS_VERSION = loadPromptsVersion();
