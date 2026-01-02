import { eq } from 'drizzle-orm';
import { db } from '~/db';
import { user } from '~/db/schemas';
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
  return {
    used,
    limit,
    remaining,
    resetAt,
    isExceeded: used >= limit,
    percentageUsed: limit > 0 ? Math.round((used / limit) * 100) : 0,
  };
}

function getNextQuotaResetDate(): Date {
  const now = new Date();
  const resetDay = APP_CONFIG.quota.resetDayOfMonth;

  let resetDate = new Date(
    now.getFullYear(),
    now.getMonth(),
    resetDay,
    0,
    0,
    0,
    0
  );

  if (now >= resetDate) {
    resetDate = new Date(
      now.getFullYear(),
      now.getMonth() + 1,
      resetDay,
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

export async function checkAndResetQuotaIfNeeded(
  userId: string
): Promise<boolean> {
  const [userData] = await db
    .select({
      quotaResetAt: user.quotaResetAt,
    })
    .from(user)
    .where(eq(user.id, userId))
    .limit(1);

  if (!userData) {
    return false;
  }

  const now = new Date();
  const shouldReset = !userData.quotaResetAt || userData.quotaResetAt <= now;

  if (shouldReset) {
    const nextResetDate = getNextQuotaResetDate();

    await db
      .update(user)
      .set({
        syncQuotaUsed: 0,
        categorizeQuotaUsed: 0,
        quotaResetAt: nextResetDate,
      })
      .where(eq(user.id, userId));

    logger.info('Quota reset for user', {
      userId,
      nextResetAt: nextResetDate.toISOString(),
    });
    return true;
  }

  return false;
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
      message:
        `${quotaType === 'sync' ? 'Sync' : 'Categorization'} quota exceeded. ` +
        `Used: ${quota.used}/${quota.limit}. Resets in ${daysUntilReset} days.`,
    });
  }

  return quota;
}

export async function incrementQuota(
  userId: string,
  quotaType: QuotaType,
  amount: number
): Promise<void> {
  if (amount <= 0) return;

  const field = quotaType === 'sync' ? 'syncQuotaUsed' : 'categorizeQuotaUsed';

  const [userData] = await db
    .select({ currentUsage: user[field] })
    .from(user)
    .where(eq(user.id, userId))
    .limit(1);

  if (!userData) {
    throw new AppError({ code: 'NOT_FOUND', message: 'User not found' });
  }

  await db
    .update(user)
    .set({ [field]: userData.currentUsage + amount })
    .where(eq(user.id, userId));

  logger.debug('Quota incremented', {
    userId,
    quotaType,
    amount,
    newTotal: userData.currentUsage + amount,
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
