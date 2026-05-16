import { existsSync } from 'node:fs';
import { appendHistory, readStatus, type StatusJson, writeStatus } from '../artifact/status';
import type { ClassifyOutput } from '../classifier/types';

export interface StatusWriterInput {
  ticket: string;
  runTs: string;
  classification: ClassifyOutput;
  scenarioCounts: { total: number; passed: number; failed: number; skipped: number };
}

export function writeStatusFromClassification(path: string, input: StatusWriterInput): void {
  const result: StatusJson['result'] = input.classification.overall === 'PASS' ? 'PASS' : 'FAIL';
  const entry = { ts: input.runTs, result, class: input.classification.overall };
  if (!existsSync(path)) {
    writeStatus(path, {
      ticket: input.ticket,
      lastRun: input.runTs,
      result,
      classification: input.classification.overall,
      confidence: input.classification.overallConfidence,
      scenarios: input.scenarioCounts,
      history: [entry],
    });
    return;
  }
  const cur = readStatus(path)!;
  writeStatus(path, {
    ...cur,
    lastRun: input.runTs,
    result,
    classification: input.classification.overall,
    confidence: input.classification.overallConfidence,
    scenarios: input.scenarioCounts,
  });
  appendHistory(path, entry);
}
