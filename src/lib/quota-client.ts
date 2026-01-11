import * as z from 'zod/v4';

export const clientQuotaInfoSchema = z.object({
  used: z.number().nonnegative(),
  limit: z.number().nonnegative(),
  remaining: z.number().nonnegative(),
  percentageUsed: z.number().min(0).max(100),
  resetAt: z.string().nullable(),
});

export const clientQuotaStateSchema = z.object({
  sync: clientQuotaInfoSchema,
  categorize: clientQuotaInfoSchema,
});

/** Client-side quota info (resetAt serialized to ISO string) */
export type ClientQuotaInfo = z.infer<typeof clientQuotaInfoSchema>;

/** Client-side container for all user quotas */
export type ClientQuotaState = z.infer<typeof clientQuotaStateSchema>;
