import { logger, metadata, schedules, tags } from '@trigger.dev/sdk';
import { isNotNull } from 'drizzle-orm';
import { db } from '~/db';
import { user } from '~/db/schemas';
import { incrementalSyncTask } from './sync-videos';

/**
 * Batch size for processing users
 * Balances between:
 * - Memory usage (smaller = less memory)
 * - Database queries (larger = fewer queries)
 * - Trigger.dev batch limits (max ~1000 recommended)
 */
const USER_BATCH_SIZE = 500;

/**
 * Hourly sync schedule - runs every hour
 * Fetches new liked videos for all onboarded users
 * Uses chunked processing to handle large user bases
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

    // Allow retry for all errors - this is a scheduled job
  },
  run: async (payload) => {
    logger.info('Starting hourly sync for all users', {
      timestamp: payload.timestamp,
      lastTimestamp: payload.lastTimestamp,
    });

    // Add tags for filtering and monitoring
    const scheduleDate = new Date(payload.timestamp);
    await tags.add('scheduled-sync');
    await tags.add(`date:${scheduleDate.toISOString().split('T')[0]}`); // YYYY-MM-DD
    await tags.add(`hour:${scheduleDate.getUTCHours()}`); // 0-23

    // Initialize progress tracking
    metadata
      .set('status', 'fetching_users')
      .set('usersProcessed', 0)
      .set('totalBatches', 0)
      .set('startTime', new Date().toISOString());

    // Process users in chunks to avoid memory issues
    let offset = 0;
    let totalUsersProcessed = 0;
    let batchCount = 0;
    const batchIds: string[] = [];

    while (true) {
      // Fetch next batch of users
      const userBatch = await db
        .select({ id: user.id })
        .from(user)
        .where(isNotNull(user.onboardedAt))
        .limit(USER_BATCH_SIZE)
        .offset(offset);

      // Exit if no more users
      if (userBatch.length === 0) {
        logger.info('No more users to process', {
          offset,
          totalUsersProcessed,
        });
        break;
      }

      logger.info('Processing user batch', {
        batchNumber: batchCount + 1,
        batchSize: userBatch.length,
        offset,
        totalSoFar: totalUsersProcessed + userBatch.length,
      });

      // Trigger sync tasks for this batch
      // Concurrency is controlled by the queue on incrementalSyncTask
      const batchHandle = await incrementalSyncTask.batchTrigger(
        userBatch.map((u) => ({ payload: { userId: u.id } }))
      );

      // Track progress
      totalUsersProcessed += userBatch.length;
      batchCount++;
      batchIds.push(batchHandle.batchId);

      // Update metadata for real-time monitoring
      metadata
        .set('status', 'processing_batches')
        .set('usersProcessed', totalUsersProcessed)
        .set('totalBatches', batchCount)
        .set('currentOffset', offset + userBatch.length)
        .append('batchIds', batchHandle.batchId);

      logger.info('Batch triggered successfully', {
        batchId: batchHandle.batchId,
        batchNumber: batchCount,
        usersInBatch: userBatch.length,
        totalProcessed: totalUsersProcessed,
      });

      // Move to next batch
      offset += USER_BATCH_SIZE;

      // If batch returned fewer users than limit, we've reached the end
      if (userBatch.length < USER_BATCH_SIZE) {
        logger.info('Reached end of users', {
          lastBatchSize: userBatch.length,
          totalProcessed: totalUsersProcessed,
        });
        break;
      }
    }

    // Final status
    metadata
      .set('status', 'completed')
      .set('endTime', new Date().toISOString());

    logger.info('Hourly sync completed', {
      totalUsersProcessed,
      totalBatches: batchCount,
      batchIds: batchIds.slice(0, 10), // Log first 10 batch IDs to avoid bloat
    });

    return {
      usersProcessed: totalUsersProcessed,
      totalBatches: batchCount,
      batchIds,
    };
  },
});
