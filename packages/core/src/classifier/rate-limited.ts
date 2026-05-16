import type { Classification } from '../artifact/status';

export interface HttpCallSummary {
  method: string;
  url: string;
  status: number;
}

export interface ClassifyResult {
  class: Classification;
  rationale: string;
}

export interface ClassifyRateLimitedInput {
  calls: readonly HttpCallSummary[];
}

export function classifyRateLimited(input: ClassifyRateLimitedInput): ClassifyResult | null {
  const hit = input.calls.find((c) => c.status === 429);
  if (!hit) return null;
  return {
    class: 'RATE_LIMITED',
    rationale: `Captured HTTP 429 on ${hit.method} ${hit.url}`,
  };
}
