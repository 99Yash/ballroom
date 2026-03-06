import { logger, metadata, schedules, tags } from '@trigger.dev/sdk';
import { and, asc, gt, inArray, isNotNull } from 'drizzle-orm';
import { db } from '~/db';
import { account, user } from '~/db/schemas';
import type { CollectionType, ContentSource } from '~/lib/sources/types';
import {
  batchTriggerIncrementalSync,
  type SyncItem,
} from './sync-videos';

/**
 * Batch size for processing users
 * Balances between:
 * - Memory usage (smaller = less memory)
 * - Database queries (larger = fewer queries)
 * - Trigger.dev batch limits (max ~1000 recommended)
 */
const USER_BATCH_SIZE = 500;
const BATCH_ID_SAMPLE_SIZE = 10;

/** Map OAuth provider IDs to source/collection pairs for scheduled sync. */
const PROVIDER_SOURCE_MAP: Record<
  string,
  Array<{ source: ContentSource; collection: CollectionType }>
> = {
  google: [{ source: 'youtube', collection: 'likes' }],
  twitter: [
    { source: 'x', collection: 'likes' },
    { source: 'x', collection: 'bookmarks' },
  ],
};

/**
 * Build sync items for a batch of users by checking which providers they
 * have connected (via the account table). Only triggers syncs for sources
 * the user has actually linked.
 */
async function buildSyncItemsForUsers(
  userIds: string[]
): Promise<SyncItem[]> {
  if (userIds.length === 0) return [];

  const connectedAccounts = await db
    .select({
      userId: account.userId,
      providerId: account.providerId,
    })
    .from(account)
    .where(
      and(
        inArray(account.userId, userIds),
        inArray(account.providerId, Object.keys(PROVIDER_SOURCE_MAP))
      )
    );

  // Group providers by user
  const providersByUser = new Map<string, Set<string>>();
  for (const acc of connectedAccounts) {
    if (!providersByUser.has(acc.userId)) {
      providersByUser.set(acc.userId, new Set());
    }
    providersByUser.get(acc.userId)!.add(acc.providerId);
  }

  // Expand to sync items
  const syncItems: SyncItem[] = [];
  for (const userId of userIds) {
    const providers = providersByUser.get(userId);
    if (!providers) continue;

    for (const providerId of providers) {
      const sourceCollections = PROVIDER_SOURCE_MAP[providerId];
      if (!sourceCollections) continue;
      for (const { source, collection } of sourceCollections) {
        syncItems.push({ userId, source, collection });
      }
    }
  }

  return syncItems;
}

/**
 * Hourly sync schedule - runs every hour.
 * Source-aware: triggers incremental sync per user per connected source/collection.
 * Uses chunked processing to handle large user bases.
 */
export const hourlySyncSchedule = schedules.task({
  id: 'hourly-sync',
  cron: '0 * * * *', // Every hour at minute 0
  maxDuration: 1800, // 30 minutes max for processing all users
  retry: {
    maxAttempts: 2,
    minTimeoutInMs: 5000,
    maxTimeoutInMs: 30000,
    factor: 2,
  },
  catchError: async ({ error, ctx, payload }) => {
    logger.error('Hourly sync schedule failed', {
      runId: ctx.run.id,
      error: error instanceof Error ? error.message : String(error),
      scheduledAt: payload.timestamp,
    });
  },
  run: async (payload) => {
    logger.info('Starting hourly sync for all users', {
      timestamp: payload.timestamp,
      lastTimestamp: payload.lastTimestamp,
    });

    const scheduleDate = new Date(payload.timestamp);
    await tags.add('scheduled-sync');
    await tags.add(`date:${scheduleDate.toISOString().split('T')[0]}`); // YYYY-MM-DD
    await tags.add(`hour:${scheduleDate.getUTCHours()}`);

    metadata
      .set('status', 'fetching_users')
      .set('usersProcessed', 0)
      .set('totalSyncItems', 0)
      .set('totalBatches', 0)
      .set('startTime', new Date().toISOString());

    let totalUsersProcessed = 0;
    let totalSyncItems = 0;
    let batchCount = 0;
    let lastUserId: string | undefined;
    const batchIdsSample: string[] = [];

    while (true) {
      const userBatch = await db
        .select({ id: user.id })
        .from(user)
        .where(
          lastUserId
            ? and(isNotNull(user.onboardedAt), gt(user.id, lastUserId))
            : isNotNull(user.onboardedAt)
        )
        .orderBy(asc(user.id))
        .limit(USER_BATCH_SIZE)
        .offset(0);

      if (userBatch.length === 0) {
        logger.info('No more users to process', {
          lastUserId,
          totalUsersProcessed,
        });
        break;
      }

      const userIds = userBatch.map((u) => u.id);
      const syncItems = await buildSyncItemsForUsers(userIds);

      logger.info('Processing user batch', {
        batchNumber: batchCount + 1,
        batchSize: userBatch.length,
        syncItems: syncItems.length,
        lastUserId,
        totalSoFar: totalUsersProcessed + userBatch.length,
      });

      if (syncItems.length > 0) {
        const batchHandle = await batchTriggerIncrementalSync(syncItems);

        if (batchHandle && batchIdsSample.length < BATCH_ID_SAMPLE_SIZE) {
          batchIdsSample.push(batchHandle.batchId);
        }
      }

      totalUsersProcessed += userBatch.length;
      totalSyncItems += syncItems.length;
      batchCount++;

      metadata
        .set('status', 'processing_batches')
        .set('usersProcessed', totalUsersProcessed)
        .set('totalSyncItems', totalSyncItems)
        .set('totalBatches', batchCount)
        .set('lastUserId', userBatch[userBatch.length - 1]?.id ?? null);

      if (batchIdsSample.length <= BATCH_ID_SAMPLE_SIZE) {
        metadata.set('batchIdsSample', batchIdsSample);
      }

      logger.info('Batch triggered successfully', {
        batchNumber: batchCount,
        usersInBatch: userBatch.length,
        syncItemsInBatch: syncItems.length,
        totalProcessed: totalUsersProcessed,
      });

      lastUserId = userBatch[userBatch.length - 1]?.id;

      if (userBatch.length < USER_BATCH_SIZE) {
        logger.info('Reached end of users', {
          lastBatchSize: userBatch.length,
          totalProcessed: totalUsersProcessed,
        });
        break;
      }
    }

    metadata
      .set('status', 'completed')
      .set('endTime', new Date().toISOString());

    logger.info('Hourly sync completed', {
      totalUsersProcessed,
      totalSyncItems,
      totalBatches: batchCount,
      batchIdsSample,
    });

    return {
      usersProcessed: totalUsersProcessed,
      totalSyncItems,
      totalBatches: batchCount,
      batchIdsSample,
    };
  },
});
