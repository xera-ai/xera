export interface ParsedCookie {
  name: string;
  value: string;
  domain?: string;
  path?: string;
  expires?: number; // unix seconds
  httpOnly?: boolean;
  secure?: boolean;
  sameSite?: string;
}

export function parseSetCookie(line: string): ParsedCookie | null {
  const trimmed = line.trim();
  if (!trimmed) return null;
  const parts = trimmed
    .split(';')
    .map((p) => p.trim())
    .filter(Boolean);
  if (parts.length === 0) return null;
  const first = parts[0]!;
  const eq = first.indexOf('=');
  if (eq <= 0) return null;
  const name = first.slice(0, eq).trim();
  const value = first.slice(eq + 1).trim();
  if (!name) return null;
  const out: ParsedCookie = { name, value };
  let maxAge: number | undefined;
  let expiresAt: number | undefined;
  for (const attr of parts.slice(1)) {
    const aEq = attr.indexOf('=');
    const key = (aEq > 0 ? attr.slice(0, aEq) : attr).trim().toLowerCase();
    const val = aEq > 0 ? attr.slice(aEq + 1).trim() : undefined;
    switch (key) {
      case 'domain':
        if (val) out.domain = val;
        break;
      case 'path':
        if (val) out.path = val;
        break;
      case 'expires':
        if (val) {
          const d = Date.parse(val);
          if (!Number.isNaN(d)) expiresAt = Math.floor(d / 1000);
        }
        break;
      case 'max-age':
        if (val) {
          const n = Number(val);
          if (Number.isFinite(n)) maxAge = Math.floor(Date.now() / 1000) + n;
        }
        break;
      case 'httponly':
        out.httpOnly = true;
        break;
      case 'secure':
        out.secure = true;
        break;
      case 'samesite':
        if (val) out.sameSite = val;
        break;
    }
  }
  // RFC 6265: Max-Age takes precedence over Expires
  if (maxAge !== undefined) out.expires = maxAge;
  else if (expiresAt !== undefined) out.expires = expiresAt;
  return out;
}
