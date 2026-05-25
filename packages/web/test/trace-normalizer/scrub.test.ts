import { describe, expect, test } from 'vitest';
import {
  type NormalizedNetworkEntry,
  type NormalizedRun,
  scrub,
} from '../../src/trace-normalizer/scrub';

describe('scrub(normalizedRun)', () => {
  test('counts scrubbed fields', () => {
    const run: NormalizedRun = {
      runId: 'r',
      outcome: 'FAIL',
      scenarios: [
        {
          name: 's',
          outcome: 'FAIL',
          failure: {
            errorMessage: 'token eyJhbGciOi.eyJzdWIiOi.SflKxw bad',
            networkAtFailure: [
              {
                method: 'POST',
                url: '/api/login?token=eyJhbGciOi.eyJzdWIiOi.SflKxw',
                status: 500,
                requestHeaders: { Authorization: 'Bearer x', 'content-type': 'application/json' },
                requestBody: { email: 'a@b.com', password: 'p' },
                responseHeaders: { 'set-cookie': 's=1' },
              } as NormalizedNetworkEntry,
            ],
            consoleAtFailure: ['user 4111 1111 1111 1111'],
          },
        },
      ],
      scrubbed_fields_count: 0,
    };
    const scrubbed = scrub(run);
    expect(scrubbed.scrubbed_fields_count).toBeGreaterThan(0);
    const net = scrubbed.scenarios[0]!.failure!.networkAtFailure![0]!;
    expect(net.requestHeaders!.Authorization).toBe('[REDACTED]');
    expect((net.requestBody as Record<string, unknown>).password).toBe('[REDACTED]');
    expect(scrubbed.scenarios[0]!.failure!.errorMessage).not.toContain('SflKxw');
    expect(scrubbed.scenarios[0]!.failure!.consoleAtFailure![0]).not.toContain('4111');
  });
});
