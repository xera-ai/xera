import { appendFileSync, mkdirSync, existsSync, readFileSync } from 'node:fs';
import { dirname } from 'node:path';

export interface LogEntry {
  ts: string;
  [key: string]: unknown;
}

export class NdjsonLogger {
  constructor(private readonly path: string) {
    mkdirSync(dirname(path), { recursive: true });
  }

  log(payload: Record<string, unknown>): void {
    const entry: LogEntry = { ts: new Date().toISOString(), ...payload };
    appendFileSync(this.path, `${JSON.stringify(entry)}\n`);
  }

  static readAll(path: string): LogEntry[] {
    if (!existsSync(path)) return [];
    const txt = readFileSync(path, 'utf8').trim();
    if (!txt) return [];
    return txt.split('\n').map(line => JSON.parse(line) as LogEntry);
  }
}
