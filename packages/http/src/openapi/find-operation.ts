import type { OpenAPIDocument } from '@xera-ai/core';

export interface FoundOperation {
  template: string;
  operation: unknown;
}

const VERBS = ['get', 'post', 'put', 'patch', 'delete'] as const;
type Verb = (typeof VERBS)[number];
function isVerb(s: string): s is Verb {
  return (VERBS as readonly string[]).includes(s);
}

// Playwright's APIRequestContext records absolute URLs in traces (and in
// normalize → report → contract-heal payloads). Strip the scheme+host so the
// OpenAPI path-template lookup works for both bare paths and absolute URLs.
// See issue #193.
function pathOf(url: string): string {
  if (url.startsWith('/')) return url;
  try {
    return new URL(url).pathname;
  } catch {
    return url;
  }
}

export function findOperation(
  spec: OpenAPIDocument,
  method: string,
  url: string,
): FoundOperation | null {
  const pathOnly = pathOf(url).split('?')[0] ?? url;
  const m = method.toLowerCase();
  if (!isVerb(m)) return null;
  for (const tmpl of Object.keys(spec.paths)) {
    const re = new RegExp(`^${tmpl.replace(/\{[^}]+\}/g, '[^/]+')}$`);
    if (!re.test(pathOnly)) continue;
    const pathItem = spec.paths[tmpl];
    const op = pathItem?.[m];
    if (op) return { template: tmpl, operation: op };
  }
  return null;
}
