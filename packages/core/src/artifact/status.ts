import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { z } from 'zod';

const ClassificationEnum = z.enum(['PASS', 'REAL_BUG', 'SELECTOR_DRIFT', 'FLAKY', 'TEST_BUG', 'TEST_OUTDATED']);
const ResultEnum = z.enum(['PASS', 'FAIL']);
const ConfidenceEnum = z.enum(['low', 'medium', 'high']);

export const HistoryEntrySchema = z.object({
  ts: z.string(),
  result: ResultEnum,
  class: ClassificationEnum,
});

export const StatusJsonSchema = z.object({
  ticket: z.string(),
  lastRun: z.string(),
  result: ResultEnum,
  classification: ClassificationEnum,
  confidence: ConfidenceEnum,
  scenarios: z.object({
    total: z.number().int().nonnegative(),
    passed: z.number().int().nonnegative(),
    failed: z.number().int().nonnegative(),
    skipped: z.number().int().nonnegative(),
  }),
  history: z.array(HistoryEntrySchema).default([]),
  last_jira_comment_id: z.string().optional(),
});

export type StatusJson = z.infer<typeof StatusJsonSchema>;
export type HistoryEntry = z.infer<typeof HistoryEntrySchema>;
export type Classification = z.infer<typeof ClassificationEnum>;

const HISTORY_CAP = 20;

export function readStatus(path: string): StatusJson | null {
  if (!existsSync(path)) return null;
  return StatusJsonSchema.parse(JSON.parse(readFileSync(path, 'utf8')));
}

export function writeStatus(path: string, status: StatusJson): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(status, null, 2));
}

export function appendHistory(path: string, entry: HistoryEntry): StatusJson {
  const s = readStatus(path);
  if (!s) {
    throw new Error(`status.json not found at ${path}`);
  }
  s.history = [entry, ...s.history].slice(0, HISTORY_CAP);
  writeStatus(path, s);
  return s;
}
