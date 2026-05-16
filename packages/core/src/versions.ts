import { createRequire } from 'node:module';

const _require = createRequire(import.meta.url);

export const XERA_VERSION = (_require('../package.json') as { version: string }).version;

function loadPromptsVersion(): string {
  try {
    return (_require('@xera-ai/prompts/version.json') as { prompts: string }).prompts;
  } catch {
    return 'unknown';
  }
}

export const PROMPTS_VERSION = loadPromptsVersion();
