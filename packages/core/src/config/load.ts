import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { XeraConfigSchema, type XeraConfig } from './schema';

export async function loadConfig(cwd: string): Promise<XeraConfig> {
  const path = join(cwd, 'xera.config.ts');
  if (!existsSync(path)) {
    throw new Error(`xera.config.ts not found in ${cwd}`);
  }
  const mod = await import(pathToFileURL(path).href);
  const raw = mod.default ?? mod;
  return XeraConfigSchema.parse(raw);
}
