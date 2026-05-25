import type { GenerateInput } from '@xera-ai/core';
import { describe, expect, test } from 'vitest';
import { HttpAdapter } from '../src/adapter';

describe('HttpAdapter', () => {
  test('id is "http"', () => {
    expect(HttpAdapter.id).toBe('http');
  });

  test('generate is a no-op (LLM-driven)', async () => {
    const r = await HttpAdapter.generate({} as GenerateInput);
    expect(r.artifacts).toEqual([]);
    expect(r.warnings).toEqual([]);
  });

  test('doctor reports playwright installed', async () => {
    const r = await HttpAdapter.doctor();
    expect(r.checks.some((c) => c.name.includes('@playwright/test'))).toBe(true);
    expect(r.ok).toBe(true);
  });
});
