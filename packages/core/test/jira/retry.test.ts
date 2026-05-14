import { describe, expect, test } from 'bun:test';
import { withRetry } from '../../src/jira/retry';

describe('withRetry', () => {
  test('retries up to maxAttempts with exponential backoff', async () => {
    let calls = 0;
    const result = await withRetry(
      async () => {
        calls++;
        if (calls < 3) throw new Error('transient');
        return 'ok';
      },
      { maxAttempts: 5, baseMs: 1, factor: 2 },
    );
    expect(result).toBe('ok');
    expect(calls).toBe(3);
  });

  test('throws original error after maxAttempts', async () => {
    let calls = 0;
    await expect(
      withRetry(async () => { calls++; throw new Error('nope'); }, { maxAttempts: 3, baseMs: 1, factor: 2 }),
    ).rejects.toThrow('nope');
    expect(calls).toBe(3);
  });

  test('does not retry when shouldRetry returns false', async () => {
    let calls = 0;
    await expect(
      withRetry(
        async () => { calls++; throw new Error('401'); },
        { maxAttempts: 5, baseMs: 1, factor: 2, shouldRetry: e => !/401/.test(String(e)) },
      ),
    ).rejects.toThrow('401');
    expect(calls).toBe(1);
  });
});
