import { z } from 'zod';

export const STAGES = ['feature-from-story', 'script-from-feature', 'diagnose-failure'] as const;
export const StageSchema = z.enum(STAGES);
export type Stage = z.infer<typeof StageSchema>;

export const VerdictSchema = z.enum(['PASS', 'FAIL', 'NA']);
export type Verdict = z.infer<typeof VerdictSchema>;

export const PromptVersionsSchema = z.object({
  'feature-from-story': z.string(),
  'script-from-feature': z.string(),
  'diagnose-failure': z.string(),
  'eval-rubric': z.string(),
});
export type PromptVersions = z.infer<typeof PromptVersionsSchema>;

export const ManifestSchema = z.object({
  run_id: z.string(),
  started_at: z.string(),
  git_sha: z.string(),
  tickets: z.array(z.string()).min(1),
  stages: z.array(StageSchema).min(1),
  prompt_versions: PromptVersionsSchema,
  flags: z.object({
    force: z.boolean(),
    only_prompt: StageSchema.nullable(),
    only_ticket: z.string().nullable(),
    judge_only: z.boolean(),
  }),
});
export type Manifest = z.infer<typeof ManifestSchema>;

export const DimensionSchema = z.object({
  name: z.string(),
  verdict: VerdictSchema,
  notes: z.string(),
});
export type Dimension = z.infer<typeof DimensionSchema>;

export const JudgmentSchema = z.object({
  stage: StageSchema,
  ticket: z.string(),
  dimensions: z.array(DimensionSchema).min(1),
});
export type Judgment = z.infer<typeof JudgmentSchema>;

export const JudgeScoresSchema = z.object({
  run_id: z.string(),
  judgments: z.array(JudgmentSchema),
});
export type JudgeScores = z.infer<typeof JudgeScoresSchema>;

export const DeterministicEntrySchema = z.object({
  ticket: z.string(),
  stage: StageSchema,
  passed: z.boolean(),
  checks: z.array(z.string()),
  error: z.string().optional(),
});
export type DeterministicEntry = z.infer<typeof DeterministicEntrySchema>;

export const DeterministicScoresSchema = z.object({
  run_id: z.string(),
  entries: z.array(DeterministicEntrySchema),
});
export type DeterministicScores = z.infer<typeof DeterministicScoresSchema>;

export const ResultSchema = z.object({
  ticket: z.string(),
  stage: StageSchema,
  deterministic: z.object({
    passed: z.boolean(),
    checks: z.array(z.string()),
    error: z.string().optional(),
  }),
  judge: z.object({
    passed: z.boolean(),
    dimensions: z.array(DimensionSchema),
    score: z.number().min(0).max(1),
  }).nullable(),
  skipped: z.boolean().optional(),
});
export type Result = z.infer<typeof ResultSchema>;

export const SummarySchema = z.object({
  run_id: z.string(),
  git_sha: z.string(),
  prompt_versions: PromptVersionsSchema,
  results: z.array(ResultSchema),
  overall: z.object({
    passed: z.number().int().nonnegative(),
    failed: z.number().int().nonnegative(),
    total: z.number().int().nonnegative(),
    score: z.number().min(0).max(1),
  }),
});
export type Summary = z.infer<typeof SummarySchema>;
