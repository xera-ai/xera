import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { readAuthState } from '../auth/state';
import type { XeraConfig } from '../config/schema';
import { type AuthFileSummary, classifyAuthExpired } from './auth-expired';
import { classifyContractDrift } from './contract-drift';
import { type ClassifyResult, classifyRateLimited } from './rate-limited';

export interface HttpOverrideInput {
  cwd: string;
  config: XeraConfig;
  ticketDir: string;
  runId: string;
}

// The deterministic HTTP classification a run resolves to, in precedence order:
// RATE_LIMITED → AUTH_EXPIRED → CONTRACT_DRIFT. Shared by `xera-internal report`
// (final classification) and `xera-internal classify-drift` (so the report
// skill can stamp CONTRACT_DRIFT into classifier-input.json *before* its heal
// check runs — #195). Returns null when no rule fires.
export async function computeHttpRuleOverride(
  input: HttpOverrideInput,
): Promise<ClassifyResult | null> {
  const { cwd, config, ticketDir, runId } = input;
  if (!config.http) return null;

  const normalizedPath = join(ticketDir, 'runs', runId, 'normalized.json');
  if (!existsSync(normalizedPath)) return null;
  const norm = JSON.parse(readFileSync(normalizedPath, 'utf8')) as {
    http?: { calls?: Array<{ method: string; url: string; status: number; respBody?: unknown }> };
  };
  const calls = norm.http?.calls ?? [];

  const rate = classifyRateLimited({ calls });
  if (rate) return rate;

  const authFiles: Record<string, AuthFileSummary> = {};
  const httpAuthDir = join(cwd, '.xera', '.auth', 'http');
  for (const role of Object.keys(config.http.auth.roles)) {
    const entry = readAuthState(httpAuthDir, role);
    if (entry) {
      const p = entry.payload as {
        token: string;
        type: 'bearer' | 'apiKey' | 'basic' | 'cookie';
      };
      if (typeof p.token === 'string' && typeof p.type === 'string') {
        authFiles[role] = {
          token: p.token,
          type: p.type as AuthFileSummary['type'],
          expires_at: entry.expires_at,
        };
      }
    }
  }
  const authExp = classifyAuthExpired({ calls, authFiles });
  if (authExp) return authExp;

  if (config.http.spec) {
    const { loadOpenApi } = await import('@xera-ai/http');
    const openapi = await loadOpenApi(config.http.spec);
    if (openapi) {
      const drift = classifyContractDrift({
        calls: calls.map((c) => ({
          method: c.method,
          url: c.url,
          status: c.status,
          respBody: c.respBody,
        })),
        openapi,
      });
      if (drift) return drift;
    }
  }
  return null;
}
