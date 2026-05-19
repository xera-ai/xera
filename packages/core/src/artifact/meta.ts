import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { z } from 'zod';

export const MetaJsonSchema = z.object({
  ticket: z.string(),
  adapter: z.string(),
  source: z.enum(['jira', 'local']).optional(),
  xera_version: z.string(),
  prompts_version: z.string(),
  fetched_at: z.string().optional(),
  story_hash: z.string().optional(),
  feature_generated_at: z.string().optional(),
  feature_generated_from_story_hash: z.string().optional(),
  feature_hash: z.string().optional(),
  script_generated_at: z.string().optional(),
  script_generated_from_feature_hash: z.string().optional(),
  script_warnings: z.array(z.string()).optional(),
});

export type MetaJson = z.infer<typeof MetaJsonSchema>;

export function readMeta(path: string): MetaJson | null {
  if (!existsSync(path)) return null;
  return MetaJsonSchema.parse(JSON.parse(readFileSync(path, 'utf8')));
}

export function writeMeta(path: string, meta: MetaJson): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(meta, null, 2));
}

export function updateMeta(path: string, patch: Partial<MetaJson>): MetaJson {
  const existing = readMeta(path);
  if (!existing) {
    throw new Error(`meta.json not found at ${path}; cannot update`);
  }
  const next = { ...existing, ...patch };
  writeMeta(path, next);
  return next;
}
