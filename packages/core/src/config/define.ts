import type { z } from 'zod';
import type { XeraConfigSchema } from './schema';

// Accept Zod *input* types so users can write either the canonical
// `reporting.postComment` or the deprecated `reporting.postToJira` in
// their xera.config.ts — both round-trip through the schema preprocess.
export type XeraConfigInput = z.input<typeof XeraConfigSchema>;

export function defineConfig(config: XeraConfigInput): XeraConfigInput {
  return config;
}
