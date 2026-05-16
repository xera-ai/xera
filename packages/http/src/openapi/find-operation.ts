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

export function findOperation(
  spec: OpenAPIDocument,
  method: string,
  url: string,
): FoundOperation | null {
  const pathOnly = url.split('?')[0] ?? url;
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
