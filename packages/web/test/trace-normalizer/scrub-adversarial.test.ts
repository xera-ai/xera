import { describe, expect, test } from 'bun:test';
import { type NormalizedRun, scrub } from '../../src/trace-normalizer/scrub';

function runWithError(msg: string): NormalizedRun {
  return {
    runId: 'r',
    outcome: 'FAIL',
    scenarios: [{ name: 's', outcome: 'FAIL', failure: { errorMessage: msg } }],
    scrubbed_fields_count: 0,
  };
}

describe('scrub adversarial', () => {
  test('JWT with unicode-like noise around it', () => {
    const r = scrub(
      runWithError('—«eyJhbGciOi.eyJzdWIiOi.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c»—'),
    );
    expect(r.scenarios[0]!.failure!.errorMessage).not.toContain('SflKxw');
    expect(r.scrubbed_fields_count).toBeGreaterThan(0);
  });

  test('multiple JWTs in one string', () => {
    const r = scrub(
      runWithError('a=eyJhbGciOi.eyJzdWIiOi.SflKxw and b=eyJhbGciOi.eyJzdWIiOi.ABCDEFGHI'),
    );
    expect(r.scenarios[0]!.failure!.errorMessage).not.toMatch(/SflKxw|ABCDEFGHI/);
  });

  test('credit card with dashes', () => {
    const r = scrub(runWithError('card 5500-0000-0000-0004 used'));
    expect(r.scenarios[0]!.failure!.errorMessage).not.toContain('5500-0000-0000-0004');
  });

  test('case variants of password key', () => {
    const r = scrub({
      runId: 'r',
      outcome: 'FAIL',
      scenarios: [
        {
          name: 's',
          outcome: 'FAIL',
          failure: {
            networkAtFailure: [
              {
                method: 'P',
                url: '/x',
                status: 200,
                requestBody: { Password: 'a', PASSWORD: 'b', passWord: 'c' },
              },
            ],
          },
        },
      ],
      scrubbed_fields_count: 0,
    });
    const body = r.scenarios[0]!.failure!.networkAtFailure![0]!.requestBody as Record<
      string,
      string
    >;
    expect(body.Password).toBe('[REDACTED]');
    expect(body.PASSWORD).toBe('[REDACTED]');
    expect(body.passWord).toBe('[REDACTED]');
  });

  test('api_key, apiKey, api-key variants', () => {
    const r = scrub({
      runId: 'r',
      outcome: 'FAIL',
      scenarios: [
        {
          name: 's',
          outcome: 'FAIL',
          failure: {
            networkAtFailure: [
              {
                method: 'P',
                url: '/x',
                status: 200,
                requestBody: { api_key: 'a', apiKey: 'b', 'api-key': 'c' },
              },
            ],
          },
        },
      ],
      scrubbed_fields_count: 0,
    });
    const body = r.scenarios[0]!.failure!.networkAtFailure![0]!.requestBody as Record<
      string,
      string
    >;
    expect(body.api_key).toBe('[REDACTED]');
    expect(body.apiKey).toBe('[REDACTED]');
    expect(body['api-key']).toBe('[REDACTED]');
  });

  test('Set-Cookie response header', () => {
    const r = scrub({
      runId: 'r',
      outcome: 'FAIL',
      scenarios: [
        {
          name: 's',
          outcome: 'FAIL',
          failure: {
            networkAtFailure: [
              {
                method: 'P',
                url: '/x',
                status: 200,
                responseHeaders: { 'Set-Cookie': 'session=xyz; HttpOnly' },
              },
            ],
          },
        },
      ],
      scrubbed_fields_count: 0,
    });
    expect(r.scenarios[0]!.failure!.networkAtFailure![0]!.responseHeaders!['Set-Cookie']).toBe(
      '[REDACTED]',
    );
  });
});
