import { readFileSync } from 'node:fs';
import { unzipSync } from 'fflate';

export interface TraceEntries {
  /** Filename → text contents */
  files: Record<string, string>;
}

export function unzipTrace(tracePath: string): TraceEntries {
  const buf = readFileSync(tracePath);
  const entries = unzipSync(buf);
  const files: Record<string, string> = {};
  for (const [name, data] of Object.entries(entries)) {
    if (name.endsWith('/')) continue;
    if (
      name.endsWith('.network') ||
      name.endsWith('.trace') ||
      name.endsWith('.txt') ||
      name.endsWith('.json')
    ) {
      files[name] = new TextDecoder().decode(data);
    }
  }
  return { files };
}
