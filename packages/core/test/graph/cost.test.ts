import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { logLlmCall, summarizeCost } from '../../src/graph/cost';

let root: string;
beforeEach(() => { root = mkdtempSync(join(tmpdir(), 'xera-cost-')); });
afterEach(() => { rmSync(root, { recursive: true, force: true }); });

describe('logLlmCall', () => {
  test('appends a single JSONL line to .xera/cost-log.jsonl', () => {
    logLlmCall(root, {
      skill: 'xera-fetch', prompt: 'extract-areas',
      tokensIn: 1240, tokensOut: 89, model: 'claude-x', costUsd: 0.012,
    });
    const lines = readFileSync(join(root, '.xera/cost-log.jsonl'), 'utf8').trim().split('\n');
    expect(lines).toHaveLength(1);
    const parsed = JSON.parse(lines[0]!);
    expect(parsed.skill).toBe('xera-fetch');
    expect(parsed.cost_estimate_usd).toBe(0.012);
    expect(typeof parsed.ts).toBe('string');
  });
});

describe('summarizeCost', () => {
  test('sums calls within window', () => {
    const recent = new Date().toISOString();
    const old = new Date(Date.now() - 30 * 86400 * 1000).toISOString();
    logLlmCall(root, { skill: 'a', prompt: 'p', tokensIn: 0, tokensOut: 0, model: 'm', costUsd: 1.0, ts: recent });
    logLlmCall(root, { skill: 'a', prompt: 'p', tokensIn: 0, tokensOut: 0, model: 'm', costUsd: 2.0, ts: recent });
    logLlmCall(root, { skill: 'b', prompt: 'p', tokensIn: 0, tokensOut: 0, model: 'm', costUsd: 5.0, ts: old });
    const sum = summarizeCost(root, 7);
    expect(sum.totalCalls).toBe(2);
    expect(sum.totalUsd).toBeCloseTo(3.0, 5);
    expect(sum.bySkill.a!.calls).toBe(2);
    expect(sum.bySkill.b).toBeUndefined();
  });
});
