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

const WebSchema = z
  .object({
    baseUrl: z.record(z.string(), z.string().url()).refine((m) => Object.keys(m).length > 0, {
      message: 'baseUrl must have at least one environment',
    }),
    defaultEnv: z.string(),
    auth: AuthSchema.prefault({}),
    testData: z
      .object({
        users: z.record(z.string(), z.object({ fromAuth: z.string() })).default({}),
      })
      .prefault({}),
  })
  .refine((w) => w.baseUrl[w.defaultEnv] !== undefined, {
    message: 'defaultEnv must exist in baseUrl map',
    path: ['defaultEnv'],
  });

const HttpAuthRoleSchema = z.object({
  tokenEnv: z.string().optional(),
  userEnv: z.string().optional(),
  passEnv: z.string().optional(),
  tokenUrl: z.string().url().optional(),
  clientIdEnv: z.string().optional(),
  clientSecretEnv: z.string().optional(),
  scope: z.string().optional(),
});

const HttpAuthSchema = z.object({
  strategy: z.enum(['bearer', 'apiKey', 'basic', 'oauth-cc', 'custom', 'none']).default('none'),
  ttl: z.string().default('8h'),
  refreshBuffer: z.string().default('30m'),
  roles: z.record(z.string(), HttpAuthRoleSchema).default({}),
});

const HttpSchema = z
  .object({
    baseUrl: z.record(z.string(), z.string().url()).refine((m) => Object.keys(m).length > 0, {
      message: 'baseUrl must have at least one environment',
    }),
    defaultEnv: z.string(),
    spec: z.string().optional(),
    auth: HttpAuthSchema.prefault({}),
  })
  .refine((h) => h.baseUrl[h.defaultEnv] !== undefined, {
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

const GithubSchema = z.object({
  repo: z.string().regex(/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/, 'github.repo must be "owner/repo"'),
});

const AISchema = z
  .object({
    livePageSnapshot: z.boolean().default(true),
    confidenceThreshold: z.enum(['low', 'medium', 'high']).default('medium'),
    maxRetries: z
      .object({
        typecheck: z.number().int().min(0).max(5).default(2),
        lint: z.number().int().min(0).max(5).default(2),
        validateFeature: z.number().int().min(0).max(5).default(2),
      })
      .prefault({}),
  })
  .prefault({});

const ReportingSchema = z
  .object({
    language: z.enum(['en', 'vi']).default('en'),
    // Despite the legacy name, this also gates posting to GitHub when
    // `github` is configured instead of `jira`.
    postToJira: z.boolean().default(true),
    transition: z
      .object({
        onPass: z.string().nullable().default(null),
        onFail: z.string().nullable().default(null),
      })
      .prefault({}),
    artifactLinks: z.enum(['git', 'local']).default('git'),
  })
  .prefault({});

const RunSchema = z
  .object({
    autoImpact: z
      .object({
        enabled: z.boolean().default(true),
        threshold: z.number().nonnegative().default(8.0),
      })
      .prefault({}),
  })
  .prefault({});

const CoverageSchema = z
  .object({
    staleAfterDays: z.number().int().positive().default(30),
    criticalAreas: z.array(z.string().regex(/^[a-z0-9-]+$/)).default([]),
    autoSnapshotOnCoverage: z.boolean().default(true),
  })
  .prefault({});

export const XeraConfigSchema = z
  .strictObject({
    jira: JiraSchema.optional(),
    github: GithubSchema.optional(),
    web: WebSchema.optional(),
    http: HttpSchema.optional(),
    ai: AISchema,
    reporting: ReportingSchema,
    run: RunSchema.prefault({}),
    coverage: CoverageSchema,
    adapters: z
      .array(z.enum(['web', 'http']))
      .min(1)
      .default(['web']),
  })
  .refine((c) => c.web !== undefined || c.http !== undefined, {
    message: 'At least one of `web` or `http` must be configured',
  })
  .refine((c) => c.adapters.every((a) => (a === 'web' ? c.web : c.http) !== undefined), {
    message: 'Every adapter in `adapters` must have a corresponding config block',
    path: ['adapters'],
  })
  .refine((c) => c.jira !== undefined || c.github !== undefined, {
    message: 'Exactly one issue provider must be configured: `jira` or `github`',
    path: ['jira'],
  })
  .refine((c) => !(c.jira !== undefined && c.github !== undefined), {
    message: 'Only one issue provider may be configured: set `jira` OR `github`, not both',
    path: ['github'],
  });

export type XeraConfig = z.infer<typeof XeraConfigSchema>;
