import type { ClassifyResult, HttpCallSummary } from './rate-limited';

export interface AuthFileSummary {
  token: string;
  type: 'bearer' | 'apiKey' | 'basic' | 'cookie';
  expires_at: string;
}

export interface ClassifyAuthExpiredInput {
  calls: readonly HttpCallSummary[];
  authFiles: Record<string, AuthFileSummary>;
}

function jwtExpPast(jwt: string, now: number): boolean {
  const parts = jwt.split('.');
  if (parts.length !== 3) return false;
  try {
    const payloadB64 = parts[1];
    if (!payloadB64) return false;
    const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8')) as {
      exp?: number;
    };
    return typeof payload.exp === 'number' && payload.exp * 1000 < now;
  } catch {
    return false;
  }
}

export function classifyAuthExpired(input: ClassifyAuthExpiredInput): ClassifyResult | null {
  const has401 = input.calls.some((c) => c.status === 401);
  if (!has401) return null;
  const now = Date.now();
  for (const [role, entry] of Object.entries(input.authFiles)) {
    const fileExpired = new Date(entry.expires_at).getTime() < now;
    const jwtExpired = entry.type === 'bearer' && jwtExpPast(entry.token, now);
    if (fileExpired || jwtExpired) {
      return {
        class: 'AUTH_EXPIRED',
        rationale: `HTTP 401 captured; auth file for role '${role}' is past expiry. Run: npx xera-internal auth-setup --role ${role}`,
      };
    }
  }
  return null;
}
