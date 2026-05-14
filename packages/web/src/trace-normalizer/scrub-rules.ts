export const SENSITIVE_HEADERS: readonly string[] = [
  'authorization',
  'cookie',
  'set-cookie',
  'x-api-key',
  'x-auth-token',
  'x-csrf-token',
  'proxy-authorization',
];

export const SENSITIVE_BODY_KEYS: readonly RegExp[] = [
  /password/i,
  /passwd/i,
  /token/i,
  /secret/i,
  /api[-_]?key/i,
  /access[-_]?key/i,
  /private[-_]?key/i,
  /authorization/i,
  /credit[-_]?card/i,
  /card[-_]?number/i,
  /cvv/i,
];

export const JWT_RE = /\beyJ[A-Za-z0-9_-]{7,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{5,}\b/;
export const CREDIT_CARD_RE = /\b(?:\d{4}[-\s]?){3}\d{4}\b/;

const JWT_RE_G = new RegExp(JWT_RE.source, 'g');
const CREDIT_CARD_RE_G = new RegExp(CREDIT_CARD_RE.source, 'g');

const REDACTED = '[REDACTED]';

export function scrubHeaders(headers: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(headers)) {
    out[k] = SENSITIVE_HEADERS.includes(k.toLowerCase()) ? REDACTED : v;
  }
  return out;
}

export function scrubBodyJson(body: unknown): unknown {
  if (Array.isArray(body)) return body.map(scrubBodyJson);
  if (body && typeof body === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(body)) {
      if (SENSITIVE_BODY_KEYS.some((re) => re.test(k))) {
        out[k] = REDACTED;
      } else {
        out[k] = scrubBodyJson(v);
      }
    }
    return out;
  }
  if (typeof body === 'string') return scrubFreeText(body);
  return body;
}

export function scrubFreeText(s: string): string {
  return s.replace(JWT_RE_G, REDACTED).replace(CREDIT_CARD_RE_G, REDACTED);
}
