export interface RetryOptions {
  maxAttempts: number;
  baseMs: number;
  factor: number;
  shouldRetry?: (err: unknown) => boolean;
}

export async function withRetry<T>(fn: () => Promise<T>, opts: RetryOptions): Promise<T> {
  let attempt = 0;
  let lastErr: unknown;
  while (attempt < opts.maxAttempts) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (opts.shouldRetry && !opts.shouldRetry(err)) throw err;
      attempt++;
      if (attempt >= opts.maxAttempts) break;
      const delay = opts.baseMs * Math.pow(opts.factor, attempt - 1);
      await new Promise(r => setTimeout(r, delay));
    }
  }
  throw lastErr;
}
