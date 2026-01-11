import 'server-only';

import { lastDayOfMonth } from 'date-fns';
import { and, eq, isNull, or, sql } from 'drizzle-orm';
import { db } from '~/db';
import { user } from '~/db/schemas';
import type { TransactionContext } from '~/db/types';
import type { ClientQuotaState } from '~/lib/quota-client';
import { APP_CONFIG } from './constants';
import { AppError } from './errors';
import { logger } from './logger';

export type QuotaType = 'sync' | 'categorize';

/** Server-side quota status with Date objects */
export interface QuotaStatus {
  used: number;
  limit: number;
  remaining: number;
  resetAt: Date | null;
  isExceeded: boolean;
  percentageUsed: number;
}

/** Server-side container for all user quotas */
export interface UserQuotas {
  sync: QuotaStatus;
  categorize: QuotaStatus;
}

function createQuotaStatus(
  used: number,
  limit: number,
  resetAt: Date | null
): QuotaStatus {
  const remaining = Math.max(0, limit - used);
  const isExceeded = used >= limit;
  let percentageUsed = 0;
  if (limit > 0 && used > 0) {
    const rawPercentage = (used / limit) * 100;

    let rounded = Number(rawPercentage.toFixed(1));

    if (rounded === 0 && rawPercentage > 0) {
      rounded = 0.1;
    }

    if (!isExceeded && rounded >= 100) {
      rounded = 99.9;
    }

    if (rounded > 100) {
      rounded = 100;
    }

    percentageUsed = rounded;
  }
  return {
    used,
    limit,
    remaining,
    resetAt,
    isExceeded,
    percentageUsed,
  };
}

function getNextQuotaResetDate(): Date {
  const now = new Date(Date.now());
  const resetDay = APP_CONFIG.quota.resetDayOfMonth;

  const utcYear = now.getUTCFullYear();
  const utcMonth = now.getUTCMonth();

  const targetMonth = new Date(Date.UTC(utcYear, utcMonth, 1));
  const lastDayOfTargetMonth = lastDayOfMonth(targetMonth);
  const safeResetDay = Math.min(resetDay, lastDayOfTargetMonth.getUTCDate());

  let resetDate = new Date(
    Date.UTC(utcYear, utcMonth, safeResetDay, 0, 0, 0, 0)
  );

  if (now >= resetDate) {
    const nextMonth = new Date(Date.UTC(utcYear, utcMonth + 1, 1));
    const lastDayOfNextMonth = lastDayOfMonth(nextMonth);
    const safeNextResetDay = Math.min(
      resetDay,
      lastDayOfNextMonth.getUTCDate()
    );

    resetDate = new Date(
      Date.UTC(utcYear, utcMonth + 1, safeNextResetDay, 0, 0, 0, 0)
    );
  }

  return resetDate;
}

export async function getUserQuotas(userId: string): Promise<UserQuotas> {
  const nextResetDate = getNextQuotaResetDate();
  await db
    .update(user)
    .set(buildQuotaResetValues(nextResetDate))
    .where(buildQuotaResetNeededCondition(userId));

  const [userData] = await db
    .select({
      syncQuotaUsed: user.syncQuotaUsed,
      syncQuotaLimit: user.syncQuotaLimit,
      categorizeQuotaUsed: user.categorizeQuotaUsed,
      categorizeQuotaLimit: user.categorizeQuotaLimit,
      quotaResetAt: user.quotaResetAt,
    })
    .from(user)
    .where(eq(user.id, userId))
    .limit(1);

  if (!userData) {
    throw new AppError({ code: 'NOT_FOUND', message: 'User not found' });
  }

  return {
    sync: createQuotaStatus(
      userData.syncQuotaUsed,
      userData.syncQuotaLimit,
      userData.quotaResetAt
    ),
    categorize: createQuotaStatus(
      userData.categorizeQuotaUsed,
      userData.categorizeQuotaLimit,
      userData.quotaResetAt
    ),
  };
}

export async function checkAndIncrementQuotaWithinTx(
  tx: TransactionContext,
  userId: string,
  quotaType: QuotaType,
  amount: number
): Promise<void> {
  if (amount < 0) {
    throw new AppError({
      code: 'BAD_REQUEST',
      message: `Invalid quota amount: ${amount}. Amount must be non-negative.`,
    });
  }
  if (amount === 0) return;

  const nextResetDate = getNextQuotaResetDate();
  await tx
    .update(user)
    .set(buildQuotaResetValues(nextResetDate))
    .where(buildQuotaResetNeededCondition(userId));
  const update = await tx
    .update(user)
    .set(buildQuotaIncrementUpdate(quotaType, amount))
    .where(
      and(eq(user.id, userId), buildQuotaLimitCheckCondition(quotaType, amount))
    )
    .returning({ id: user.id });

  if (update.length === 1) {
    logger.debug('Quota checked and incremented in transaction', {
      userId,
      quotaType,
      amount,
    });
    return;
  }

  const [current] = await tx
    .select({
      syncQuotaUsed: user.syncQuotaUsed,
      syncQuotaLimit: user.syncQuotaLimit,
      categorizeQuotaUsed: user.categorizeQuotaUsed,
      categorizeQuotaLimit: user.categorizeQuotaLimit,
    })
    .from(user)
    .where(eq(user.id, userId))
    .limit(1);

  if (!current) {
    throw new AppError({
      code: 'NOT_FOUND',
      message: `User not found: ${userId}`,
    });
  }

  const { used, limit } = getQuotaValues(current, quotaType);

  logger.debug('Quota check failed - limit exceeded', {
    userId,
    quotaType,
    requestedAmount: amount,
    currentUsed: used,
    limit,
  });

  throw new AppError({
    code: 'QUOTA_EXCEEDED',
    message: `${getQuotaTypeDisplayName(
      quotaType
    )} quota exceeded. Used: ${used}/${limit}. Resets monthly.`,
  });
}

function getQuotaValues(
  userData: {
    syncQuotaUsed: number;
    syncQuotaLimit: number;
    categorizeQuotaUsed: number;
    categorizeQuotaLimit: number;
  },
  quotaType: QuotaType
): { used: number; limit: number } {
  return quotaType === 'sync'
    ? { used: userData.syncQuotaUsed, limit: userData.syncQuotaLimit }
    : {
        used: userData.categorizeQuotaUsed,
        limit: userData.categorizeQuotaLimit,
      };
}

function buildQuotaLimitCheckCondition(
  quotaType: QuotaType,
  amount: number
): ReturnType<typeof sql> {
  return quotaType === 'sync'
    ? sql`${user.syncQuotaUsed} + ${amount} <= ${user.syncQuotaLimit}`
    : sql`${user.categorizeQuotaUsed} + ${amount} <= ${user.categorizeQuotaLimit}`;
}

function getQuotaTypeDisplayName(quotaType: QuotaType): string {
  return quotaType === 'sync' ? 'Sync' : 'Categorization';
}

function buildQuotaResetValues(nextResetDate: Date) {
  return {
    syncQuotaUsed: 0,
    categorizeQuotaUsed: 0,
    quotaResetAt: nextResetDate,
  };
}

function buildQuotaResetNeededCondition(userId: string) {
  return and(
    eq(user.id, userId),
    or(
      isNull(user.quotaResetAt),
      sql`${user.quotaResetAt} <= CURRENT_TIMESTAMP`
    )
  );
}

function buildQuotaIncrementUpdate(quotaType: QuotaType, amount: number) {
  return quotaType === 'sync'
    ? { syncQuotaUsed: sql`${user.syncQuotaUsed} + ${amount}` }
    : { categorizeQuotaUsed: sql`${user.categorizeQuotaUsed} + ${amount}` };
}

export async function incrementQuotaWithinTx(
  tx: TransactionContext,
  userId: string,
  quotaType: QuotaType,
  amount: number
): Promise<void> {
  if (amount < 0) {
    throw new AppError({
      code: 'BAD_REQUEST',
      message: `Invalid quota amount: ${amount}. Amount must be non-negative.`,
    });
  }
  if (amount === 0) return;

  const update = await tx
    .update(user)
    .set(buildQuotaIncrementUpdate(quotaType, amount))
    .where(eq(user.id, userId))
    .returning({ id: user.id });

  if (update.length === 0) {
    throw new AppError({
      code: 'NOT_FOUND',
      message: `User not found: ${userId}`,
    });
  }

  logger.debug('Quota incremented in transaction', {
    userId,
    quotaType,
    amount,
  });
}

/**
 * Reserve quota atomically BEFORE expensive operations (e.g., AI API calls).
 * This prevents concurrent requests from both passing optimistic checks and
 * wasting resources on operations that will fail at commit time.
 *
 * Uses row-level locking to ensure only one request can reserve quota at a time.
 * If the quota would be exceeded, throws QUOTA_EXCEEDED immediately.
 *
 * @returns The amount reserved (for logging/tracking)
 */
export async function reserveQuota(
  userId: string,
  quotaType: QuotaType,
  amount: number
): Promise<{ reserved: number; newUsed: number; limit: number }> {
  if (amount < 0) {
    throw new AppError({
      code: 'BAD_REQUEST',
      message: `Invalid quota amount: ${amount}. Amount must be non-negative.`,
    });
  }
  if (amount === 0) {
    const quotas = await getUserQuotas(userId);
    const quota = quotaType === 'sync' ? quotas.sync : quotas.categorize;
    return { reserved: 0, newUsed: quota.used, limit: quota.limit };
  }

  return db.transaction(async (tx) => {
    const nextResetDate = getNextQuotaResetDate();
    await tx
      .update(user)
      .set(buildQuotaResetValues(nextResetDate))
      .where(buildQuotaResetNeededCondition(userId));

    const update = await tx
      .update(user)
      .set(buildQuotaIncrementUpdate(quotaType, amount))
      .where(
        and(
          eq(user.id, userId),
          buildQuotaLimitCheckCondition(quotaType, amount)
        )
      )
      .returning({
        syncQuotaUsed: user.syncQuotaUsed,
        syncQuotaLimit: user.syncQuotaLimit,
        categorizeQuotaUsed: user.categorizeQuotaUsed,
        categorizeQuotaLimit: user.categorizeQuotaLimit,
      });

    if (update.length === 1) {
      const { used, limit } = getQuotaValues(update[0]!, quotaType);
      logger.debug('Quota reserved successfully', {
        userId,
        quotaType,
        amount,
        newUsed: used,
        limit,
      });
      return { reserved: amount, newUsed: used, limit };
    }

    const [current] = await tx
      .select({
        syncQuotaUsed: user.syncQuotaUsed,
        syncQuotaLimit: user.syncQuotaLimit,
        categorizeQuotaUsed: user.categorizeQuotaUsed,
        categorizeQuotaLimit: user.categorizeQuotaLimit,
      })
      .from(user)
      .where(eq(user.id, userId))
      .limit(1);

    if (!current) {
      throw new AppError({
        code: 'NOT_FOUND',
        message: `User not found: ${userId}`,
      });
    }

    const { used, limit } = getQuotaValues(current, quotaType);

    logger.debug('Quota reservation failed - limit exceeded', {
      userId,
      quotaType,
      requestedAmount: amount,
      currentUsed: used,
      limit,
    });

    throw new AppError({
      code: 'QUOTA_EXCEEDED',
      message: `${getQuotaTypeDisplayName(
        quotaType
      )} quota exceeded. Used: ${used}/${limit}. Resets monthly.`,
    });
  });
}

export function formatQuotaForClient(quotas: UserQuotas): ClientQuotaState {
  return {
    sync: {
      used: quotas.sync.used,
      limit: quotas.sync.limit,
      remaining: quotas.sync.remaining,
      percentageUsed: quotas.sync.percentageUsed,
      resetAt: quotas.sync.resetAt?.toISOString() ?? null,
    },
    categorize: {
      used: quotas.categorize.used,
      limit: quotas.categorize.limit,
      remaining: quotas.categorize.remaining,
      percentageUsed: quotas.categorize.percentageUsed,
      resetAt: quotas.categorize.resetAt?.toISOString() ?? null,
    },
  };
}
