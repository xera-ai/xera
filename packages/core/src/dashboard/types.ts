import { z } from 'zod';

export const TicketResultEnum = z.enum(['PASS', 'FAIL', 'UNKNOWN', 'NEVER_RUN']);

export const TicketRowSchema = z.object({
  ticketId: z.string(),
  result: TicketResultEnum,
  classification: z.string().nullable(),
  confidence: z.enum(['low', 'medium', 'high']).nullable(),
  scenarios: z.object({
    total: z.number().int().nonnegative(),
    passed: z.number().int().nonnegative(),
    failed: z.number().int().nonnegative(),
  }),
  lastRun: z.string().nullable(),
  areas: z.array(z.string()),
  has_html_report: z.boolean(),
});

export const RecentFailureSchema = z.object({
  ticketId: z.string(),
  classification: z.string(),
  confidence: z.enum(['low', 'medium', 'high']),
  lastRun: z.string(),
  scenarios_failed: z.number().int().nonnegative(),
  scenarios_total: z.number().int().nonnegative(),
  areas: z.array(z.string()),
});

export const ClassificationBinSchema = z.object({
  classification: z.string(),
  count: z.number().int().nonnegative(),
});

export const AreaStatSchema = z.object({
  area: z.string(),
  failing_tickets: z.array(z.string()),
  is_critical: z.boolean(),
});

export const AppliedFiltersSchema = z.object({
  since: z.string().optional(),
  classifications: z.array(z.string()).optional(),
  areas: z.array(z.string()).optional(),
  failing_only: z.boolean().optional(),
});

export const DashboardSnapshotSchema = z.object({
  generated_at: z.string(),
  totals: z.object({
    tickets: z.number().int().nonnegative(),
    last_pass: z.number().int().nonnegative(),
    last_fail: z.number().int().nonnegative(),
    never_run: z.number().int().nonnegative(),
    scenarios_pass: z.number().int().nonnegative(),
    scenarios_fail: z.number().int().nonnegative(),
  }),
  classifications: z.array(ClassificationBinSchema),
  tickets: z.array(TicketRowSchema),
  recent_failures: z.array(RecentFailureSchema),
  stale: z.array(TicketRowSchema),
  critical_alerts: z.array(AreaStatSchema),
  top_failing_areas: z.array(AreaStatSchema),
  filters_applied: AppliedFiltersSchema,
});

export type DashboardSnapshot = z.infer<typeof DashboardSnapshotSchema>;
export type TicketRow = z.infer<typeof TicketRowSchema>;
export type RecentFailure = z.infer<typeof RecentFailureSchema>;
export type ClassificationBin = z.infer<typeof ClassificationBinSchema>;
export type AreaStat = z.infer<typeof AreaStatSchema>;
export type AppliedFilters = z.infer<typeof AppliedFiltersSchema>;

export interface CollectOpts {
  since?: string;
  classifications?: string[];
  areas?: string[];
  failingOnly?: boolean;
}
