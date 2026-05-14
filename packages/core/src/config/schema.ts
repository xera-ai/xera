import { z } from 'zod';

const AuthRoleSchema = z.object({
  envEmail: z.string().min(1),
  envPassword: z.string().min(1),
});

const AuthSchema = z.object({
  strategy: z.enum(['storageState', 'apiToken', 'none']).default('none'),
  ttl: z.string().default('8h'),
  refreshBuffer: z.string().default('30m'),
  setupScript: z.string().optional(),
  roles: z.record(z.string(), AuthRoleSchema).default({}),
});

const WebSchema = z.object({
  baseUrl: z.record(z.string(), z.string().url()).refine(m => Object.keys(m).length > 0, {
    message: 'baseUrl must have at least one environment',
  }),
  defaultEnv: z.string(),
  auth: AuthSchema.default({}),
  testData: z
    .object({
      users: z.record(z.string(), z.object({ fromAuth: z.string() })).default({}),
    })
    .default({ users: {} }),
}).refine(w => w.baseUrl[w.defaultEnv] !== undefined, {
  message: 'defaultEnv must exist in baseUrl map',
  path: ['defaultEnv'],
});

const JiraSchema = z.object({
  baseUrl: z.string().url(),
  projectKeys: z.array(z.string().min(1)).min(1),
  fields: z.object({
    story: z.string().min(1),
    acceptanceCriteria: z.string().optional(),
    attachments: z.string().default('attachment'),
  }),
});

const AISchema = z.object({
  livePageSnapshot: z.boolean().default(true),
  confidenceThreshold: z.enum(['low', 'medium', 'high']).default('medium'),
  maxRetries: z
    .object({
      typecheck: z.number().int().min(0).max(5).default(2),
      lint: z.number().int().min(0).max(5).default(2),
      validateFeature: z.number().int().min(0).max(5).default(2),
    })
    .default({}),
}).default({});

const ReportingSchema = z.object({
  language: z.enum(['en', 'vi']).default('en'),
  postToJira: z.boolean().default(true),
  transition: z
    .object({
      onPass: z.string().nullable().default(null),
      onFail: z.string().nullable().default(null),
    })
    .default({}),
  artifactLinks: z.enum(['git', 'local']).default('git'),
}).default({});

export const XeraConfigSchema = z.object({
  jira: JiraSchema,
  web: WebSchema,
  ai: AISchema,
  reporting: ReportingSchema,
  adapters: z.array(z.string().min(1)).min(1).default(['web']),
});

export type XeraConfig = z.infer<typeof XeraConfigSchema>;
