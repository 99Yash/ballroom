import { lastDayOfMonth } from 'date-fns';
import { and, eq, isNull, or, sql } from 'drizzle-orm';
import { db } from '~/db';
import { user } from '~/db/schemas';
import type { TransactionContext } from '~/db/types';
import { APP_CONFIG } from './constants';
import { AppError } from './errors';
import { logger } from './logger';

export type QuotaType = 'sync' | 'categorize';

export interface QuotaStatus {
  used: number;
  limit: number;
  remaining: number;
  resetAt: Date | null;
  isExceeded: boolean;
  percentageUsed: number;
}

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

    // Use Math.round for accurate representation
    let rounded = Math.round(rawPercentage);

    // Ensure small usage (e.g., 1/5000 = 0.02%) shows as at least 1%
    // This prevents showing 0% when there's actual usage, improving UX for low usage
    if (rounded === 0 && rawPercentage > 0) {
      rounded = 1;
    }

    // Cap at 99% if not exceeded to avoid showing 100% when quota is still available
    // Only show 100% when actually exceeded
    if (!isExceeded && rounded >= 100) {
      rounded = 99;
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
  const now = new Date();
  const resetDay = APP_CONFIG.quota.resetDayOfMonth;

  const targetMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const lastDayOfTargetMonth = lastDayOfMonth(targetMonth);
  const safeResetDay = Math.min(resetDay, lastDayOfTargetMonth.getDate());

  let resetDate = new Date(
    now.getFullYear(),
    now.getMonth(),
    safeResetDay,
    0,
    0,
    0,
    0
  );

  if (now >= resetDate) {
    const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    const lastDayOfNextMonth = lastDayOfMonth(nextMonth);
    const safeNextResetDay = Math.min(resetDay, lastDayOfNextMonth.getDate());

    resetDate = new Date(
      now.getFullYear(),
      now.getMonth() + 1,
      safeNextResetDay,
      0,
      0,
      0,
      0
    );
  }

  return resetDate;
}

export async function getUserQuotas(userId: string): Promise<UserQuotas> {
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

/**
 * Checks if quota reset is needed and performs the reset atomically.
 * Resets quota if:
 * - User has no quotaResetAt date set, OR
 * - Current date >= quotaResetAt date
 *
 * The WHERE clause ensures the update only happens when reset is needed,
 * making this operation idempotent and safe to call multiple times.
 *
 * @param userId - The user ID to check and reset quota for
 * @returns true if quota was reset, false if reset was not needed or user not found
 */
export async function checkAndResetQuotaIfNeeded(
  userId: string
): Promise<boolean> {
  const now = new Date();
  const nextResetDate = getNextQuotaResetDate();

  const result = await db
    .update(user)
    .set({
      syncQuotaUsed: 0,
      categorizeQuotaUsed: 0,
      quotaResetAt: nextResetDate,
    })
    .where(
      and(
        eq(user.id, userId),
        or(isNull(user.quotaResetAt), sql`${user.quotaResetAt} <= ${now}`)
      )
    );

  const rowsAffected = result.rowCount ?? 0;
  const didReset = rowsAffected > 0;

  if (didReset) {
    logger.info('Quota reset for user', {
      userId,
      nextResetAt: nextResetDate.toISOString(),
    });
  }

  return didReset;
}

export async function checkQuota(
  userId: string,
  quotaType: QuotaType,
  amount: number = 1
): Promise<QuotaStatus> {
  await checkAndResetQuotaIfNeeded(userId);

  const quotas = await getUserQuotas(userId);
  const quota = quotas[quotaType];

  if (quota.used + amount > quota.limit) {
    const daysUntilReset = quota.resetAt
      ? Math.ceil(
          (quota.resetAt.getTime() - Date.now()) / (1000 * 60 * 60 * 24)
        )
      : 0;

    throw new AppError({
      code: 'QUOTA_EXCEEDED',
      message: `${getQuotaTypeDisplayName(quotaType)} quota exceeded. Used: ${
        quota.used
      }/${quota.limit}. Resets in ${daysUntilReset} days.`,
    });
  }

  return quota;
}

/**
 * Atomically checks and increments quota within a database transaction.
 * This prevents race conditions by using a conditional UPDATE that only succeeds
 * if the quota limit would not be exceeded. All operations happen within a single transaction.
 *
 * @param tx - The transaction context from db.transaction
 * @param userId - The user ID to check and increment quota for
 * @param quotaType - Type of quota to check and increment ('sync' or 'categorize')
 * @param amount - Amount to increment by. Zero values are silently ignored (no-op). Negative values throw an error.
 * @throws {AppError} If user is not found (NOT_FOUND), quota would be exceeded (QUOTA_EXCEEDED), or amount is negative (BAD_REQUEST)
 */
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

  // First, check and reset quota if needed (within transaction)
  const now = new Date();
  const nextResetDate = getNextQuotaResetDate();

  await tx
    .update(user)
    .set({
      syncQuotaUsed: 0,
      categorizeQuotaUsed: 0,
      quotaResetAt: nextResetDate,
    })
    .where(
      and(
        eq(user.id, userId),
        or(isNull(user.quotaResetAt), sql`${user.quotaResetAt} <= ${now}`)
      )
    );

  // Read current quota values (within transaction for consistency)
  const [userData] = await tx
    .select({
      syncQuotaUsed: user.syncQuotaUsed,
      syncQuotaLimit: user.syncQuotaLimit,
      categorizeQuotaUsed: user.categorizeQuotaUsed,
      categorizeQuotaLimit: user.categorizeQuotaLimit,
    })
    .from(user)
    .where(eq(user.id, userId))
    .limit(1);

  if (!userData) {
    throw new AppError({
      code: 'NOT_FOUND',
      message: `User not found: ${userId}`,
    });
  }

  // Check quota
  const { used: currentUsed, limit } = getQuotaValues(userData, quotaType);

  if (currentUsed + amount > limit) {
    throw new AppError({
      code: 'QUOTA_EXCEEDED',
      message: `${getQuotaTypeDisplayName(
        quotaType
      )} quota exceeded. Used: ${currentUsed}/${limit}. Resets monthly.`,
    });
  }

  // Increment quota atomically with conditional WHERE clause
  // This ensures the update only happens if quota hasn't changed
  const result = await tx
    .update(user)
    .set(buildQuotaIncrementUpdate(quotaType, amount))
    .where(
      and(eq(user.id, userId), buildQuotaLimitCheckCondition(quotaType, amount))
    );

  const rowsAffected = result.rowCount ?? 0;
  if (rowsAffected === 0) {
    // Could be user not found OR quota exceeded (race condition detected)
    // Re-check to provide accurate error message
    const [recheckData] = await tx
      .select({
        syncQuotaUsed: user.syncQuotaUsed,
        syncQuotaLimit: user.syncQuotaLimit,
        categorizeQuotaUsed: user.categorizeQuotaUsed,
        categorizeQuotaLimit: user.categorizeQuotaLimit,
      })
      .from(user)
      .where(eq(user.id, userId))
      .limit(1);

    if (!recheckData) {
      throw new AppError({
        code: 'NOT_FOUND',
        message: `User not found: ${userId}`,
      });
    }

    const { used: recheckUsed, limit: recheckLimit } = getQuotaValues(
      recheckData,
      quotaType
    );

    if (recheckUsed + amount > recheckLimit) {
      throw new AppError({
        code: 'QUOTA_EXCEEDED',
        message: `${getQuotaTypeDisplayName(
          quotaType
        )} quota exceeded. Used: ${recheckUsed}/${recheckLimit}. Resets monthly.`,
      });
    }

    // If we get here, it's likely a race condition that was resolved
    // Log it but don't throw - the quota check passed on recheck
    logger.warn('Quota update race condition detected and resolved', {
      userId,
      quotaType,
      amount,
    });
  }

  logger.debug('Quota checked and incremented atomically in transaction', {
    userId,
    quotaType,
    amount,
    newUsed: currentUsed + amount,
    limit,
  });
}

/**
 * Helper function to extract quota values (used and limit) from user data based on quota type.
 */
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

/**
 * Helper function to build the WHERE clause condition for quota limit check.
 * Ensures quota won't exceed limit when incrementing.
 */
function buildQuotaLimitCheckCondition(
  quotaType: QuotaType,
  amount: number
): ReturnType<typeof sql> {
  return quotaType === 'sync'
    ? sql`${user.syncQuotaUsed} + ${amount} <= ${user.syncQuotaLimit}`
    : sql`${user.categorizeQuotaUsed} + ${amount} <= ${user.categorizeQuotaLimit}`;
}

/**
 * Helper function to get the display name for a quota type.
 */
function getQuotaTypeDisplayName(quotaType: QuotaType): string {
  return quotaType === 'sync' ? 'Sync' : 'Categorization';
}

/**
 * Helper function to build the quota increment update object based on quota type.
 * Returns the appropriate Drizzle update object for the given quota type.
 */
function buildQuotaIncrementUpdate(
  quotaType: QuotaType,
  amount: number
): Record<string, ReturnType<typeof sql>> {
  return quotaType === 'sync'
    ? { syncQuotaUsed: sql`${user.syncQuotaUsed} + ${amount}` }
    : { categorizeQuotaUsed: sql`${user.categorizeQuotaUsed} + ${amount}` };
}

/**
 * Increments quota usage within a database transaction.
 * This ensures quota updates are atomic with other operations (e.g., video categorization).
 * NOTE: This function does NOT check quota limits. Use checkAndIncrementQuotaWithinTx for atomic check-and-increment.
 *
 * @param tx - The transaction context from db.transaction
 * @param userId - The user ID to increment quota for
 * @param quotaType - Type of quota to increment ('sync' or 'categorize')
 * @param amount - Amount to increment by. Zero values are silently ignored (no-op). Negative values throw an error.
 * @throws {AppError} If user is not found (NOT_FOUND) or amount is negative (BAD_REQUEST)
 */
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

  const result = await tx
    .update(user)
    .set(buildQuotaIncrementUpdate(quotaType, amount))
    .where(eq(user.id, userId));

  const rowsAffected = result.rowCount ?? 0;
  if (rowsAffected === 0) {
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
 * Increments quota usage outside of a transaction.
 * NOTE: This function does NOT check quota limits. Use checkQuota before calling if limits should be enforced.
 *
 * @param userId - The user ID to increment quota for
 * @param quotaType - Type of quota to increment ('sync' or 'categorize')
 * @param amount - Amount to increment by. Zero values are silently ignored (no-op). Negative values throw an error.
 * @throws {AppError} If user is not found (NOT_FOUND) or amount is negative (BAD_REQUEST)
 */
export async function incrementQuota(
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

  const result = await db
    .update(user)
    .set(buildQuotaIncrementUpdate(quotaType, amount))
    .where(eq(user.id, userId));

  const rowsAffected = result.rowCount ?? 0;
  if (rowsAffected === 0) {
    throw new AppError({ code: 'NOT_FOUND', message: 'User not found' });
  }

  logger.debug('Quota incremented', {
    userId,
    quotaType,
    amount,
  });
}

export async function getRemainingQuota(
  userId: string,
  quotaType: QuotaType
): Promise<number> {
  await checkAndResetQuotaIfNeeded(userId);
  const quotas = await getUserQuotas(userId);
  return quotas[quotaType].remaining;
}

export function formatQuotaForClient(quotas: UserQuotas) {
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
