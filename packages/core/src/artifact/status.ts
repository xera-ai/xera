import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { z } from 'zod';

const ClassificationEnum = z.enum([
  'PASS',
  'SKIPPED',
  'REAL_BUG',
  'SELECTOR_DRIFT',
  'FLAKY',
  'TEST_BUG',
  'TEST_OUTDATED',
  'CONTRACT_DRIFT',
  'RATE_LIMITED',
  'AUTH_EXPIRED',
]);
const ResultEnum = z.enum(['PASS', 'FAIL']);
const ConfidenceEnum = z.enum(['low', 'medium', 'high']);

export const HistoryEntrySchema = z.object({
  ts: z.string(),
  result: ResultEnum,
  class: ClassificationEnum,
});

export const StatusJsonSchema = z.preprocess(
  (val) => {
    // Backwards-compat: migrate legacy `last_jira_comment_id` from on-disk
    // status.json files written by xera <=v0.15.x. New name is tracker-agnostic.
    if (val && typeof val === 'object' && !Array.isArray(val)) {
      const obj = val as Record<string, unknown>;
      if ('last_jira_comment_id' in obj && !('last_comment_id' in obj)) {
        obj.last_comment_id = obj.last_jira_comment_id;
      }
      delete obj.last_jira_comment_id;
    }
    return val;
  },
  z.object({
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
    last_comment_id: z.string().optional(),
  }),
);

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
