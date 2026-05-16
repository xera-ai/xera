import { existsSync, readFileSync } from 'node:fs';
import RefParser from '@apidevtools/json-schema-ref-parser';
import type { OpenAPIDocument } from '@xera-ai/core';
import { parse as parseYaml } from 'yaml';

export async function loadOpenApi(pathOrUrl: string): Promise<OpenAPIDocument | null> {
  let raw: string;
  if (pathOrUrl.startsWith('http://') || pathOrUrl.startsWith('https://')) {
    const res = await fetch(pathOrUrl);
    if (!res.ok) return null;
    raw = await res.text();
  } else {
    if (!existsSync(pathOrUrl)) return null;
    raw = readFileSync(pathOrUrl, 'utf8');
  }
  const parsed: unknown = pathOrUrl.endsWith('.json') ? JSON.parse(raw) : parseYaml(raw);
  const deref = (await RefParser.dereference(parsed as object)) as unknown as OpenAPIDocument;
  return deref;
}
