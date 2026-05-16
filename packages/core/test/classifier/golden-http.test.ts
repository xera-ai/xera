import { describe, expect, test } from 'bun:test';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { type AuthFileSummary, classifyAuthExpired } from '../../src/classifier/auth-expired';
import { classifyContractDrift, type OpenAPIDocument } from '../../src/classifier/contract-drift';
import { classifyRateLimited } from '../../src/classifier/rate-limited';

const FIXTURE_ROOT = join(
  import.meta.dir,
  '..',
  '..',
  '..',
  '..',
  'fixtures',
  'golden-tickets-http',
);

interface NormalizedHttpFixture {
  outcome: 'PASS' | 'FAIL';
  scenarios: Array<{ name: string; outcome: string }>;
  http: {
    calls: Array<{ method: string; url: string; status: number; respBody?: unknown }>;
  };
}

interface Expected {
  class: string;
  rationale_substring: string;
}

describe('golden http tickets — classifier deterministic rules', () => {
  if (!existsSync(FIXTURE_ROOT)) {
    test.skip('fixture dir missing — skipping golden tests', () => {});
    return;
  }

  for (const ticketDir of readdirSync(FIXTURE_ROOT)) {
    const dir = join(FIXTURE_ROOT, ticketDir);
    const normalizedPath = join(dir, 'normalized.json');
    const expectedPath = join(dir, 'expected-classification.json');
    if (!existsSync(normalizedPath) || !existsSync(expectedPath)) continue;

    test(`${ticketDir}`, () => {
      const normalized = JSON.parse(readFileSync(normalizedPath, 'utf8')) as NormalizedHttpFixture;
      const expected = JSON.parse(readFileSync(expectedPath, 'utf8')) as Expected;
      const calls = normalized.http.calls;

      // If PASS, no deterministic rule should fire.
      if (expected.class === 'PASS') {
        expect(classifyRateLimited({ calls })).toBeNull();
        return;
      }

      // RATE_LIMITED: any 429 wins.
      if (expected.class === 'RATE_LIMITED') {
        const r = classifyRateLimited({ calls });
        expect(r?.class).toBe('RATE_LIMITED');
        if (expected.rationale_substring)
          expect(r?.rationale).toContain(expected.rationale_substring);
        return;
      }

      // AUTH_EXPIRED: 401 + expired auth file from auth-files.json
      if (expected.class === 'AUTH_EXPIRED') {
        const authFilesPath = join(dir, 'auth-files.json');
        const authFiles = existsSync(authFilesPath)
          ? (JSON.parse(readFileSync(authFilesPath, 'utf8')) as Record<string, AuthFileSummary>)
          : {};
        const r = classifyAuthExpired({ calls, authFiles });
        expect(r?.class).toBe('AUTH_EXPIRED');
        if (expected.rationale_substring)
          expect(r?.rationale).toContain(expected.rationale_substring);
        return;
      }

      // CONTRACT_DRIFT: load openapi.json + compare schema
      if (expected.class === 'CONTRACT_DRIFT') {
        const openapiPath = join(dir, 'openapi.json');
        const openapi = existsSync(openapiPath)
          ? (JSON.parse(readFileSync(openapiPath, 'utf8')) as OpenAPIDocument)
          : null;
        const r = classifyContractDrift({
          calls: calls.map((c) => ({
            method: c.method,
            url: c.url,
            status: c.status,
            respBody: c.respBody,
          })),
          openapi,
        });
        expect(r?.class).toBe('CONTRACT_DRIFT');
        return;
      }

      // REAL_BUG / other: no deterministic rule should fire.
      expect(classifyRateLimited({ calls })).toBeNull();
      expect(classifyAuthExpired({ calls, authFiles: {} })).toBeNull();
    });
  }
});
