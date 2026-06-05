export type CookieMatch =
  | { literal: string }
  | { glob: string }
  | { regex: string };

export function globToRegex(glob: string): RegExp {
  const escaped = glob.replace(/[.+^${}()|[\]\\]/g, '\\$&');
  const expanded = escaped.replace(/\*/g, '.*').replace(/\?/g, '.');
  return new RegExp(`^${expanded}$`);
}

export function cookieMatcher(m: CookieMatch): (name: string) => boolean {
  if ('literal' in m) return (name) => name === m.literal;
  if ('glob' in m) {
    const re = globToRegex(m.glob);
    return (name) => re.test(name);
  }
  const re = new RegExp(m.regex, 'i');
  return (name) => re.test(name);
}

export interface MatchableCookie {
  name: string;
  value: string;
  domain: string;
  path: string;
  expires?: number;
}

export function pickOne<T extends { name: string }>(
  cookies: T[],
  m: CookieMatch,
): T | undefined {
  const match = cookieMatcher(m);
  return cookies.find((c) => match(c.name));
}

export function serializeMatch(m: CookieMatch): CookieMatch {
  return m;
}
