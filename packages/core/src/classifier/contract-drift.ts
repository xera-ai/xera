import type { ClassifyResult } from './rate-limited';

export interface OpenAPISchema {
  type?: 'object' | 'array' | 'string' | 'integer' | 'number' | 'boolean' | 'null';
  properties?: Record<string, OpenAPISchema>;
  required?: readonly string[];
  items?: OpenAPISchema;
}

interface OpenAPIOperation {
  responses?: Record<string, { content?: Record<string, { schema?: OpenAPISchema }> }>;
  requestBody?: { content?: Record<string, { schema?: OpenAPISchema }> };
}

export interface OpenAPIDocument {
  paths: Record<
    string,
    Partial<Record<'get' | 'post' | 'put' | 'patch' | 'delete', OpenAPIOperation>>
  >;
}

export interface ContractDriftCall {
  method: string;
  url: string;
  status: number;
  respBody: unknown;
}

export interface ClassifyContractDriftInput {
  calls: readonly ContractDriftCall[];
  openapi: OpenAPIDocument | null;
}

function matchPath(specPaths: readonly string[], actualUrl: string): string | null {
  const path = actualUrl.split('?')[0] ?? actualUrl;
  for (const tmpl of specPaths) {
    const re = new RegExp(`^${tmpl.replace(/\{[^}]+\}/g, '[^/]+')}$`);
    if (re.test(path)) return tmpl;
  }
  return null;
}

function matchesSchema(body: unknown, schema: OpenAPISchema | undefined): boolean {
  if (!schema) return true;
  if (schema.type === 'object') {
    if (typeof body !== 'object' || body === null || Array.isArray(body)) return false;
    const obj = body as Record<string, unknown>;
    for (const req of schema.required ?? []) {
      if (!(req in obj)) return false;
    }
    return true;
  }
  if (schema.type === 'array') return Array.isArray(body);
  if (schema.type === 'string') return typeof body === 'string';
  if (schema.type === 'integer' || schema.type === 'number') return typeof body === 'number';
  if (schema.type === 'boolean') return typeof body === 'boolean';
  if (schema.type === 'null') return body === null;
  return true;
}

const VERBS = ['get', 'post', 'put', 'patch', 'delete'] as const;
type Verb = (typeof VERBS)[number];

function isVerb(s: string): s is Verb {
  return (VERBS as readonly string[]).includes(s);
}

export function classifyContractDrift(input: ClassifyContractDriftInput): ClassifyResult | null {
  if (input.openapi === null) return null;
  const specPaths = Object.keys(input.openapi.paths);

  for (const call of input.calls) {
    const tmpl = matchPath(specPaths, call.url);
    if (!tmpl) {
      return {
        class: 'CONTRACT_DRIFT',
        rationale: `Endpoint ${call.method} ${call.url} not found in OpenAPI`,
      };
    }
    const methodLower = call.method.toLowerCase();
    if (!isVerb(methodLower)) {
      return {
        class: 'CONTRACT_DRIFT',
        rationale: `Method ${call.method} not supported by classifier for ${tmpl}`,
      };
    }
    const pathItem = input.openapi.paths[tmpl];
    const op = pathItem?.[methodLower];
    if (!op) {
      return {
        class: 'CONTRACT_DRIFT',
        rationale: `${call.method} not defined for ${tmpl} in OpenAPI`,
      };
    }
    const respDef = op.responses?.[String(call.status)];
    if (!respDef) {
      return {
        class: 'CONTRACT_DRIFT',
        rationale: `Status ${call.status} not enumerated for ${call.method} ${tmpl} in OpenAPI`,
      };
    }
    const schema = respDef.content?.['application/json']?.schema;
    if (!matchesSchema(call.respBody, schema)) {
      return {
        class: 'CONTRACT_DRIFT',
        rationale: `Response body for ${call.method} ${tmpl} (${call.status}) does not match OpenAPI schema`,
      };
    }
  }
  return null;
}
